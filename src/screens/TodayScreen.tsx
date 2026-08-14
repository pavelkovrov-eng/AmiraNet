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

/**
 * The session builder deliberately refuses to serve material at or below the
 * user's own level - comfortable practice yields all-correct answers and a
 * score below the pass threshold on the real, computer-adaptive exam. When
 * the bank runs dry above that level, a short session is the correct output,
 * not a defect. Left unexplained, it is indistinguishable from one.
 */
function SessionShortfallNotice() {
  return (
    <aside className="shortfall-notice" role="status" aria-label="הסבר לגבי אורך הסשן">
      <p>
        <span className="shortfall-glyph" aria-hidden="true">
          ⓘ
        </span>
        התוכן החדש מעל הרמה הנוכחית שלך אזל להיום. לכן הסשן קצר מהזמן שביקשת — וזו לא תקלה.
      </p>
      <p>
        המערכת נמנעת בכוונה מתרגול קל מדי, כי הוא היה פוגע בציון שלך במבחן האמיתי. כרטיסיות
        חזרה חדשות יצטברו בהמשך.
      </p>
    </aside>
  );
}

interface ActiveSession {
  plan: SessionPlan;
  budgetSeconds: number;
}

export function TodayScreen() {
  const [session, setSession] = useState<ActiveSession | null>(null);

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
