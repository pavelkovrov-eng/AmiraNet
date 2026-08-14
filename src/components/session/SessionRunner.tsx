import { useEffect, useRef, useState } from 'react';
import { QuestionCard } from '../question/QuestionCard';
import { EnglishText } from '../ui/EnglishText';
import { useSessionState } from '../../hooks/useSessionState';
import { questionById } from '../../content/index';
import type { SessionPlan } from '../../engines/session-builder';

interface SessionRunnerProps {
  plan: SessionPlan;
  onComplete: () => void;
}

export function SessionRunner({ plan, onComplete }: SessionRunnerProps) {
  const { ready, submitAnswer } = useSessionState();
  const [index, setIndex] = useState(0);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
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
    if (item && item.kind !== 'question') setIndex((i) => i + 1);
  }, [item]);

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
    try {
      await submitAnswer(questionId, choice, Date.now() - startedAt.current);
    } catch (err) {
      // onClick's return value is never awaited by React or the DOM, so a
      // rejection here has no other listener — without this catch it becomes
      // an unhandled rejection (observed via corrupt-data guards like
      // updateTheta's finite check, and via any other storage failure), and
      // the UI is left showing a reveal state that was never actually
      // persisted, with no trace anywhere that the write failed.
      console.error('Failed to persist answer', err);
    }
  }

  function advance() {
    setChosenIndex(null);
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
