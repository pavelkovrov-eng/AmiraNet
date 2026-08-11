import type { Card as FsrsCard } from 'ts-fsrs';
import { db, type Profile, type StoredCard } from './db';
import type { Attempt, RemediationEntry } from '../content/types';

const DEFAULT_PROFILE: Profile = {
  id: 'me',
  theta: 0,
  answered: 0,
  placementDone: false,
  thetaHistory: [],
};

/**
 * Reads the profile back from IndexedDB. This is the read boundary that
 * protects the theta engine (src/engines/theta.ts), which throws on
 * non-finite input: a partial write, a failed migration, or manual storage
 * tampering could otherwise hand a corrupt `theta` or `answered` straight
 * into `updateTheta` on the user's next answer, with no explanation.
 *
 * A corrupt record is surfaced as a thrown error rather than silently
 * replaced with the default profile. This is a single-user local app where
 * the profile is weeks of progress — silently resetting to defaults would
 * destroy that history and misreport the user as a beginner without any
 * indication anything went wrong. Throwing makes the corruption visible so
 * a caller can react deliberately (e.g. surface a "your data is corrupted"
 * message) instead of the app quietly forgetting the user's ability level.
 */
export async function getProfile(): Promise<Profile> {
  const stored = await db.profile.get('me');
  if (!stored) return DEFAULT_PROFILE;

  if (!Number.isFinite(stored.theta)) {
    throw new Error(`Corrupt profile: theta is ${stored.theta} (must be finite)`);
  }
  if (!Number.isFinite(stored.answered) || stored.answered < 0) {
    throw new Error(
      `Corrupt profile: answered is ${stored.answered} (must be finite and non-negative)`,
    );
  }

  return stored;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put(profile);
}

/**
 * Called once per answered question. Never batched.
 *
 * Passes a shallow copy to Dexie rather than `attempt` itself: for a table
 * with an auto-incrementing inbound key (`++seq`), Dexie mutates the object
 * it's given to inject the generated key back onto it. Handing over the
 * caller's own object would leak a `seq` onto it, which then poisons any
 * later record derived from that same object (e.g. via spread) with a
 * stale, already-used key.
 */
export async function recordAttempt(attempt: Attempt): Promise<void> {
  await db.attempts.add({ ...attempt });
}

export async function getAttempts(): Promise<Attempt[]> {
  return db.attempts.orderBy('seq').toArray();
}

export async function saveCard(lexemeId: string, card: FsrsCard): Promise<void> {
  await db.cards.put({ lexemeId, card });
}

export async function getCards(): Promise<StoredCard[]> {
  return db.cards.toArray();
}

export async function saveRemediation(entries: RemediationEntry[]): Promise<void> {
  await db.transaction('rw', db.remediation, async () => {
    await db.remediation.clear();
    await db.remediation.bulkAdd(
      entries.map((e) => ({ ...e, key: `${e.cause}:${e.targetId}` })),
    );
  });
}

export async function getRemediation(): Promise<RemediationEntry[]> {
  const rows = await db.remediation.toArray();
  return rows.map(({ key: _key, ...entry }) => entry);
}
