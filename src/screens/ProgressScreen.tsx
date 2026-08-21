import { useEffect, useState } from 'react';
import { ThetaChart } from '../components/ui/ThetaChart';
import { getAttempts, getProfile } from '../db/repository';
import { PASS_THRESHOLD_SCORE, thetaToScore } from '../engines/theta';
import type { Attempt, DiagnosisCause } from '../content/types';
import './progress.css';

const CAUSE_LABELS: Record<DiagnosisCause, string> = {
  'vocabulary-gap': 'פער אוצר מילים',
  'distractor-phonetic': 'מסיח דומה בצליל',
  'connector-misread': 'קריאה שגויה של מילת קישור',
  'time-pressure': 'לחץ זמן',
  'inference-error': 'שגיאת הסקה',
};

/**
 * Same shape as PlacementScreen's describePlacementScore and
 * SimulationScreen's describeSimulationScore: thetaToScore (src/engines/
 * theta.ts) throws on non-finite input, and this screen calls it during
 * render. Computed ahead of the JSX rather than inside it, so a failure is a
 * value the render branches on instead of an exception the render dies on.
 * Content can't organically produce a non-finite theta - the read boundary
 * in getProfile (src/db/repository.ts) already rejects a corrupt stored
 * theta before it ever reaches state here - but this is the same
 * carry-forward risk named for all three screens, handled the same way for
 * consistency.
 */
function describeProgressScore(theta: number): number | null {
  try {
    return thetaToScore(theta);
  } catch (err) {
    console.error('Failed to compute progress score', err);
    return null;
  }
}

export function ProgressScreen() {
  const [history, setHistory] = useState<{ at: number; theta: number }[]>([]);
  const [theta, setTheta] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [profile, all] = await Promise.all([getProfile(), getAttempts()]);
        setHistory(profile.thetaHistory);
        setTheta(profile.theta);
        setAttempts(all);
      } catch (err) {
        // Addition 1's carry-forward risk applies here too: getProfile
        // throws on a corrupt stored profile (src/db/repository.ts). Left
        // unguarded, this async IIFE has no other listener for the
        // rejection, and the screen would settle into its default,
        // never-updated state (theta 0, empty history, empty attempts) -
        // which renders as an ordinary "brand new user, nothing yet" empty
        // state. That is actively misleading for someone whose profile is
        // weeks of real progress that failed to load, not actually empty -
        // worse than TodayScreen's inertness, because it does not even look
        // broken. Guarded the same way: caught, logged, and surfaced as a
        // visible, non-silent notice.
        console.error('Failed to load progress data', err);
        setLoadFailed(true);
      }
    })();
  }, []);

  const score = describeProgressScore(theta);

  const counts = attempts.reduce<Record<string, number>>((acc, a) => {
    if (!a.diagnosis) return acc;
    acc[a.diagnosis] = (acc[a.diagnosis] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section aria-labelledby="progress-heading">
      <h1 id="progress-heading">התקדמות</h1>

      {loadFailed && (
        <p className="save-error" role="status" aria-label="שגיאת טעינה">
          <span className="save-error-glyph" aria-hidden="true">
            ✕
          </span>
          לא ניתן לטעון את נתוני ההתקדמות. ייתכן שהמידע פגום.
        </p>
      )}

      {score === null ? (
        <p className="save-error" role="status" aria-label="שגיאת חישוב">
          <span className="save-error-glyph" aria-hidden="true">
            ✕
          </span>
          לא הצלחנו לחשב את האומדן הנוכחי.
        </p>
      ) : (
        <p className="score-display">
          אומדן נוכחי: <strong>{score}</strong> · יעד: {PASS_THRESHOLD_SCORE}
        </p>
      )}
      {/* Addition 3: this is the app's own internal estimate, not a NITE
          score - the real Amirnet calibration is not public. Rendered
          unconditionally, not only alongside a successful score above, so
          it still appears even when the score itself could not be
          computed or the data failed to load. */}
      <p className="disclaimer">
        זהו אומדן פנימי של האפליקציה, לא ציון מאל"ו. הכיול הרשמי אינו פומבי. השתמש במספר כדי לעקוב
        אחר מגמה, לא כתחזית לציון בבחינה.
      </p>

      <ThetaChart history={history} />

      <h2>התפלגות סיבות טעות</h2>
      {Object.keys(counts).length === 0 ? (
        <p className="empty-state">אין עדיין טעויות מסווגות.</p>
      ) : (
        <ul>
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([cause, count]) => (
              <li key={cause}>
                {CAUSE_LABELS[cause as DiagnosisCause]}: {count}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
