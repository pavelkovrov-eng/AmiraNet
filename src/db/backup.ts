import { db, type Profile, type StoredCard } from './db';
import type { Attempt, RemediationEntry } from '../content/types';

export const BACKUP_VERSION = 1;

export interface Backup {
  version: number;
  exportedAt: string;
  profile: Profile;
  cards: StoredCard[];
  attempts: Attempt[];
  remediation: RemediationEntry[];
}

/** Fields inside an FSRS card that are Dates and become strings in JSON. */
const CARD_DATE_FIELDS = ['due', 'last_review'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Revives the Date fields JSON flattened into strings.
 *
 * Without this the scheduler receives strings where it expects Dates,
 * `due.getTime()` yields NaN, every due comparison is false, and the word
 * silently never comes up for review again. The repository's read guard would
 * catch it on the next load, but only after the bad data had been written.
 */
function reviveCard(raw: unknown): StoredCard {
  if (!isPlainObject(raw) || typeof raw.lexemeId !== 'string' || !isPlainObject(raw.card)) {
    throw new Error('Corrupt backup: card entry is not shaped like a stored card');
  }

  const card: Record<string, unknown> = { ...raw.card };
  for (const field of CARD_DATE_FIELDS) {
    const value = card[field];
    if (value === undefined || value === null) continue;
    const revived = value instanceof Date ? value : new Date(String(value));
    if (!Number.isFinite(revived.getTime())) {
      throw new Error(`Corrupt backup: card ${raw.lexemeId} has an invalid ${field}`);
    }
    card[field] = revived;
  }

  return { lexemeId: raw.lexemeId, card: card as unknown as StoredCard['card'] };
}

function assertProfile(raw: unknown): Profile {
  if (!isPlainObject(raw)) throw new Error('Corrupt backup: profile is missing');
  const { theta, answered, placementDone, thetaHistory } = raw;
  if (!Number.isFinite(theta)) {
    throw new Error(`Corrupt backup: profile theta is ${String(theta)} (must be finite)`);
  }
  if (!Number.isFinite(answered) || (answered as number) < 0) {
    throw new Error(`Corrupt backup: profile answered is ${String(answered)}`);
  }
  if (typeof placementDone !== 'boolean') {
    throw new Error('Corrupt backup: profile placementDone is not a boolean');
  }
  if (!Array.isArray(thetaHistory)) {
    throw new Error('Corrupt backup: profile thetaHistory is not an array');
  }
  return {
    id: 'me',
    theta: theta as number,
    answered: answered as number,
    placementDone,
    thetaHistory: thetaHistory as Profile['thetaHistory'],
  };
}

export async function exportBackup(): Promise<Backup> {
  const [profile, cards, attempts, remediation] = await Promise.all([
    db.profile.get('me'),
    db.cards.toArray(),
    db.attempts.orderBy('seq').toArray(),
    db.remediation.toArray(),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile: profile ?? {
      id: 'me',
      theta: 0,
      answered: 0,
      placementDone: false,
      thetaHistory: [],
    },
    cards,
    attempts: attempts.map(({ seq: _seq, ...rest }) => rest),
    remediation: remediation.map(({ key: _key, ...rest }) => rest),
  };
}

/**
 * Replaces all stored progress with the backup's contents.
 *
 * Validation happens in full before anything is written, and the write runs
 * inside one transaction. A backup that fails halfway would otherwise leave
 * the user with neither their old progress nor the restored progress — the
 * worst outcome available for a file whose whole purpose is not losing work.
 */
export async function importBackup(raw: unknown): Promise<void> {
  if (!isPlainObject(raw)) throw new Error('Corrupt backup: not an object');
  if (raw.version !== BACKUP_VERSION) {
    throw new Error(
      `Unsupported backup version: ${String(raw.version)} (this app reads version ${BACKUP_VERSION})`,
    );
  }
  if (!Array.isArray(raw.cards) || !Array.isArray(raw.attempts) || !Array.isArray(raw.remediation)) {
    throw new Error('Corrupt backup: cards, attempts and remediation must all be arrays');
  }

  const profile = assertProfile(raw.profile);
  const cards = raw.cards.map(reviveCard);
  const attempts = raw.attempts as Attempt[];
  const remediation = raw.remediation as RemediationEntry[];

  await db.transaction('rw', db.profile, db.cards, db.attempts, db.remediation, async () => {
    await Promise.all([
      db.profile.clear(),
      db.cards.clear(),
      db.attempts.clear(),
      db.remediation.clear(),
    ]);
    await db.profile.put(profile);
    await db.cards.bulkAdd(cards);
    await db.attempts.bulkAdd(attempts);
    await db.remediation.bulkAdd(
      remediation.map((e) => ({ ...e, key: `${e.cause}:${e.targetId}` })),
    );
  });
}
