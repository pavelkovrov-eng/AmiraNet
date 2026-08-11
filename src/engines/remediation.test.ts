import {
  addRemediation,
  recordServing,
  EVICT_AFTER_CORRECT_SERVINGS,
  EVICT_AFTER_MS,
} from './remediation';
import type { RemediationEntry } from '../content/types';

const T0 = 1_700_000_000_000;

describe('addRemediation', () => {
  it('adds a new entry', () => {
    const queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual({
      cause: 'vocabulary-gap',
      targetId: 'awl-analyze',
      createdAt: T0,
      servings: 0,
    });
  });

  it('does not duplicate an existing target for the same cause', () => {
    let queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    queue = addRemediation(queue, 'vocabulary-gap', 'awl-analyze', T0 + 5000);
    expect(queue).toHaveLength(1);
  });

  it('keeps the same target under a different cause as a separate entry', () => {
    let queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    queue = addRemediation(queue, 'distractor-phonetic', 'awl-analyze', T0);
    expect(queue).toHaveLength(2);
  });

  it('does not mutate the input queue', () => {
    const original: RemediationEntry[] = [];
    addRemediation(original, 'vocabulary-gap', 'awl-analyze', T0);
    expect(original).toHaveLength(0);
  });
});

describe('recordServing', () => {
  it('increments servings on a correct answer', () => {
    const queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    const next = recordServing(queue, 'awl-analyze', true, T0 + 1000);
    expect(next[0].servings).toBe(1);
  });

  it('resets servings on a wrong answer', () => {
    let queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    queue = recordServing(queue, 'awl-analyze', true, T0 + 1000);
    queue = recordServing(queue, 'awl-analyze', false, T0 + 2000);
    expect(queue[0].servings).toBe(0);
  });

  it('evicts after the required correct servings', () => {
    let queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    for (let i = 0; i < EVICT_AFTER_CORRECT_SERVINGS; i++) {
      queue = recordServing(queue, 'awl-analyze', true, T0 + i * 1000);
    }
    expect(queue).toHaveLength(0);
  });

  it('evicts stale entries past the age limit', () => {
    const queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    const next = recordServing(queue, 'other-target', true, T0 + EVICT_AFTER_MS + 1);
    expect(next).toHaveLength(0);
  });

  it('leaves untouched targets alone', () => {
    let queue = addRemediation([], 'vocabulary-gap', 'a', T0);
    queue = addRemediation(queue, 'vocabulary-gap', 'b', T0);
    queue = recordServing(queue, 'a', true, T0 + 1000);
    expect(queue.find((e) => e.targetId === 'b')?.servings).toBe(0);
  });

  // Not in the brief's literal test code, added during mutation-testing
  // verification: addRemediation has an explicit non-mutation test but
  // recordServing did not, and an in-place-mutation regression (entries
  // mutated via a for-loop instead of .map) passed all of the brief's
  // given tests silently. The task's global constraints require both
  // functions to be proven non-mutating, so this closes that gap.
  it('does not mutate the input queue', () => {
    const original = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    const snapshot = original.map((e) => ({ ...e }));
    recordServing(original, 'awl-analyze', true, T0 + 1000);
    expect(original).toEqual(snapshot);
  });
});
