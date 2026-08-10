import { content, lexemeById, questionById } from './index';
import { validateContent } from './validate';

describe('content bundle', () => {
  it('passes its own validator', () => {
    expect(validateContent(content)).toEqual({ ok: true });
  });

  it('contains at least one lexeme, question, and passage', () => {
    expect(content.lexemes.length).toBeGreaterThan(0);
    expect(content.questions.length).toBeGreaterThan(0);
    expect(content.passages.length).toBeGreaterThan(0);
  });

  it('covers every question type the app supports', () => {
    const types = new Set(content.questions.map((q) => q.type));
    expect(types).toContain('sentence-completion');
    expect(types).toContain('restatement');
    expect(types).toContain('reading');
    expect(types).toContain('grammar-in-context');
  });

  it('looks up a lexeme by id', () => {
    const first = content.lexemes[0];
    expect(lexemeById(first.id)).toEqual(first);
  });

  it('returns undefined for an unknown lexeme id', () => {
    expect(lexemeById('nope')).toBeUndefined();
  });

  it('looks up a question by id', () => {
    const first = content.questions[0];
    expect(questionById(first.id)).toEqual(first);
  });
});
