import { buildChoiceSet, CHOICE_COUNT } from './choice-card';
import type { Lexeme } from '../content/types';

function lex(over: Partial<Lexeme> = {}): Lexeme {
  return {
    id: 'awl-analyze',
    headword: 'analyze',
    family: ['analyze', 'analysis'],
    definitionHe: 'לנתח',
    definitionEn: 'to examine in detail',
    pos: 'verb',
    morphology: { root: 'lys', suffixes: [] },
    confusableWith: ['analogy', 'paralysis'],
    exampleSentence: 'They analyze the data.',
    difficulty: 2,
    tags: [],
    ...over,
  };
}

const pool = [
  lex({ id: 'p1', headword: 'derive', family: ['derive'], confusableWith: [] }),
  lex({ id: 'p2', headword: 'obtain', family: ['obtain'], confusableWith: [] }),
  lex({ id: 'p3', headword: 'restrict', family: ['restrict'], confusableWith: [] }),
  lex({ id: 'p4', headword: 'anthem', family: ['anthem'], pos: 'noun', confusableWith: [] }),
];

describe('buildChoiceSet', () => {
  it('prompts with the Hebrew gloss, not the English word', () => {
    const set = buildChoiceSet(lex(), pool, 1);
    expect(set.prompt).toBe('לנתח');
  });

  it('always produces exactly four options', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(buildChoiceSet(lex(), pool, seed).options).toHaveLength(CHOICE_COUNT);
    }
  });

  it('places the headword at the reported correct index', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const set = buildChoiceSet(lex(), pool, seed);
      expect(set.options[set.correctIndex]).toBe('analyze');
    }
  });

  it('prefers the lexeme own confusables as distractors', () => {
    const set = buildChoiceSet(lex(), pool, 3);
    expect(set.options).toContain('analogy');
    expect(set.options).toContain('paralysis');
  });

  it('never offers two options from the answer family', () => {
    // 'analysis' is family, so offering it would make two options defensible.
    const set = buildChoiceSet(lex({ confusableWith: ['analysis', 'analogy'] }), pool, 5);
    expect(set.options).not.toContain('analysis');
    expect(new Set(set.options).size).toBe(CHOICE_COUNT);
  });

  it('fills from the pool when confusables are too few', () => {
    const set = buildChoiceSet(lex({ confusableWith: [] }), pool, 7);
    expect(set.options).toHaveLength(CHOICE_COUNT);
    expect(new Set(set.options).size).toBe(CHOICE_COUNT);
  });

  it('prefers same-part-of-speech fillers', () => {
    // pool has three verbs and one noun; the noun should not be reached first.
    const set = buildChoiceSet(lex({ confusableWith: [] }), pool, 11);
    expect(set.options).not.toContain('anthem');
  });

  it('is deterministic for a given seed', () => {
    const a = buildChoiceSet(lex(), pool, 42);
    const b = buildChoiceSet(lex(), pool, 42);
    expect(a).toEqual(b);
  });

  it('varies the answer position across seeds', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      seen.add(buildChoiceSet(lex(), pool, seed).correctIndex);
    }
    // A fixed position would make the card trainable without reading it.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('rejects a non-finite seed', () => {
    expect(() => buildChoiceSet(lex(), pool, NaN)).toThrow(/Invalid seed/);
    expect(() => buildChoiceSet(lex(), pool, Infinity)).toThrow(/Invalid seed/);
  });
});
