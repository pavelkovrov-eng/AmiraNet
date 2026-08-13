import { EnglishText } from '../ui/EnglishText';

interface ChoiceListProps {
  options: readonly string[];
  explanations: readonly string[];
  correctIndex: number;
  chosenIndex: number | null;
  revealed: boolean;
  onChoose: (index: number) => void;
}

interface ChoiceState {
  /** Leading space so it concatenates directly onto the "choice" base class. */
  className: string;
  /** Decorative glyph carrying the correct/wrong distinction without relying on colour. */
  glyph: string;
  /** Hebrew text for assistive technology; colour and glyph both convey nothing to a screen reader. */
  label: string;
}

function describeState(index: number, correctIndex: number, chosenIndex: number | null): ChoiceState | null {
  if (index === correctIndex) {
    return { className: ' choice--correct', glyph: '✓', label: 'תשובה נכונה' };
  }
  if (index === chosenIndex) {
    return { className: ' choice--wrong', glyph: '✕', label: 'התשובה שלך – שגויה' };
  }
  return null;
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
      {options.map((option, index) => {
        const state = revealed ? describeState(index, correctIndex, chosenIndex) : null;
        return (
          <li key={option}>
            <button
              type="button"
              className={`choice${state?.className ?? ''}`}
              disabled={revealed}
              onClick={() => onChoose(index)}
            >
              <EnglishText>{option}</EnglishText>
              {state && (
                <span className="choice-mark" aria-hidden="true">
                  {state.glyph}
                </span>
              )}
              {state && <span className="visually-hidden">{state.label}</span>}
            </button>
            {revealed && (
              <p className="choice-explanation">
                <EnglishText>{explanations[index]}</EnglishText>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
