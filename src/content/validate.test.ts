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

  // Issue 1: Passage↔Question bidirectional consistency
  it('rejects when passage lists a non-reading question', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [
        question({ id: 'sc-9999', type: 'sentence-completion', passageId: 'psg-001' }),
        question({ id: 'rc-0001', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0002', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0003', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0004', type: 'reading', passageId: 'psg-001' }),
      ],
      passages: [passage({ questionIds: ['sc-9999', 'rc-0001', 'rc-0002', 'rc-0003', 'rc-0004'] })],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('sc-9999');
  });

  it('rejects when reading question does not point back to its passage', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [
        question({ id: 'rc-0001', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0002', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0003', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0004', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0005', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0006', type: 'reading', passageId: 'psg-001' }),
      ],
      passages: [
        passage({
          questionIds: ['rc-0001', 'rc-0003', 'rc-0004', 'rc-0005', 'rc-0006'],
        }),
      ],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('rc-0002');
  });

  it('rejects when passage question list has orphaned reading question', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [
        question({ id: 'rc-0001', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0002', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0003', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0004', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0005', type: 'reading', passageId: 'psg-001' }),
      ],
      passages: [
        passage({
          questionIds: ['rc-0001', 'rc-0002', 'rc-0003', 'rc-0004', 'rc-0006'],
        }),
      ],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    // rc-0006 is listed in passage but doesn't exist
    expect(result.ok === false && result.errors.join(' ')).toContain('rc-0006');
  });

  // Issue 2: Crashes on malformed input
  it('does not crash when bundle missing passages array', () => {
    const bundle = {
      lexemes: [lexeme()],
      questions: [question()],
    } as ContentBundle;
    expect(() => validateContent(bundle)).not.toThrow();
    // Should not crash, and treating missing array as empty is valid
    const result = validateContent(bundle);
    expect(result).toBeDefined();
  });

  it('does not crash when question missing targetLexemes', () => {
    const bundle = {
      lexemes: [lexeme()],
      questions: [{ ...question(), targetLexemes: undefined }],
      passages: [],
    } as any;
    expect(() => validateContent(bundle)).not.toThrow();
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
  });

  it('does not crash when bundle missing lexemes array', () => {
    const bundle = {
      questions: [question()],
      passages: [],
    } as unknown as ContentBundle;
    expect(() => validateContent(bundle)).not.toThrow();
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
  });

  // Issue 3: Unknown passageId coverage
  it('rejects a question referencing an unknown passageId', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ id: 'rc-0001', type: 'reading', passageId: 'psg-9999' })],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain('psg-9999');
  });

  // Issue 3: Reading question without passage coverage
  it('rejects a reading question that does not reference a passage', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ id: 'rc-0001', type: 'reading' })],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain('reading question');
  });

  // Issue 4: Schema field negative cases
  it('rejects a lexeme with invalid pos', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme({ pos: 'invalid' as any })],
      questions: [question()],
      passages: [],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  it('rejects a lexeme with out-of-range difficulty', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme({ difficulty: 6 as any })],
      questions: [question()],
      passages: [],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  it('rejects a passage with invalid domain', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [
        question({ id: 'rc-0001', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0002', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0003', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0004', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0005', type: 'reading', passageId: 'psg-001' }),
      ],
      passages: [
        passage({
          domain: 'invalid' as any,
          questionIds: ['rc-0001', 'rc-0002', 'rc-0003', 'rc-0004', 'rc-0005'],
        }),
      ],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  it('rejects a passage with non-positive wordCount', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [
        question({ id: 'rc-0001', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0002', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0003', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0004', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0005', type: 'reading', passageId: 'psg-001' }),
      ],
      passages: [
        passage({
          wordCount: 0,
          questionIds: ['rc-0001', 'rc-0002', 'rc-0003', 'rc-0004', 'rc-0005'],
        }),
      ],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  it('rejects a question with invalid type', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ type: 'invalid-type' as any })],
      passages: [],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  it('rejects a question with invalid trapType', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ trapType: 'invalid-trap' as any })],
      passages: [],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  it('rejects a question with invalid correctIndex', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ correctIndex: 5 as any })],
      passages: [],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  // Issue 5: Better error locators
  it('provides item index and headword when lexeme id is missing', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme({ id: '' })],
      questions: [question()],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('index 0');
    expect(result.ok === false && result.errors.join(' ')).toContain('headword');
  });

  it('provides item index in error message when question id is missing', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ id: '' })],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('index 0');
  });

  it('provides passage title in error message when id is missing', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [
        question({ id: 'rc-0001', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0002', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0003', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0004', type: 'reading', passageId: 'psg-001' }),
        question({ id: 'rc-0005', type: 'reading', passageId: 'psg-001' }),
      ],
      passages: [
        passage({
          id: '',
          questionIds: ['rc-0001', 'rc-0002', 'rc-0003', 'rc-0004', 'rc-0005'],
        }),
      ],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('Coral Reefs');
  });
});
