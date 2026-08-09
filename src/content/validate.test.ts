import { validateContent } from './validate';
import type { ContentBundle, Lexeme, QuestionItem, Passage } from './types';

function lexeme(over: Partial<Lexeme> = {}): Lexeme {
  return {
    id: 'awl-analyze',
    headword: 'analyze',
    family: ['analyze', 'analysis'],
    definitionHe: 'לנתח',
    definitionEn: 'to examine in detail',
    pos: 'verb',
    morphology: { root: 'lys', suffixes: ['-is'] },
    confusableWith: ['analogy'],
    exampleSentence: 'Researchers analyze the data.',
    difficulty: 3,
    tags: ['awl-sublist-1'],
    ...over,
  };
}

function question(over: Partial<QuestionItem> = {}): QuestionItem {
  return {
    id: 'sc-0001',
    type: 'sentence-completion',
    difficulty: 0.5,
    stem: 'The committee will ___ the findings.',
    options: ['analyze', 'analogy', 'apologize', 'anarchy'],
    correctIndex: 0,
    explanationPerOption: ['correct', 'sounds similar', 'unrelated', 'unrelated'],
    primaryLexeme: 'awl-analyze',
    targetLexemes: ['awl-analyze'],
    trapType: 'phonetic-neighbor',
    ...over,
  };
}

function passage(over: Partial<Passage> = {}): Passage {
  return {
    id: 'psg-001',
    title: 'Coral Reefs',
    body: 'Coral reefs support enormous biodiversity.',
    domain: 'science',
    difficulty: 0.8,
    wordCount: 6,
    questionIds: ['rc-0001'],
    ...over,
  };
}

describe('validateContent', () => {
  it('accepts a well-formed bundle', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question()],
      passages: [],
    };
    expect(validateContent(bundle)).toEqual({ ok: true });
  });

  it('rejects a question referencing an unknown lexeme', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ targetLexemes: ['awl-ghost'] })],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain('awl-ghost');
  });

  it('rejects duplicate ids', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme(), lexeme()],
      questions: [],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain('duplicate');
  });

  it('rejects a passage whose questionIds do not exist', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question()],
      passages: [passage({ questionIds: ['rc-9999'] })],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain('rc-9999');
  });

  it('rejects a passage that does not have exactly five questions', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ id: 'rc-0001', type: 'reading', passageId: 'psg-001' })],
      passages: [passage()],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('exactly 5');
  });

  it('rejects an empty explanation for any option', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ explanationPerOption: ['correct', '', 'x', 'y'] })],
      passages: [],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  it('rejects difficulty outside the theta range', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ difficulty: 7 })],
      passages: [],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  it('rejects duplicate option text within a question', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ options: ['analyze', 'analyze', 'apologize', 'anarchy'] })],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('duplicate option');
  });

  it('rejects an unknown primaryLexeme', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [
        question({ primaryLexeme: 'awl-ghost', targetLexemes: ['awl-analyze', 'awl-ghost'] }),
      ],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('unknown primaryLexeme');
  });

  it('rejects a primaryLexeme that is not among the targetLexemes', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme(), lexeme({ id: 'awl-other', headword: 'other' })],
      questions: [question({ primaryLexeme: 'awl-other', targetLexemes: ['awl-analyze'] })],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('missing from targetLexemes');
  });

  it('accepts a question whose targetLexemes extend beyond the primary', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme(), lexeme({ id: 'awl-other', headword: 'other' })],
      questions: [
        question({ primaryLexeme: 'awl-analyze', targetLexemes: ['awl-analyze', 'awl-other'] }),
      ],
      passages: [],
    };
    expect(validateContent(bundle)).toEqual({ ok: true });
  });

  it('rejects an empty targetLexemes list', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ targetLexemes: [] })],
      passages: [],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });
});
