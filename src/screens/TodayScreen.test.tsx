import 'fake-indexeddb/auto';
import { createEmptyCard } from 'ts-fsrs';
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
    // theta is set above every non-reading question's difficulty in the
    // bank, so the new-material step contributes nothing and only the
    // questions targeting the queued remediation lexeme are scheduled -
    // the same shape as the real exhausted-bank session in
    // scripts/demo-session.ts, reproduced deterministically here.
    // Pinned above the bank's maximum rather than at a literal that a
    // later content wave would silently invalidate.
    const hardest = Math.max(
      ...content.questions.filter((q) => q.type !== 'reading').map((q) => q.difficulty),
    );
    await saveProfile({
      id: 'me',
      theta: hardest,
      answered: 0,
      placementDone: false,
      thetaHistory: [],
    });
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

// Addition 1 (Context section's carry-forward note): start()'s Promise.all
// was completely unreachable before Task 15 wired routing - App.tsx
// rendered a placeholder. These seed the corrupt row via db.profile.put /
// db.cards.put directly, bypassing saveProfile/saveCard's own write guards -
// same technique as src/db/repository.test.ts - simulating corruption that
// arrived by some other path than this app's own writes.
describe('TodayScreen corrupt-storage handling', () => {
  it('shows a visible failure state instead of going silently inert when the stored profile is corrupt', async () => {
    await db.profile.put({
      id: 'me',
      theta: NaN,
      answered: 0,
      placementDone: false,
      thetaHistory: [],
    });

    render(<TodayScreen />);
    await userEvent.click(screen.getByRole('button', { name: '10 דקות' }));

    const notice = await screen.findByRole('status', { name: 'שגיאת טעינה' });
    expect(notice).toHaveTextContent('לא ניתן לטעון את הנתונים השמורים');

    // Not a silent bounce: no session ever mounts, and no other status
    // (e.g. the unrelated empty-session notice) fires instead.
    expect(screen.queryByRole('region', { name: 'שאלה' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('shows a visible failure state instead of going silently inert when a stored card is corrupt', async () => {
    const card = createEmptyCard(new Date('2026-08-09T09:00:00Z'));
    await db.cards.put({ lexemeId: 'corrupt', card: { ...card, stability: NaN } });

    render(<TodayScreen />);
    await userEvent.click(screen.getByRole('button', { name: '10 דקות' }));

    const notice = await screen.findByRole('status', { name: 'שגיאת טעינה' });
    expect(notice).toHaveTextContent('לא ניתן לטעון את הנתונים השמורים');
    expect(screen.queryByRole('region', { name: 'שאלה' })).not.toBeInTheDocument();
  });
});
