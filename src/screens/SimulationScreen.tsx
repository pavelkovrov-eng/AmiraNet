import { useEffect, useRef, useState } from 'react';
import { QuestionCard } from '../components/question/QuestionCard';
import { TimerBar } from '../components/ui/TimerBar';
import { EnglishText } from '../components/ui/EnglishText';
import { createTimer, type Timer } from '../lib/timer';
import { content } from '../content/index';
import {
  EXAM_SECTIONS,
  advanceSection,
  assignSectionQuestions,
  computeSimulationTheta,
  initialSimulationState,
  type SimulationState,
} from '../engines/simulation';
import { thetaToScore } from '../engines/theta';
import { getProfile, saveProfile } from '../db/repository';
import type { QuestionItem } from '../content/types';
import './simulation.css';

const POLL_INTERVAL_MS = 250;

/**
 * Which specific questions each section shows, computed once at module
 * scope rather than per render or per section. content.questions is a
 * static bundle fixed at startup and EXAM_SECTIONS is a fixed constant, so
 * this mapping can never change during a run - see assignSectionQuestions
 * (engines/simulation.ts) for why it exists at all (the seed bank is
 * smaller than the exam's 23 slots) and why it walks the whole exam at once
 * instead of filtering per section independently.
 */
const SECTION_QUESTIONS = assignSectionQuestions(EXAM_SECTIONS, content.questions);


/**
 * thetaToScore (engines/theta.ts) throws on non-finite input, and so does
 * computeSimulationTheta's own updateTheta fold. Valid content can never
 * drive either non-finite, but this feeds the completion view's render, and
 * an uncaught throw there would blank the screen at the exact moment a
 * 39-minute exam finishes: the worst possible time to lose the screen.
 * Computed ahead of the JSX rather than inside it, so a failure here is a
 * value the render branches on instead of an exception the render dies on -
 * same shape as PlacementScreen.tsx's describePlacementScore. Returns null
 * (never a valid score) to signal failure, and logs so the failure is not
 * silent even though the screen recovers from it.
 */
function describeSimulationScore(
  state: SimulationState,
  sectionQuestions: QuestionItem[][],
): number | null {
  try {
    return thetaToScore(computeSimulationTheta(state, sectionQuestions));
  } catch (err) {
    console.error('Failed to compute simulation score', err);
    return null;
  }
}

function timerFor(sectionIndex: number): Timer | null {
  const section = EXAM_SECTIONS[sectionIndex];
  return section ? createTimer(section.seconds * 1000) : null;
}

/**
 * The seed content bank (16 items) is smaller than the exam's 23 scored
 * slots, so assignSectionQuestions can legitimately hand a section zero
 * questions once every question of its type has already gone to an earlier
 * section. Rendering nothing here would look indistinguishable from a bug;
 * this says so and lets the exam keep moving - the section still counts,
 * still times out, and still locks like any other. Same InfoNotice shape as
 * TodayScreen.tsx's EmptySessionNotice: decorative glyph never the only
 * signal (WCAG 1.4.1), role="status" so it is announced on arrival, and an
 * explicit accessible name on the landmark.
 */
function NoQuestionsNotice() {
  return (
    <aside className="info-notice" role="status" aria-label="הסבר: אין שאלות בפרק זה">
      <p>
        <span className="info-notice-glyph" aria-hidden="true">
          ⓘ
        </span>
        בפרק הזה אין כרגע שאלות זמינות.
      </p>
      <p>מאגר התוכן הנוכחי מצומצם. אפשר להמשיך הלאה ולנעול את הפרק כרגיל.</p>
    </aside>
  );
}

