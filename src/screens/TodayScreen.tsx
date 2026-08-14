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

  async function start(budgetSeconds: number) {
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

    setEmptySession(false);
    setSession({ plan, budgetSeconds });
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
