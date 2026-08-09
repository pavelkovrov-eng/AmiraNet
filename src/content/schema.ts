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
  explanationPerOption: z.tuple([
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
  ]),
  primaryLexeme: z.string().min(1),
  targetLexemes: z.array(z.string()).min(1),
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

export const contentBundleSchema = z.object({
  lexemes: z.array(lexemeSchema),
  questions: z.array(questionSchema),
  passages: z.array(passageSchema),
});
