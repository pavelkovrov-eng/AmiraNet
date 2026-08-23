import type { Lexeme } from '../content/types';

export const CHOICE_COUNT = 4;

export interface ChoiceSet {
  /** The Hebrew gloss shown as the prompt. */
  prompt: string;
  /** Four English headwords, one of which is the answer. */
  options: string[];
  correctIndex: number;
}

/**
 * Deterministic index in [0, max). A seed rather than Math.random so a card
 * shows the same arrangement on re-render and so tests can pin it.
 */
function pick(seed: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  return Math.floor((x - Math.floor(x)) * max);
}

function isFamilyOf(word: string, lexeme: Lexeme): boolean {
  const w = word.toLowerCase();
  return lexeme.family.some((f) => f.toLowerCase() === w);
}

/**
 * Builds a Hebrew-to-English multiple-choice card.
 *
 * Distractors come from the lexeme's own `confusableWith` first, because those
 * were chosen as genuine phonetic or orthographic neighbours and are the same
 * lures the real exam uses. When there are not enough, the pool fills the rest
 * with same-part-of-speech headwords — never a member of the answer's own
 * family, which would make two options correct.
 */
export function buildChoiceSet(lexeme: Lexeme, pool: Lexeme[], seed: number): ChoiceSet {
  if (!Number.isFinite(seed)) {
    throw new Error(`Invalid seed: ${seed} (must be finite)`);
  }

  const taken = new Set<string>([lexeme.headword.toLowerCase()]);
  const distractors: string[] = [];

  for (const word of lexeme.confusableWith) {
    if (distractors.length >= CHOICE_COUNT - 1) break;
    const key = word.toLowerCase();
    if (taken.has(key) || isFamilyOf(word, lexeme)) continue;
    taken.add(key);
    distractors.push(word);
  }

  if (distractors.length < CHOICE_COUNT - 1) {
    const samePos = pool.filter(
      (l) =>
        l.id !== lexeme.id &&
        l.pos === lexeme.pos &&
        !taken.has(l.headword.toLowerCase()) &&
        !isFamilyOf(l.headword, lexeme),
    );
    const fallback = samePos.length > 0 ? samePos : pool.filter((l) => l.id !== lexeme.id);

    // Walk the whole pool once from a seed-derived start. Random probing here
    // wasted its iteration budget on collisions and could return short.
    const start = fallback.length > 0 ? pick(seed, fallback.length) : 0;
    for (let step = 0; step < fallback.length; step++) {
      if (distractors.length >= CHOICE_COUNT - 1) break;
      const candidate = fallback[(start + step) % fallback.length];
      const key = candidate.headword.toLowerCase();
      if (taken.has(key)) continue;
      taken.add(key);
      distractors.push(candidate.headword);
    }
  }

  const correctIndex = pick(seed, Math.min(CHOICE_COUNT, distractors.length + 1));
  const options = [...distractors];
  options.splice(correctIndex, 0, lexeme.headword);

  return { prompt: lexeme.definitionHe, options, correctIndex };
}
