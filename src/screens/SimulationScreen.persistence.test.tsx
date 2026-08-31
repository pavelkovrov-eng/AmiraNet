import { StrictMode } from 'react';
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SimulationScreen } from './SimulationScreen';
import { content } from '../content/index';
import {
  EXAM_SECTIONS,
  assignSectionQuestions,
  computeSimulationTheta,
} from '../engines/simulation';
import { getProfile } from '../db/repository';
import { db } from '../db/db';

// Addition 2's happy path, in its own file with real timers rather than
// added to SimulationScreen.test.tsx: that file's fake timers and
// fake-indexeddb do not mix here - confirmed directly, both db.delete()/
// db.open() and a plain getProfile()/saveProfile() call hang indefinitely
// under fake timers, no matter how much fake time is advanced afterward,
// because fake-indexeddb's own internal event dispatch depends on a real
// timer queue. Real timers sidestep that entirely; a short (300ms) section
// duration keeps the test fast without needing to fake anything.
//
// Reduced to a single section: this test only needs to reach completion
// once, with one answer, to verify persistence - the full 6-section
// traversal (including the seed-bank shortfall in later sections) is
// already covered by SimulationScreen.test.tsx.
vi.mock('../engines/simulation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engines/simulation')>();
  return {
    ...actual,
    EXAM_SECTIONS: [{ ...actual.EXAM_SECTIONS[0], seconds: 0.3 }],
  };
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('SimulationScreen result persistence', () => {
  it('appends the completed simulation theta to the profile history exactly once', async () => {
    render(
      <StrictMode>
        <SimulationScreen />
      </StrictMode>,
    );
    expect(screen.getByRole('heading', { name: 'פרק 1 מתוך 1' })).toBeInTheDocument();

    // Answered correctly, so the persisted theta must land strictly above
    // what the same run scores with nothing answered at all. Compared
    // against that reference rather than against 0: unanswered questions
    // now count as wrong (computeSimulationTheta), so a single correct
    // answer among a section's unanswered rest still leaves theta negative,
    // and "> 0" would assert the old, flattering scoring instead.
    const question = content.questions.find((q) => screen.queryByText(q.stem))!;
    fireEvent.click(screen.getAllByRole('button')[question.correctIndex]);

    expect(
      await screen.findByRole('heading', { name: 'הסימולציה הסתיימה' }, { timeout: 5000 }),
    ).toBeInTheDocument();

    // The persistence effect's own async work (getProfile/saveProfile)
    // starts on the same render that reaches completion but is not
    // guaranteed to have settled by the time that render commits -
    // findByRole above already waited for the completion heading via real
    // polling, which gives it ample opportunity, but the assertion itself
    // still needs its own poll rather than a single immediate read.
    await waitFor(async () => {
      const profile = await getProfile();
      expect(profile.thetaHistory).toHaveLength(1);
    });

    const profile = await getProfile();
    const nothingAnswered = computeSimulationTheta(
      { sectionIndex: 1, locked: [0], answers: {} },
      assignSectionQuestions(EXAM_SECTIONS, content.questions),
    );
    expect(profile.thetaHistory[0].theta).toBeGreaterThan(nothingAnswered);

    // profile.theta itself (the live adaptive estimate session-builder.ts
    // reads for future practice material) must stay untouched - the
    // simulation's own independently-seeded theta is plotted as a history
    // point, never folded back into it.
    expect(profile.theta).toBe(0);

    // StrictMode double-invoke safety (Context section's carry-forward
    // instruction: guard any async-triggering control the working way).
    // Exactly one history point, not two: resultSaved.current is set
    // synchronously before the first await inside the persistence effect,
    // so StrictMode's mount -> cleanup -> mount replay of that effect sees
    // it already true on its second pass and never double-appends.
    expect(profile.thetaHistory).toHaveLength(1);
  });
});
