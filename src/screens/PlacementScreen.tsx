import { useRef, useState } from 'react';
import { QuestionCard } from '../components/question/QuestionCard';
import { content } from '../content/index';
import {
  initialPlacementState,
  nextPlacementItem,
  applyPlacementAnswer,
  PLACEMENT_ITEM_COUNT,
  type PlacementState,
} from '../engines/placement';
import { seedCard } from '../engines/srs';
import { thetaToScore } from '../engines/theta';
import { getProfile, saveCard, saveProfile } from '../db/repository';
import './placement.css';

interface PlacementScreenProps {
  onDone: () => void;
}

/**
 * thetaToScore (src/engines/theta.ts) throws on non-finite input. Under
 * normal placement flow state.theta can never go non-finite - every write to
 * it passes through applyPlacementAnswer's own finite guards - but this feeds
 * the completion view's render, and an uncaught throw there would blank the
 * screen at the exact moment placement finishes: the worst possible time.
 * Computed ahead of the JSX rather than inside it, so a failure here is a
 * value the render branches on instead of an exception the render dies on.
 * Returns null (never a valid score) to signal failure, and logs so the
 * failure is not silent even though the screen recovers from it.
 */
function describePlacementScore(theta: number): number | null {
  try {
    return thetaToScore(theta);
  } catch (err) {
    console.error('Failed to compute placement score', err);
    return null;
  }
}

export function PlacementScreen({ onDone }: PlacementScreenProps) {
  const [state, setState] = useState<PlacementState>(initialPlacementState());
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [finishFailed, setFinishFailed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // Placement shows no right/wrong feedback (revealed stays false below), so
  // nothing disables the choice buttons the way SessionRunner's
  // revealed-on-chosenIndex does - a ref, not React state, because a second
  // click that fires before the first has yielded back to a render needs a
  // synchronously-visible guard, not one that only updates next render.
  const answering = useRef(false);

  const item = nextPlacementItem(state, content.questions);

  if (!item) {
    const score = describePlacementScore(state.theta);

    return (
      <section aria-labelledby="placement-done">
        <h1 id="placement-done">מבחן המיקום הסתיים</h1>
        {score === null ? (
          <p className="save-error" role="status" aria-label="שגיאת חישוב">
            <span className="save-error-glyph" aria-hidden="true">
              ✕
            </span>
            לא הצלחנו לחשב הערכה ראשונית.
          </p>
        ) : (
          <p>הערכה ראשונית: {score}</p>
        )}
        {/* Internal estimate only - the real NITE/AMIRNET calibration is not
            public, so this must never be presented as an official score. */}
        <p className="disclaimer">
          זהו אומדן פנימי בלבד, לא ציון מאל"ו. הוא נועד למעקב אחר מגמה.
        </p>
        {finishFailed && (
          <p className="save-error" role="status" aria-label="שגיאת שמירה">
            <span className="save-error-glyph" aria-hidden="true">
              ✕
            </span>
            השמירה נכשלה. אפשר לנסות שוב.
          </p>
        )}
        <button type="button" disabled={finishing} onClick={() => void finish()}>
          התחל ללמוד
        </button>
      </section>
    );
  }

  // Captured as a plain, non-null local here: narrowing `item` from
  // QuestionItem | null via the `if (!item)` guard above does not persist
  // into the nested handleAnswer function declared below (same reasoning as
  // SessionRunner.tsx's questionId/lexemeId captures), so TypeScript would
  // otherwise widen `item` back to QuestionItem | null inside it.
  const currentItem = item;

  // onAnswer's return value is never awaited by React or the DOM (it is
  // invoked from ChoiceList's synchronous onClick), so handleAnswer must
  // catch its own failures - an uncaught rejection here has no other
  // listener and is exactly the failure mode that once made this suite
  // exit non-zero with every assertion green (see SessionRunner.tsx).
  async function handleAnswer(choice: number) {
    // Reentrancy guard: without it, a second click landing before the first
    // click's `await saveCard` resolves re-enters this function with a
    // closure over the same pre-answer `state`, and the two calls'
    // setState(applyPlacementAnswer(...)) race - whichever settles last
    // silently wins, discarding the other click's contribution to theta and
    // to the seeded card. Checked and set synchronously (before any await),
    // so the second call sees it as already-true regardless of render
    // timing. Left `true` on failure, matching chosenIndex staying set
    // below: a placement item that failed to save is not retried, the same
    // "don't advance on a failure that already happened" reasoning
    // SessionRunner.tsx applies to its own save-failure path.
    if (answering.current) return;
    answering.current = true;

    setChosenIndex(choice);
    setSaveFailed(false);
    const correct = choice === currentItem.correctIndex;
    const now = new Date();

    try {
      // Seed vs review: a lexeme met during placement gets a seeded card
      // (seedCard), never a reviewed one. Wrong answers seed as due
      // immediately; correct answers enter normal FSRS scheduling.
      for (const lexemeId of currentItem.targetLexemes) {
        await saveCard(lexemeId, seedCard(correct, now));
      }
      setState(applyPlacementAnswer(state, currentItem, correct));
    } catch (err) {
      console.error('Failed to persist placement answer', err);
      setSaveFailed(true);
      return;
    }
    answering.current = false;
    setChosenIndex(null);
  }

  async function finish() {
    // Same reentrancy concern as handleAnswer, at lower stakes (a repeat
    // click just re-issues an idempotent save), so a plain state flag - also
    // giving the button a visible disabled state - is enough here. Reset on
    // failure (unlike handleAnswer's guard) since the visible "נסה שוב"
    // notice below explicitly offers a retry.
    if (finishing) return;
    setFinishing(true);
    setFinishFailed(false);
    try {
      const profile = await getProfile();
      await saveProfile({
        ...profile,
        theta: state.theta,
        answered: state.answered,
        placementDone: true,
        thetaHistory: [...profile.thetaHistory, { at: Date.now(), theta: state.theta }],
      });
    } catch (err) {
      console.error('Failed to save placement result', err);
      setFinishFailed(true);
      setFinishing(false);
      return;
    }
    onDone();
  }

  return (
    <section aria-labelledby="placement-heading">
      <h1 id="placement-heading">מבחן מיקום</h1>
      <p>
        שאלה {state.answered + 1} מתוך{' '}
        {Math.min(PLACEMENT_ITEM_COUNT, content.questions.length)}
      </p>
      <QuestionCard
        question={item}
        onAnswer={handleAnswer}
        revealed={false}
        chosenIndex={chosenIndex}
      />
      {saveFailed && (
        <p className="save-error" role="status" aria-label="שגיאת שמירה">
          <span className="save-error-glyph" aria-hidden="true">
            ✕
          </span>
          התשובה לא נשמרה.
        </p>
      )}
    </section>
  );
}
