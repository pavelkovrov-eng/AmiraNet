import { z } from 'zod';

export const lexemeSchema = z.object({
  id: z.string().min(1),
  headword: z.string().min(1),
  family: z.array(z.string().min(1)).min(1),
  definitionHe: z.string().min(1),
  definitionEn: z.string().min(1),
  pos: z.enum(['noun', 'verb', 'adjective', 'adverb', 'connector']),
  morphology: z.object({
    prefix: z.string().optional(),
    root: z.string().min(1),
    suffixes: z.array(z.string()),
  }),
  confusableWith: z.array(z.string()),
  exampleSentence: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  tags: z.array(z.string()),
});

export const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['sentence-completion', 'restatement', 'reading', 'grammar-in-context']),
  difficulty: z.number().min(-3).max(3),
  stem: z.string().min(1),
  options: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]),
  correctIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  // Optional since the psychometric import. An authored item explains every
  // option and names the word it tests; an imported exam item supplies a
  // stem, four options and the official answer, and nothing else. Fabricating
  // the rest would not be neutral: diagnose() treats a lexeme with no FSRS
  // card as unmastered, so inventing a primaryLexeme for a reading question
  // would classify every wrong reading answer as a vocabulary gap and flatten
  // the error-cause distribution the learner is meant to steer by.
  explanationPerOption: z
    .tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)])
    .optional(),
  primaryLexeme: z.string().min(1).optional(),
  targetLexemes: z.array(z.string()).optional(),
  trapType: z.enum([
    'phonetic-neighbor',
    'logic-inversion',
    'scope-shift',
    'tense-shift',
    'surface-match',
  ]),
  passageId: z.string().optional(),
});

export const passageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  domain: z.enum(['science', 'history', 'psychology', 'economics', 'humanities']),
  difficulty: z.number().min(-3).max(3),
  wordCount: z.number().int().positive(),
  questionIds: z.array(z.string()),
});
