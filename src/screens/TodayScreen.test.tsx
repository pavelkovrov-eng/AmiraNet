import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodayScreen } from './TodayScreen';
import { db } from '../db/db';
import { saveProfile, saveRemediation } from '../db/repository';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('TodayScreen shortfall notice', () => {
  it('stays silent when the built session fills the requested budget', async () => {
    render(<TodayScreen />);
    await userEvent.click(screen.getByRole('button', { name: '10 דקות' }));

    // Fresh profile (theta 0), no remediation, no due cards: the builder
    // fills the full 600s budget from the 11-item non-reading seed bank
    // (same fixture as scripts/demo-session.ts's first session, at a budget
    // that happens to divide evenly: 8 items land at exactly 600/600).
    await screen.findByRole('region', { name: 'שאלה' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('explains a session that lands far under the requested budget', async () => {
    // theta 1.0 exceeds every non-reading question's difficulty in the seed
    // bank (max 0.9), so the new-material step contributes nothing. Only
    // the one question targeting the queued remediation lexeme is
    // scheduled - the same shape as the real second session in
    // scripts/demo-session.ts, reproduced deterministically here.
    await saveProfile({ id: 'me', theta: 1.0, answered: 0, placementDone: false, thetaHistory: [] });
    await saveRemediation([
      { cause: 'vocabulary-gap', targetId: 'awl-analyze', createdAt: Date.now(), servings: 0 },
    ]);

    render(<TodayScreen />);
    await userEvent.click(screen.getByRole('button', { name: '10 דקות' }));

    // 60s of 600s requested (10%) - well under the 50% threshold, and the
    // session still renders alongside the notice, not instead of it.
    await screen.findByRole('region', { name: 'שאלה' });
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('אזל להיום');
  });
});
