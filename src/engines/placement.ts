import { updateTheta } from './theta';
import type { QuestionItem } from '../content/types';

export const PLACEMENT_ITEM_COUNT = 20;

export interface PlacementState {
  theta: number;
  answered: number;
  usedIds: string[];
}

export function initialPlacementState(): PlacementState {
  return { theta: 0, answered: 0, usedIds: [] };
}

/** Picks the unused item whose difficulty sits closest to the current estimate. */
export function nextPlacementItem(
  state: PlacementState,
  pool: QuestionItem[],
): QuestionItem | null {
  if (state.answered >= PLACEMENT_ITEM_COUNT) return null;

  const used = new Set(state.usedIds);
  const candidates = pool.filter((q) => !used.has(q.id));
  if (candidates.length === 0) return null;

  return candidates.reduce((best, item) =>
    Math.abs(item.difficulty - state.theta) < Math.abs(best.difficulty - state.theta)
      ? item
      : best,
  );
}

/**
 * Guards mirror updateTheta's own (src/engines/theta.ts) exactly, and are
 * intentionally redundant with the checks inside updateTheta itself: theta
 * on the returned PlacementState is read back downstream (PlacementScreen's
 * completion view, then persisted into the profile), so this is the entry
 * point where a corrupt value should be caught, not merely wherever it
 * happens to get used first.
 */
export function applyPlacementAnswer(
  state: PlacementState,
  item: QuestionItem,
  correct: boolean,
): PlacementState {
  if (!Number.isFinite(state.theta)) {
    throw new Error(`Invalid theta: ${state.theta} (must be finite)`);
  }
  if (!Number.isFinite(item.difficulty)) {
    throw new Error(`Invalid itemDifficulty: ${item.difficulty} (must be finite)`);
  }
  if (!Number.isFinite(state.answered)) {
    throw new Error(`Invalid answered: ${state.answered} (must be finite)`);
  }

  return {
    theta: updateTheta(state.theta, item.difficulty, correct, state.answered),
    answered: state.answered + 1,
    usedIds: [...state.usedIds, item.id],
  };
}
