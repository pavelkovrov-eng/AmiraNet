import type { QuestionItem, Passage, RemediationEntry, QuestionType } from '../content/types';

export const NEW_MATERIAL_THETA_OFFSET = 0.5;

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

  // 1. Due SRS cards — cheapest, highest value.
  for (const lexemeId of request.dueLexemeIds) {
    if (!fits(COST_SECONDS.srs)) break;
    take({ kind: 'srs', lexemeId }, COST_SECONDS.srs);
  }

  const used = new Set(request.answeredQuestionIds);
  const available = request.questions.filter(
    (q) => !used.has(q.id) && q.type !== 'reading',
  );

  // 2. Remediation — questions touching a queued target.
  const targets = new Set(request.remediation.map((e) => e.targetId));
  const remedial = available.filter((q) =>
    q.targetLexemes.some((id) => targets.has(id)),
  );
  for (const q of remedial) {
    if (!fits(COST_SECONDS[q.type])) break;
    take({ kind: 'question', questionId: q.id }, COST_SECONDS[q.type]);
    used.add(q.id);
  }

  // 3. New material deliberately above the comfort level.
  const aim = request.theta + NEW_MATERIAL_THETA_OFFSET;
  const fresh = available
    .filter((q) => !used.has(q.id) && q.difficulty > request.theta)
    .sort((a, b) => Math.abs(a.difficulty - aim) - Math.abs(b.difficulty - aim));

  for (const q of fresh) {
    if (!fits(COST_SECONDS[q.type])) break;
    take({ kind: 'question', questionId: q.id }, COST_SECONDS[q.type]);
    used.add(q.id);
  }

  // 4. A reading passage is atomic — all or nothing.
  for (const p of request.passages) {
    if (!fits(COST_SECONDS.passage)) break;
    take({ kind: 'passage', passageId: p.id }, COST_SECONDS.passage);
  }

  return { items, estimatedSeconds: spent };
}
