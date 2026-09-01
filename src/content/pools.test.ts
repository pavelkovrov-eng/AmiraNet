import { placementQuestions, standaloneQuestions, passageBackedQuestions, content } from './index';

// Placement both measures ability and seeds the SRS. An item that names no
// word can only do the first, so the pool it draws from must be able to do
// both - this is what stopped the placement test seeding cards once the
// imported exam questions landed in the bank.
describe('placement pool', () => {
  it('only offers items that name a word to seed', () => {
    expect(placementQuestions.length).toBeGreaterThan(20);
    for (const q of placementQuestions) {
      expect(q.primaryLexeme).toBeDefined();
      expect(q.targetLexemes?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('spans enough difficulty for a 20-item search', () => {
    const ds = placementQuestions.map((q) => q.difficulty);
    expect(Math.max(...ds) - Math.min(...ds)).toBeGreaterThan(2);
  });
});

// The defect that put "as used in paragraph 1..." on screen with nothing to
// read: a question that belongs to a passage must never reach a screen that
// renders questions on their own.
describe('question pools', () => {
  it('keeps passage-dependent items out of the standalone pool', () => {
    for (const q of standaloneQuestions) expect(q.passageId).toBeUndefined();
  });

  it('guarantees every passage-backed question has a passage that exists', () => {
    const ids = new Set(content.passages.map((p) => p.id));
    for (const q of passageBackedQuestions) expect(ids.has(q.passageId!)).toBe(true);
  });

  it('accounts for every question in exactly one pool', () => {
    expect(standaloneQuestions.length + passageBackedQuestions.length).toBe(
      content.questions.length,
    );
  });
});
