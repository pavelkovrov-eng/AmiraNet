import awl1 from './lexemes/awl-sublist-1.json';
import awl2 from './lexemes/awl-sublist-2.json';
import awl3 from './lexemes/awl-sublist-3.json';
import connectors from './lexemes/connectors.json';
import questionsJson from './questions/seed.json';
import passagesJson from './passages/seed.json';
import { validateContent } from './validate';
import type { ContentBundle, Lexeme, QuestionItem } from './types';

export const content: ContentBundle = {
  lexemes: [...awl1, ...awl2, ...awl3, ...connectors] as Lexeme[],
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
