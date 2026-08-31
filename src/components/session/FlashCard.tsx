import { useState } from 'react';
import { EnglishText } from '../ui/EnglishText';
import type { Lexeme } from '../../content/types';

interface FlashCardProps {
  lexeme: Lexeme;
  onRate: (known: boolean) => void;
}

export function FlashCard({ lexeme, onRate }: FlashCardProps) {
  // SessionRunner keys this component by lexeme id, so a new word is a fresh
  // mount and this starts false without an effect. The previous version reset
  // it in a useEffect keyed on lexeme.id, which runs after commit: the next
  // word's first painted frame still carried the last one's revealed meaning.
  const [revealed, setRevealed] = useState(false);

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
