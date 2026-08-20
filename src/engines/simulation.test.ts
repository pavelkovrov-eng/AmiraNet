import {
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
