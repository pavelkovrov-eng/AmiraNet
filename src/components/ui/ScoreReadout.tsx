import { PASS_THRESHOLD_SCORE, SCORE_MIN } from '../../engines/theta';

interface ScoreReadoutProps {
  /** null when the stored estimate could not be turned into a score. */
  score: number | null;
  /** 'bar' is the persistent header readout; 'hero' is the Progress screen. */
  variant?: 'bar' | 'hero';
}

/**
 * The number the whole app exists to move, kept permanently in view.
 *
 * Progress is measured from the bottom of the scale rather than from zero:
 * the reported score never goes below SCORE_MIN, so a track anchored at zero
 * would start a third of the way full and never empty, which reads as
 * progress the learner has not made.
 */
export function ScoreReadout({ score, variant = 'bar' }: ScoreReadoutProps) {
  const fraction =
    score === null
      ? 0
      : Math.min(
          1,
          Math.max(0, (score - SCORE_MIN) / (PASS_THRESHOLD_SCORE - SCORE_MIN)),
        );
  const reached = score !== null && score >= PASS_THRESHOLD_SCORE;

  return (
    <div className={`score-readout score-readout--${variant}`}>
      <p className="eyebrow">אומדן נוכחי</p>

      <p className="score-readout-figures">
        <span
          className={`numeral score-readout-value${reached ? ' score-readout-value--reached' : ''}`}
        >
          {score ?? '—'}
        </span>
        <span className="score-readout-target">
          <span aria-hidden="true">/</span>
          <span className="visually-hidden">מתוך יעד</span>
          <span className="numeral">{PASS_THRESHOLD_SCORE}</span>
        </span>
      </p>

      <div
        className="score-track"
        role="progressbar"
        aria-valuemin={SCORE_MIN}
        aria-valuemax={PASS_THRESHOLD_SCORE}
        aria-valuenow={score ?? SCORE_MIN}
        aria-label={`אומדן ${score ?? 'לא זמין'} מתוך יעד ${PASS_THRESHOLD_SCORE}`}
      >
        <div
          className={`score-fill${reached ? ' score-fill--reached' : ''}`}
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
    </div>
  );
}
