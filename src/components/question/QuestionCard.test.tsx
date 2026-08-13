import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionCard } from './QuestionCard';
import type { QuestionItem } from '../../content/types';

const question: QuestionItem = {
  id: 'sc-0001',
  type: 'sentence-completion',
  difficulty: 0.5,
  stem: 'They will ___ the data.',
  options: ['analyze', 'analogy', 'apologize', 'anarchy'],
  correctIndex: 0,
  explanationPerOption: ['right', 'sounds alike', 'unrelated', 'unrelated'],
  primaryLexeme: 'awl-analyze',
  targetLexemes: ['awl-analyze'],
  trapType: 'phonetic-neighbor',
};

describe('QuestionCard', () => {
  it('renders the stem as left-to-right English', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed={false} chosenIndex={null} />);
    expect(screen.getByText('They will ___ the data.')).toHaveAttribute('dir', 'ltr');
  });

  it('renders all four options', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed={false} chosenIndex={null} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('reports the chosen index', async () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={question} onAnswer={onAnswer} revealed={false} chosenIndex={null} />);
    await userEvent.click(screen.getByRole('button', { name: /analogy/ }));
    expect(onAnswer).toHaveBeenCalledWith(1);
  });

  it('hides explanations before reveal', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed={false} chosenIndex={null} />);
    expect(screen.queryByText('sounds alike')).not.toBeInTheDocument();
  });

  it('shows every explanation after reveal, not only the chosen one', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    expect(screen.getByText('right')).toBeInTheDocument();
    expect(screen.getByText('sounds alike')).toBeInTheDocument();
    // Options 2 and 3 share the literal explanation text 'unrelated' in this fixture,
    // so both must be found — getByText would throw on the legitimate multiple match.
    expect(screen.getAllByText('unrelated')).toHaveLength(2);
  });

  it('marks the correct option after reveal', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    expect(screen.getByRole('button', { name: /analyze/ })).toHaveClass('choice--correct');
  });

  it('marks the wrong chosen option after reveal', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    expect(screen.getByRole('button', { name: /analogy/ })).toHaveClass('choice--wrong');
  });

  it('disables the options after reveal', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  });

  // Colour alone (border-color) is not a legitimate way to convey correct/wrong: WCAG
  // 1.4.1. These query by accessible name and by the non-colour glyph, never by the
  // choice--correct / choice--wrong class, so a regression that dropped the marker but
  // kept the class would fail here even though "marks the correct option" above still
  // passes.
  it('marks correct and wrong options with a non-colour glyph, discoverable without the CSS class', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    const correctButton = screen.getByRole('button', { name: /analyze/ });
    const wrongButton = screen.getByRole('button', { name: /analogy/ });
    expect(within(correctButton).getByText('✓')).toBeInTheDocument();
    expect(within(wrongButton).getByText('✕')).toBeInTheDocument();
  });

  it('announces correct/wrong state to assistive technology via the accessible name', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    expect(screen.getByRole('button', { name: /תשובה נכונה/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /שגויה/ })).toBeInTheDocument();
  });

  it('leaves unmarked distractors without a glyph or state label', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    const distractor = screen.getByRole('button', { name: /apologize/ });
    expect(within(distractor).queryByText('✓')).not.toBeInTheDocument();
    expect(within(distractor).queryByText('✕')).not.toBeInTheDocument();
  });
});
