import { useEffect, useMemo, useState } from 'react';
import { EnglishText } from '../ui/EnglishText';
import { buildChoiceSet } from '../../engines/choice-card';
import type { Lexeme } from '../../content/types';

interface ChoiceCardProps {
  lexeme: Lexeme;
  pool: Lexeme[];
  /** Deterministic arrangement; the caller varies it per card. */
  seed: number;
  onAnswer: (correct: boolean) => void;
}

/**
 * Hebrew gloss to English word, scored objectively.
 *
 * The reveal-then-self-rate FlashCard measures a feeling of familiarity: with
 * the answer already on screen it is easy to report knowing a word one could
 * not have produced. Four options remove that, and the direction is the harder
 * one — recognising `analyze` as "לנתח" is far easier than retrieving it.
 */
export function ChoiceCard({ lexeme, pool, seed, onAnswer }: ChoiceCardProps) {
  const set = useMemo(() => buildChoiceSet(lexeme, pool, seed), [lexeme, pool, seed]);
  const [chosen, setChosen] = useState<number | null>(null);

  // Without this a new card arrives already answered.
  useEffect(() => {
    setChosen(null);
  }, [lexeme.id]);

  const revealed = chosen !== null;

  function stateOf(index: number): { className: string; label: string } | null {
    if (!revealed) return null;
    if (index === set.correctIndex) {
      return { className: ' choice--correct', label: 'תשובה נכונה' };
    }
    if (index === chosen) {
      return { className: ' choice--wrong', label: 'התשובה שלך – שגויה' };
    }
    return null;
  }

  return (
    <article className="flashcard reading-measure">
      <p className="flashcard-gloss">{set.prompt}</p>

      <ol className="choice-list">
        {set.options.map((option, index) => {
          const state = stateOf(index);
          return (
            <li key={option}>
              <button
                type="button"
                className={`choice${state?.className ?? ''}`}
                disabled={revealed}
                onClick={() => {
                  setChosen(index);
                  onAnswer(index === set.correctIndex);
                }}
              >
                {state && (
                  <span className="choice-mark" aria-hidden="true">
                    {index === set.correctIndex ? '✓' : '✕'}
                  </span>
                )}
                <EnglishText>{option}</EnglishText>
                {state && <span className="visually-hidden">{state.label}</span>}
              </button>
            </li>
          );
        })}
      </ol>

      {revealed && (
        <>
          <p className="flashcard-family">
            <EnglishText>{lexeme.family.join(', ')}</EnglishText>
          </p>
          <p className="flashcard-example">
            <EnglishText>{lexeme.exampleSentence}</EnglishText>
          </p>
        </>
      )}
    </article>
  );
}
