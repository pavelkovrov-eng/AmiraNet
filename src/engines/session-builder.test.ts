import { buildSession, COST_SECONDS, NEW_MATERIAL_THETA_OFFSET } from './session-builder';
import type { QuestionItem, Passage, RemediationEntry } from '../content/types';

function q(id: string, difficulty: number, over: Partial<QuestionItem> = {}): QuestionItem {
  return {
    id,
    type: 'sentence-completion',
    difficulty,
    stem: 'stem',
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    explanationPerOption: ['1', '2', '3', '4'],
    primaryLexeme: 'awl-stub',
    targetLexemes: ['awl-stub'],
    trapType: 'phonetic-neighbor',
    ...over,
  };
}

const passage: Passage = {
  id: 'psg-001',
  title: 't',
  body: 'b',
  domain: 'science',
  difficulty: 0.5,
  wordCount: 1,
  questionIds: ['rc-1', 'rc-2', 'rc-3', 'rc-4', 'rc-5'],
};

const base = {
  theta: 1.0,
  dueLexemeIds: [] as string[],
  remediation: [] as RemediationEntry[],
  questions: [] as QuestionItem[],
  passages: [] as Passage[],
  answeredQuestionIds: new Set<string>(),
};

describe('buildSession', () => {
  it('returns an empty plan for a zero budget', () => {
    expect(buildSession({ ...base, budgetSeconds: 0 })).toEqual({
      items: [],
      estimatedSeconds: 0,
    });
  });

  it('places due SRS cards first', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 600,
      dueLexemeIds: ['awl-analyze'],
      questions: [q('sc-1', 1.5)],
    });
    expect(plan.items[0]).toEqual({ kind: 'srs', lexemeId: 'awl-analyze' });
  });

  it('never exceeds the time budget', () => {
    const questions = Array.from({ length: 50 }, (_, i) => q(`sc-${i}`, 1.5));
    const plan = buildSession({ ...base, budgetSeconds: 300, questions });
    expect(plan.estimatedSeconds).toBeLessThanOrEqual(300);
  });

  it('reports an estimate matching the item costs', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 200,
      dueLexemeIds: ['a', 'b'],
      questions: [q('sc-1', 1.5)],
    });
    const expected = 2 * COST_SECONDS.srs + COST_SECONDS['sentence-completion'];
    expect(plan.estimatedSeconds).toBe(expected);
  });

  it('selects new questions above current theta', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 120,
      theta: 1.0,
      questions: [q('easy', -1.0), q('target', 1.5)],
    });
    const ids = plan.items.map((i) => (i.kind === 'question' ? i.questionId : null));
    expect(ids).toContain('target');
    expect(ids).not.toContain('easy');
  });

  it('aims new material at theta plus the offset', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 60,
      theta: 1.0,
      questions: [q('far', 3.0), q('near', 1.0 + NEW_MATERIAL_THETA_OFFSET)],
    });
    expect(plan.items[0]).toEqual({ kind: 'question', questionId: 'near' });
  });

  it('excludes already-answered questions', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 120,
      questions: [q('seen', 1.5), q('fresh', 1.5)],
      answeredQuestionIds: new Set(['seen']),
    });
    const ids = plan.items.map((i) => (i.kind === 'question' ? i.questionId : null));
    expect(ids).not.toContain('seen');
    expect(ids).toContain('fresh');
  });

  it('serves remediation targets before new material', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 120,
      theta: 1.0,
      remediation: [
        { cause: 'vocabulary-gap', targetId: 'awl-x', createdAt: 1, servings: 0 },
      ],
      questions: [
        q('remedial', 0.2, { primaryLexeme: 'awl-x', targetLexemes: ['awl-x'] }),
        q('new', 1.5),
      ],
    });
    expect(plan.items[0]).toEqual({ kind: 'question', questionId: 'remedial' });
  });

  it('omits a passage that does not fit the remaining budget', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: COST_SECONDS.passage - 1,
      passages: [passage],
    });
    expect(plan.items.some((i) => i.kind === 'passage')).toBe(false);
  });

  it('includes a passage when the budget allows', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: COST_SECONDS.passage,
      passages: [passage],
    });
    expect(plan.items).toContainEqual({ kind: 'passage', passageId: 'psg-001' });
  });

  // --- Beyond the brief's ten: input guards ---------------------------------
  // budgetSeconds and theta both feed every comparison in this function. A
  // non-finite budget makes fits() compare against NaN, which is always
  // false, and silently returns an empty session instead of erroring — the
  // user asks for 25 minutes and gets nothing. Style matches theta.ts /
  // timer.ts: throw, name the parameter and the value.

  it('rejects a NaN budget', () => {
    expect(() => buildSession({ ...base, budgetSeconds: NaN })).toThrow(
      'Invalid budgetSeconds: NaN (must be finite)',
    );
  });

  it('rejects an Infinity budget', () => {
    expect(() => buildSession({ ...base, budgetSeconds: Infinity })).toThrow(
      'Invalid budgetSeconds: Infinity (must be finite)',
    );
  });

  it('rejects a -Infinity budget', () => {
    // -Infinity is also < 0, so this only stays pinned to the right message
    // ("must be finite") if the finite check runs before the sign check.
    expect(() => buildSession({ ...base, budgetSeconds: -Infinity })).toThrow(
      'Invalid budgetSeconds: -Infinity (must be finite)',
    );
  });

  it('rejects a negative budget', () => {
    expect(() => buildSession({ ...base, budgetSeconds: -1 })).toThrow(
      'Invalid budgetSeconds: -1 (must be non-negative)',
    );
  });

  it('throws on a NaN theta', () => {
    expect(() => buildSession({ ...base, budgetSeconds: 60, theta: NaN })).toThrow(
      'Invalid theta: NaN (must be finite)',
    );
  });

  it('throws on an Infinity theta', () => {
    expect(() => buildSession({ ...base, budgetSeconds: 60, theta: Infinity })).toThrow(
      'Invalid theta: Infinity (must be finite)',
    );
  });

  // --- Beyond the brief's ten: exact-boundary comparisons --------------------
  // The passage-cost-exact boundary is already pinned by "includes a passage
  // when the budget allows" above (budgetSeconds is exactly COST_SECONDS.passage
  // with nothing else consuming budget) — not duplicated here.

  it('includes a question whose cost exactly equals the remaining budget', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: COST_SECONDS['sentence-completion'],
      theta: 1.0,
      questions: [q('exact', 1.5)],
    });
    // fits() is spent + cost <= budget; a strict < would drop this to empty.
    expect(plan.items).toContainEqual({ kind: 'question', questionId: 'exact' });
    expect(plan.estimatedSeconds).toBe(COST_SECONDS['sentence-completion']);
  });

  it('excludes a question whose difficulty exactly equals theta', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 120,
      theta: 1.0,
      questions: [q('onTheta', 1.0)],
    });
    // The new-material filter is difficulty > theta, strictly. At theta
    // itself the item is comfort-level, not a push upward, and must be
    // excluded — a >= here would silently defeat the difficulty push.
    expect(plan.items).toEqual([]);
  });

  // --- Beyond the brief's ten: every adjacent priority pair -------------------
  // The four-step fill order (SRS, remediation, new material, passage) IS the
  // design. Each fixture below makes both sides of one adjacent pair
  // eligible at once, with a budget tight enough that only one order can
  // satisfy both — so only the ordering in the code, not any other logic,
  // decides the outcome.

  it('spends a tight budget on the due SRS card before the remediation question', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 65, // srs (8) fits then blocks the question (60); reversed, the question (60) fits then blocks the card (8)
      theta: 1.0,
      dueLexemeIds: ['due-1'],
      remediation: [
        { cause: 'vocabulary-gap', targetId: 'awl-x', createdAt: 1, servings: 0 },
      ],
      questions: [q('remedial', 0.2, { targetLexemes: ['awl-x'] })],
    });
    expect(plan.items).toEqual([{ kind: 'srs', lexemeId: 'due-1' }]);
  });

  it('serves the remediation-eligible question over a closer new-material match when budget allows only one', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: COST_SECONDS['sentence-completion'], // room for exactly one question
      theta: 1.0,
      remediation: [
        { cause: 'vocabulary-gap', targetId: 'awl-x', createdAt: 1, servings: 0 },
      ],
      questions: [
        // 'remedial' is a worse new-material match (further from theta+offset=1.5)
        // than 'freshOnly', so if new material ran first it would win the slot.
        q('remedial', 2.5, { targetLexemes: ['awl-x'] }),
        q('freshOnly', 1.6, { targetLexemes: ['other'] }),
      ],
    });
    expect(plan.items).toEqual([{ kind: 'question', questionId: 'remedial' }]);
  });

  it('does not double-schedule a question that is both remediation-eligible and a good new-material candidate', () => {
    // The interesting case: a single item satisfies both branches at once.
    // If remediation's used.add(q.id) is dropped (or if new material ran
    // first without a used check in the remediation loop), this same
    // question gets taken twice and the budget is double-spent.
    const plan = buildSession({
      ...base,
      budgetSeconds: 200,
      theta: 1.0,
      remediation: [
        { cause: 'vocabulary-gap', targetId: 'awl-x', createdAt: 1, servings: 0 },
      ],
      questions: [q('dual', 1.5, { targetLexemes: ['awl-x'] })],
    });
    const dualCount = plan.items.filter(
      (i) => i.kind === 'question' && i.questionId === 'dual',
    ).length;
    expect(dualCount).toBe(1);
    expect(plan.estimatedSeconds).toBe(COST_SECONDS['sentence-completion']);
  });

  it('serves new-material questions before spending budget on a passage', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: COST_SECONDS.passage, // fits the question (60) then the passage (900) does not; reversed, the passage fits and the question does not
      theta: 1.0,
      questions: [q('new', 1.5)],
      passages: [passage],
    });
    expect(plan.items).toContainEqual({ kind: 'question', questionId: 'new' });
    expect(plan.items.some((i) => i.kind === 'passage')).toBe(false);
  });

  // --- Beyond the brief's ten: the offset actually drives the sort target -----

  it('sorts new material by closeness to theta plus the offset, not to theta itself', () => {
    // "aims new material at theta plus the offset" (above) does not actually
    // discriminate the offset being dropped: 'near' (theta+offset exactly) is
    // closer to theta itself too, so aim=theta would pick the same winner.
    // This fixture puts one item nearest theta and the other nearest
    // theta+offset, so only the correct aim value decides the winner.
    const plan = buildSession({
      ...base,
      budgetSeconds: 60,
      theta: 1.0,
      questions: [q('atTheta', 1.01), q('atAim', 1.0 + NEW_MATERIAL_THETA_OFFSET)],
    });
    expect(plan.items[0]).toEqual({ kind: 'question', questionId: 'atAim' });
  });

  // --- Beyond the brief's ten: immutability -----------------------------------

  it('does not mutate the answeredQuestionIds set passed by the caller', () => {
    const answered = new Set(['seen']);
    buildSession({
      ...base,
      budgetSeconds: 120,
      theta: 1.0,
      questions: [q('seen', 1.5), q('fresh', 1.5)],
      answeredQuestionIds: answered,
    });
    // 'fresh' gets scheduled and added to the builder's local `used` set. If
    // that set were the caller's Set by reference rather than a copy, this
    // addition would leak back into `answered` and corrupt session state a
    // later caller (Task 11) relies on.
    expect(answered).toEqual(new Set(['seen']));
  });

  // --- Beyond the brief's ten: reading questions stay passage-only -----------

  it('excludes reading questions from the general question pool', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 300,
      theta: 1.0,
      questions: [q('rc-1', 1.5, { type: 'reading', passageId: 'psg-001' })],
    });
    // Reading questions are reachable only through their passage; serving
    // one standalone would show a question with no passage to read.
    expect(plan.items).toEqual([]);
  });

  // --- Review fix: a fully-answered passage must not be re-served ------------
  // The calling convention (see scripts/demo-session.ts) passes the entire
  // static passage bank on every call and relies on buildSession to filter
  // out what's done, exactly as already happens for `questions`. Without an
  // analogous filter here, a completed passage comes back as a fresh
  // 900-second reading item forever.

  it('excludes a passage whose questions are all already answered', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: COST_SECONDS.passage,
      passages: [passage],
      answeredQuestionIds: new Set(passage.questionIds),
    });
    expect(plan.items.some((i) => i.kind === 'passage')).toBe(false);
  });

  it('still schedules a passage with exactly one unanswered question left', () => {
    // Boundary for the new `every(id => used.has(id))` check: all but one of
    // the five question ids are answered. One unanswered id must be enough
    // to keep the passage alive — this is the closest possible fixture to
    // the "fully answered" case above without actually crossing into it.
    const [, ...allButOne] = passage.questionIds;
    const plan = buildSession({
      ...base,
      budgetSeconds: COST_SECONDS.passage,
      passages: [passage],
      answeredQuestionIds: new Set(allButOne),
    });
    expect(plan.items).toContainEqual({ kind: 'passage', passageId: 'psg-001' });
  });

  // --- Review fix: `continue` (not `break`) fills the budget with cheaper
  // items the loop hasn't reached yet ------------------------------------
  // COST_SECONDS varies by question type (60s vs. 120s). A `break` on the
  // first unaffordable item — even one that isn't first in the array —
  // strands every cheaper item behind it and wastes the remaining budget.
  // Reproduces the reviewer's case: a 100s budget, a 120s restatement that
  // is the closest difficulty match, and a 60s sentence-completion that is
  // a worse match but affordable.

  it('skips an unaffordable new-material match to schedule a cheaper one behind it', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 100,
      theta: 1.0,
      questions: [
        // Closest match to aim (1.5) but costs 120s — does not fit.
        q('closeButExpensive', 1.5, { type: 'restatement' }),
        // Worse match (diff 0.5 vs. 0) but costs 60s — fits.
        q('fartherButCheap', 2.0),
      ],
    });
    const ids = plan.items.map((i) => (i.kind === 'question' ? i.questionId : null));
    expect(ids).not.toContain('closeButExpensive');
    expect(ids).toContain('fartherButCheap');
    expect(plan.estimatedSeconds).toBe(COST_SECONDS['sentence-completion']);
  });

  it('skips an unaffordable remediation match to schedule a cheaper one behind it', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 100,
      theta: 1.0,
      remediation: [
        { cause: 'vocabulary-gap', targetId: 'awl-x', createdAt: 1, servings: 0 },
      ],
      questions: [
        // Listed first, so a `break` would strand the cheap item below it.
        q('bigRemedial', 0.2, { type: 'restatement', targetLexemes: ['awl-x'] }),
        q('smallRemedial', 0.2, { targetLexemes: ['awl-x'] }),
      ],
    });
    const ids = plan.items.map((i) => (i.kind === 'question' ? i.questionId : null));
    expect(ids).not.toContain('bigRemedial');
    expect(ids).toContain('smallRemedial');
    expect(plan.estimatedSeconds).toBe(COST_SECONDS['sentence-completion']);
  });
});
