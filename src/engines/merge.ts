import type { Card as FsrsCard } from 'ts-fsrs';
import type { Backup } from '../db/backup';
import type { Attempt, RemediationEntry } from '../content/types';
import type { Profile, StoredCard } from '../db/db';
import { updateTheta } from './theta';

/**
 * Combines two progress records into one, losing nothing from either.
 *
 * The app stores progress only on the device that produced it, so studying on
 * a phone and then on a laptop makes two histories that both contain real
 * work. Import used to *replace*, which meant carrying progress in one
 * direction silently discarded whatever the destination had done since.
 *
 * Every store merges by a rule that suits what it actually is, rather than by
 * one blanket "newest wins":
 *
 *   attempts     append-only facts. Union, keyed by question and timestamp,
 *                because the same answer synced twice is one event.
 *   cards        one scheduling state per word, so the later review wins -
 *                it already incorporates the earlier one.
 *   remediation  one entry per (cause, target); keep the higher serving count,
 *                since servings only ever go up.
 *   profile      derived, not merged. See recomputeProfile below.
 */
export function mergeBackups(a: Backup, b: Backup): Backup {
  const attempts = mergeAttempts(a.attempts, b.attempts);
  return {
    version: Math.max(a.version, b.version),
    exportedAt: new Date().toISOString(),
    profile: recomputeProfile(a.profile, b.profile, attempts),
    cards: mergeCards(a.cards, b.cards),
    attempts,
    remediation: mergeRemediation(a.remediation, b.remediation),
  };
}

/** An answer is identified by which question, answered when. */
const attemptKey = (x: Attempt) => `${x.questionId}@${x.at}`;

export function mergeAttempts(a: readonly Attempt[], b: readonly Attempt[]): Attempt[] {
  const byKey = new Map<string, Attempt>();
  for (const attempt of [...a, ...b]) byKey.set(attemptKey(attempt), attempt);
  return [...byKey.values()].sort((x, y) => x.at - y.at);
}

function reviewedAt(card: FsrsCard): number {
  const last = card.last_review ? new Date(card.last_review).getTime() : NaN;
  return Number.isFinite(last) ? last : -Infinity;
}

export function mergeCards(a: readonly StoredCard[], b: readonly StoredCard[]): StoredCard[] {
  const byLexeme = new Map<string, StoredCard>();
  for (const row of [...a, ...b]) {
    const existing = byLexeme.get(row.lexemeId);
    // A card with no review yet loses to one that has been reviewed; between
    // two reviewed cards the later review already folds in the earlier.
    if (!existing || reviewedAt(row.card) > reviewedAt(existing.card)) {
      byLexeme.set(row.lexemeId, row);
    }
  }
  return [...byLexeme.values()];
}

export function mergeRemediation(
  a: readonly RemediationEntry[],
  b: readonly RemediationEntry[],
): RemediationEntry[] {
  const byTarget = new Map<string, RemediationEntry>();
  for (const entry of [...a, ...b]) {
    const key = `${entry.cause}:${entry.targetId}`;
    const existing = byTarget.get(key);
    if (!existing || entry.servings > existing.servings) byTarget.set(key, entry);
  }
  return [...byTarget.values()];
}

/**
 * Rebuilds the ability estimate from the merged answers rather than picking
 * one device's number.
 *
 * theta is a fold over the answers that produced it, so with the full merged
 * history in hand the honest value is the fold re-run over all of it. Taking
 * the higher of the two, or the more recent, would report an estimate that no
 * actual sequence of answers supports — and this is the number the whole app
 * exists to move.
 *
 * `difficultyOf` is injected so this stays a pure function the tests can drive
 * without loading the content bundle.
 */
export function recomputeProfile(
  a: Profile,
  b: Profile,
  attempts: readonly Attempt[],
  difficultyOf?: (questionId: string) => number | undefined,
): Profile {
  const history = [...a.thetaHistory, ...b.thetaHistory];
  const byTime = new Map(history.map((point) => [point.at, point]));

  let theta = 0;
  let answered = 0;
  if (difficultyOf) {
    for (const attempt of attempts) {
      const difficulty = difficultyOf(attempt.questionId);
      // An answer to a question the bank no longer holds still happened, but
      // there is no difficulty to score it against, so it moves the count and
      // not the estimate.
      if (difficulty !== undefined) {
        theta = updateTheta(theta, difficulty, attempt.correct, answered);
      }
      answered += 1;
    }
  } else {
    // Without the question bank the fold cannot run; fall back to the record
    // that saw more answers, which is the closer of the two to the truth.
    const fuller = a.answered >= b.answered ? a : b;
    theta = fuller.theta;
    answered = Math.max(a.answered, b.answered, attempts.length);
  }

  return {
    id: 'me',
    theta,
    answered,
    // Placement is done once and cannot be undone by merging in a record that
    // predates it.
    placementDone: a.placementDone || b.placementDone,
    thetaHistory: [...byTime.values()].sort((x, y) => x.at - y.at),
  };
}
