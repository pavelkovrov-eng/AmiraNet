import { lexemeSchema, questionSchema, passageSchema } from './schema';
import type { ContentBundle } from './types';

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

const READING_QUESTIONS_PER_PASSAGE = 5;

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

export function validateContent(bundle: ContentBundle): ValidationResult {
  const errors: string[] = [];

  for (const item of bundle.lexemes) {
    const parsed = lexemeSchema.safeParse(item);
    if (!parsed.success) errors.push(`lexeme ${item.id}: ${parsed.error.message}`);
  }
  for (const item of bundle.questions) {
    const parsed = questionSchema.safeParse(item);
    if (!parsed.success) errors.push(`question ${item.id}: ${parsed.error.message}`);
  }
  for (const item of bundle.passages) {
    const parsed = passageSchema.safeParse(item);
    if (!parsed.success) errors.push(`passage ${item.id}: ${parsed.error.message}`);
  }

  const allIds = [
    ...bundle.lexemes.map((l) => l.id),
    ...bundle.questions.map((q) => q.id),
    ...bundle.passages.map((p) => p.id),
  ];
  for (const dupe of findDuplicates(allIds)) {
    errors.push(`duplicate id: ${dupe}`);
  }

  const lexemeIds = new Set(bundle.lexemes.map((l) => l.id));
  const questionIds = new Set(bundle.questions.map((q) => q.id));
  const passageIds = new Set(bundle.passages.map((p) => p.id));

  for (const q of bundle.questions) {
    for (const target of q.targetLexemes) {
      if (!lexemeIds.has(target)) {
        errors.push(`question ${q.id}: unknown targetLexeme ${target}`);
      }
    }
    if (!lexemeIds.has(q.primaryLexeme)) {
      errors.push(`question ${q.id}: unknown primaryLexeme ${q.primaryLexeme}`);
    }
    // The primary must also be a target: diagnosis reads primaryLexeme,
    // while SRS review and coverage read targetLexemes. If they diverge,
    // the word driving the diagnosis never gets scheduled for review.
    if (!q.targetLexemes.includes(q.primaryLexeme)) {
      errors.push(
        `question ${q.id}: primaryLexeme ${q.primaryLexeme} missing from targetLexemes`,
      );
    }
    const uniqueOptions = new Set(q.options);
    if (uniqueOptions.size !== q.options.length) {
      errors.push(`question ${q.id}: duplicate option text`);
    }
    if (q.passageId && !passageIds.has(q.passageId)) {
      errors.push(`question ${q.id}: unknown passageId ${q.passageId}`);
    }
    if (q.type === 'reading' && !q.passageId) {
      errors.push(`question ${q.id}: reading question must reference a passage`);
    }
  }

  for (const p of bundle.passages) {
    for (const qid of p.questionIds) {
      if (!questionIds.has(qid)) {
        errors.push(`passage ${p.id}: unknown questionId ${qid}`);
      }
    }
    if (p.questionIds.length !== READING_QUESTIONS_PER_PASSAGE) {
      errors.push(
        `passage ${p.id}: must have exactly 5 questions, found ${p.questionIds.length}`,
      );
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
