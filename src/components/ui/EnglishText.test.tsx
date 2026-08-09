import { render, screen } from '@testing-library/react';
import { EnglishText } from './EnglishText';

describe('EnglishText', () => {
  it('marks content as left-to-right', () => {
    render(<EnglishText>The results were inconclusive.</EnglishText>);
    const el = screen.getByText('The results were inconclusive.');
    expect(el).toHaveAttribute('dir', 'ltr');
  });

  it('carries the bidi isolation class', () => {
    render(<EnglishText>despite the claims</EnglishText>);
    expect(screen.getByText('despite the claims')).toHaveClass('english-text');
  });

  it('renders as the requested element', () => {
    render(<EnglishText as="p">Academic prose.</EnglishText>);
    expect(screen.getByText('Academic prose.').tagName).toBe('P');
  });

  it('defaults to a span', () => {
    render(<EnglishText>inline</EnglishText>);
    expect(screen.getByText('inline').tagName).toBe('SPAN');
  });
});
