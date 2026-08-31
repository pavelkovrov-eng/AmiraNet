import type { QuestionItem, Passage, RemediationEntry, QuestionType } from '../content/types';

export const NEW_MATERIAL_THETA_OFFSET = 0.5;

/**
 * Ceiling on first exposures per session. Beyond roughly this many, a
 * session becomes a vocabulary list rather than practice, and the review
 * schedule floods days later with everything introduced at once.
 */
export const MAX_NEW_LEXEMES_PER_SESSION = 8;

export const COST_SECONDS: Record<QuestionType | 'srs' | 'passage', number> = {
  srs: 8,
  'sentence-completion': 60,
  'grammar-in-context': 60,
  restatement: 120,
  reading: 180,
  passage: 900,
};

export type SessionItem =
  | { kind: 'srs'; lexemeId: string }
  | { kind: 'question'; questionId: string }
  | { kind: 'passage'; passageId: string };

export interface SessionPlan {
  items: SessionItem[];
  estimatedSeconds: number;
}

export interface SessionRequest {
  budgetSeconds: number;
  theta: number;
  dueLexemeIds: string[];
  /**
   * Lexemes with no FSRS record yet. Without this the only way a word could
   * ever reach a session was to be named by some question's targetLexemes,
   * because cards are created solely when a question is answered or during
   * placement. Words the bank held but no question referenced were reachable
   * only by browsing the lexicon by hand.
   */
  unseenLexemeIds: string[];
  remediation: RemediationEntry[];
  questions: QuestionItem[];
  passages: Passage[];
  answeredQuestionIds: Set<string>;
}

export function buildSession(request: SessionRequest): SessionPlan {
  // A non-finite budget makes every fits() comparison false (spent + cost
  // <= NaN is always false), silently returning an empty session with no
  // error — the user asks for 25 minutes and gets nothing. Zero is a
  // legitimate budget (an empty plan on purpose), so only non-finite and
  // negative values are rejected.
  if (!Number.isFinite(request.budgetSeconds)) {
    throw new Error(`Invalid budgetSeconds: ${request.budgetSeconds} (must be finite)`);
  }
  if (request.budgetSeconds < 0) {
    throw new Error(`Invalid budgetSeconds: ${request.budgetSeconds} (must be non-negative)`);
  }
  if (!Number.isFinite(request.theta)) {
    throw new Error(`Invalid theta: ${request.theta} (must be finite)`);
  }

  const items: SessionItem[] = [];
  let spent = 0;

  const fits = (cost: number) => spent + cost <= request.budgetSeconds;
  const take = (item: SessionItem, cost: number) => {
    items.push(item);
    spent += cost;
  };

  // 1. Due SRS cards — cheapest, highest value. Uniform per-item cost, so
  // continue vs. break cannot change the outcome — kept as `continue` only
  // for consistency with the loops below, where it does matter.
  for (const lexemeId of request.dueLexemeIds) {
    if (!fits(COST_SECONDS.srs)) continue;
    take({ kind: 'srs', lexemeId }, COST_SECONDS.srs);
  }

  const used = new Set(request.answeredQuestionIds);
  const available = request.questions.filter(
    (q) => !used.has(q.id) && q.type !== 'reading',
  );

  // 2. Remediation — questions touching a queued target. `continue`, not
  // `break`: item costs vary (60s vs. 120s), so one item that doesn't fit
  // must not block a cheaper one further down the list.
  const targets = new Set(request.remediation.map((e) => e.targetId));
  const remedial = available.filter((q) =>
    (q.targetLexemes ?? []).some((id) => targets.has(id)),
  );
  for (const q of remedial) {
    if (!fits(COST_SECONDS[q.type])) continue;
    take({ kind: 'question', questionId: q.id }, COST_SECONDS[q.type]);
    used.add(q.id);
  }

  // 3. New vocabulary. Placed after remediation because a word already
  // missed is more urgent than a word never met, and before new questions
  // because a card costs 8s against 60-120s. Capped: a session that is
  // nothing but first exposures teaches recognition and never application.
  let introduced = 0;
  for (const lexemeId of request.unseenLexemeIds) {
    if (introduced >= MAX_NEW_LEXEMES_PER_SESSION) break;
    if (!fits(COST_SECONDS.srs)) continue;
    take({ kind: 'srs', lexemeId }, COST_SECONDS.srs);
    introduced += 1;
  }

  // 4. New material deliberately above the comfort level. Same reasoning as
  // step 2: `continue` lets a cheaper, worse-matched item fill budget a
  // pricier, better-matched item couldn't.
  const aim = request.theta + NEW_MATERIAL_THETA_OFFSET;
  const fresh = available
    .filter((q) => !used.has(q.id) && q.difficulty > request.theta)
    .sort((a, b) => Math.abs(a.difficulty - aim) - Math.abs(b.difficulty - aim));

  for (const q of fresh) {
    if (!fits(COST_SECONDS[q.type])) continue;
    take({ kind: 'question', questionId: q.id }, COST_SECONDS[q.type]);
    used.add(q.id);
  }

  // 5. A reading passage is atomic — all or nothing. Skip passages whose
  // questions are all already answered; otherwise a completed passage is
  // re-offered as "new" reading material forever. Uniform per-item cost
  // (every passage is 900s), so `continue` vs. `break` cannot change the
  // outcome here either — kept for the same consistency reason as step 1.
  const unfinishedPassages = request.passages.filter(
    (p) => !p.questionIds.every((id) => used.has(id)),
  );
  for (const p of unfinishedPassages) {
    if (!fits(COST_SECONDS.passage)) continue;
    take({ kind: 'passage', passageId: p.id }, COST_SECONDS.passage);
  }

  return { items, estimatedSeconds: spent };
}
