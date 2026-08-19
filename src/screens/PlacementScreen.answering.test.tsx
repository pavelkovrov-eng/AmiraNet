import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlacementScreen } from './PlacementScreen';
import { db } from '../db/db';
import { getCards } from '../db/repository';
import { content } from '../content/index';

// Deliberately unmocked (unlike PlacementScreen.test.tsx): this exercises
// handleAnswer against the real 16-item seed pool, not the completion view.

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function renderedQuestion() {
  return content.questions.find((q) => screen.queryByText(q.stem))!;
}

describe('PlacementScreen answering', () => {
  // Review finding: placement shows no right/wrong feedback, so nothing
  // disables the choice buttons the way SessionRunner's revealed-on-
  // chosenIndex does. Without a reentrancy guard, a second click landing
  // before the first click's saveCard/applyPlacementAnswer resolves races
  // against it: both handleAnswer calls close over the same pre-answer
  // state and the same currentItem, so whichever call's setState/saveCard
  // lands last silently wins - confirmed empirically (the *correct* click's
  // write overwrote the *wrong* click's seeded-due-now card, so the wrong
  // click a person actually made first ends up recorded as scheduled into
  // the future instead of due immediately) rather than assumed.
  //
  // The wrong click fires first and the correct one second on purpose: a
  // weaker assertion (progress advances by exactly one step, a card exists)
  // holds either way, because `answered` only ever advances by one and
  // `saveCard` overwrites the same lexemeId key regardless of which call
  // wins - it does not distinguish "the second click was correctly
  // ignored" from "the second click silently overwrote the first's
  // result". Checking which correctness value actually persisted does.
  it('keeps the first click, not the second, when the same question is clicked twice before the first save resolves', async () => {
    render(<PlacementScreen onDone={() => {}} />);
    await screen.findByRole('heading', { name: 'מבחן מיקום' });

    const question = renderedQuestion();
    const wrongIndex = question.correctIndex === 0 ? 1 : 0;
    const buttons = screen.getAllByRole('button');

    // fireEvent (not userEvent) fires both clicks synchronously, back to
    // back, with neither awaited - the only way to land the second click
    // before the first's `await saveCard` has had a chance to resolve.
    fireEvent.click(buttons[wrongIndex]);
    fireEvent.click(buttons[question.correctIndex]);

    expect(await screen.findByText(/שאלה 2 מתוך/)).toBeInTheDocument();
    expect(screen.queryByText(/שאלה 3 מתוך/)).not.toBeInTheDocument();

    // The wrong click (first) must be what was kept: seeded as due
    // immediately, not scheduled into the future the way the correct
    // (second) click's answer would have been.
    const cards = await getCards();
    const card = cards.find((c) => c.lexemeId === question.targetLexemes[0]);
    expect(card).toBeDefined();
    expect(card!.card.due.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
