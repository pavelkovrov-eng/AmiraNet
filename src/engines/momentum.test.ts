import { answeredToday, localDayIndex, streakDays } from './momentum';
import type { Attempt } from '../content/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local noon, `daysAgo` days back — far from any midnight boundary. */
function daysAgoAt(daysAgo: number, hour = 12): number {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.getTime() - daysAgo * DAY_MS;
}

function attempt(at: number): Attempt {
  return { questionId: 'q', chosenIndex: 0, correct: true, elapsedMs: 1000, at, diagnosis: null };
}

describe('localDayIndex', () => {
  it('buckets by the local calendar, not by UTC', () => {
    // 23:30 and 00:30 local are different days; a UTC bucket would disagree
    // for any device east of Greenwich, which includes the only timezone
    // this app is used in.
    const lateTonight = new Date();
    lateTonight.setHours(23, 30, 0, 0);
    const earlyTomorrow = new Date(lateTonight.getTime() + 60 * 60 * 1000);

    expect(localDayIndex(earlyTomorrow.getTime())).toBe(
      localDayIndex(lateTonight.getTime()) + 1,
    );
  });

  it('puts two different times on the same local day in the same bucket', () => {
    expect(localDayIndex(daysAgoAt(0, 8))).toBe(localDayIndex(daysAgoAt(0, 22)));
  });
});

describe('answeredToday', () => {
  it('counts only today', () => {
    const attempts = [attempt(daysAgoAt(0)), attempt(daysAgoAt(0)), attempt(daysAgoAt(1))];
    expect(answeredToday(attempts, Date.now())).toBe(2);
  });

  it('is zero on a fresh install', () => {
    expect(answeredToday([], Date.now())).toBe(0);
  });
});

describe('streakDays', () => {
  it('counts consecutive days ending today', () => {
    const attempts = [attempt(daysAgoAt(0)), attempt(daysAgoAt(1)), attempt(daysAgoAt(2))];
    expect(streakDays(attempts, Date.now())).toBe(3);
  });

  it('counts several attempts on one day once', () => {
    const attempts = [attempt(daysAgoAt(0)), attempt(daysAgoAt(0)), attempt(daysAgoAt(1))];
    expect(streakDays(attempts, Date.now())).toBe(2);
  });

  // The property that matters: opening the app in the morning, before
  // studying, must not report that a two-week run has ended.
  it('keeps the streak alive on a day that has not been studied yet', () => {
    const attempts = [attempt(daysAgoAt(1)), attempt(daysAgoAt(2)), attempt(daysAgoAt(3))];
    expect(streakDays(attempts, Date.now())).toBe(3);
  });

  it('breaks once a whole day was skipped', () => {
    const attempts = [attempt(daysAgoAt(0)), attempt(daysAgoAt(2)), attempt(daysAgoAt(3))];
    expect(streakDays(attempts, Date.now())).toBe(1);
  });

  it('reports zero when the last session was too long ago to anchor', () => {
    expect(streakDays([attempt(daysAgoAt(2))], Date.now())).toBe(0);
  });

  it('is zero on a fresh install', () => {
    expect(streakDays([], Date.now())).toBe(0);
  });
});
