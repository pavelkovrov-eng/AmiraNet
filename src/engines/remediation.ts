import type { DiagnosisCause, RemediationEntry } from '../content/types';

export const EVICT_AFTER_CORRECT_SERVINGS = 2;
export const EVICT_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function addRemediation(
  queue: RemediationEntry[],
  cause: DiagnosisCause,
  targetId: string,
  now: number,
): RemediationEntry[] {
  const exists = queue.some((e) => e.cause === cause && e.targetId === targetId);
  if (exists) return queue.map((e) => ({ ...e }));
  return [...queue.map((e) => ({ ...e })), { cause, targetId, createdAt: now, servings: 0 }];
}

/**
 * Applies the outcome of serving a remediation target, then evicts entries
 * that are satisfied or stale. Without eviction the queue grows without
 * bound and crowds out new material.
 */
export function recordServing(
  queue: RemediationEntry[],
  targetId: string,
  wasCorrect: boolean,
  now: number,
): RemediationEntry[] {
  return queue
    .map((entry) => {
      if (entry.targetId !== targetId) return { ...entry };
      return { ...entry, servings: wasCorrect ? entry.servings + 1 : 0 };
    })
    .filter((entry) => {
      if (entry.servings >= EVICT_AFTER_CORRECT_SERVINGS) return false;
      if (now - entry.createdAt > EVICT_AFTER_MS) return false;
      return true;
    });
}
