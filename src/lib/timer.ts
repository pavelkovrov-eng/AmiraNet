export const WARNING_FRACTION = 0.2;

export interface Timer {
  remainingMs(): number;
  fraction(): number;
  isExpired(): boolean;
  isWarning(): boolean;
}

/**
 * Timestamp-delta countdown. Reads are computed from a start timestamp
 * rather than accumulated ticks, so repeated polling cannot drift.
 */
export function createTimer(durationMs: number, now: () => number = Date.now): Timer {
  if (!Number.isFinite(durationMs)) {
    throw new Error(`Invalid durationMs: ${durationMs} (must be finite)`);
  }
  if (durationMs < 0) {
    throw new Error(`Invalid durationMs: ${durationMs} (must be non-negative)`);
  }

  const startedAt = now();

  function remainingMs(): number {
    return Math.max(0, durationMs - (now() - startedAt));
  }

  function fraction(): number {
    return durationMs === 0 ? 0 : remainingMs() / durationMs;
  }

  return {
    remainingMs,
    fraction,
    isExpired: () => remainingMs() === 0,
    isWarning: () => fraction() < WARNING_FRACTION,
  };
}
