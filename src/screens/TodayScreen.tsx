import { useState } from 'react';
import { SessionRunner } from '../components/session/SessionRunner';
import { buildSession, type SessionPlan } from '../engines/session-builder';
import { dueLexemeIds } from '../engines/srs';
import { content } from '../content/index';
import { getAttempts, getCards, getProfile, getRemediation } from '../db/repository';
import './today.css';

export const TIME_BUDGET_OPTIONS = [
  { label: '10 דקות', seconds: 600 },
  { label: '25 דקות', seconds: 1500 },
  { label: '45 דקות', seconds: 2700 },
  { label: '90 דקות', seconds: 5400 },
];

/**
 * Below this fraction of the requested budget, a session has stopped being
 * merely smaller than asked-for and started looking broken. Two real
 * measurements bound the choice: a fresh 25-minute request lands at 56% fill
 * because the whole non-reading seed bank is 11 items (small content, not a
 * defect); a returning learner who has cleared everything above their level
 * can land at 8% - six flashcards for a 10-minute ask (session-builder.ts
 * §3, by design - see NEW_MATERIAL_THETA_OFFSET). 50% sits strictly between
 * those two observed numbers, so it leaves the first case unflagged and
 * always flags the second.
 */
export const SESSION_SHORTFALL_THRESHOLD = 0.5;

function isShortfall(plan: SessionPlan, budgetSeconds: number): boolean {
  return plan.estimatedSeconds < budgetSeconds * SESSION_SHORTFALL_THRESHOLD;
}

interface InfoNoticeProps {
  /** Concise accessible name for the landmark itself, distinct from its body text. */
  label: string;
  lead: string;
  body: string;
}

/**
 * Shared shell for a small, honest explanation panel: a decorative glyph
 * (never the only signal — WCAG 1.4.1, same reasoning as Task 10's
 * ChoiceList), a live region so the explanation is announced the moment it
 * appears rather than requiring the user to go looking for it, and an
 * explicit accessible name on the landmark.
 */
function InfoNotice({ label, lead, body }: InfoNoticeProps) {
  return (
    <aside className="info-notice" role="status" aria-label={label}>
      <p>
        <span className="info-notice-glyph" aria-hidden="true">
          ⓘ
        </span>
        {lead}
      </p>
      <p>{body}</p>
    </aside>
  );
}

/**
 * The session builder deliberately refuses to serve material at or below the
 * user's own level - comfortable practice yields all-correct answers and a
 * score below the pass threshold on the real, computer-adaptive exam. When
 * the bank runs dry above that level, a short session is the correct output,
 * not a defect. Left unexplained, it is indistinguishable from one.
 */
function SessionShortfallNotice() {
  return (
    <InfoNotice
      label="הסבר לגבי אורך הסשן"
      lead="התוכן החדש מעל הרמה הנוכחית שלך אזל להיום. לכן הסשן קצר מהזמן שביקשת — וזו לא תקלה."
      body="המערכת נמנעת בכוונה מתרגול קל מדי, כי הוא היה פוגע בציון שלך במבחן האמיתי. כרטיסיות חזרה חדשות יצטברו בהמשך."
    />
  );
}

/**
 * The zero-item extreme of the same situation SessionShortfallNotice
 * explains. Rendered on the picker itself, not alongside a SessionRunner:
 * mounting SessionRunner with nothing to show would trigger its own
 * ready-but-no-item effect immediately, completing the "session" before it
 * ever rendered and bouncing back here anyway with no trace — indistin-
 * guishable from the button not responding at all.
 */
function EmptySessionNotice() {
  return (
    <InfoNotice
      label="הסבר: אין תוכן זמין כרגע"
      lead="אין כרגע תוכן חדש להציע ברמה הנוכחית, ואין גם כרטיסיות לחזרה שממתינות כרגע."
      body="זו לא תקלה — כל מה שזמין כבר נוצל. אפשר לנסות תקציב זמן אחר, או לחזור מאוחר יותר כשיצטברו כרטיסיות חדשות לחזרה."
    />
  );
}

interface ActiveSession {
  plan: SessionPlan;
  budgetSeconds: number;
}

export function TodayScreen() {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [emptySession, setEmptySession] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Addition 1: getProfile and getCards (src/db/repository.ts) both throw
  // on corrupt stored data - assertFiniteProfile / assertFiniteCard. Before
  // Task 15 this Promise.all was unreachable (App.tsx rendered a
  // placeholder); routing now makes it live, and this is the literal
  // entrance to a study session. Audited the whole Promise.all, not just
  // getProfile: getRemediation/getAttempts have no corruption guard of
  // their own today, but wrapping the full load-and-build sequence in one
  // try/catch means that stays true regardless, rather than pinning safety
  // to which two of four calls happen to guard themselves right now.
  // Without this, a rejection here was completely unhandled: no status
  // role, no session, an unhandled promise rejection in the background -
  // the same failure shape SessionRunner's save-error notice already
  // exists to avoid for a single answer, just one level earlier, for
  // everything a session needs before it can even start.
  async function start(budgetSeconds: number) {
    setLoadFailed(false);
    setEmptySession(false);

    try {
      const [profile, cards, remediation, attempts] = await Promise.all([
        getProfile(),
        getCards(),
        getRemediation(),
        getAttempts(),
      ]);
      const plan = buildSession({
        budgetSeconds,
        theta: profile.theta,
        dueLexemeIds: dueLexemeIds(cards, new Date()),
        remediation,
        questions: content.questions,
        passages: content.passages,
        answeredQuestionIds: new Set(attempts.map((a) => a.questionId)),
      });

      if (plan.items.length === 0) {
        setEmptySession(true);
        return;
      }

      setSession({ plan, budgetSeconds });
    } catch (err) {
      console.error('Failed to load stored data', err);
      setLoadFailed(true);
    }
  }

  if (session) {
    return (
      <>
        {isShortfall(session.plan, session.budgetSeconds) && <SessionShortfallNotice />}
        <SessionRunner plan={session.plan} onComplete={() => setSession(null)} />
      </>
    );
  }

  return (
    <section aria-labelledby="today-heading">
      <h1 id="today-heading">כמה זמן יש לך היום?</h1>
      {emptySession && <EmptySessionNotice />}
      {loadFailed && (
        <p className="save-error" role="status" aria-label="שגיאת טעינה">
          <span className="save-error-glyph" aria-hidden="true">
            ✕
          </span>
          לא ניתן לטעון את הנתונים השמורים. ייתכן שהמידע פגום.
        </p>
      )}
      <div className="budget-options">
        {TIME_BUDGET_OPTIONS.map((option) => (
          <button key={option.seconds} type="button" onClick={() => void start(option.seconds)}>
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
