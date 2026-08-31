import { EnglishText } from '../ui/EnglishText';
import { ChoiceList } from './ChoiceList';
import type { Passage, QuestionItem } from '../../content/types';
import './question.css';

interface QuestionCardProps {
  question: QuestionItem;
  /** The text a reading question is about. Omitted for standalone items. */
  passage?: Passage;
  onAnswer: (index: number) => void;
  revealed: boolean;
  chosenIndex: number | null;
}

export function QuestionCard({
  question,
  passage,
  onAnswer,
  revealed,
  chosenIndex,
}: QuestionCardProps) {
  return (
    <article className={`question-card${passage ? ' question-card--with-passage' : ''}`}>
      {/* The passage stays on screen with the question rather than preceding
          it: exam reading questions are answered by looking back at the text,
          and a reader that hides it turns comprehension into memory. */}
      {passage && (
        <div className="passage">
          <h2 className="passage-title">
            <EnglishText>{passage.title}</EnglishText>
          </h2>
          <div className="passage-body">
            {passage.body.split(/\n{2,}/).map((para, i) => (
              <EnglishText as="p" key={i}>
                {para}
              </EnglishText>
            ))}
          </div>
        </div>
      )}
      <div className="question-body reading-measure">
        <EnglishText as="p">{question.stem}</EnglishText>
        <ChoiceList
          options={question.options}
          explanations={question.explanationPerOption}
          correctIndex={question.correctIndex}
          chosenIndex={chosenIndex}
          revealed={revealed}
          onChoose={onAnswer}
        />
      </div>
    </article>
  );
}
