import { PASS_THRESHOLD_SCORE, thetaToScore } from '../../engines/theta';
import './theta-chart.css';

interface ThetaChartProps {
  history: { at: number; theta: number }[];
}

const WIDTH = 640;
const HEIGHT = 240;
const PAD = 24;
const SCORE_MIN = 50;
const SCORE_MAX = 150;

function yFor(score: number): number {
  const ratio = (score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN);
  return HEIGHT - PAD - ratio * (HEIGHT - 2 * PAD);
}

/**
 * role="img" makes the SVG an opaque leaf to assistive tech - none of its
 * children (the pass-line, the trend path, the points) are exposed
 * individually, only the accessible name (aria-label) and, via
 * aria-describedby below, this text. A bare label naming the chart ("a
 * progress chart exists") says nothing about what it actually shows; this
 * names the real range and calls out the threshold line explicitly, which
 * is also how its meaning reaches someone who cannot see the dashed stroke
 * at all (Addition 3 - colour is never the only carrier of meaning, and for
 * a screen-reader user even shape is invisible unless it's named in words).
 */
function describeHistory(history: { at: number; theta: number }[]): string {
  const scores = history.map((entry) => thetaToScore(entry.theta));
  const passLine = `הקו המקווקו על הגרף מסמן את סף המעבר, ציון ${PASS_THRESHOLD_SCORE}.`;
  if (scores.length === 1) {
    return `מדידה אחת בלבד: אומדן ציון ${scores[0]}. ${passLine}`;
  }
  const first = scores[0];
  const last = scores[scores.length - 1];
  return `${scores.length} מדידות לאורך זמן, מציון ${first} ועד ציון ${last}. ${passLine}`;
}

export function ThetaChart({ history }: ThetaChartProps) {
  if (history.length === 0) {
    return <p className="empty-state">אין עדיין נתונים. השלם סשן ראשון.</p>;
  }

  const step = history.length === 1 ? 0 : (WIDTH - 2 * PAD) / (history.length - 1);
  const points = history.map((entry, i) => ({
    x: PAD + i * step,
    y: yFor(thetaToScore(entry.theta)),
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const passY = yFor(PASS_THRESHOLD_SCORE);
  const baseline = HEIGHT - PAD;
  // Closed back along the baseline so the trend can be filled. A line alone
  // reads as a thin scratch on a dark ground; the fill is what makes the
  // climb visible from across the room.
  const area = `${path} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
  const gridScores = [75, 100, 125];

  return (
    <figure className="theta-chart-figure">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="גרף התקדמות אומדן הציון לאורך זמן"
        aria-describedby="theta-chart-desc"
        className="theta-chart"
      >
        <defs>
          <linearGradient id="theta-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Reference grid. Decorative only - every value it marks is already
            named in the figure's description, so it is left out of the
            accessible tree along with the rest of the SVG's internals. */}
        {gridScores.map((score) => (
          <line
            key={score}
            x1={PAD}
            x2={WIDTH - PAD}
            y1={yFor(score)}
            y2={yFor(score)}
            className="theta-chart-grid"
          />
        ))}

        <path d={area} fill="url(#theta-area)" stroke="none" />

        {/* Addition 3: the pass-threshold reference line must be
            distinguishable by more than colour - strokeDasharray gives it a
            shape distinct from the solid trend path below, and the label
            beside it names the value directly for anyone who cannot resolve
            the dash pattern either. */}
        <line
          data-testid="pass-line"
          x1={PAD}
          x2={WIDTH - PAD}
          y1={passY}
          y2={passY}
          stroke="var(--color-due)"
          strokeDasharray="4 4"
        />
        <path d={path} fill="none" strokeWidth={2} className="theta-chart-line" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} className="theta-chart-point" />
        ))}
        {/* Drawn last (on top) so it stays legible even when a data point
            lands near the threshold - the single most likely place for a
            studier close to passing to actually look. */}
        <text x={WIDTH - PAD} y={passY - 6} textAnchor="end" className="theta-chart-pass-label">
          {`סף מעבר · ${PASS_THRESHOLD_SCORE}`}
        </text>
      </svg>
      <figcaption id="theta-chart-desc" className="theta-chart-caption">
        {describeHistory(history)}
      </figcaption>
    </figure>
  );
}
