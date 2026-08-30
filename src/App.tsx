import { useEffect, useState } from 'react';
import { TodayScreen } from './screens/TodayScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { SimulationScreen } from './screens/SimulationScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { LexiconScreen } from './screens/LexiconScreen';
import { PlacementScreen } from './screens/PlacementScreen';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ScoreReadout } from './components/ui/ScoreReadout';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { getProfile } from './db/repository';
import { thetaToScore } from './engines/theta';
import './App.css';

type Tab = 'today' | 'practice' | 'simulation' | 'progress' | 'lexicon';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'today', label: 'היום', glyph: '◈' },
  { id: 'practice', label: 'תרגול', glyph: '◇' },
  { id: 'simulation', label: 'סימולציה', glyph: '⧗' },
  { id: 'progress', label: 'התקדמות', glyph: '◪' },
  { id: 'lexicon', label: 'מילון', glyph: '⌸' },
];

/**
 * Same guarded shape the three score-rendering screens use: thetaToScore
 * throws on non-finite input, and this runs during render.
 */
function describeScore(theta: number): number | null {
  try {
    return thetaToScore(theta);
  } catch (err) {
    console.error('Failed to compute header score', err);
    return null;
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [placementDone, setPlacementDone] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [theta, setTheta] = useState(0);

  // Addition 1: this is the app's actual entrance path - the very first
  // stored read on every boot, before any screen exists at all. getProfile
  // (src/db/repository.ts) throws on a corrupt stored profile. Left
  // unguarded (as the brief's own transcribed version has it), that throw
  // rejects this promise with no .catch anywhere: placementDone stays
  // null forever, the app is stuck on "טוען…" permanently, and the
  // rejection itself is unhandled in the background - silent in the
  // strongest sense, since there is not even a button the user could
  // retry. Caught, logged, and surfaced as a visible, non-silent notice,
  // matching the pattern already established in SessionRunner for save
  // failures.
  //
  // Re-runs on tab change so the header readout reflects a session that was
  // just finished. Deliberately not live during a session: a score ticking
  // in the corner while a question is on screen is exactly the kind of
  // distraction the timer was made a thin line to avoid.
  useEffect(() => {
    void getProfile()
      .then((profile) => {
        setPlacementDone(profile.placementDone);
        setTheta(profile.theta);
      })
      .catch((err) => {
        console.error('Failed to load profile', err);
        setLoadFailed(true);
      });
  }, [tab]);

  if (loadFailed) {
    return (
      <main className="boot-failure">
        <p className="save-error" role="status" aria-label="שגיאת טעינה">
          <span className="save-error-glyph" aria-hidden="true">
            ✕
          </span>
          לא ניתן לטעון את הפרופיל השמור. ייתכן שהמידע פגום.
        </p>
      </main>
    );
  }

  if (placementDone === null) {
    return (
      <main className="boot-loading">
        <span className="boot-pulse" aria-hidden="true" />
        <p>טוען…</p>
      </main>
    );
  }

  if (!placementDone) return <PlacementScreen onDone={() => setPlacementDone(true)} />;

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="app-bar-inner">
          <p className="brand">
            <span className="brand-mark" aria-hidden="true" />
            אמירנט
          </p>
          <ScoreReadout score={describeScore(theta)} />
          <ThemeToggle />
        </div>
      </header>

      <main>
        {/* key={tab}: a render-phase throw in one screen (Addition 1 -
            three screens call thetaToScore during render) trips hasError
            and, without a key, would leave every other tab stuck on the
            same fallback forever, since an error boundary never re-attempts
            rendering its children on its own. Keying by tab means switching
            tabs remounts a fresh boundary along with the next screen, so
            navigating away from a broken screen actually recovers instead
            of just repeating the same dead end. */}
        <ErrorBoundary key={tab}>
          {tab === 'today' && <TodayScreen />}
          {tab === 'practice' && <PracticeScreen />}
          {tab === 'simulation' && <SimulationScreen />}
          {tab === 'progress' && <ProgressScreen />}
          {tab === 'lexicon' && <LexiconScreen />}
        </ErrorBoundary>
      </main>

      {/* Bottom-anchored on a phone, where this app is actually used, and
          promoted to the header row on a wide screen. */}
      <nav aria-label="ניווט ראשי" className="main-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="nav-glyph" aria-hidden="true">
              {t.glyph}
            </span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
