interface MomentumStripProps {
  streak: number;
  answeredToday: number;
}

/**
 * Two numbers, above the fold, before anything is asked of the learner.
 *
 * The app previously offered no evidence that yesterday had happened. Effort
 * over four weeks is the whole method here, and a method with no visible
 * accumulation is one people abandon in week two. A streak is the cheapest
 * honest record of it: it counts days practised, nothing more.
 *
 * Deliberately not a `role="status"`. Nothing here is news — it is the
 * standing state of the screen, and announcing it on every mount would make
 * the screen noisier for a screen-reader user than for anyone else.
 */
export function MomentumStrip({ streak, answeredToday }: MomentumStripProps) {
  return (
    <dl className="momentum" aria-label="מומנטום">
      <div className={`momentum-cell${streak > 0 ? ' momentum-cell--live' : ''}`}>
        <dd className="momentum-value numeral">{streak}</dd>
        <dt className="momentum-label">{streak === 1 ? 'יום ברצף' : 'ימים ברצף'}</dt>
      </div>
      <div className="momentum-cell">
        <dd className="momentum-value numeral">{answeredToday}</dd>
        <dt className="momentum-label">נענו היום</dt>
      </div>
    </dl>
  );
}
