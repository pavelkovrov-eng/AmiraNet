import { useEffect, useRef, useState } from 'react';
import { FlashCard } from './FlashCard';
import { ChoiceCard } from './ChoiceCard';
import { QuestionCard } from '../question/QuestionCard';
import { EnglishText } from '../ui/EnglishText';
import { useSessionState } from '../../hooks/useSessionState';
import { content, lexemeById, questionById } from '../../content/index';
import type { SessionPlan } from '../../engines/session-builder';
import './session-runner.css';

interface SessionRunnerProps {
  plan: SessionPlan;
  onComplete: () => void;
}

export function SessionRunner({ plan, onComplete }: SessionRunnerProps) {
  const { ready, submitAnswer, reviewLexeme, hasSeenLexeme } = useSessionState();
  const [index, setIndex] = useState(0);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [cardAnswered, setCardAnswered] = useState(false);
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
    // Passage runner is out of scope for wave 1; skip past it. SRS items no
    // longer belong in this effect - Task 12 renders them via FlashCard
    // below instead of skipping them.
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
    if (item && item.kind === 'passage') {
      setIndex((i) => (plan.items[i] === item ? i + 1 : i));
    }
  }, [item, plan.items]);

  if (!ready) return <p>טוען…</p>;
  if (!item) return null;

  // Shared by both the SRS branch and the question flow below, so rating a
  // flashcard advances through the exact same path answering a question
  // does - not a second, independently maintained setIndex call.
  function advance() {
    setChosenIndex(null);
    setSaveFailed(false);
    setCardAnswered(false);
    setIndex((i) => i + 1);
  }

  if (item.kind === 'srs') {
    // Captured as a plain string here, for the same reason questionId is
    // captured below: narrowing from `item.kind === 'srs'` does not persist
    // into the nested onRate closure, so `item.lexemeId` inside it would not
    // type-check.
    const lexemeId = item.lexemeId;
    const lexeme = lexemeById(lexemeId);
    if (!lexeme) return <p>מילה חסרה</p>;

    const persist = async (known: boolean) => {
            try {
              await reviewLexeme(lexemeId, known);
            } catch (err) {
              // Same reasoning as handleAnswer's catch below: onRate is
              // invoked from FlashCard's onClick, whose return value React
              // never awaits, so a rejection here would otherwise be
              // unhandled - exactly the failure mode that once made this
              // suite exit non-zero with every assertion green. Not calling
              // advance() on failure is deliberate too: advance() clears
              // saveFailed, so advancing anyway would erase this notice
              // before anyone saw it and let the card look reviewed while
              // nothing was actually persisted.
              console.error('Failed to persist review', err);
              setSaveFailed(true);
              return;
            }
      advance();
    };

    const persistOnly = async (known: boolean) => {
      try {
        await reviewLexeme(lexemeId, known);
      } catch (err) {
        console.error('Failed to persist review', err);
        setSaveFailed(true);
      }
    };

    const seen = hasSeenLexeme(lexemeId);

    return (
      <section aria-label="כרטיסיית מילה">
        {seen ? (
          <ChoiceCard
            lexeme={lexeme}
            pool={content.lexemes}
            seed={index + 1}
            onAnswer={(correct) => {
              // Score and persist, but do not advance: the card has to stay
              // on screen long enough to show whether the answer was right,
              // along with the word family and example. Advancing here would
              // score the card and skip the part that teaches.
              setCardAnswered(true);
              void persistOnly(correct);
            }}
          />
        ) : (
          <FlashCard lexeme={lexeme} onRate={(known) => void persist(known)} />
        )}
        {seen && cardAnswered && !saveFailed && (
          <button type="button" onClick={advance}>
            המשך
          </button>
        )}
        {saveFailed && (
          <p className="save-error" role="status" aria-label="שגיאת שמירה">
            <span className="save-error-glyph" aria-hidden="true">
              ✕
            </span>
            הסקירה לא נשמרה.
          </p>
        )}
        <p className="progress-note">
          <EnglishText>{`${index + 1} / ${plan.items.length}`}</EnglishText>
        </p>
      </section>
    );
  }

  if (item.kind !== 'question') return null;

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

  return (
    <section aria-label="שאלה">
      <QuestionCard
        question={question}
        onAnswer={handleAnswer}
        revealed={chosenIndex !== null}
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
