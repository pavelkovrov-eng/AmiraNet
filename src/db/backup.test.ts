import 'fake-indexeddb/auto';
import { createEmptyCard, State } from 'ts-fsrs';
import { db } from './db';
import { exportBackup, importBackup, resetProgress, BACKUP_VERSION } from './backup';
import { getAttempts, getCards, getProfile, recordAttempt, saveCard, saveProfile } from './repository';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seed() {
  await saveProfile({
    id: 'me',
    theta: 1.4,
    answered: 12,
    placementDone: true,
    thetaHistory: [{ at: 1_700_000_000_000, theta: 1.4 }],
  });
  await saveCard('awl-analyze', {
    ...createEmptyCard(new Date('2026-08-09T09:00:00Z')),
    state: State.Review,
    scheduled_days: 30,
  });
  await recordAttempt({
    questionId: 'sc-0001',
    chosenIndex: 1,
    correct: false,
    elapsedMs: 42_000,
    at: 1_700_000_000_000,
    diagnosis: 'vocabulary-gap',
  });
}

describe('exportBackup', () => {
  it('captures every store', async () => {
    await seed();
    const backup = await exportBackup();
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.profile.theta).toBe(1.4);
    expect(backup.cards).toHaveLength(1);
    expect(backup.attempts).toHaveLength(1);
  });

  it('exports a default profile rather than failing on a fresh install', async () => {
    const backup = await exportBackup();
    expect(backup.profile.theta).toBe(0);
    expect(backup.profile.placementDone).toBe(false);
  });

  it('omits the auto-increment key so a re-import cannot collide', async () => {
    await seed();
    const backup = await exportBackup();
    expect(backup.attempts[0]).not.toHaveProperty('seq');
  });
});

describe('importBackup', () => {
  it('restores progress through a full JSON round trip', async () => {
    await seed();
    const json = JSON.stringify(await exportBackup());

    await db.delete();
    await db.open();
    expect((await getProfile()).answered).toBe(0);

    await importBackup(JSON.parse(json));

    const profile = await getProfile();
    expect(profile.theta).toBe(1.4);
    expect(profile.answered).toBe(12);
    expect(profile.placementDone).toBe(true);
  });

  it('revives card dates that JSON flattened into strings', async () => {
    await seed();
    const json = JSON.stringify(await exportBackup());
    await db.delete();
    await db.open();
    await importBackup(JSON.parse(json));

    const [stored] = await getCards();
    // A string here would make due.getTime() return NaN, so every due
    // comparison would be false and the word would never resurface.
    expect(stored.card.due).toBeInstanceOf(Date);
    expect(Number.isFinite(stored.card.due.getTime())).toBe(true);
  });

  it('rejects an unsupported version', async () => {
    await expect(importBackup({ version: 99 })).rejects.toThrow(/Unsupported backup version/);
  });

  it('rejects a non-finite theta rather than poisoning the estimate', async () => {
    await expect(
      importBackup({
        version: BACKUP_VERSION,
        profile: { theta: NaN, answered: 0, placementDone: false, thetaHistory: [] },
        cards: [],
        attempts: [],
        remediation: [],
      }),
    ).rejects.toThrow(/theta/);
  });

  it('rejects a card whose date cannot be parsed', async () => {
    await expect(
      importBackup({
        version: BACKUP_VERSION,
        profile: { theta: 0, answered: 0, placementDone: false, thetaHistory: [] },
        cards: [{ lexemeId: 'x', card: { due: 'not-a-date' } }],
        attempts: [],
        remediation: [],
      }),
    ).rejects.toThrow(/invalid due/);
  });

  it('leaves existing progress untouched when the backup is rejected', async () => {
    await seed();
    await expect(importBackup({ version: 99 })).rejects.toThrow();

    // The property that matters: a bad file must not cost the user the
    // progress they already had.
    const profile = await getProfile();
    expect(profile.theta).toBe(1.4);
    expect(profile.answered).toBe(12);
    expect(await getCards()).toHaveLength(1);
  });

  it('replaces rather than merges', async () => {
    await seed();
    await importBackup({
      version: BACKUP_VERSION,
      profile: { theta: -0.5, answered: 3, placementDone: false, thetaHistory: [] },
      cards: [],
      attempts: [],
      remediation: [],
    });
    expect((await getProfile()).theta).toBe(-0.5);
    expect(await getCards()).toHaveLength(0);
  });
});

describe('resetProgress', () => {
  it('returns the app to a first-run state', async () => {
    await seed();
    await resetProgress();

    const profile = await getProfile();
    expect(profile.placementDone).toBe(false);
    expect(profile.theta).toBe(0);
    expect(profile.answered).toBe(0);
    expect(await getCards()).toHaveLength(0);
    expect(await getAttempts()).toHaveLength(0);
  });

  // The point of the reset is retaking the placement test, which the app
  // only offers when placementDone is false.
  it('leaves the placement test available again', async () => {
    await saveProfile({
      id: 'me',
      theta: 1.9,
      answered: 40,
      placementDone: true,
      thetaHistory: [{ at: 1, theta: 1.9 }],
    });
    await resetProgress();
    expect((await getProfile()).placementDone).toBe(false);
  });
});
