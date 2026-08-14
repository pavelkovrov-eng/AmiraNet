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
});
