import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { PlacementScreen } from './PlacementScreen';
import { db } from '../db/db';

// Forces nextPlacementItem to return null immediately, so the completion
// view renders on the very first render without needing to answer through
// the real (16-item) seed pool - all this test cares about is the
// completion view's render path.
vi.mock('../engines/placement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engines/placement')>();
  return { ...actual, nextPlacementItem: () => null };
});

// thetaToScore (src/engines/theta.ts) throws on non-finite input, but
// state.theta is a perfectly finite 0 here (nothing was ever answered) -
// applyPlacementAnswer's own guards mean it can never organically go
// non-finite. The only way to exercise "thetaToScore throws during the
// completion view's render" is to force the throw directly, standing in for
// whatever real corruption would otherwise cause it.
vi.mock('../engines/theta', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engines/theta')>();
  return {
    ...actual,
    thetaToScore: () => {
      throw new Error('boom');
    },
  };
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('PlacementScreen render-throw handling', () => {
  it('does not blank the screen when thetaToScore throws during render, and surfaces the failure visibly', async () => {
    render(<PlacementScreen onDone={() => {}} />);

    // Not blank: the completion heading and the mandatory disclaimer
    // (Addition 3) both still render.
    expect(
      await screen.findByRole('heading', { name: 'מבחן המיקום הסתיים' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/אומדן פנימי בלבד/)).toBeInTheDocument();

    // Not silent: a visible, accessible notice replaces the numeric score.
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('לא הצלחנו לחשב הערכה ראשונית');
    expect(notice).toHaveAccessibleName('שגיאת חישוב');

    // The user is not stuck: they can still proceed to studying.
    expect(screen.getByRole('button', { name: 'התחל ללמוד' })).toBeInTheDocument();
  });
});
