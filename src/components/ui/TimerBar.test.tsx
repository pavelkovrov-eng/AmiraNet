import { render, screen } from '@testing-library/react';
import { TimerBar } from './TimerBar';

describe('TimerBar', () => {
  it('exposes remaining time to assistive technology', () => {
    render(<TimerBar fraction={0.5} warning={false} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
  });

  it('scales the fill to the remaining fraction', () => {
    render(<TimerBar fraction={0.25} warning={false} />);
    const fill = screen.getByTestId('timer-fill');
    expect(fill).toHaveStyle({ transform: 'scaleX(0.25)' });
  });

  it('adds the warning modifier below the threshold', () => {
    render(<TimerBar fraction={0.1} warning />);
    expect(screen.getByTestId('timer-fill')).toHaveClass('timer-fill--warning');
  });

  it('renders no digits', () => {
    const { container } = render(<TimerBar fraction={0.42} warning={false} />);
    expect(container.textContent).toBe('');
  });
});
