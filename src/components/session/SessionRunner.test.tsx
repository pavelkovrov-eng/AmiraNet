import { StrictMode } from 'react';
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionRunner } from './SessionRunner';
import { db } from '../../db/db';
import { getAttempts, getCards } from '../../db/repository';
import { content } from '../../content/index';

const firstQuestion = content.questions.find((q) => q.type === 'sentence-completion')!;
const secondQuestion = content.questions.find(
  (q) => q.type === 'sentence-completion' && q.id !== firstQuestion.id,
)!;

const plan = {
  items: [{ kind: 'question' as const, questionId: firstQuestion.id }],
  estimatedSeconds: 60,
};

// A passage is the only remaining skip-kind item after Task 12: SRS cards
// now render a FlashCard instead of being silently skipped (see the
// StrictMode SRS test below), so a passage is the only kind left that the
// skip effect still advances past on its own. passageId is never looked up
// by the skip effect (no passage renderer exists yet), so a fixture id that
// matches no real passage is fine here.
const skipThenQuestionPlan = {
  items: [
    { kind: 'passage' as const, passageId: 'skip-test-passage' },
    { kind: 'question' as const, questionId: firstQuestion.id },
  ],
  estimatedSeconds: 960,
};

// buildSession always places due SRS cards first, so this is the realistic
// shape of a returning user's plan: a card, then two distinct questions -
// enough to tell "advanced to the next item" apart from "advanced past it".
const srsFirstPlan = {
  items: [
    { kind: 'srs' as const, lexemeId: 'awl-analyze' },
    { kind: 'question' as const, questionId: firstQuestion.id },
    { kind: 'question' as const, questionId: secondQuestion.id },
  ],
  estimatedSeconds: 128,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/**
 * The two taps answering now takes: arm an option, then submit it.
 * Choices come first in the DOM, so index still addresses them directly.
 */
async function answer(index: number) {
  await userEvent.click(screen.getAllByRole('button')[index]);
  await userEvent.click(screen.getByRole('button', { name: 'שלח' }));
}

describe('SessionRunner', () => {
  it('renders the first question of the plan', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    expect(await screen.findByText(firstQuestion.stem)).toBeInTheDocument();
  });

  it('persists an attempt immediately after answering', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    await answer(0);

    const attempts = await getAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].questionId).toBe(firstQuestion.id);
  });

  it('reveals explanations after answering', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    await answer(0);
    expect(screen.getByText(firstQuestion.explanationPerOption[0])).toBeInTheDocument();
  });

  // The property the submit step exists for: a tap is recoverable. Touching
  // an option must change nothing that outlives the screen - no attempt
  // written, no theta moved, and the explanations still hidden - until the
  // person says so.
  it('records nothing, and reveals nothing, until the answer is submitted', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);

    await userEvent.click(screen.getAllByRole('button')[0]);
    expect(await getAttempts()).toHaveLength(0);
    expect(screen.queryByText(firstQuestion.explanationPerOption[0])).not.toBeInTheDocument();

    // Still answerable, and re-tapping moves the selection rather than
    // stacking a second answer on top of the first.
    await userEvent.click(screen.getAllByRole('button')[1]);
    expect(screen.getAllByRole('button')[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'false');
    expect(await getAttempts()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'שלח' }));
    const attempts = await getAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].chosenIndex).toBe(1);
  });

  it('cannot submit before an option is picked', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    expect(screen.getByRole('button', { name: 'שלח' })).toBeDisabled();
  });

  it('records a diagnosis for a wrong answer', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    const wrongIndex = firstQuestion.correctIndex === 0 ? 1 : 0;
    await answer(wrongIndex);

    const attempts = await getAttempts();
    expect(attempts[0].correct).toBe(false);
    expect(attempts[0].diagnosis).not.toBeNull();
  });

  it('records no diagnosis for a correct answer', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    await answer(firstQuestion.correctIndex);

    const attempts = await getAttempts();
    expect(attempts[0].correct).toBe(true);
    expect(attempts[0].diagnosis).toBeNull();
  });

  it('calls onComplete after the last item', async () => {
    const onComplete = vi.fn();
    render(<SessionRunner plan={plan} onComplete={onComplete} />);
    await screen.findByText(firstQuestion.stem);
    await answer(0);
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

  // Task 12: SRS items now render a FlashCard instead of being skipped, so
  // buildSession's "due cards first" ordering means this is the realistic
  // first render for any returning user with something due. Advancing after
  // a rating reuses the same advance() the question flow uses (no second,
  // independently guarded setIndex), so unlike the skip effect above there
  // is no StrictMode double-invoke exposure in the advance step itself -
  // this test pins that the whole mount-then-rate flow still lands on
  // exactly the next item under StrictMode's double-mount, not the one
  // after, and that the review was actually persisted before moving on.
  it('renders an SRS card first under StrictMode, persists the review immediately, and advances to the next item only', async () => {
    render(
      <StrictMode>
        <SessionRunner plan={srsFirstPlan} onComplete={() => {}} />
      </StrictMode>,
    );

    expect(await screen.findByText('analyze')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    await userEvent.click(screen.getByRole('button', { name: 'ידעתי' }));

    // The next item, not the one after: this is what a StrictMode-doubled
    // index jump (0 -> 2) would have shown instead.
    expect(await screen.findByText(firstQuestion.stem)).toBeInTheDocument();
    expect(screen.queryByText(secondQuestion.stem)).not.toBeInTheDocument();

    // Persisted immediately (not batched): by the time the next question has
    // rendered, reviewLexeme's own await has already completed.
    const cards = await getCards();
    expect(cards.find((c) => c.lexemeId === 'awl-analyze')).toBeDefined();
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
    await answer(0);

    // The reveal itself must not be lost because the write failed.
    expect(screen.getByText(firstQuestion.explanationPerOption[0])).toBeInTheDocument();
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('לא נשמרה');
    // role="status" is not name-from-content - InfoNotice (TodayScreen.tsx)
    // pairs the same role with an explicit aria-label, and this notice must
    // match that pattern rather than being an anonymous status region.
    expect(notice).toHaveAccessibleName('שגיאת שמירה');
  });
});
