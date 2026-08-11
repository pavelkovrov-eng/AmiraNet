import 'fake-indexeddb/auto';
import { createEmptyCard } from 'ts-fsrs';
import { db } from './db';
import {
  recordAttempt,
  getAttempts,
  getProfile,
  saveProfile,
  saveCard,
  getCards,
  saveRemediation,
  getRemediation,
} from './repository';
import type { Attempt, RemediationEntry } from '../content/types';

const attempt: Attempt = {
  questionId: 'sc-0001',
  chosenIndex: 1,
  correct: false,
  elapsedMs: 42000,
  at: 1_700_000_000_000,
  diagnosis: 'vocabulary-gap',
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('profile', () => {
  it('returns a default profile before anything is saved', async () => {
    const profile = await getProfile();
    expect(profile.theta).toBe(0);
    expect(profile.answered).toBe(0);
    expect(profile.placementDone).toBe(false);
  });

  it('round-trips a saved profile', async () => {
    await saveProfile({
      id: 'me',
      theta: 1.4,
      answered: 12,
      placementDone: true,
      thetaHistory: [{ at: 1, theta: 1.4 }],
    });
    const profile = await getProfile();
    expect(profile.theta).toBe(1.4);
    expect(profile.placementDone).toBe(true);
    expect(profile.thetaHistory).toHaveLength(1);
  });

  it('overwrites the profile on a second save rather than duplicating', async () => {
    await saveProfile({
      id: 'me',
      theta: 0.5,
      answered: 3,
      placementDone: false,
      thetaHistory: [],
    });
    await saveProfile({
      id: 'me',
      theta: 1.1,
      answered: 9,
      placementDone: true,
      thetaHistory: [],
    });
    const profile = await getProfile();
    expect(profile.theta).toBe(1.1);
    expect(profile.answered).toBe(9);
  });

  // These four seed the corrupt row via db.profile.put directly, bypassing
  // saveProfile's own write guard. That's deliberate: it simulates
  // corruption arriving by a path other than this module's own writes (a
  // partial write, a failed migration, manual tampering) — saveProfile
  // would now reject these same values outright, so routing through it
  // would no longer exercise the read boundary at all.
  it('throws when the stored theta has been corrupted to NaN', async () => {
    await db.profile.put({
      id: 'me',
      theta: NaN,
      answered: 5,
      placementDone: true,
      thetaHistory: [],
    });
    await expect(getProfile()).rejects.toThrow();
  });

  it('throws when the stored theta has been corrupted to Infinity', async () => {
    await db.profile.put({
      id: 'me',
      theta: Infinity,
      answered: 5,
      placementDone: true,
      thetaHistory: [],
    });
    await expect(getProfile()).rejects.toThrow();
  });

  it('throws when the stored answered count is negative', async () => {
    await db.profile.put({
      id: 'me',
      theta: 0.5,
      answered: -1,
      placementDone: true,
      thetaHistory: [],
    });
    await expect(getProfile()).rejects.toThrow();
  });

  it('throws when the stored answered count is non-finite', async () => {
    await db.profile.put({
      id: 'me',
      theta: 0.5,
      answered: NaN,
      placementDone: true,
      thetaHistory: [],
    });
    await expect(getProfile()).rejects.toThrow();
  });

  it('rejects a corrupt profile write and leaves the previously stored profile intact', async () => {
    await saveProfile({
      id: 'me',
      theta: 0.7,
      answered: 4,
      placementDone: true,
      thetaHistory: [],
    });

    await expect(
      saveProfile({
        id: 'me',
        theta: NaN,
        answered: 4,
        placementDone: true,
        thetaHistory: [],
      }),
    ).rejects.toThrow();

    const profile = await getProfile();
    expect(profile.theta).toBe(0.7);
    expect(profile.answered).toBe(4);
  });

  it('returns a fresh default profile object on every call', async () => {
    const first = await getProfile();
    const second = await getProfile();
    expect(first).not.toBe(second);
    expect(first.thetaHistory).not.toBe(second.thetaHistory);

    first.answered = 999;
    first.thetaHistory.push({ at: 1, theta: 0.5 });

    const third = await getProfile();
    expect(third.answered).toBe(0);
    expect(third.thetaHistory).toHaveLength(0);
  });
});

describe('attempts', () => {
  it('persists an attempt immediately', async () => {
    await recordAttempt(attempt);
    const stored = await getAttempts();
    expect(stored).toHaveLength(1);
    expect(stored[0].questionId).toBe('sc-0001');
    expect(stored[0].diagnosis).toBe('vocabulary-gap');
  });

  it('survives a database reopen', async () => {
    await recordAttempt(attempt);
    db.close();
    await db.open();
    expect(await getAttempts()).toHaveLength(1);
  });

  it('accumulates attempts in order', async () => {
    await recordAttempt(attempt);
    await recordAttempt({ ...attempt, questionId: 'sc-0002', at: attempt.at + 1000 });
    const stored = await getAttempts();
    expect(stored.map((a) => a.questionId)).toEqual(['sc-0001', 'sc-0002']);
  });
});

describe('cards', () => {
  it('round-trips an FSRS card', async () => {
    const card = createEmptyCard(new Date('2026-08-09T09:00:00Z'));
    await saveCard('awl-analyze', card);
    const stored = await getCards();
    expect(stored).toHaveLength(1);
    expect(stored[0].lexemeId).toBe('awl-analyze');
    expect(stored[0].card.reps).toBe(0);
  });

  it('round-trips the FSRS due date as a real Date, not a string', async () => {
    const dueDate = new Date('2026-08-09T09:00:00Z');
    const card = createEmptyCard(dueDate);
    await saveCard('awl-analyze', card);
    const stored = await getCards();
    expect(stored[0].card.due).toBeInstanceOf(Date);
    expect(stored[0].card.due.getTime()).toBe(dueDate.getTime());
  });

  it('overwrites a card for the same lexeme rather than duplicating', async () => {
    const card = createEmptyCard(new Date('2026-08-09T09:00:00Z'));
    await saveCard('awl-analyze', card);
    await saveCard('awl-analyze', { ...card, reps: 5 });
    const stored = await getCards();
    expect(stored).toHaveLength(1);
    expect(stored[0].card.reps).toBe(5);
  });

  it('rejects a corrupt card write and leaves the previously stored card intact', async () => {
    const goodCard = createEmptyCard(new Date('2026-08-09T09:00:00Z'));
    await saveCard('awl-analyze', goodCard);

    await expect(
      saveCard('awl-analyze', { ...goodCard, stability: NaN }),
    ).rejects.toThrow();

    const stored = await getCards();
    expect(stored).toHaveLength(1);
    expect(stored[0].card.stability).toBe(goodCard.stability);
  });
});

describe('remediation', () => {
  it('replaces the queue wholesale', async () => {
    const entries: RemediationEntry[] = [
      { cause: 'vocabulary-gap', targetId: 'awl-analyze', createdAt: 1, servings: 0 },
    ];
    await saveRemediation(entries);
    expect(await getRemediation()).toHaveLength(1);

    await saveRemediation([]);
    expect(await getRemediation()).toHaveLength(0);
  });

  it('leaves the previous queue intact if the replacement batch fails partway', async () => {
    await saveRemediation([
      { cause: 'vocabulary-gap', targetId: 'awl-analyze', createdAt: 1, servings: 0 },
    ]);

    const conflicting: RemediationEntry[] = [
      { cause: 'time-pressure', targetId: 'dup', createdAt: 2, servings: 0 },
      { cause: 'time-pressure', targetId: 'dup', createdAt: 3, servings: 1 },
    ];

    await expect(saveRemediation(conflicting)).rejects.toThrow();
    const remaining = await getRemediation();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].targetId).toBe('awl-analyze');
  });
});
