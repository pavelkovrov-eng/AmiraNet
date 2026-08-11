import { diagnose, timeThresholdFor, MIN_ATTEMPTS_FOR_PERSONAL_P90 } from './diagnosis';
import type { Lexeme, QuestionItem } from '../content/types';

const lexAnalyze: Lexeme = {
  id: 'awl-analyze',
  headword: 'analyze',
  family: ['analyze'],
  definitionHe: 'לנתח',
  definitionEn: 'examine in detail',
  pos: 'verb',
  morphology: { root: 'lys', suffixes: [] },
  confusableWith: ['analogy'],
  exampleSentence: 'They analyze data.',
  difficulty: 2,
  tags: [],
};

const question: QuestionItem = {
  id: 'sc-0001',
  type: 'sentence-completion',
  difficulty: 0.5,
  stem: 'They will ___ the data.',
  options: ['analyze', 'analogy', 'apologize', 'anarchy'],
  correctIndex: 0,
  explanationPerOption: ['a', 'b', 'c', 'd'],
  primaryLexeme: 'awl-analyze',
  targetLexemes: ['awl-analyze'],
  trapType: 'phonetic-neighbor',
};

const deps = {
  lexemeById: (id: string) => (id === 'awl-analyze' ? lexAnalyze : undefined),
  timeThresholdMs: 90_000,
};

describe('diagnose', () => {
  it('returns null for a correct answer', () => {
    const result = diagnose({
      question,
      chosenIndex: 0,
      elapsedMs: 20_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBeNull();
  });

  it('classifies an unmastered target lexeme as a vocabulary gap', () => {
    const result = diagnose({
      question,
      chosenIndex: 2,
      elapsedMs: 20_000,
      isMastered: () => false,
      ...deps,
    });
    expect(result).toBe('vocabulary-gap');
  });

  it('treats an unseen lexeme as a vocabulary gap', () => {
    const result = diagnose({
      question: {
        ...question,
        primaryLexeme: 'awl-unseen',
        targetLexemes: ['awl-unseen'],
      },
      chosenIndex: 2,
      elapsedMs: 20_000,
      isMastered: () => false,
      ...deps,
    });
    expect(result).toBe('vocabulary-gap');
  });

  it('ignores unmastered secondary lexemes when the primary is mastered', () => {
    const result = diagnose({
      question: {
        ...question,
        trapType: 'scope-shift',
        primaryLexeme: 'awl-analyze',
        targetLexemes: ['awl-analyze', 'awl-secondary-unmastered'],
      },
      chosenIndex: 2,
      elapsedMs: 20_000,
      isMastered: (id) => id === 'awl-analyze',
      ...deps,
    });
    // A secondary gap must not masquerade as the root cause, or the
    // classifier degenerates into reporting vocabulary-gap for everything.
    expect(result).toBe('inference-error');
  });

  it('prioritizes vocabulary gap over the phonetic trap', () => {
    const result = diagnose({
      question,
      chosenIndex: 1, // 'analogy' — a confusable
      elapsedMs: 20_000,
      isMastered: () => false,
      ...deps,
    });
    expect(result).toBe('vocabulary-gap');
  });

  it('classifies a confusable distractor when vocabulary is mastered', () => {
    const result = diagnose({
      question,
      chosenIndex: 1,
      elapsedMs: 20_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('distractor-phonetic');
  });

  it('classifies a logic-inversion trap as a connector misread', () => {
    const result = diagnose({
      question: { ...question, trapType: 'logic-inversion' },
      chosenIndex: 2,
      elapsedMs: 20_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('connector-misread');
  });

  it('prioritizes the phonetic distractor over the connector-misread trap', () => {
    const result = diagnose({
      // Both conditions are true at once: chosenIndex 1 ('analogy') is a
      // confusable AND the trap is logic-inversion. Only priority order
      // decides the outcome.
      question: { ...question, trapType: 'logic-inversion' },
      chosenIndex: 1,
      elapsedMs: 20_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('distractor-phonetic');
  });

  it('prioritizes the connector-misread trap over time pressure', () => {
    const result = diagnose({
      // Both conditions are true at once: the trap is logic-inversion AND
      // elapsedMs is over the threshold. Only priority order decides.
      question: { ...question, trapType: 'logic-inversion' },
      chosenIndex: 2,
      elapsedMs: 120_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('connector-misread');
  });

  it('classifies a slow wrong answer as time pressure', () => {
    const result = diagnose({
      question: { ...question, trapType: 'scope-shift' },
      chosenIndex: 2,
      elapsedMs: 120_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('time-pressure');
  });

  it('does not classify a wrong answer as time pressure exactly at the threshold', () => {
    const result = diagnose({
      // elapsedMs equals timeThresholdMs exactly (90_000). The comparison
      // must be strict (>), so this must fall through to inference-error.
      question: { ...question, trapType: 'scope-shift' },
      chosenIndex: 2,
      elapsedMs: 90_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('inference-error');
  });

  it('falls back to inference error', () => {
    const result = diagnose({
      question: { ...question, trapType: 'scope-shift' },
      chosenIndex: 2,
      elapsedMs: 20_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('inference-error');
  });
});

describe('timeThresholdFor', () => {
  it('uses the cold-start fallback when personal data is insufficient', () => {
    // sentence-completion is allotted 60s in the real exam; fallback is 1.5x
    expect(timeThresholdFor('sentence-completion', null)).toBe(90_000);
  });

  it('uses the personal percentile once it is available', () => {
    expect(timeThresholdFor('sentence-completion', 47_000)).toBe(47_000);
  });

  it('exposes the minimum attempts needed for a personal percentile', () => {
    expect(MIN_ATTEMPTS_FOR_PERSONAL_P90).toBe(20);
  });

  it('gives restatements a longer fallback than sentence completion', () => {
    expect(timeThresholdFor('restatement', null)).toBeGreaterThan(
      timeThresholdFor('sentence-completion', null),
    );
  });
});
