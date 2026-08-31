import type { QuestionItem, QuestionType } from '../content/types';
import { updateTheta } from './theta';

export interface SectionSpec {
  index: number;
  type: QuestionType;
  questionCount: number;
  seconds: number;
}

/** Published Amirnet core structure: 23 scored questions across 39 minutes. */
export const EXAM_SECTIONS: SectionSpec[] = [
  { index: 0, type: 'sentence-completion', questionCount: 4, seconds: 240 },
  { index: 1, type: 'sentence-completion', questionCount: 4, seconds: 240 },
  { index: 2, type: 'reading', questionCount: 5, seconds: 900 },
  { index: 3, type: 'restatement', questionCount: 3, seconds: 360 },
  { index: 4, type: 'restatement', questionCount: 3, seconds: 360 },
  { index: 5, type: 'sentence-completion', questionCount: 4, seconds: 240 },
];

export const TOTAL_SCORED_QUESTIONS = 23;

export interface SimulationState {
  sectionIndex: number;
  locked: number[];
  answers: Record<string, number>;
}

export function initialSimulationState(): SimulationState {
  return { sectionIndex: 0, locked: [], answers: {} };
}

/**
 * Locks the current section permanently. The real exam offers no way back
 * once a section is confirmed, and practising under a softer rule builds
 * the wrong habit.
 */
export function advanceSection(state: SimulationState): SimulationState {
  return {
    ...state,
    answers: { ...state.answers },
    locked: [...state.locked, state.sectionIndex],
    sectionIndex: state.sectionIndex + 1,
  };
}

export function canReturnToSection(state: SimulationState, index: number): boolean {
  return !state.locked.includes(index);
}

/**
 * Maps each exam section to the specific questions it will show, with no
 * question ever repeated across sections.
 *
 * EXAM_SECTIONS is the fixed, published structure (23 scored slots), but the
 * seed content bank is smaller (16 items as of Task 16's wave 1). Filtering
 * per section independently - "give section N whatever matches its type,
 * starting from the front of the bank" - would hand sections 0, 1 and 5 the
 * exact same four sentence-completion questions in the same order, since
 * they'd all filter the same static array from the same starting point. A
 * simulated exam that quietly repeats questions across sections is worse
 * than one that runs a section short: it silently breaks the premise that
 * this is 23 distinct questions, not 6 shown three times.
 *
 * Instead this walks the bank once, in order, tracking which ids have
 * already been claimed, so every question is used at most once across the
 * whole exam. Sections earlier in the array get first claim on a type; a
 * type with fewer bank items than the exam's later sections need for it
 * comes up short there - by design, pinned by the caller rather than hidden
 * here. Deterministic given the same inputs, so it is safe (and cheap) to
 * compute once rather than per render or per section.
 */
export function assignSectionQuestions(
  sections: SectionSpec[],
  questions: QuestionItem[],
): QuestionItem[][] {
  const used = new Set<string>();
  return sections.map((section) => {
    const picked: QuestionItem[] = [];
    for (const question of questions) {
      if (picked.length >= section.questionCount) break;
      if (question.type !== section.type || used.has(question.id)) continue;
      picked.push(question);
      used.add(question.id);
    }
    return picked;
  });
}

/**
 * Ability estimate for a finished (or abandoned) simulation.
 *
 * Folds every question the exam actually *presented* — not every question
 * that got an answer. A presented question with no answer counts as wrong,
 * which is the real exam's rule, stated outright in NITE's own examinee
 * presentation: an unmarked question is treated as an incorrect answer, and
 * guessing can only help. The earlier version folded over `state.answers`
 * alone, so skipping a hard question cost nothing here and cost a point in
 * the exam. That made every simulation score flattering, and — worse for a
 * tool whose whole purpose is rehearsal — it trained the one habit the
 * official guidance explicitly warns against.
 *
 * Only locked sections are scored. A section the examinee never reached was
 * never put in front of them, so failing it would be an artefact of quitting
 * early rather than a measurement. Sections lock in exam order, so
 * `state.locked` already carries the sequence updateTheta's shrinking step
 * size expects.
 */
export function computeSimulationTheta(
  state: SimulationState,
  sectionQuestions: QuestionItem[][],
): number {
  const presented = state.locked.flatMap((index) => sectionQuestions[index] ?? []);
  return presented.reduce(
    (theta, question, answered) =>
      updateTheta(
        theta,
        question.difficulty,
        // Strict equality against a possibly-undefined lookup: unanswered is
        // not correct, which is the entire point of this function.
        state.answers[question.id] === question.correctIndex,
        answered,
      ),
    0,
  );
}
