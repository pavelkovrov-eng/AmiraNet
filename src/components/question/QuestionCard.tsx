import { EnglishText } from '../ui/EnglishText';
import { ChoiceList } from './ChoiceList';
import type { QuestionItem } from '../../content/types';
import './question.css';

interface QuestionCardProps {
  question: QuestionItem;
  onAnswer: (index: number) => void;
  revealed: boolean;
  chosenIndex: number | null;
}

export function QuestionCard({ question, onAnswer, revealed, chosenIndex }: QuestionCardProps) {
  return (
    <article className="question-card reading-measure">
      <EnglishText as="p">{question.stem}</EnglishText>
      <ChoiceList
        options={question.options}
        explanations={question.explanationPerOption}
        correctIndex={question.correctIndex}
        chosenIndex={chosenIndex}
        revealed={revealed}
        onChoose={onAnswer}
      />
    </article>
  );
}
