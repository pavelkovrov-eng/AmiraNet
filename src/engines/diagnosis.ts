import type {
  DiagnosisCause,
  Lexeme,
  QuestionItem,
  QuestionType,
} from '../content/types';

export const MIN_ATTEMPTS_FOR_PERSONAL_P90 = 20;

/** Seconds allotted per question in the real exam, by type. */
const EXAM_SECONDS: Record<QuestionType, number> = {
  'sentence-completion': 60,
  'grammar-in-context': 60,
  restatement: 120,
  reading: 180,
};

const COLD_START_MULTIPLIER = 1.5;

export function timeThresholdFor(
  type: QuestionType,
  personalP90: number | null,
): number {
  if (personalP90 !== null) return personalP90;
  return EXAM_SECONDS[type] * COLD_START_MULTIPLIER * 1000;
}

export interface DiagnosisInput {
  question: QuestionItem;
  chosenIndex: number;
  elapsedMs: number;
  isMastered: (lexemeId: string) => boolean;
  lexemeById: (id: string) => Lexeme | undefined;
  timeThresholdMs: number;
}

/**
 * Classifies the root cause of a wrong answer. Order matters: an unknown
 * target word makes every other signal a symptom rather than a cause.
 */
export function diagnose(input: DiagnosisInput): DiagnosisCause | null {
  const { question, chosenIndex, elapsedMs, isMastered, lexemeById, timeThresholdMs } = input;

  if (chosenIndex === question.correctIndex) return null;

  // 1. Vocabulary gap — checked against the PRIMARY lexeme only. Reading the
  // full targetLexemes list here would classify almost every wrong answer as
  // a vocabulary gap, since most items exercise several words and any one of
  // them being unmastered would trip the branch. That would collapse a
  // five-cause classifier into a one-cause one.
  if (!isMastered(question.primaryLexeme)) return 'vocabulary-gap';

  // 2. Chose a word the primary lexeme is known to be confused with.
  const chosenText = question.options[chosenIndex];
  const primary = lexemeById(question.primaryLexeme);
  if (primary?.confusableWith.includes(chosenText)) return 'distractor-phonetic';

  // 3. The item's trap was a reversed logical relation.
  if (question.trapType === 'logic-inversion') return 'connector-misread';

  // 4. Wrong and slow.
  if (elapsedMs > timeThresholdMs) return 'time-pressure';

  return 'inference-error';
}
