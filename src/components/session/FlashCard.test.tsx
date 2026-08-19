import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlashCard } from './FlashCard';
import type { Lexeme } from '../../content/types';

const lexeme: Lexeme = {
  id: 'awl-analyze',
  headword: 'analyze',
  family: ['analyze', 'analysis', 'analytical'],
  definitionHe: 'לנתח',
  definitionEn: 'examine in detail',
  pos: 'verb',
  morphology: { root: 'lys', suffixes: ['-is'] },
  confusableWith: ['analogy'],
  exampleSentence: 'Researchers analyze the data.',
  difficulty: 2,
  tags: [],
};

describe('FlashCard', () => {
  it('renders the headword as left-to-right English', () => {
    render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    expect(screen.getByText('analyze')).toHaveAttribute('dir', 'ltr');
  });

  it('hides the Hebrew gloss before reveal', () => {
    render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    expect(screen.queryByText('לנתח')).not.toBeInTheDocument();
  });

  it('offers no rating buttons before reveal', () => {
    render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    expect(screen.queryByRole('button', { name: 'ידעתי' })).not.toBeInTheDocument();
  });

  it('reveals the gloss on request', async () => {
    render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    expect(screen.getByText('לנתח')).toBeInTheDocument();
  });

  it('shows the word family and example after reveal', async () => {
    render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    expect(screen.getByText('analyze, analysis, analytical')).toBeInTheDocument();
    expect(screen.getByText('Researchers analyze the data.')).toBeInTheDocument();
  });

  it('reports a known rating', async () => {
    const onRate = vi.fn();
    render(<FlashCard lexeme={lexeme} onRate={onRate} />);
    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    await userEvent.click(screen.getByRole('button', { name: 'ידעתי' }));
    expect(onRate).toHaveBeenCalledWith(true);
  });

  it('reports an unknown rating', async () => {
    const onRate = vi.fn();
    render(<FlashCard lexeme={lexeme} onRate={onRate} />);
    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    await userEvent.click(screen.getByRole('button', { name: 'לא ידעתי' }));
    expect(onRate).toHaveBeenCalledWith(false);
  });

  it('re-hides the gloss when the lexeme changes', async () => {
    const { rerender } = render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    expect(screen.getByText('לנתח')).toBeInTheDocument();

    rerender(
      <FlashCard lexeme={{ ...lexeme, id: 'awl-other', headword: 'implicit', definitionHe: 'מרומז' }} onRate={() => {}} />,
    );
    expect(screen.queryByText('מרומז')).not.toBeInTheDocument();
  });
});
