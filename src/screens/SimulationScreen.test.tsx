import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SimulationScreen } from './SimulationScreen';
import { content } from '../content/index';
import { thetaToScore } from '../engines/theta';

// Shortened durations only - type and questionCount stay real, so the real
// content-bank shortfall this task's Context section calls out (16 seed
// questions against the exam's 23 slots) still plays out exactly as it
// would against the real 240s/900s/360s timings. Six 1-second sections keep
// the fake-timer traversal below fast without changing what gets assigned
// or rendered.
vi.mock('../engines/simulation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engines/simulation')>();
  return {
    ...actual,
    EXAM_SECTIONS: actual.EXAM_SECTIONS.map((s) => ({ ...s, seconds: 1 })),
  };
});

// thetaToScore (src/engines/theta.ts) throws on non-finite input, but every
// theta this screen can organically produce is finite - updateTheta's own
// guards see to that (src/engines/theta.test.ts), and the content schema
// clamps question difficulty to [-3, 3]. The only way to exercise "throws
// during the completion view's render" is to force the throw directly,
// standing in for whatever real corruption would otherwise cause it - same
// technique as PlacementScreen.test.tsx's render-throw test. Wrapped in
// vi.fn so the render-throw test can also inspect what it was called with.
vi.mock('../engines/theta', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engines/theta')>();
  return {
    ...actual,
    thetaToScore: vi.fn(() => {
      throw new Error('boom');
    }),
  };
});

// The shortened section duration plus one extra poll tick (SimulationScreen
// polls every 250ms) of headroom, so the expiry effect is guaranteed to see
// isExpired() true at least once before this resolves.
const SECTION_MS = 1100;

