import { render, screen } from '@testing-library/react';
import { ThetaChart } from './ThetaChart';

const history = [
  { at: 1_700_000_000_000, theta: 0.2 },
  { at: 1_700_100_000_000, theta: 0.9 },
  { at: 1_700_200_000_000, theta: 1.6 },
];

describe('ThetaChart', () => {
  it('renders an accessible figure', () => {
    render(<ThetaChart history={history} />);
    expect(screen.getByRole('img', { name: /התקדמות/ })).toBeInTheDocument();
  });

  it('draws one point per history entry', () => {
    const { container } = render(<ThetaChart history={history} />);
    expect(container.querySelectorAll('circle')).toHaveLength(3);
  });

  it('draws the 134 reference line', () => {
    const { container } = render(<ThetaChart history={history} />);
    expect(container.querySelector('[data-testid="pass-line"]')).toBeInTheDocument();
  });

  it('renders an empty state with no history', () => {
    const { container } = render(<ThetaChart history={[]} />);
    expect(screen.getByText(/אין עדיין נתונים/)).toBeInTheDocument();

    // Rigor (task instruction): an empty history must not fall through to a
    // broken partial render. Without the early return, history.length === 0
    // still produces a finite (if nonsensical) step, an empty points array,
    // and an empty path string - but the pass-line itself does not depend on
    // history at all, so it would still draw. The result would be an SVG
    // showing only a dashed threshold line with no data, no points, and no
    // explanation - a chart that looks like it has zero interesting data
    // rather than a screen that is honestly saying "nothing recorded yet".
    // Asserting no SVG (and no chart primitives) renders at all closes that
    // gap - the message text alone does not prove the broken chart is
    // actually absent.
    expect(container.querySelector('svg')).not.toBeInTheDocument();
    expect(container.querySelectorAll('circle')).toHaveLength(0);
    expect(container.querySelector('[data-testid="pass-line"]')).not.toBeInTheDocument();
  });
});
