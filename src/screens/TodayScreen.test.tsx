import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodayScreen } from './TodayScreen';
import { db } from '../db/db';
import { recordAttempt, saveProfile, saveRemediation } from '../db/repository';
import { content } from '../content/index';

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

  // Review finding: with zero items, SessionRunner's own ready-but-no-item
  // effect fires onComplete as soon as it mounts, which here means
  // setSession(null) - unmounting the session branch (and the shortfall
  // notice that would have explained it) before the person clicking the
  // button ever sees anything. The button appears not to respond at all.
  it('explains a session with nothing left to offer, without bouncing back silently', async () => {
    // Every seed question already answered: no due cards, no remediation
    // targets, nothing left for new-material to select, and the passage
    // excluded too since all of its questions are in this same set -
    // buildSession has nothing to schedule at all, for any budget.
    await Promise.all(
      content.questions.map((q) =>
        recordAttempt({
          questionId: q.id,
          chosenIndex: 0,
          correct: true,
          elapsedMs: 1000,
          at: Date.now(),
          diagnosis: null,
        }),
      ),
    );

    render(<TodayScreen />);
    await userEvent.click(screen.getByRole('button', { name: '10 דקות' }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('אין כרגע תוכן חדש');
    // Not bounced back silently: this IS the picker again, now carrying an
    // explanation, and no SessionRunner mounted underneath it - there was
    // never anything for it to run.
    expect(screen.getByRole('heading', { name: 'כמה זמן יש לך היום?' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'שאלה' })).not.toBeInTheDocument();
  });
});
