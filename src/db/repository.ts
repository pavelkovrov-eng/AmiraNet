import type { Card as FsrsCard } from 'ts-fsrs';
import { db, type Profile, type StoredCard } from './db';
import type { Attempt, RemediationEntry } from '../content/types';

/**
 * Fresh object every call — including a fresh `thetaHistory` array, since a
 * shared nested array is exactly as much of an aliasing hazard as sharing
 * the top-level object. Callers load-modify-save (e.g. `profile.answered
 * += 1` then `saveProfile(profile)`); a single reused singleton here would
 * mean one caller's in-memory edit silently becomes what every other
 * caller sees as the "default" before anything is ever saved.
 */
function createDefaultProfile(): Profile {
  return {
    id: 'me',
    theta: 0,
    answered: 0,
    placementDone: false,
    thetaHistory: [],
  };
}

/**
 * Shared invariant for the profile's numeric fields: `theta` must be
 * finite, and `answered` must be finite and non-negative. Enforced at
 * both boundaries:
 *
 * - The write boundary (saveProfile) is the stronger of the two: refusing
 *   a bad value there means the call site closest to the actual bug is
 *   where it gets caught, and the last-known-good profile already on disk
 *   is never overwritten.
 * - The read boundary (getProfile) still matters on its own, because
 *   storage can be corrupted by something other than this module's own
 *   writes — a partial write, a failed migration, or manual tampering. By
 *   the time that shows up, the bad value is already persisted, and the
 *   read boundary is the last thing standing between it and
 *   src/engines/theta.ts's `updateTheta`, which throws on non-finite
 *   input with no context about *why* the value was bad.
 *
 * Either way, a corrupt value is surfaced as a thrown error rather than
 * silently discarded. This is a single-user local app where the profile is
 * weeks of progress — silently falling back to defaults would both destroy
 * that history and misreport the user as a beginner, with no indication
 * anything went wrong.
 */
function assertFiniteProfile(theta: number, answered: number): void {
  if (!Number.isFinite(theta)) {
    throw new Error(`Corrupt profile: theta is ${theta} (must be finite)`);
  }
  if (!Number.isFinite(answered) || answered < 0) {
    throw new Error(
      `Corrupt profile: answered is ${answered} (must be finite and non-negative)`,
    );
  }
}

export async function getProfile(): Promise<Profile> {
  const stored = await db.profile.get('me');
  if (!stored) return createDefaultProfile();

  assertFiniteProfile(stored.theta, stored.answered);
  return stored;
}

export async function saveProfile(profile: Profile): Promise<void> {
  assertFiniteProfile(profile.theta, profile.answered);
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

/**
 * Same reasoning as assertFiniteProfile, applied to the FSRS card's
 * numeric fields. These feed Task 7's ts-fsrs scheduler directly, so a
 * corrupt `stability`/`difficulty`/etc. persisted here would surface later
 * as a broken review schedule with no indication which write caused it.
 * Checked for finiteness only (matching src/engines/theta.ts's own
 * contract of guarding non-finite input, not domain range) — this module
 * isn't in a position to know ts-fsrs's valid ranges for each field.
 */
function assertFiniteCard(card: FsrsCard): void {
  const numericFields: [string, number][] = [
    ['stability', card.stability],
    ['difficulty', card.difficulty],
    ['elapsed_days', card.elapsed_days],
    ['scheduled_days', card.scheduled_days],
    ['reps', card.reps],
    ['lapses', card.lapses],
    ['learning_steps', card.learning_steps],
  ];
  for (const [name, value] of numericFields) {
    if (!Number.isFinite(value)) {
      throw new Error(`Corrupt card: ${name} is ${value} (must be finite)`);
    }
  }
}

export async function saveCard(lexemeId: string, card: FsrsCard): Promise<void> {
  assertFiniteCard(card);
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
