import { lexemeSchema, questionSchema, passageSchema } from './schema';
import type { ContentBundle, QuestionItem, Passage } from './types';

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

function getLocator(item: QuestionItem | Passage | { id: string; headword?: string }, index: number): string {
  if (!item.id) {
    if ('headword' in item) return `index ${index} (headword: ${item.headword})`;
    if ('title' in item) return `index ${index} (title: ${item.title})`;
    return `index ${index}`;
  }
  return item.id;
}

export function validateContent(bundle: ContentBundle): ValidationResult {
  const errors: string[] = [];

  // Issue 2: Guard against missing arrays instead of validating bundle upfront
  // This prevents crashes and allows item-level validation with better locators
  const lexemes = Array.isArray(bundle.lexemes) ? bundle.lexemes : [];
  const questions = Array.isArray(bundle.questions) ? bundle.questions : [];
  const passages = Array.isArray(bundle.passages) ? bundle.passages : [];

  // Validate each item's schema and track which items failed
  const failedQuestionIds = new Set<string>();
  const failedPassageIds = new Set<string>();

  for (let i = 0; i < lexemes.length; i++) {
    const item = lexemes[i];
    const parsed = lexemeSchema.safeParse(item);
    if (!parsed.success) {
      const locator = getLocator(item, i);
      errors.push(`lexeme ${locator}: ${parsed.error.message}`);
    }
  }

  for (let i = 0; i < questions.length; i++) {
    const item = questions[i];
    const parsed = questionSchema.safeParse(item);
    if (!parsed.success) {
      const locator = getLocator(item, i);
      errors.push(`question ${locator}: ${parsed.error.message}`);
      failedQuestionIds.add(item.id);
    }
  }

  for (let i = 0; i < passages.length; i++) {
    const item = passages[i];
    const parsed = passageSchema.safeParse(item);
    if (!parsed.success) {
      const locator = getLocator(item, i);
      errors.push(`passage ${locator}: ${parsed.error.message}`);
      failedPassageIds.add(item.id);
    }
  }

  const allIds = [
    ...lexemes.map((l) => l.id),
    ...questions.map((q) => q.id),
    ...passages.map((p) => p.id),
  ];
  for (const dupe of findDuplicates(allIds)) {
    errors.push(`duplicate id: ${dupe}`);
  }

  const lexemeIds = new Set(lexemes.map((l) => l.id));
  const questionIds = new Set(questions.map((q) => q.id));
  const passageIds = new Set(passages.map((p) => p.id));

  // Track reading questions that reference passages (for bidirectional check)
  const readingQuestionsInPassages = new Map<string, Set<string>>();

  // Issue 2: Only check cross-references for items that passed schema validation
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (failedQuestionIds.has(q.id)) continue;

    // Skip targetLexemes check if it failed schema validation
    if (Array.isArray(q.targetLexemes)) {
      for (const target of q.targetLexemes) {
        if (!lexemeIds.has(target)) {
          errors.push(`question ${q.id}: unknown targetLexeme ${target}`);
        }
      }
    }

    // Absent is allowed (imported exam items name no word); present but
    // unknown is still an error.
    if (q.primaryLexeme && !lexemeIds.has(q.primaryLexeme)) {
      errors.push(`question ${q.id}: unknown primaryLexeme ${q.primaryLexeme}`);
    }
    // The primary must also be a target: diagnosis reads primaryLexeme,
    // while SRS review and coverage read targetLexemes. If they diverge,
    // the word driving the diagnosis never gets scheduled for review.
    if (
      q.primaryLexeme &&
      Array.isArray(q.targetLexemes) &&
      !q.targetLexemes.includes(q.primaryLexeme)
    ) {
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

    // Issue 1: Track reading questions for bidirectional check
    if (q.type === 'reading' && q.passageId) {
      if (!readingQuestionsInPassages.has(q.passageId)) {
        readingQuestionsInPassages.set(q.passageId, new Set());
      }
      readingQuestionsInPassages.get(q.passageId)!.add(q.id);
    }
  }

  for (let i = 0; i < passages.length; i++) {
    const p = passages[i];
    if (failedPassageIds.has(p.id)) continue;

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

    // Issue 1: Check bidirectional consistency
    // Every question in the passage must be type:'reading' and point back at this passage
    for (let qIdx = 0; qIdx < p.questionIds.length; qIdx++) {
      const qid = p.questionIds[qIdx];
      const question = questions.find((q) => q.id === qid);
      if (question) {
        if (question.type !== 'reading') {
          errors.push(`passage ${p.id}: question ${qid} must be type 'reading'`);
        }
        if (question.passageId !== p.id) {
          errors.push(
            `passage ${p.id}: reading question ${qid} must be listed in passage's questionIds`,
          );
        }
      }
    }

    // Every reading question pointing at this passage must appear in its questionIds
    const readingQuestionsForPassage = readingQuestionsInPassages.get(p.id) || new Set();
    for (const qid of readingQuestionsForPassage) {
      if (!p.questionIds.includes(qid)) {
        errors.push(`passage ${p.id}: reading question ${qid} must be listed in passage's questionIds`);
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
