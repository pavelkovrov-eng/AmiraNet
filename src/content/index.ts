import lexemesJson from './lexemes/seed.json';
import questionsJson from './questions/seed.json';
import passagesJson from './passages/seed.json';
import { validateContent } from './validate';
import type { ContentBundle, Lexeme, QuestionItem } from './types';

export const content: ContentBundle = {
  lexemes: lexemesJson as Lexeme[],
  questions: questionsJson as QuestionItem[],
  passages: passagesJson as ContentBundle['passages'],
};

const result = validateContent(content);
if (!result.ok) {
  throw new Error(`Invalid content bundle:\n${result.errors.join('\n')}`);
}

const lexemeIndex = new Map(content.lexemes.map((l) => [l.id, l]));
const questionIndex = new Map(content.questions.map((q) => [q.id, q]));

export function lexemeById(id: string): Lexeme | undefined {
  return lexemeIndex.get(id);
}

export function questionById(id: string): QuestionItem | undefined {
  return questionIndex.get(id);
}
