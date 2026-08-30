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
  /** Decorative glyph carrying the distinction without relying on colour. */
  glyph: string;
  /** Hebrew text for assistive technology; colour and glyph both convey nothing to a screen reader. */
  label: string;
}

function describeGraded(
  index: number,
  correctIndex: number,
  chosenIndex: number | null,
): ChoiceState | null {
  if (index === correctIndex) {
    return { className: ' choice--correct', glyph: '✓', label: 'תשובה נכונה' };
  }
  if (index === chosenIndex) {
    return { className: ' choice--wrong', glyph: '✕', label: 'התשובה שלך – שגויה' };
  }
  return null;
}

/**
 * Picked, not yet submitted.
 *
 * Before this existed, an un-revealed list rendered no state at all: the
 * simulation recorded the tap into its answer sheet and showed the person
 * nothing back, so there was no way to see what had been selected or to
 * check an answer before locking the section. The glyph carries it without
 * colour, same rule as the graded marks.
 */
function describePending(index: number, chosenIndex: number | null): ChoiceState | null {
  return index === chosenIndex
    ? { className: ' choice--selected', glyph: '●', label: 'נבחר' }
    : null;
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
        const state = revealed
          ? describeGraded(index, correctIndex, chosenIndex)
          : describePending(index, chosenIndex);
        return (
          <li key={option}>
            <button
              type="button"
              className={`choice${state?.className ?? ''}`}
              disabled={revealed}
              // Only meaningful while the list is still answerable. Once
              // graded, "pressed" would compete with the correct/wrong
              // marking for the same announcement.
              aria-pressed={revealed ? undefined : index === chosenIndex}
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
