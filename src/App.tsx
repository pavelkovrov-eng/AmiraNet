import { useEffect, useState } from 'react';
import { TodayScreen } from './screens/TodayScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { SimulationScreen } from './screens/SimulationScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { LexiconScreen } from './screens/LexiconScreen';
import { PlacementScreen } from './screens/PlacementScreen';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { getProfile } from './db/repository';
import './App.css';

type Tab = 'today' | 'practice' | 'simulation' | 'progress' | 'lexicon';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'היום' },
  { id: 'practice', label: 'תרגול' },
  { id: 'simulation', label: 'סימולציה' },
  { id: 'progress', label: 'התקדמות' },
  { id: 'lexicon', label: 'מילון' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [placementDone, setPlacementDone] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
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
    void getProfile()
      .then((profile) => setPlacementDone(profile.placementDone))
      .catch((err) => {
        console.error('Failed to load profile', err);
        setLoadFailed(true);
      });
  }, []);

  if (loadFailed) {
    return (
      <p className="save-error" role="status" aria-label="שגיאת טעינה">
        <span className="save-error-glyph" aria-hidden="true">
          ✕
        </span>
        לא ניתן לטעון את הפרופיל השמור. ייתכן שהמידע פגום.
      </p>
    );
  }

  if (placementDone === null) return <p>טוען…</p>;
  if (!placementDone) return <PlacementScreen onDone={() => setPlacementDone(true)} />;

  return (
    <>
      <header>
        <nav aria-label="ניווט ראשי" className="main-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
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
    </>
  );
}
