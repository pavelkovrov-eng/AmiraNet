import type { QuestionItem } from '../content/types';
import {
  assignSectionQuestions,
  EXAM_SECTIONS,
  TOTAL_SCORED_QUESTIONS,
  advanceSection,
  canReturnToSection,
  computeSimulationTheta,
  initialSimulationState,
} from './simulation';

describe('EXAM_SECTIONS', () => {
  it('has six scored sections', () => {
    expect(EXAM_SECTIONS).toHaveLength(6);
  });

  it('totals 23 scored questions', () => {
    const total = EXAM_SECTIONS.reduce((sum, s) => sum + s.questionCount, 0);
    expect(total).toBe(TOTAL_SCORED_QUESTIONS);
  });

  it('totals 39 minutes', () => {
    const total = EXAM_SECTIONS.reduce((sum, s) => sum + s.seconds, 0);
    expect(total).toBe(39 * 60);
  });

  it('matches the published section order', () => {
    expect(EXAM_SECTIONS.map((s) => s.type)).toEqual([
      'sentence-completion',
      'sentence-completion',
      'reading',
      'restatement',
      'restatement',
      'sentence-completion',
    ]);
  });

  it('allots 15 minutes to the reading section', () => {
    expect(EXAM_SECTIONS[2].seconds).toBe(900);
  });
});

describe('section locking', () => {
  it('starts on the first section with nothing locked', () => {
    const state = initialSimulationState();
    expect(state.sectionIndex).toBe(0);
    expect(state.locked).toEqual([]);
  });

  it('allows returning within the current section', () => {
    expect(canReturnToSection(initialSimulationState(), 0)).toBe(true);
  });

  it('locks a section on advance', () => {
    const state = advanceSection(initialSimulationState());
    expect(state.locked).toContain(0);
    expect(state.sectionIndex).toBe(1);
  });

  it('forbids returning to a locked section', () => {
    const state = advanceSection(initialSimulationState());
    expect(canReturnToSection(state, 0)).toBe(false);
  });

  it('does not mutate the state it is given', () => {
    const state = initialSimulationState();
    advanceSection(state);
    expect(state.sectionIndex).toBe(0);
    expect(state.locked).toHaveLength(0);
  });

  it('accumulates locks across sections', () => {
    let state = initialSimulationState();
    state = advanceSection(state);
    state = advanceSection(state);
    expect(state.locked).toEqual([0, 1]);
  });
});

describe('assignSectionQuestions under a deficient bank', () => {
  // The screen-level test can no longer exercise the empty-section path,
  // because the real content bank now fills every section. The behaviour
  // still needs pinning, so it is pinned here where the input is injectable
  // rather than left to a bank size that keeps changing under it.
  function q(id: string, type: QuestionItem['type']): QuestionItem {
    return {
      id,
      type,
      difficulty: 0,
      stem: id,
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
      explanationPerOption: ['1', '2', '3', '4'],
      primaryLexeme: 'awl-stub',
      targetLexemes: ['awl-stub'],
      trapType: 'phonetic-neighbor',
    };
  }

  it('gives a section an empty list when the bank has none of its type', () => {
    const assigned = assignSectionQuestions(EXAM_SECTIONS, [q('sc-a', 'sentence-completion')]);
    // Section 4 (index 3) is restatement; the bank holds none.
    expect(assigned[3]).toEqual([]);
  });

  it('never assigns the same question to two sections', () => {
    const bank = [q('sc-a', 'sentence-completion'), q('sc-b', 'sentence-completion')];
    const assigned = assignSectionQuestions(EXAM_SECTIONS, bank);
    const ids = assigned.flat().map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('short-fills rather than padding when a type runs out mid-section', () => {
    const bank = [q('sc-a', 'sentence-completion'), q('sc-b', 'sentence-completion')];
    const assigned = assignSectionQuestions(EXAM_SECTIONS, bank);
    // Section 1 wants 4 sentence-completion items and can only get 2.
    expect(assigned[0]).toHaveLength(2);
  });
});

describe('computeSimulationTheta', () => {
  function item(id: string, correctIndex: 0 | 1): QuestionItem {
    return {
      id,
      type: 'sentence-completion',
      difficulty: 0,
      stem: id,
      options: ['a', 'b', 'c', 'd'],
      correctIndex,
      explanationPerOption: ['1', '2', '3', '4'],
      primaryLexeme: 'awl-stub',
      targetLexemes: ['awl-stub'],
      trapType: 'phonetic-neighbor',
    };
  }

  const twoQuestions = [[item('a', 0), item('b', 0)]];
  const locked = (answers: Record<string, number>) => ({
    sectionIndex: 1,
    locked: [0],
    answers,
  });

  // The rule this function exists for. NITE's examinee presentation states
  // it outright: an unmarked question is treated as an incorrect answer,
  // which is why guessing can only help. A simulation that ignored skipped
  // questions scored every run high and rehearsed the opposite habit.
  it('counts a presented but unanswered question as wrong', () => {
    const skipped = computeSimulationTheta(locked({ a: 0 }), twoQuestions);
    const answeredWrong = computeSimulationTheta(locked({ a: 0, b: 1 }), twoQuestions);
    expect(skipped).toBe(answeredWrong);
  });

  it('scores a correct answer strictly above skipping the same question', () => {
    const skipped = computeSimulationTheta(locked({ a: 0 }), twoQuestions);
    const bothCorrect = computeSimulationTheta(locked({ a: 0, b: 0 }), twoQuestions);
    expect(bothCorrect).toBeGreaterThan(skipped);
  });

  it('puts an all-skipped section below zero rather than at it', () => {
    // Zero is what the earlier implementation returned for a blank exam,
    // because it folded over answers and there were none. A blank exam is a
    // failed exam, not an average one.
    expect(computeSimulationTheta(locked({}), twoQuestions)).toBeLessThan(0);
  });

  // Quitting in section 1 must not be recorded as failing sections 2-6.
  // Only what was actually put in front of the examinee is measured.
  it('ignores sections that were never reached', () => {
    const sections = [[item('a', 0)], [item('b', 0)]];
    const onlyFirstLocked = computeSimulationTheta(
      { sectionIndex: 1, locked: [0], answers: { a: 0 } },
      sections,
    );
    const bothLocked = computeSimulationTheta(
      { sectionIndex: 2, locked: [0, 1], answers: { a: 0 } },
      sections,
    );
    expect(onlyFirstLocked).toBeGreaterThan(0);
    expect(bothLocked).toBeLessThan(onlyFirstLocked);
  });

  it('returns the baseline when nothing has been locked yet', () => {
    expect(computeSimulationTheta(initialSimulationState(), twoQuestions)).toBe(0);
  });

  it('tolerates a locked section that holds no questions', () => {
    expect(computeSimulationTheta({ sectionIndex: 1, locked: [0], answers: {} }, [[]])).toBe(0);
  });
});
