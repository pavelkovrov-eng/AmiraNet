import awl1 from './lexemes/awl-sublist-1.json';
import awl2 from './lexemes/awl-sublist-2.json';
import awl3 from './lexemes/awl-sublist-3.json';
import connectors from './lexemes/connectors.json';
import examFrequent from './lexemes/exam-frequent.json';
import verifiedExam from './lexemes/verified-exam.json';
import questionsJson from './questions/seed.json';
import sentenceCompletion from './questions/sentence-completion.json';
import restatement from './questions/restatement.json';
import reading from './questions/reading.json';
import cluster from './questions/cluster.json';
import seedPassages from './passages/seed.json';
import passagesJson from './passages/passages.json';
import { validateContent } from './validate';
import type { ContentBundle, Lexeme, QuestionItem } from './types';

export const content: ContentBundle = {
  lexemes: [...awl1, ...awl2, ...awl3, ...connectors, ...examFrequent, ...verifiedExam] as Lexeme[],
  questions: [...questionsJson, ...sentenceCompletion, ...restatement, ...reading, ...cluster] as QuestionItem[],
  passages: [...seedPassages, ...passagesJson] as ContentBundle['passages'],
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
