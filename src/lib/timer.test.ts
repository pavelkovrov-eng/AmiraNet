import { createTimer, WARNING_FRACTION } from './timer';

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('createTimer', () => {
  it('starts with the full duration remaining', () => {
    const clock = fakeClock();
    const timer = createTimer(60000, clock.now);
    expect(timer.remainingMs()).toBe(60000);
  });

  it('starts at fraction 1', () => {
    const clock = fakeClock();
    expect(createTimer(60000, clock.now).fraction()).toBe(1);
  });

  it('decreases as the clock advances', () => {
    const clock = fakeClock();
    const timer = createTimer(60000, clock.now);
    clock.advance(15000);
    expect(timer.remainingMs()).toBe(45000);
    expect(timer.fraction()).toBeCloseTo(0.75);
  });

  it('does not drift across many reads with varied tick spacing', () => {
    const clock = fakeClock();
    const timer = createTimer(60000, clock.now);

    // Alternate between 60ms and 140ms advances to vary tick spacing
    for (let i = 0; i < 200; i++) {
      const advance = i % 2 === 0 ? 60 : 140;
      clock.advance(advance);

      // Read 3 times per advance - discriminates timestamp-delta from accumulator
      timer.remainingMs();
      timer.remainingMs();
      timer.remainingMs();
    }

    // Total advanced: 100 * 60 + 100 * 140 = 6000 + 14000 = 20000ms
    // Remaining should be 60000 - 20000 = 40000
    expect(timer.remainingMs()).toBe(40000);
  });

  it('floors remaining time at zero', () => {
    const clock = fakeClock();
    const timer = createTimer(5000, clock.now);
    clock.advance(999999);
    expect(timer.remainingMs()).toBe(0);
    expect(timer.fraction()).toBe(0);
  });

  it('reports expiry only after the duration elapses', () => {
    const clock = fakeClock();
    const timer = createTimer(5000, clock.now);
    expect(timer.isExpired()).toBe(false);
    clock.advance(4999);
    expect(timer.isExpired()).toBe(false);
    clock.advance(1);
    expect(timer.isExpired()).toBe(true);
  });

  it('enters the warning state below the warning fraction', () => {
    const clock = fakeClock();
    const timer = createTimer(10000, clock.now);
    expect(timer.isWarning()).toBe(false);
    clock.advance(10000 * (1 - WARNING_FRACTION) + 1);
    expect(timer.isWarning()).toBe(true);
  });

  it('rejects NaN duration', () => {
    const clock = fakeClock();
    expect(() => {
      createTimer(NaN, clock.now);
    }).toThrow('Invalid durationMs: NaN (must be finite)');
  });

  it('rejects Infinity duration', () => {
    const clock = fakeClock();
    expect(() => {
      createTimer(Infinity, clock.now);
    }).toThrow('Invalid durationMs: Infinity (must be finite)');
  });

  it('rejects negative infinity duration', () => {
    const clock = fakeClock();
    expect(() => {
      createTimer(-Infinity, clock.now);
    }).toThrow('Invalid durationMs: -Infinity (must be finite)');
  });

  it('rejects negative duration', () => {
    const clock = fakeClock();
    expect(() => {
      createTimer(-100, clock.now);
    }).toThrow('Invalid durationMs: -100 (must be non-negative)');
  });

  it('allows zero duration', () => {
    const clock = fakeClock();
    const timer = createTimer(0, clock.now);
    expect(timer.remainingMs()).toBe(0);
    expect(timer.fraction()).toBe(0);
    expect(timer.isExpired()).toBe(true);
    expect(timer.isWarning()).toBe(true);
  });

  it('remains expired after backward clock jump', () => {
    const clock = fakeClock();
    const timer = createTimer(5000, clock.now);
    clock.advance(5000);
    expect(timer.isExpired()).toBe(true);

    // Clock jumps backward
    clock.advance(-2000);

    // Should still be expired - monotonic expiry latch
    expect(timer.isExpired()).toBe(true);
    expect(timer.remainingMs()).toBe(0);
  });

  it('does not increase remaining time after backward clock jump', () => {
    const clock = fakeClock();
    const timer = createTimer(60000, clock.now);

    clock.advance(30000);
    const remaining1 = timer.remainingMs();
    expect(remaining1).toBe(30000);

    // Clock jumps backward by 20s
    clock.advance(-20000);

    // Remaining should not increase beyond previous value
    const remaining2 = timer.remainingMs();
    expect(remaining2).toBeLessThanOrEqual(remaining1);
    expect(remaining2).toBe(remaining1); // Should be identical with max elapsed tracking
  });

  it('maintains fraction in [0,1] across backward clock jump', () => {
    const clock = fakeClock();
    const timer = createTimer(60000, clock.now);

    clock.advance(30000);
    expect(timer.fraction()).toBeGreaterThanOrEqual(0);
    expect(timer.fraction()).toBeLessThanOrEqual(1);

    // Clock jumps backward by 20s
    clock.advance(-20000);

    // Fraction should still be in [0,1]
    expect(timer.fraction()).toBeGreaterThanOrEqual(0);
    expect(timer.fraction()).toBeLessThanOrEqual(1);
  });

  it('maintains monotonic remaining time across multiple backward jumps', () => {
    const clock = fakeClock();
    const timer = createTimer(60000, clock.now);

    clock.advance(45000);
    const r1 = timer.remainingMs();
    expect(r1).toBe(15000);

    clock.advance(-10000); // Backward jump
    const r2 = timer.remainingMs();
    expect(r2).toBeLessThanOrEqual(r1);

    clock.advance(-10000); // Another backward jump
    const r3 = timer.remainingMs();
    expect(r3).toBeLessThanOrEqual(r2);
  });
});
