import { useEffect, useRef, useState } from 'react';
import { QuestionCard } from '../question/QuestionCard';
import { EnglishText } from '../ui/EnglishText';
import { useSessionState } from '../../hooks/useSessionState';
import { questionById } from '../../content/index';
import type { SessionPlan } from '../../engines/session-builder';
import './session-runner.css';

interface SessionRunnerProps {
  plan: SessionPlan;
  onComplete: () => void;
}

export function SessionRunner({ plan, onComplete }: SessionRunnerProps) {
  const { ready, submitAnswer } = useSessionState();
  const [index, setIndex] = useState(0);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const startedAt = useRef(Date.now());

  const item = plan.items[index];

  useEffect(() => {
    startedAt.current = Date.now();
  }, [index]);

  // Skipping and completion are state changes, so they belong in effects.
  // Calling setIndex or onComplete during render re-enters render immediately
  // and React loops.
  useEffect(() => {
    if (ready && !item) onComplete();
  }, [ready, item, onComplete]);

  useEffect(() => {
    // Non-question kinds have no runner yet; Task 12 adds the SRS branch.
    //
    // Guarded against StrictMode's double-invoke (mount -> cleanup -> mount,
    // dev-only, no cleanup returned here): both invocations fire against the
    // same captured `item` before either commit is visible, so a bare
    // `setIndex(i => i + 1)` would apply twice and skip two items instead of
    // one. The functional updater instead re-checks, against whatever index
    // it is actually handed, whether that index still points at the exact
    // item this effect closed over. The first invocation's update makes that
    // false for the second, spurious invocation, so it becomes a no-op
    // rather than a second skip.
    if (item && item.kind !== 'question') {
      setIndex((i) => (plan.items[i] === item ? i + 1 : i));
    }
  }, [item, plan.items]);

  if (!ready) return <p>טוען…</p>;
  if (!item || item.kind !== 'question') return null;

  // Captured as a plain string here, not read as item.questionId inside the
  // closure below: type narrowing from the `item.kind !== 'question'` guard
  // above does not persist into a nested function declaration, so
  // TypeScript would otherwise widen `item` back to the full SessionItem
  // union and reject the property access.
  const questionId = item.questionId;
  const question = questionById(questionId);
  if (!question) return <p>שאלה חסרה</p>;

  async function handleAnswer(choice: number) {
    setChosenIndex(choice);
    setSaveFailed(false);
    try {
      await submitAnswer(questionId, choice, Date.now() - startedAt.current);
    } catch (err) {
      // onClick's return value is never awaited by React or the DOM, so a
      // rejection here has no other listener — without this catch it becomes
      // an unhandled rejection (observed via corrupt-data guards like
      // updateTheta's finite check, and via any other storage failure).
      // console.error keeps it non-silent for a developer, but chosenIndex
      // was already set above, so explanations reveal and "המשך" appears
      // regardless of whether anything was actually saved - console.error
      // alone left the person studying with no way to know their answer
      // was not recorded. saveFailed makes that visible on screen too.
      console.error('Failed to persist answer', err);
      setSaveFailed(true);
    }
  }

  function advance() {
    setChosenIndex(null);
    setSaveFailed(false);
    setIndex((i) => i + 1);
  }

  return (
    <section aria-label="שאלה">
      <QuestionCard
        question={question}
        onAnswer={handleAnswer}
        revealed={chosenIndex !== null}
        chosenIndex={chosenIndex}
      />
      {saveFailed && (
        <p className="save-error" role="status">
          <span className="save-error-glyph" aria-hidden="true">
            ✕
          </span>
          התשובה לא נשמרה.
        </p>
      )}
      {chosenIndex !== null && (
        <button type="button" onClick={advance}>
          המשך
        </button>
      )}
      <p className="progress-note">
        <EnglishText>{`${index + 1} / ${plan.items.length}`}</EnglishText>
      </p>
    </section>
  );
}
