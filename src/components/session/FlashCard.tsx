import { useEffect, useState } from 'react';
import { EnglishText } from '../ui/EnglishText';
import type { Lexeme } from '../../content/types';

interface FlashCardProps {
  lexeme: Lexeme;
  onRate: (known: boolean) => void;
}

export function FlashCard({ lexeme, onRate }: FlashCardProps) {
  const [revealed, setRevealed] = useState(false);

  // Reset on card change, or the next word arrives already answered.
  useEffect(() => {
    setRevealed(false);
  }, [lexeme.id]);

  return (
    <article className="flashcard reading-measure">
      <EnglishText as="p">{lexeme.headword}</EnglishText>

      {!revealed && (
        <button type="button" onClick={() => setRevealed(true)}>
          הצג משמעות
        </button>
      )}

      {revealed && (
        <>
          <p className="flashcard-gloss">{lexeme.definitionHe}</p>
          <p className="flashcard-family">
            <EnglishText>{lexeme.family.join(', ')}</EnglishText>
          </p>
          <p className="flashcard-example">
            <EnglishText>{lexeme.exampleSentence}</EnglishText>
          </p>
          <div className="flashcard-rating">
            <button type="button" onClick={() => onRate(false)}>
              לא ידעתי
            </button>
            <button type="button" onClick={() => onRate(true)}>
              ידעתי
            </button>
          </div>
        </>
      )}
    </article>
  );
}
