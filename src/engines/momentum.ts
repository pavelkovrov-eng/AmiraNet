import type { Attempt } from '../content/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Day index in the *local* calendar, not in UTC.
 *
 * A learner studying at 23:30 Israel time is two hours into the next UTC day,
 * so a UTC-based bucket would credit that session to tomorrow and then show
 * a broken streak the following evening. `setHours(0,0,0,0)` resolves in
 * whatever zone the device is actually in, which is the zone the person
 * experiences as "today".
 */
export function localDayIndex(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / DAY_MS);
}

export function answeredToday(attempts: readonly Attempt[], now: number): number {
  const today = localDayIndex(now);
  return attempts.filter((a) => localDayIndex(a.at) === today).length;
}

/**
 * Consecutive days of practice, counting back from today or yesterday.
 *
 * Yesterday counts as a valid anchor on purpose. Anchoring only on today
 * would reset the number to zero every midnight and show "0 ימים ברצף" to
 * someone who has studied fourteen days running and simply has not opened
 * the app yet this morning — turning the one number meant to create momentum
 * into a daily discouragement.
 */
export function streakDays(attempts: readonly Attempt[], now: number): number {
  if (attempts.length === 0) return 0;

  const days = new Set(attempts.map((a) => localDayIndex(a.at)));
  const today = localDayIndex(now);

  let cursor = days.has(today) ? today : days.has(today - 1) ? today - 1 : null;
  if (cursor === null) return 0;

  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor -= 1;
  }
  return count;
}
