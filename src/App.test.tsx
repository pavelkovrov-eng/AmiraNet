import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import App from './App';
import { db } from './db/db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

// Addition 1 (Context section's carry-forward note): App.tsx's own initial
// getProfile() read is the app's literal entrance path - the very first
// stored read on every boot, before any screen (even PlacementScreen)
// exists. Before Task 15 this whole component was a placeholder <h1>, so
// this specific throw path had no code to even exist in. Seeds the corrupt
// row via db.profile.put directly, bypassing saveProfile's own write guard -
// same technique as src/db/repository.test.ts - simulating corruption that
// arrived by some other path than this app's own writes.
describe('App corrupt-profile boot handling', () => {
  it('shows a visible failure state instead of staying stuck on the loading screen forever', async () => {
    await db.profile.put({
      id: 'me',
      theta: NaN,
      answered: 0,
      placementDone: false,
      thetaHistory: [],
    });

    render(<App />);

    const notice = await screen.findByRole('status', { name: 'שגיאת טעינה' });
    expect(notice).toHaveTextContent('לא ניתן לטעון את הפרופיל השמור');

    // Not stuck: the perpetual "טוען…" state - what an unguarded rejection
    // would leave behind forever, since placementDone would never resolve -
    // is gone, replaced by the notice above.
    expect(screen.queryByText('טוען…')).not.toBeInTheDocument();
  });
});
