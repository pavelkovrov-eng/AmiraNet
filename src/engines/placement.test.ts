import {
  initialPlacementState,
  nextPlacementItem,
  applyPlacementAnswer,
  PLACEMENT_ITEM_COUNT,
} from './placement';
import type { QuestionItem } from '../content/types';

function q(id: string, difficulty: number): QuestionItem {
  return {
    id,
    type: 'sentence-completion',
    difficulty,
    stem: 's',
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    explanationPerOption: ['1', '2', '3', '4'],
    primaryLexeme: 'awl-stub',
    targetLexemes: ['awl-stub'],
    trapType: 'phonetic-neighbor',
  };
}

const pool = [q('easy', -2), q('mid', 0), q('hard', 2)];

describe('placement', () => {
  it('starts at theta zero with nothing answered', () => {
    expect(initialPlacementState()).toEqual({ theta: 0, answered: 0, usedIds: [] });
  });

  it('opens with an item near the middle of the scale', () => {
    expect(nextPlacementItem(initialPlacementState(), pool)?.id).toBe('mid');
  });

  it('never repeats an item', () => {
    const state = { theta: 0, answered: 1, usedIds: ['mid'] };
    expect(nextPlacementItem(state, pool)?.id).not.toBe('mid');
  });

  it('stops after the placement item count', () => {
    const state = { theta: 0, answered: PLACEMENT_ITEM_COUNT, usedIds: [] };
    expect(nextPlacementItem(state, pool)).toBeNull();
  });

  it('returns null when the pool is exhausted', () => {
    const state = { theta: 0, answered: 1, usedIds: ['easy', 'mid', 'hard'] };
    expect(nextPlacementItem(state, pool)).toBeNull();
  });

  it('moves to a harder item after a correct answer', () => {
    let state = initialPlacementState();
    state = applyPlacementAnswer(state, q('mid', 0), true);
    expect(nextPlacementItem(state, pool)?.id).toBe('hard');
  });

  it('moves to an easier item after a wrong answer', () => {
    let state = initialPlacementState();
    state = applyPlacementAnswer(state, q('mid', 0), false);
    expect(nextPlacementItem(state, pool)?.id).toBe('easy');
  });

  it('counts the answer and marks the item used', () => {
    const state = applyPlacementAnswer(initialPlacementState(), q('mid', 0), true);
    expect(state.answered).toBe(1);
    expect(state.usedIds).toContain('mid');
  });

  it('does not mutate the state it is given', () => {
    const state = initialPlacementState();
    applyPlacementAnswer(state, q('mid', 0), true);
    expect(state.answered).toBe(0);
    expect(state.usedIds).toHaveLength(0);
  });

  it('converges upward for a consistently strong responder', () => {
    let state = initialPlacementState();
    const items = Array.from({ length: 20 }, (_, i) => q(`i${i}`, 1.5));
    for (const item of items) state = applyPlacementAnswer(state, item, true);
    expect(state.theta).toBeGreaterThan(1);
  });

  // Addition 1: applyPlacementAnswer must guard every numeric entry point
  // that feeds the stored PlacementState, the same way updateTheta guards
  // theta/itemDifficulty/answered — never fall back to a default on NaN or
  // Infinity, always throw naming the parameter and value.
  it('throws on a non-finite theta in state', () => {
    const nanState = { theta: NaN, answered: 0, usedIds: [] };
    const infState = { theta: Infinity, answered: 0, usedIds: [] };
    expect(() => applyPlacementAnswer(nanState, q('mid', 0), true)).toThrow();
    expect(() => applyPlacementAnswer(infState, q('mid', 0), true)).toThrow();
  });

  it('throws on a non-finite item difficulty', () => {
    const state = initialPlacementState();
    expect(() => applyPlacementAnswer(state, q('mid', NaN), true)).toThrow();
    expect(() => applyPlacementAnswer(state, q('mid', Infinity), true)).toThrow();
  });

  it('throws on a non-finite answered count in state', () => {
    const nanState = { theta: 0, answered: NaN, usedIds: [] };
    const infState = { theta: 0, answered: Infinity, usedIds: [] };
    expect(() => applyPlacementAnswer(nanState, q('mid', 0), true)).toThrow();
    expect(() => applyPlacementAnswer(infState, q('mid', 0), true)).toThrow();
  });
});
