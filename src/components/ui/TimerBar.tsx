import '../question/question.css';

interface TimerBarProps {
  fraction: number;
  warning: boolean;
}

/**
 * A thin line, never digits. Counting digits pull the eye every second
 * and spend attention the question needs.
 */
export function TimerBar({ fraction, warning }: TimerBarProps) {
  return (
    <div
      className="timer-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      aria-label="זמן שנותר"
    >
      <div
        data-testid="timer-fill"
        className={`timer-fill${warning ? ' timer-fill--warning' : ''}`}
        style={{ transform: `scaleX(${fraction})` }}
      />
    </div>
  );
}