export function SimulationScreen() {
  const [state, setState] = useState<SimulationState>(initialSimulationState());
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timer, setTimer] = useState<Timer | null>(() => timerFor(0));
  const [tick, setTick] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Reentrancy guard for confirmSection: without it, two triggers landing
  // before either has rendered - two rapid clicks on the dialog's confirm
  // button, or a click racing the expiry effect below - each enqueue their
  // own setState(prev => advanceSection(prev)). React applies queued
  // functional updaters in order, each against the previous one's result,
  // so both apply: sectionIndex jumps by two for one confirmation, silently
  // skipping the section in between and locking it unseen. Same shape as
  // the double-click race a review caught on PlacementScreen's answer
  // buttons (src/screens/PlacementScreen.tsx); checked and set
  // synchronously, before React has any chance to re-render and disable
  // anything.
  const advancing = useRef(false);
  // Addition 2: guards the persistence effect below against StrictMode's
  // double-invoke on the render where `section` first goes undefined -
  // same shape as `advancing` above, set synchronously before any await so
  // a second invocation sees it as already-true regardless of render
  // timing. Never reset (unlike `advancing`, which must reset every time
  // the section changes so the NEXT confirm can proceed): completion is a
  // one-way transition - once `section` is undefined it stays undefined
  // for the rest of this component's life - so there is no "next attempt"
  // this guard would ever need to allow through again.
  const resultSaved = useRef(false);
  const [resultSaveFailed, setResultSaveFailed] = useState(false);

  const section = EXAM_SECTIONS[state.sectionIndex];
  const sectionQuestions = section ? SECTION_QUESTIONS[state.sectionIndex] : [];

  // Built once per section, never on an unrelated re-render (Addition 1):
  // this effect's only dependency is state.sectionIndex, so it is inert on
  // every render that leaves the section unchanged - answering a question,
  // navigating between questions, or a tick from the poll effect below.
  // useMemo was deliberately not used for the timer itself - React documents
  // it as a perf hint it may discard and recompute, not a guarantee - and a
  // timer rebuilt on some render unrelated to the section changing would
  // restart the section clock continuously and the section would never
  // expire.
  useEffect(() => {
    setTimer(timerFor(state.sectionIndex));
    // The queued advance has now actually landed (this effect only runs
    // once state.sectionIndex itself has changed), so a new confirm may
    // proceed. Resetting this synchronously at the end of confirmSection
    // instead would defeat the guard entirely: setState does not apply
    // within the same synchronous call that queued it, so a reset there
    // clears the flag before React has applied anything, for every call,
    // race or not - the reentrancy check would never actually block a
    // second trigger. Same reasoning as PlacementScreen.tsx's answering
    // ref, which stays true for the entire await gap rather than resetting
    // at the end of the function body.
    advancing.current = false;
  }, [state.sectionIndex]);

  useEffect(() => {
    // Nothing left to poll once the exam is done (section is undefined) -
    // without this guard the interval outlives the last section forever,
    // re-rendering the completion view (and recomputing its score) every
    // 250ms for as long as the screen stays mounted.
    if (!section) return;
    const id = setInterval(() => setTick((t) => t + 1), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [section]);

  function confirmSection() {
    if (advancing.current) return;
    advancing.current = true;
    setState((prev) => advanceSection(prev));
    setQuestionIndex(0);
    setConfirmOpen(false);
  }

  useEffect(() => {
    // Expiry gets no confirmation dialog - time is simply up, and the
    // section locks exactly as the manual-confirm path does. This is the
    // path that must hold the lock even though nobody clicked anything, and
    // it shares confirmSection's reentrancy guard rather than calling
    // advanceSection directly, so an expiry landing beside a manual click
    // cannot double-advance either.
    if (timer?.isExpired()) confirmSection();
  }, [tick, timer]);

  // Addition 2: Task 14 deliberately left simulation results unpersisted -
  // its own brief named no repository functions, so it invented none. That
  // left a real gap: a full 39-minute simulation is the single most
  // information-dense signal this app can produce (all 23 scored slots,
  // every question type in one pass), closer to the real exam than any
  // practice session, and a user who sits through one saw nothing of it on
  // the progress screen afterward.
  //
  // Fires exactly once, when `section` first goes undefined (all sections
  // locked). Appends one point to profile.thetaHistory - the same shape
  // PlacementScreen.tsx's finish() already writes for a completed placement
  // - without touching profile.theta or profile.answered. Deliberately not
  // folded into the live adaptive estimate: session-builder.ts selects
  // future practice material from profile.theta, and letting an occasional
  // mock exam (independently seeded from acc=0, see computeSimulationTheta)
  // overwrite that would make ordinary practice selection jump around based
  // on a completely different, freshly-seeded computation. Plotting it as
  // one more timestamped point on the same history the chart already reads
  // is the minimal, additive fix for what was actually reported missing -
  // "the progress screen's picture" - without perturbing anything else.
  //
  // No repository function is added for this: it reuses getProfile/
  // saveProfile exactly as PlacementScreen.tsx's finish() already does for
  // the identical read-modify-write shape, keeping repository.ts's role as
  // thin CRUD and the "what changed and why" business logic where every
  // other caller already keeps it.
  useEffect(() => {
    if (section) return;
    if (resultSaved.current) return;
    resultSaved.current = true;

    void (async () => {
      let theta: number;
      try {
        theta = computeSimulationTheta(state, SECTION_QUESTIONS);
      } catch (err) {
        // Non-finite theta: already surfaced to the user via the score
        // notice below (describeSimulationScore hits the same throw). Not
        // a second, redundant failure to report - there is nothing sane to
        // persist either way.
        console.error('Failed to compute simulation result for history', err);
        return;
      }
      try {
        const profile = await getProfile();
        await saveProfile({
          ...profile,
          thetaHistory: [...profile.thetaHistory, { at: Date.now(), theta }],
        });
      } catch (err) {
        console.error('Failed to persist simulation result', err);
        setResultSaveFailed(true);
      }
    })();
  }, [section, state]);

  if (!section) {
    const score = describeSimulationScore(state, SECTION_QUESTIONS);

    return (
      <section aria-labelledby="sim-done">
        <h1 id="sim-done">הסימולציה הסתיימה</h1>
        {score === null ? (
          <p className="save-error" role="status" aria-label="שגיאת חישוב">
            <span className="save-error-glyph" aria-hidden="true">
              ✕
            </span>
            לא הצלחנו לחשב את אומדן הציון.
          </p>
        ) : (
          <p>אומדן ציון: {score}</p>
        )}
        {/* Addition 3: this is this app's own internal estimate, not a NITE
            score - the real Amirnet calibration is not public. Rendered
            unconditionally, not only alongside a successful score above, so
            it still appears even when the score itself could not be
            computed. */}
        <p className="disclaimer">אומדן פנימי בלבד, לא ציון מאל"ו. השתמש בו למעקב אחר מגמה.</p>
        {/* Addition 2: the history write is best-effort - failing to save it
            must not look like the exam itself failed, so this is its own,
            separate notice rather than folded into the score-error one
            above. No retry control, matching SessionRunner's own per-answer
            save-error notice (Addition 1's cited pattern): telling the user
            plainly is the fix here, not offering a retry for a background
            write they never directly triggered. */}
        {resultSaveFailed && (
          <p className="save-error" role="status" aria-label="שגיאת שמירה">
            <span className="save-error-glyph" aria-hidden="true">
              ✕
            </span>
            תוצאת הסימולציה לא נשמרה בהיסטוריית ההתקדמות.
          </p>
        )}
      </section>
    );
  }

  const question = sectionQuestions[questionIndex];

  return (
    <section aria-labelledby="sim-heading">
      <TimerBar fraction={timer?.fraction() ?? 0} warning={timer?.isWarning() ?? false} />
      {timer?.isWarning() && (
        <p className="timer-warning" role="status" aria-label="התראת זמן">
          <span aria-hidden="true">⚠</span> נותר פחות מחמישית מזמן הפרק
        </p>
      )}
      <h1 id="sim-heading">
        פרק {section.index + 1} מתוך {EXAM_SECTIONS.length}
      </h1>
      {sectionQuestions.length === 0 ? (
        <NoQuestionsNotice />
      ) : (
        <>
          <p className="progress-note">
            <EnglishText>{`${questionIndex + 1} / ${sectionQuestions.length}`}</EnglishText>
          </p>
          {question && (
            <QuestionCard
              question={question}
              revealed={false}
              chosenIndex={state.answers[question.id] ?? null}
              onAnswer={(choice) =>
                setState((prev) => ({
                  ...prev,
                  answers: { ...prev.answers, [question.id]: choice },
                }))
              }
            />
          )}
          <nav aria-label="ניווט בתוך הפרק" className="section-nav">
            <button
              type="button"
              disabled={questionIndex === 0}
              onClick={() => setQuestionIndex((i) => i - 1)}
            >
              הקודמת
            </button>
            <button
              type="button"
              disabled={questionIndex >= sectionQuestions.length - 1}
              onClick={() => setQuestionIndex((i) => i + 1)}
            >
              הבאה
            </button>
          </nav>
        </>
      )}
      {confirmOpen ? (
        // Addition 4: replaces window.confirm, which is untestable (jsdom
        // has no real implementation to drive) and blocks the event loop.
        // role="alertdialog" (not "dialog"): this interrupts to demand a
        // decision on an irreversible action, which is exactly what
        // alertdialog is for.
        <div
          className="confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-heading"
          aria-describedby="confirm-body"
        >
          <h2 id="confirm-heading">אישור נעילת פרק</h2>
          <p id="confirm-body">
            לאחר האישור לא ניתן לחזור לפרק הזה בשום שלב — גם לא לשאלות שלא נענו בו. הפעולה סופית.
          </p>
          <div className="confirm-dialog-actions">
            <button type="button" onClick={() => setConfirmOpen(false)}>
              ביטול
            </button>
            <button type="button" onClick={confirmSection}>
              כן, נעל את הפרק
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmOpen(true)}>
          אשר וסיים פרק
        </button>
      )}
    </section>
  );
}
