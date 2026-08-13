import { EnglishText } from '../ui/EnglishText';

interface ChoiceListProps {
  options: readonly string[];
  explanations: readonly string[];
  correctIndex: number;
  chosenIndex: number | null;
  revealed: boolean;
  onChoose: (index: number) => void;
}

function modifier(index: number, correctIndex: number, chosenIndex: number | null): string {
  if (index === correctIndex) return ' choice--correct';
  if (index === chosenIndex) return ' choice--wrong';
  return '';
}

export function ChoiceList({
  options,
  explanations,
  correctIndex,
  chosenIndex,
  revealed,
  onChoose,
}: ChoiceListProps) {
  return (
    <ol className="choice-list">
      {options.map((option, index) => (
        <li key={option}>
          <button
            type="button"
            className={`choice${revealed ? modifier(index, correctIndex, chosenIndex) : ''}`}
            disabled={revealed}
            onClick={() => onChoose(index)}
          >
            <EnglishText>{option}</EnglishText>
          </button>
          {revealed && (
            // dir + english-text applied directly (not via <EnglishText>, which has no
            // className passthrough): explanations are full English prose ending in
            // terminal punctuation, and without bidi isolation that punctuation visually
            // renders on the wrong side inside this app's RTL root. Confirmed empirically:
            // an unwrapped trailing "." renders to the LEFT of its preceding word here.
            <p className="choice-explanation english-text" dir="ltr">
              {explanations[index]}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
