import {
  updateTheta,
  thetaToScore,
  stepSize,
  THETA_MIN,
  THETA_MAX,
  PASS_THRESHOLD_SCORE,
  PASS_THRESHOLD_THETA,
} from './theta';

describe('thetaToScore', () => {
  it('maps theta 0 to score 100', () => {
    expect(thetaToScore(0)).toBe(100);
  });

  it('maps the pass threshold theta to the pass threshold score', () => {
    expect(thetaToScore(PASS_THRESHOLD_THETA)).toBe(PASS_THRESHOLD_SCORE);
  });

  it('maps theta +3 to 150', () => {
    expect(thetaToScore(3)).toBe(150);
  });

  it('maps theta -3 to 50', () => {
    expect(thetaToScore(-3)).toBe(50);
  });

  it('clamps above the maximum', () => {
    expect(thetaToScore(99)).toBe(150);
  });

  it('clamps below the minimum', () => {
    expect(thetaToScore(-99)).toBe(50);
  });

  it('returns integers', () => {
    expect(Number.isInteger(thetaToScore(1.234))).toBe(true);
  });

  it('throws on NaN theta', () => {
    expect(() => thetaToScore(NaN)).toThrow();
  });

  it('throws on Infinity theta', () => {
    expect(() => thetaToScore(Infinity)).toThrow();
  });

  it('rounds non-integer raw scores (theta 1.0 -> 117)', () => {
    expect(thetaToScore(1.0)).toBe(117);
  });

  it('rounds non-integer raw scores (theta 0.2 -> 103)', () => {
    expect(thetaToScore(0.2)).toBe(103);
  });
});

describe('stepSize', () => {
  it('shrinks as more items are answered', () => {
    expect(stepSize(0)).toBeGreaterThan(stepSize(10));
    expect(stepSize(10)).toBeGreaterThan(stepSize(50));
  });

  it('stays positive', () => {
    expect(stepSize(1000)).toBeGreaterThan(0);
  });

  it('stays finite and positive with negative input', () => {
    const size = stepSize(-1);
    expect(Number.isFinite(size)).toBe(true);
    expect(size).toBeGreaterThan(0);
  });
});

describe('updateTheta', () => {
  it('raises theta on a correct answer', () => {
    expect(updateTheta(0, 0, true, 0)).toBeGreaterThan(0);
  });

  it('lowers theta on a wrong answer', () => {
    expect(updateTheta(0, 0, false, 0)).toBeLessThan(0);
  });

  it('rewards a correct answer on a hard item more than on an easy one', () => {
    const hard = updateTheta(0, 2, true, 0);
    const easy = updateTheta(0, -2, true, 0);
    expect(hard).toBeGreaterThan(easy);
  });

  it('penalizes a wrong answer on an easy item more than on a hard one', () => {
    const easy = updateTheta(0, -2, false, 0);
    const hard = updateTheta(0, 2, false, 0);
    expect(easy).toBeLessThan(hard);
  });

  it('clamps to the theta ceiling', () => {
    expect(updateTheta(THETA_MAX, -3, true, 0)).toBeLessThanOrEqual(THETA_MAX);
  });

  it('clamps to the theta floor', () => {
    expect(updateTheta(THETA_MIN, 3, false, 0)).toBeGreaterThanOrEqual(THETA_MIN);
  });

  it('converges toward true ability under repeated correct answers', () => {
    let theta = 0;
    for (let i = 0; i < 40; i++) theta = updateTheta(theta, 1.5, true, i);
    expect(theta).toBeGreaterThan(1.5);
  });

  it('moves less per answer as the estimate settles', () => {
    const early = Math.abs(updateTheta(0, 0, true, 0) - 0);
    const late = Math.abs(updateTheta(0, 0, true, 40) - 0);
    expect(early).toBeGreaterThan(late);
  });

  it('throws on NaN theta', () => {
    expect(() => updateTheta(NaN, 0, true, 0)).toThrow();
  });

  it('throws on Infinity theta', () => {
    expect(() => updateTheta(Infinity, 0, true, 0)).toThrow();
  });

  it('throws on NaN itemDifficulty', () => {
    expect(() => updateTheta(0, NaN, true, 0)).toThrow();
  });

  it('throws on Infinity itemDifficulty', () => {
    expect(() => updateTheta(0, Infinity, true, 0)).toThrow();
  });

  it('throws on NaN answered', () => {
    expect(() => updateTheta(0, 0, true, NaN)).toThrow();
  });

  it('throws on Infinity answered', () => {
    expect(() => updateTheta(0, 0, true, Infinity)).toThrow();
  });
});
