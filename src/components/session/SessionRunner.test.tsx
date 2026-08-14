import { StrictMode } from 'react';
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionRunner } from './SessionRunner';
import { db } from '../../db/db';
import { getAttempts } from '../../db/repository';
import { content } from '../../content/index';

const firstQuestion = content.questions.find((q) => q.type === 'sentence-completion')!;

const plan = {
  items: [{ kind: 'question' as const, questionId: firstQuestion.id }],
  estimatedSeconds: 60,
};

// A due SRS card is always placed first by buildSession, so any plan for a
// returning user with something due looks like this: a skip-kind item
// immediately followed by a question.
const skipThenQuestionPlan = {
  items: [
    { kind: 'srs' as const, lexemeId: 'awl-analyze' },
    { kind: 'question' as const, questionId: firstQuestion.id },
  ],
  estimatedSeconds: 68,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('SessionRunner', () => {
  it('renders the first question of the plan', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    expect(await screen.findByText(firstQuestion.stem)).toBeInTheDocument();
  });

  it('persists an attempt immediately after answering', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    await userEvent.click(screen.getAllByRole('button')[0]);

    const attempts = await getAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].questionId).toBe(firstQuestion.id);
  });

  it('reveals explanations after answering', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    await userEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText(firstQuestion.explanationPerOption[0])).toBeInTheDocument();
  });

  it('records a diagnosis for a wrong answer', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    const wrongIndex = firstQuestion.correctIndex === 0 ? 1 : 0;
    await userEvent.click(screen.getAllByRole('button')[wrongIndex]);

    const attempts = await getAttempts();
    expect(attempts[0].correct).toBe(false);
    expect(attempts[0].diagnosis).not.toBeNull();
  });

  it('records no diagnosis for a correct answer', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    await userEvent.click(screen.getAllByRole('button')[firstQuestion.correctIndex]);

    const attempts = await getAttempts();
    expect(attempts[0].correct).toBe(true);
    expect(attempts[0].diagnosis).toBeNull();
  });

  it('calls onComplete after the last item', async () => {
    const onComplete = vi.fn();
    render(<SessionRunner plan={plan} onComplete={onComplete} />);
    await screen.findByText(firstQuestion.stem);
    await userEvent.click(screen.getAllByRole('button')[0]);
    await userEvent.click(screen.getByRole('button', { name: /המשך/ }));
    expect(onComplete).toHaveBeenCalled();
  });

  // Review finding: StrictMode (main.tsx wraps the whole app in it) double-
  // invokes effects with no cleanup on initial mount. The skip effect has no
  // cleanup and its condition is satisfied synchronously, so both
  // invocations queued a functional setIndex(i => i + 1) against the same
  // captured skip-kind item, taking index 0 -> 2 in one commit and skipping
  // straight past the question that was actually next.
  it('renders the question after a skip-kind item even under StrictMode double-invoked effects', async () => {
    render(
      <StrictMode>
        <SessionRunner plan={skipThenQuestionPlan} onComplete={() => {}} />
      </StrictMode>,
    );
    expect(await screen.findByText(firstQuestion.stem)).toBeInTheDocument();
  });

  // Review finding: submitAnswer's rejection was reachable (corrupt stored
  // data, e.g. getProfile's own finite-theta guard) but chosenIndex is set
  // before the await, so explanations reveal and "המשך" appears regardless
  // of whether anything was actually saved - with the try/catch alone, a
  // real failure was silent to the user, console.error notwithstanding.
  it('shows a visible, non-silent failure state when persisting an answer throws', async () => {
    // Bypasses saveProfile's own write guard on purpose, the same way
    // getProfile's read guard is documented to defend against corruption
    // from something other than this module's own writes (db/repository.ts).
    await db.profile.put({ id: 'me', theta: NaN, answered: 0, placementDone: false, thetaHistory: [] });

    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    await userEvent.click(screen.getAllByRole('button')[0]);

    // The reveal itself must not be lost because the write failed.
    expect(screen.getByText(firstQuestion.explanationPerOption[0])).toBeInTheDocument();
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('לא נשמרה');
  });
});
