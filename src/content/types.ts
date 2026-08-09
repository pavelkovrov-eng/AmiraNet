export type QuestionType =
  | 'sentence-completion'
  | 'restatement'
  | 'reading'
  | 'grammar-in-context';

export type TrapType =
  | 'phonetic-neighbor'
  | 'logic-inversion'
  | 'scope-shift'
  | 'tense-shift'
  | 'surface-match';

export type DiagnosisCause =
  | 'vocabulary-gap'
  | 'distractor-phonetic'
  | 'connector-misread'
  | 'time-pressure'
  | 'inference-error';

export interface Lexeme {
  id: string;
  headword: string;
  family: string[];
  definitionHe: string;
  definitionEn: string;
  pos: 'noun' | 'verb' | 'adjective' | 'adverb' | 'connector';
  morphology: { prefix?: string; root: string; suffixes: string[] };
  confusableWith: string[];
  exampleSentence: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

export interface QuestionItem {
  id: string;
  type: QuestionType;
  difficulty: number;
  stem: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanationPerOption: [string, string, string, string];
  /** The one word this item is really testing. Drives vocabulary-gap diagnosis. */
  primaryLexeme: string;
  /** Every lexeme the item exercises, including distractors. Drives coverage and SRS review. Must contain primaryLexeme. */
  targetLexemes: string[];
  trapType: TrapType;
  passageId?: string;
}

export interface Passage {
  id: string;
  title: string;
  body: string;
  domain: 'science' | 'history' | 'psychology' | 'economics' | 'humanities';
  difficulty: number;
  wordCount: number;
  questionIds: string[];
}

export interface RemediationEntry {
  cause: DiagnosisCause;
  targetId: string;
  createdAt: number;
  servings: number;
}

export interface Attempt {
  questionId: string;
  chosenIndex: number;
  correct: boolean;
  elapsedMs: number;
  at: number;
  diagnosis: DiagnosisCause | null;
}

export interface ContentBundle {
  lexemes: Lexeme[];
  questions: QuestionItem[];
  passages: Passage[];
}
