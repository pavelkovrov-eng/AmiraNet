import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Card as FsrsCard,
} from 'ts-fsrs';
import type { StoredCard } from '../db/db';

export const MASTERY_INTERVAL_DAYS = 21;

// Fuzz off: deterministic scheduling keeps tests meaningful and, with a
// single user, adds nothing.
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

export function isMastered(card: FsrsCard): boolean {
  return card.state === State.Review && card.scheduled_days > MASTERY_INTERVAL_DAYS;
}

export function reviewCard(card: FsrsCard, correct: boolean, now: Date): FsrsCard {
  const rating = correct ? Rating.Good : Rating.Again;
  return scheduler.next(card, now, rating).card;
}

export function dueLexemeIds(cards: StoredCard[], now: Date): string[] {
  return cards
    .filter((c) => c.card.due.getTime() <= now.getTime())
    .sort((a, b) => a.card.due.getTime() - b.card.due.getTime())
    .map((c) => c.lexemeId);
}

/**
 * Initial card for a lexeme first encountered during placement.
 * Wrong answers come back immediately; correct ones enter normal scheduling.
 */
export function seedCard(correct: boolean, now: Date): FsrsCard {
  const empty = createEmptyCard(now);
  if (!correct) return { ...empty, due: now };
  return reviewCard(empty, true, now);
}
