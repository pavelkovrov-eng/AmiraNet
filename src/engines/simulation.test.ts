import type { QuestionItem } from '../content/types';
import {
  assignSectionQuestions,
  EXAM_SECTIONS,
  TOTAL_SCORED_QUESTIONS,
  advanceSection,
  canReturnToSection,
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
