export const THETA_MIN = -3;
export const THETA_MAX = 3;
export const PASS_THRESHOLD_SCORE = 134;
export const PASS_THRESHOLD_THETA = 2.04;

const SCORE_CENTER = 100;
const SCORE_PER_THETA = 50 / 3;
const SCORE_MIN = 50;
const SCORE_MAX = 150;
const STEP_BASE = 1.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Probability of a correct response under a 1PL (Rasch) model. */
function pCorrect(theta: number, difficulty: number): number {
  return 1 / (1 + Math.exp(-(theta - difficulty)));
}

/** Step shrinks as evidence accumulates, so the estimate settles. */
export function stepSize(answered: number): number {
  return STEP_BASE / Math.sqrt(Math.max(0, answered) + 1);
}

export function updateTheta(
  theta: number,
  itemDifficulty: number,
  correct: boolean,
  answered: number,
): number {
  if (!Number.isFinite(theta)) {
    throw new Error(`Invalid theta: ${theta} (must be finite)`);
  }
  if (!Number.isFinite(itemDifficulty)) {
    throw new Error(`Invalid itemDifficulty: ${itemDifficulty} (must be finite)`);
  }
  if (!Number.isFinite(answered)) {
    throw new Error(`Invalid answered: ${answered} (must be finite)`);
  }

  const expected = pCorrect(theta, itemDifficulty);
  const observed = correct ? 1 : 0;
  const next = theta + stepSize(answered) * (observed - expected);
  return clamp(next, THETA_MIN, THETA_MAX);
}

export function thetaToScore(theta: number): number {
  if (!Number.isFinite(theta)) {
    throw new Error(`Invalid theta: ${theta} (must be finite)`);
  }

  const raw = SCORE_CENTER + theta * SCORE_PER_THETA;
  return clamp(Math.round(raw), SCORE_MIN, SCORE_MAX);
}