// act()'s async form flushes every resulting state update and re-render
// before returning, so the DOM is already settled by the time each call
// below returns - every assertion in these tests uses getBy*/queryBy*
// (synchronous), never findBy*. findBy*'s internal waitFor polls via its
// own setTimeout, which fake timers intercept exactly like any other timer;
// nothing here ever advances fake time to serve that unrelated poll, so a
// findBy* call would hang until Vitest's test timeout, even though the
// element it is waiting for is already in the DOM.
async function expireCurrentSection() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SECTION_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SimulationScreen confirmation', () => {
  it('replaces window.confirm with an in-app dialog, guards a double confirm, and keeps one timer per section', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(
      <StrictMode>
        <SimulationScreen />
      </StrictMode>,
    );
    expect(screen.getByRole('heading', { name: 'פרק 1 מתוך 6' })).toBeInTheDocument();

    // Halfway through section 1's (shortened) 1000ms duration.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByTestId('timer-fill')).toHaveStyle({ transform: 'scaleX(0.5)' });

    // Addition 1: an unrelated re-render (answering the current question)
    // must not rebuild the timer. A rebuilt timer would jump straight back
    // to a full bar - a fresh timer always starts at fraction 1 - and fake
    // time has not moved since the read above, so a timer that was truly
    // built once for this section must show the exact same fraction still.
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByTestId('timer-fill')).toHaveStyle({ transform: 'scaleX(0.5)' });

    // Addition 4: opening the confirm control must never touch
    // window.confirm, and the dialog text must be unmistakable about the
    // action being final.
    fireEvent.click(screen.getByRole('button', { name: 'אשר וסיים פרק' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('לא ניתן לחזור לפרק הזה');
    expect(confirmSpy).not.toHaveBeenCalled();

    // Two rapid clicks on the same button, both dispatched before either is
    // allowed to flush. confirmSection is fully synchronous (no await gap
    // to land a second click inside, unlike PlacementScreen's async
    // handleAnswer), so two plain sequential fireEvent.click calls would not
    // reproduce the race on their own - the dialog closes as part of the
    // first click's synchronous re-render, so a second, separately flushed
    // click would just miss an already-detached button (confirmed directly:
    // instrumenting a call counter showed exactly one confirmSection
    // invocation for two sequential fireEvent.click calls here). Nesting
    // both inside one act() defers React's flush until this whole callback
    // returns, so both dispatches reach the handler while React still has
    // only the pre-advance state queued - the same call-counter probe
    // confirmed this reaches confirmSection twice, each enqueueing its own
    // setState(prev => advanceSection(prev)). Without the reentrancy guard
    // both updaters apply, one against the other's result, and the section
    // jumps by two instead of one - the actual shape of the race a review
    // caught on PlacementScreen's answer buttons (Context section),
    // reproduced here without an await gap to exploit it through.
    const lockButton = screen.getByRole('button', { name: 'כן, נעל את הפרק' });
    act(() => {
      fireEvent.click(lockButton);
      fireEvent.click(lockButton);
    });

    // Section 2, not 3: two clicks locked exactly one section, not two.
    expect(screen.getByRole('heading', { name: 'פרק 2 מתוך 6' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'פרק 3 מתוך 6' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // The other half of Addition 1: a new section gets its own fresh timer.
    expect(screen.getByTestId('timer-fill')).toHaveStyle({ transform: 'scaleX(1)' });
  });
});

describe('SimulationScreen render-throw handling', () => {
  it('locks sections on expiry alone, carries an early answer through to the final score, and shows a safe fallback instead of a blank screen when the score computation throws', async () => {
    render(
      <StrictMode>
        <SimulationScreen />
      </StrictMode>,
    );
    expect(screen.getByRole('heading', { name: 'פרק 1 מתוך 6' })).toBeInTheDocument();

    // Section 1 (sentence-completion, 4 of 4 seed questions available):
    // left untouched. Locks and advances on the timer alone - nobody
    // clicks anything - proving the lock holds after expiry, not only
    // after a manual confirm.
    await expireCurrentSection();
    expect(screen.getByRole('heading', { name: 'פרק 2 מתוך 6' })).toBeInTheDocument();

    // Section 2 (sentence-completion): only 2 of its 4 slots have a
    // distinct question left in the 16-item seed bank, the shortfall this
    // task's Context section describes. Answered correctly here - any
    // correct answer from a baseline theta of 0 pushes theta strictly
    // above 0, regardless of which item it is - so survival of this exact
    // answer through every later section is checkable without pinning an
    // exact score.
    const question = content.questions.find((q) => screen.queryByText(q.stem))!;
    fireEvent.click(screen.getAllByRole('button')[question.correctIndex]);
    await expireCurrentSection();
    expect(screen.getByRole('heading', { name: 'פרק 3 מתוך 6' })).toBeInTheDocument();

    // Section 3 (reading, 5 of 5): expires untouched.
    await expireCurrentSection();
    expect(screen.getByRole('heading', { name: 'פרק 4 מתוך 6' })).toBeInTheDocument();

    // Section 4 (restatement, 3 of 3): expires untouched.
    await expireCurrentSection();
    expect(screen.getByRole('heading', { name: 'פרק 5 מתוך 6' })).toBeInTheDocument();

    // Section 5 (restatement): every restatement question already went to
    // section 4 - zero left. Must show the sane empty-section notice
    // instead of an undefined question, and must still lock on expiry.
    expect(screen.getByRole('status', { name: /אין שאלות/ })).toBeInTheDocument();
    await expireCurrentSection();
    expect(screen.getByRole('heading', { name: 'פרק 6 מתוך 6' })).toBeInTheDocument();

    // Section 6 (sentence-completion): every sentence-completion question
    // already went to sections 1 and 2 - also zero left.
    expect(screen.getByRole('status', { name: /אין שאלות/ })).toBeInTheDocument();
    await expireCurrentSection();

    // Completion view: thetaToScore throws, but the screen must not blank.
    expect(screen.getByRole('heading', { name: 'הסימולציה הסתיימה' })).toBeInTheDocument();

    // Not silent: a visible, accessible notice replaces the numeric score.
    const notice = screen.getByRole('status', { name: 'שגיאת חישוב' });
    expect(notice).toHaveTextContent('לא הצלחנו לחשב את אומדן הציון');

    // Addition 3: the disclaimer still renders on this failure path too -
    // it must appear on the completion view, not merely exist in the
    // source.
    expect(screen.getByText(/אומדן פנימי בלבד/)).toBeInTheDocument();

    // The section-2 answer survived four more section transitions (through
    // section 6) to reach this computation at all: every call thetaToScore
    // received a theta only a real, retained correct answer produces from a
    // baseline of 0 - not the 0 a lost answer would leave behind.
    expect(thetaToScore).toHaveBeenCalled();
    for (const [theta] of vi.mocked(thetaToScore).mock.calls) {
      expect(theta).toBeGreaterThan(0);
    }
  });
});
