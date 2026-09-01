import { createEmptyCard } from 'ts-fsrs';
import { mergeAttempts, mergeCards, mergeRemediation, recomputeProfile } from './merge';
import type { Attempt, RemediationEntry } from '../content/types';
import type { Profile, StoredCard } from '../db/db';

function attempt(questionId: string, at: number, correct = true): Attempt {
  return { questionId, chosenIndex: 0, correct, elapsedMs: 1000, at, diagnosis: null };
}

function card(lexemeId: string, lastReview: number | null): StoredCard {
  const base = createEmptyCard(new Date(at0));
  return {
    lexemeId,
    card: { ...base, last_review: lastReview === null ? undefined : new Date(lastReview) },
  };
}

const at0 = 1_700_000_000_000;

function profile(over: Partial<Profile> = {}): Profile {
  return { id: 'me', theta: 0, answered: 0, placementDone: false, thetaHistory: [], ...over };
}

describe('mergeAttempts', () => {
  // The same answer arriving from both devices is one event, not two - and
  // double-counting it would inflate both the answer count and the estimate
  // folded from it.
  it('counts an answer present on both devices once', () => {
    const shared = attempt('q1', at0);
    expect(mergeAttempts([shared], [{ ...shared }])).toHaveLength(1);
  });

  it('keeps work done on either device', () => {
    const merged = mergeAttempts([attempt('q1', at0)], [attempt('q2', at0 + 5)]);
    expect(merged.map((a) => a.questionId)).toEqual(['q1', 'q2']);
  });

  it('returns them in the order they happened, not the order they arrived', () => {
    const merged = mergeAttempts([attempt('late', at0 + 100)], [attempt('early', at0)]);
    expect(merged.map((a) => a.questionId)).toEqual(['early', 'late']);
  });

  // Answering the same question twice on different days is two real events.
  it('treats the same question answered at different times as two answers', () => {
    expect(mergeAttempts([attempt('q1', at0)], [attempt('q1', at0 + 86_400_000)])).toHaveLength(2);
  });
});

describe('mergeCards', () => {
  it('keeps the more recently reviewed card for a word', () => {
    const merged = mergeCards([card('w', at0)], [card('w', at0 + 1000)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].card.last_review?.getTime()).toBe(at0 + 1000);
  });

  // A word met on one device only must survive the merge; losing it would
  // silently drop that word out of the review schedule entirely.
  it('keeps a card that exists on one side only', () => {
    const merged = mergeCards([card('a', at0)], [card('b', at0)]);
    expect(merged.map((c) => c.lexemeId).sort()).toEqual(['a', 'b']);
  });

  it('prefers a reviewed card over one never reviewed', () => {
    const merged = mergeCards([card('w', null)], [card('w', at0)]);
    expect(merged[0].card.last_review?.getTime()).toBe(at0);
  });
});

describe('mergeRemediation', () => {
  it('keeps the higher serving count for the same cause and target', () => {
    const entry = (servings: number): RemediationEntry => ({
      cause: 'vocabulary-gap',
      targetId: 'awl-analyze',
      createdAt: at0,
      servings,
    });
    const merged = mergeRemediation([entry(1)], [entry(3)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].servings).toBe(3);
  });
});

describe('recomputeProfile', () => {
  const difficultyOf = (id: string) => (id.startsWith('hard') ? 2 : 0);

  // The property that matters: the estimate is derived from the merged
  // answers, not chosen from one device. Picking a side would report a number
  // no actual sequence of answers supports.
  it('folds the estimate over the merged answers rather than picking a side', () => {
    const attempts = [attempt('hard1', at0), attempt('hard2', at0 + 1)];
    const merged = recomputeProfile(
      profile({ theta: 0.2, answered: 1 }),
      profile({ theta: 1.9, answered: 1 }),
      attempts,
      difficultyOf,
    );
    expect(merged.answered).toBe(2);
    // Two correct answers on hard items from a zero baseline; neither input
    // theta survives.
    expect(merged.theta).toBeGreaterThan(0);
    expect(merged.theta).not.toBe(1.9);
    expect(merged.theta).not.toBe(0.2);
  });

  it('counts an answer to a retired question without scoring it', () => {
    const merged = recomputeProfile(
      profile(),
      profile(),
      [attempt('gone', at0)],
      () => undefined,
    );
    expect(merged.answered).toBe(1);
    expect(merged.theta).toBe(0);
  });

  // Merging in an older export must not reopen a placement test the learner
  // has already sat.
  it('keeps placement done if either side had done it', () => {
    expect(
      recomputeProfile(profile({ placementDone: true }), profile(), [], difficultyOf).placementDone,
    ).toBe(true);
  });

  it('merges the chart history without duplicating shared points', () => {
    const shared = { at: at0, theta: 0.5 };
    const merged = recomputeProfile(
      profile({ thetaHistory: [shared, { at: at0 + 10, theta: 0.7 }] }),
      profile({ thetaHistory: [shared] }),
      [],
      difficultyOf,
    );
    expect(merged.thetaHistory).toHaveLength(2);
    expect(merged.thetaHistory[0].at).toBeLessThan(merged.thetaHistory[1].at);
  });

  it('falls back to the fuller record when the question bank is unavailable', () => {
    const merged = recomputeProfile(
      profile({ theta: 0.3, answered: 2 }),
      profile({ theta: 1.1, answered: 9 }),
      [],
    );
    expect(merged.theta).toBe(1.1);
    expect(merged.answered).toBe(9);
  });
});
