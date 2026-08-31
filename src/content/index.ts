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
import clusterAte from './questions/cluster-ate.json';
import reading2 from './questions/reading-2.json';
import reading3 from './questions/reading-3.json';
import seedPassages from './passages/seed.json';
import passagesJson from './passages/passages.json';
import passages2 from './passages/passages-2.json';
import passages3 from './passages/passages-3.json';
import { validateContent } from './validate';
import type { ContentBundle, Lexeme, QuestionItem } from './types';

export const content: ContentBundle = {
  lexemes: [...awl1, ...awl2, ...awl3, ...connectors, ...examFrequent, ...verifiedExam] as Lexeme[],
  questions: [...questionsJson, ...sentenceCompletion, ...restatement, ...reading, ...cluster, ...clusterAte, ...reading2, ...reading3] as QuestionItem[],
  passages: [...seedPassages, ...passagesJson, ...passages2, ...passages3] as ContentBundle['passages'],
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

/**
 * Questions that can be put in front of someone with nothing else on screen.
 *
 * A reading question ("as used in paragraph 1...", "the main purpose of the
 * second paragraph is...") is meaningless without its passage, and no screen
 * that renders a bare QuestionCard renders passages. Answering one is a coin
 * flip, which is merely annoying in practice and actively harmful in the
 * placement test, where those guesses set the starting ability estimate that
 * every later session is built from.
 *
 * session-builder.ts already knew this and filtered `type !== 'reading'`
 * inline. Keeping the rule there and nowhere else is what let the placement
 * test and the free-practice screen each rediscover it as a bug. Filtering on
 * `passageId` rather than on the type name so a future passage-backed type
 * cannot slip through by not being called "reading".
 */
export const standaloneQuestions: QuestionItem[] = content.questions.filter(
  (q) => q.passageId === undefined,
);
