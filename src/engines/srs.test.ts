import { createEmptyCard, State } from 'ts-fsrs';
import {
  isMastered,
  reviewCard,
  dueLexemeIds,
  seedCard,
  MASTERY_INTERVAL_DAYS,
} from './srs';

const NOW = new Date('2026-08-09T09:00:00Z');

describe('isMastered', () => {
  it('is false for a new card', () => {
    expect(isMastered(createEmptyCard(NOW))).toBe(false);
  });

  it('is false for a review card below the mastery interval', () => {
    const card = { ...createEmptyCard(NOW), state: State.Review, scheduled_days: 10 };
    expect(isMastered(card)).toBe(false);
  });

  it('is false exactly at the mastery interval', () => {
    const card = {
      ...createEmptyCard(NOW),
      state: State.Review,
      scheduled_days: MASTERY_INTERVAL_DAYS,
    };
    expect(isMastered(card)).toBe(false);
  });

  it('is true above the mastery interval in the review state', () => {
    const card = {
      ...createEmptyCard(NOW),
      state: State.Review,
      scheduled_days: MASTERY_INTERVAL_DAYS + 1,
    };
    expect(isMastered(card)).toBe(true);
  });

  it('is false for a long interval that is not in the review state', () => {
    const card = {
      ...createEmptyCard(NOW),
      state: State.Relearning,
      scheduled_days: 60,
    };
    expect(isMastered(card)).toBe(false);
  });
});

describe('reviewCard', () => {
  it('increments the repetition count', () => {
    expect(reviewCard(createEmptyCard(NOW), true, NOW).reps).toBe(1);
  });

  it('schedules a correct answer further out than a wrong one', () => {
    const correct = reviewCard(createEmptyCard(NOW), true, NOW);
    const wrong = reviewCard(createEmptyCard(NOW), false, NOW);
    expect(correct.due.getTime()).toBeGreaterThan(wrong.due.getTime());
  });

  it('records a lapse when a review card is answered wrong', () => {
    let card = createEmptyCard(NOW);
    for (let i = 0; i < 6; i++) {
      card = reviewCard(card, true, new Date(card.due));
    }
    const lapsed = reviewCard(card, false, new Date(card.due));
    expect(lapsed.lapses).toBeGreaterThan(0);
  });
});

describe('dueLexemeIds', () => {
  it('returns cards due at or before now', () => {
    const cards = [
      { lexemeId: 'a', card: { ...createEmptyCard(NOW), due: new Date('2026-08-08T09:00:00Z') } },
      { lexemeId: 'b', card: { ...createEmptyCard(NOW), due: new Date('2026-08-10T09:00:00Z') } },
    ];
    expect(dueLexemeIds(cards, NOW)).toEqual(['a']);
  });

  it('orders the most overdue first', () => {
    const cards = [
      { lexemeId: 'recent', card: { ...createEmptyCard(NOW), due: new Date('2026-08-08T09:00:00Z') } },
      { lexemeId: 'stale', card: { ...createEmptyCard(NOW), due: new Date('2026-08-01T09:00:00Z') } },
    ];
    expect(dueLexemeIds(cards, NOW)).toEqual(['stale', 'recent']);
  });

  it('returns an empty list when nothing is due', () => {
    const cards = [
      { lexemeId: 'a', card: { ...createEmptyCard(NOW), due: new Date('2026-09-01T09:00:00Z') } },
    ];
    expect(dueLexemeIds(cards, NOW)).toEqual([]);
  });
});

describe('seedCard', () => {
  it('seeds a wrong-answer lexeme as due immediately', () => {
    expect(seedCard(false, NOW).due.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it('seeds a correct-answer lexeme with a future review', () => {
    expect(seedCard(true, NOW).due.getTime()).toBeGreaterThan(NOW.getTime());
  });
});
