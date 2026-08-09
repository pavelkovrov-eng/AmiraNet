# Amirnet Study App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, offline, single-user study application that drives its user to a 134+ score on the Israeli Amirnet English placement exam.

**Architecture:** Vocabulary-first and diagnosis-driven. An FSRS spaced-repetition engine over Academic Word List lexemes is the core; practice questions serve as both application and diagnostic signal. Every wrong answer is classified into one of five root causes, which feeds a remediation queue that shapes the next session. A session builder assembles elastic sessions from a user-supplied time budget. No server, no network at runtime — a Vite client app with content bundled as validated JSON and progress in IndexedDB.

**Tech Stack:** Vite 8, React 19, TypeScript 5, Vitest 4, Dexie 4 (IndexedDB), ts-fsrs 5 (FSRS scheduling), Zod 4 (content validation), fake-indexeddb 6 (DB tests). No CSS framework — plain CSS with custom properties.

**Spec:** `docs/superpowers/specs/2026-08-09-amirnet-study-app-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Offline at runtime.** No `fetch`, no XHR, no external CDN, no remote fonts. All content bundled at build time.
- **Single user.** No auth, no accounts, no multi-user data partitioning.
- **UI language is Hebrew (RTL). Content language is English (LTR).** Every English text node must carry `dir="ltr"` and be styled `unicode-bidi: isolate`. A question rendered with broken bidi is a failed question.
- **Light theme is the default.** Dark theme is opt-in only, never auto-applied from `prefers-color-scheme` alone.
- **Color is semantic only.** Green = correct, red = wrong, amber = due / time warning. No decorative color, no gradients.
- **Persist after every single answer** to IndexedDB — never batch to end of session.
- **theta scale is `-3.0` to `+3.0`**, clamped.
- **Score mapping is `clamp(round(100 + theta * (50/3)), 50, 150)`.** Score 134 corresponds to theta `2.04`.
- **Mastery threshold:** an FSRS card is mastered when `state === State.Review && scheduled_days > 21`.
- **Pilot sections are out of scope** except `grammar-in-context`. No audio, no writing task, no word-formation.
- **All design values come from `src/styles/tokens.css`.** No hardcoded colors, font sizes, or spacing in components.
- **Files stay focused.** Target 200–400 lines, 800 hard maximum.
- **Commit after every task** using conventional commit format (`feat:`, `test:`, `docs:`, `chore:`).

---

## File Structure

```text
src/
├── content/
│   ├── types.ts                  # shared domain types (single source of truth)
│   ├── schema.ts                 # Zod schemas mirroring types.ts
│   ├── validate.ts               # cross-reference integrity checks
│   ├── index.ts                  # loads + validates all content at import time
│   ├── lexemes/*.json
│   ├── questions/*.json
│   └── passages/*.json
├── db/
│   ├── db.ts                     # Dexie instance + table definitions
│   └── repository.ts             # typed accessors, per-answer writes
├── engines/
│   ├── theta.ts                  # ability estimate + score mapping
│   ├── srs.ts                    # ts-fsrs wrapper + mastery + seeding
│   ├── diagnosis.ts              # five-cause classifier
│   ├── remediation.ts            # remediation queue lifecycle
│   ├── placement.ts              # 20-item binary search
│   └── session-builder.ts        # elastic session assembly
├── lib/
│   └── timer.ts                  # drift-free countdown
├── components/
│   ├── question/                 # per-type question renderers
│   ├── session/                  # session runner shell
│   └── ui/                       # EnglishText, TimerBar, Choice, etc.
├── screens/
│   ├── PlacementScreen.tsx
│   ├── TodayScreen.tsx
│   ├── PracticeScreen.tsx
│   ├── SimulationScreen.tsx
│   ├── ProgressScreen.tsx
│   └── LexiconScreen.tsx
└── styles/
    ├── tokens.css
    ├── typography.css
    └── global.css

scripts/
└── validate-content.ts           # CI-style gate, runs the validator over all content
```

**Decomposition rationale:** engines are pure functions with injected dependencies, so every one is unit-testable without a DOM or a database. The database layer is the only stateful module. Screens compose engines and components but hold no domain logic.

---

## Task 1: Project scaffold, design tokens, and bidi correctness

Bidi is a correctness requirement, not styling — so it gets a test in the very first task.

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`
- Create: `src/styles/tokens.css`, `src/styles/typography.css`, `src/styles/global.css`
- Create: `src/components/ui/EnglishText.tsx`
- Test: `src/components/ui/EnglishText.test.tsx`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `EnglishText` component — `({ children, as }: { children: string; as?: 'span' | 'p' | 'div' }) => JSX.Element`. Every English string in the app renders through this.

- [ ] **Step 1: Initialize the project**

Do **not** run `npm create vite` here — the repo root already contains `docs/`, `.git`, and `.gitignore`, and the scaffolder opens an interactive "directory is not empty" prompt that cannot be answered non-interactively. Write the scaffold by hand instead.

Create `package.json`:

```json
{
  "name": "amirnet-study-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `index.html`:

```html
<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>הכנה לאמירנט</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "scripts"]
}
```

Create `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create a placeholder `src/App.tsx` (Task 15 replaces it):

```tsx
export default function App() {
  return <h1>הכנה לאמירנט</h1>;
}
```

Then install:

```bash
npm install react@19 react-dom@19
npm install -D vite@8 @vitejs/plugin-react typescript@5 @types/react @types/react-dom \
  vitest@4 jsdom @testing-library/react @testing-library/jest-dom
```

`typescript@5` is deliberate: TypeScript 7 is current, but the `@types/*` and tooling ecosystem this project depends on is still settling against it. Pin 5 and revisit after the app is working — a toolchain fight is not what this project's deadline can absorb.

- [ ] **Step 2: Configure Vitest**

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

Create `src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Add to `package.json` scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Write the failing bidi test**

Create `src/components/ui/EnglishText.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { EnglishText } from './EnglishText';

describe('EnglishText', () => {
  it('marks content as left-to-right', () => {
    render(<EnglishText>The results were inconclusive.</EnglishText>);
    const el = screen.getByText('The results were inconclusive.');
    expect(el).toHaveAttribute('dir', 'ltr');
  });

  it('carries the bidi isolation class', () => {
    render(<EnglishText>despite the claims</EnglishText>);
    expect(screen.getByText('despite the claims')).toHaveClass('english-text');
  });

  it('renders as the requested element', () => {
    render(<EnglishText as="p">Academic prose.</EnglishText>);
    expect(screen.getByText('Academic prose.').tagName).toBe('P');
  });

  it('defaults to a span', () => {
    render(<EnglishText>inline</EnglishText>);
    expect(screen.getByText('inline').tagName).toBe('SPAN');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- EnglishText`
Expected: FAIL — `Failed to resolve import "./EnglishText"`

- [ ] **Step 5: Write the design tokens**

Create `src/styles/tokens.css`:

```css
:root {
  /* Achromatic base — Swiss/International direction */
  --color-bg:            oklch(99% 0 0);
  --color-surface:       oklch(97% 0 0);
  --color-border:        oklch(88% 0 0);
  --color-text:          oklch(20% 0 0);
  --color-text-muted:    oklch(48% 0 0);

  /* Semantic only — never decorative */
  --color-correct:       oklch(58% 0.15 150);
  --color-wrong:         oklch(56% 0.19 27);
  --color-due:           oklch(72% 0.15 75);

  /* Type scale */
  --text-sm:    0.875rem;
  --text-base:  1.0625rem;
  --text-lg:    1.375rem;
  --text-xl:    2rem;
  --text-2xl:   3rem;

  --measure:    65ch;
  --leading-body: 1.65;
  --leading-tight: 1.2;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 2.5rem;
  --space-6: 4rem;

  --duration-fast: 150ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}

:root[data-theme='dark'] {
  --color-bg:         oklch(18% 0 0);
  --color-surface:    oklch(23% 0 0);
  --color-border:     oklch(34% 0 0);
  --color-text:       oklch(94% 0 0);
  --color-text-muted: oklch(68% 0 0);
}
```

Create `src/styles/typography.css`:

```css
body {
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: var(--text-base);
  line-height: var(--leading-body);
  color: var(--color-text);
}

/* Bidi isolation: Hebrew UI wrapping English content.
   Without this, terminal punctuation and quotes jump to the wrong edge. */
.english-text {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: left;
}

.reading-measure {
  max-width: var(--measure);
}
```

Create `src/styles/global.css`:

```css
@import './tokens.css';
@import './typography.css';

html {
  direction: rtl;
}

body {
  margin: 0;
  background: var(--color-bg);
}

*:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Implement EnglishText**

Create `src/components/ui/EnglishText.tsx`:

```tsx
interface EnglishTextProps {
  children: string;
  as?: 'span' | 'p' | 'div';
}

export function EnglishText({ children, as: Tag = 'span' }: EnglishTextProps) {
  return (
    <Tag dir="ltr" className="english-text">
      {children}
    </Tag>
  );
}
```

- [ ] **Step 7: Wire the stylesheet**

In `src/main.tsx`, replace the default CSS import with:

```ts
import './styles/global.css';
```

Delete `src/App.css` and `src/index.css`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- EnglishText`
Expected: PASS — 4 tests

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite app with design tokens and bidi-safe English text"
```

---

## Task 2: Content types, Zod schema, and integrity validator

This is the quality gate for all authored content. It must exist before any content is written.

**Files:**
- Create: `src/content/types.ts`
- Create: `src/content/schema.ts`
- Create: `src/content/validate.ts`
- Test: `src/content/validate.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - Types `Lexeme`, `QuestionItem`, `Passage`, `TrapType`, `QuestionType`, `DiagnosisCause`, `RemediationEntry`, `Attempt`
  - `validateContent(bundle: ContentBundle): ValidationResult` where `ValidationResult = { ok: true } | { ok: false; errors: string[] }`

- [ ] **Step 1: Write the domain types**

Create `src/content/types.ts`:

```ts
export type QuestionType =
  | 'sentence-completion'
  | 'restatement'
  | 'reading'
  | 'grammar-in-context';

export type TrapType =
  | 'phonetic-neighbor'
  | 'logic-inversion'
  | 'scope-shift'
  | 'tense-shift'
  | 'surface-match';

export type DiagnosisCause =
  | 'vocabulary-gap'
  | 'distractor-phonetic'
  | 'connector-misread'
  | 'time-pressure'
  | 'inference-error';

export interface Lexeme {
  id: string;
  headword: string;
  family: string[];
  definitionHe: string;
  definitionEn: string;
  pos: 'noun' | 'verb' | 'adjective' | 'adverb' | 'connector';
  morphology: { prefix?: string; root: string; suffixes: string[] };
  confusableWith: string[];
  exampleSentence: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

export interface QuestionItem {
  id: string;
  type: QuestionType;
  difficulty: number;
  stem: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanationPerOption: [string, string, string, string];
  targetLexemes: string[];
  trapType: TrapType;
  passageId?: string;
}

export interface Passage {
  id: string;
  title: string;
  body: string;
  domain: 'science' | 'history' | 'psychology' | 'economics' | 'humanities';
  difficulty: number;
  wordCount: number;
  questionIds: string[];
}

export interface RemediationEntry {
  cause: DiagnosisCause;
  targetId: string;
  createdAt: number;
  servings: number;
}

export interface Attempt {
  questionId: string;
  chosenIndex: number;
  correct: boolean;
  elapsedMs: number;
  at: number;
  diagnosis: DiagnosisCause | null;
}

export interface ContentBundle {
  lexemes: Lexeme[];
  questions: QuestionItem[];
  passages: Passage[];
}
```

- [ ] **Step 2: Write the failing validator tests**

Create `src/content/validate.test.ts`:

```ts
import { validateContent } from './validate';
import type { ContentBundle, Lexeme, QuestionItem, Passage } from './types';

function lexeme(over: Partial<Lexeme> = {}): Lexeme {
  return {
    id: 'awl-analyze',
    headword: 'analyze',
    family: ['analyze', 'analysis'],
    definitionHe: 'לנתח',
    definitionEn: 'to examine in detail',
    pos: 'verb',
    morphology: { root: 'lys', suffixes: ['-is'] },
    confusableWith: ['analogy'],
    exampleSentence: 'Researchers analyze the data.',
    difficulty: 3,
    tags: ['awl-sublist-1'],
    ...over,
  };
}

function question(over: Partial<QuestionItem> = {}): QuestionItem {
  return {
    id: 'sc-0001',
    type: 'sentence-completion',
    difficulty: 0.5,
    stem: 'The committee will ___ the findings.',
    options: ['analyze', 'analogy', 'apologize', 'anarchy'],
    correctIndex: 0,
    explanationPerOption: ['correct', 'sounds similar', 'unrelated', 'unrelated'],
    targetLexemes: ['awl-analyze'],
    trapType: 'phonetic-neighbor',
    ...over,
  };
}

function passage(over: Partial<Passage> = {}): Passage {
  return {
    id: 'psg-001',
    title: 'Coral Reefs',
    body: 'Coral reefs support enormous biodiversity.',
    domain: 'science',
    difficulty: 0.8,
    wordCount: 6,
    questionIds: ['rc-0001'],
    ...over,
  };
}

describe('validateContent', () => {
  it('accepts a well-formed bundle', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question()],
      passages: [],
    };
    expect(validateContent(bundle)).toEqual({ ok: true });
  });

  it('rejects a question referencing an unknown lexeme', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ targetLexemes: ['awl-ghost'] })],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain('awl-ghost');
  });

  it('rejects duplicate ids', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme(), lexeme()],
      questions: [],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain('duplicate');
  });

  it('rejects a passage whose questionIds do not exist', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question()],
      passages: [passage({ questionIds: ['rc-9999'] })],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]).toContain('rc-9999');
  });

  it('rejects a passage that does not have exactly five questions', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ id: 'rc-0001', type: 'reading', passageId: 'psg-001' })],
      passages: [passage()],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('exactly 5');
  });

  it('rejects an empty explanation for any option', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ explanationPerOption: ['correct', '', 'x', 'y'] })],
      passages: [],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  it('rejects difficulty outside the theta range', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ difficulty: 7 })],
      passages: [],
    };
    expect(validateContent(bundle).ok).toBe(false);
  });

  it('rejects duplicate option text within a question', () => {
    const bundle: ContentBundle = {
      lexemes: [lexeme()],
      questions: [question({ options: ['analyze', 'analyze', 'apologize', 'anarchy'] })],
      passages: [],
    };
    const result = validateContent(bundle);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('duplicate option');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- validate`
Expected: FAIL — `Failed to resolve import "./validate"`

- [ ] **Step 4: Write the Zod schemas**

Create `src/content/schema.ts`:

```ts
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
  targetLexemes: z.array(z.string()),
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
```

- [ ] **Step 5: Implement the validator**

Create `src/content/validate.ts`:

```ts
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
```

- [ ] **Step 6: Install Zod and run the tests**

```bash
npm install zod@4
npm test -- validate
```

Expected: PASS — 8 tests

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add content types, Zod schema, and integrity validator"
```

---

## Task 3: Seed content fixture and load-time validation gate

A small but genuine content set so every engine can be exercised end to end. Full volume comes in Task 16.

**Files:**
- Create: `src/content/lexemes/seed.json`
- Create: `src/content/questions/seed.json`
- Create: `src/content/passages/seed.json`
- Create: `src/content/index.ts`
- Create: `scripts/validate-content.ts`
- Test: `src/content/index.test.ts`

**Interfaces:**
- Consumes: `validateContent` from Task 2
- Produces: `content: ContentBundle` (validated at import), plus lookups `lexemeById(id): Lexeme | undefined` and `questionById(id): QuestionItem | undefined`

- [ ] **Step 1: Write the failing test**

Create `src/content/index.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- content/index`
Expected: FAIL — `Failed to resolve import "./index"`

- [ ] **Step 3: Author the seed lexemes**

Create `src/content/lexemes/seed.json` with **12 entries**. Two are shown in full; author the remaining ten in the same shape.

Required coverage: at least 3 connectors (`pos: 'connector'`), at least 2 with a non-empty `prefix`, and at least 4 with non-empty `confusableWith` (needed by the diagnosis engine in Task 7).

```json
[
  {
    "id": "awl-analyze",
    "headword": "analyze",
    "family": ["analyze", "analysis", "analytical", "analytically"],
    "definitionHe": "לנתח, לפרק לגורמים",
    "definitionEn": "to examine something in detail in order to understand it",
    "pos": "verb",
    "morphology": { "root": "lys", "suffixes": ["-is", "-ical", "-ically"] },
    "confusableWith": ["analogy", "paralysis"],
    "exampleSentence": "Researchers analyze the data before drawing conclusions.",
    "difficulty": 2,
    "tags": ["awl-sublist-1"]
  },
  {
    "id": "conn-nevertheless",
    "headword": "nevertheless",
    "family": ["nevertheless"],
    "definitionHe": "אף על פי כן, ובכל זאת",
    "definitionEn": "in spite of what has just been said",
    "pos": "connector",
    "morphology": { "root": "nevertheless", "suffixes": [] },
    "confusableWith": ["nonetheless", "moreover"],
    "exampleSentence": "The evidence was thin; nevertheless, the theory persisted.",
    "difficulty": 3,
    "tags": ["connector-contrast"]
  }
]
```

Remaining ten headwords to author: `implicit`, `subsequent`, `ambiguous`, `facilitate`, `constrain`, `arbitrary`, `coherent` (regular lexemes); `whereas`, `consequently`, `notwithstanding` (connectors).

- [ ] **Step 4: Author the seed questions**

Create `src/content/questions/seed.json` with **16 entries**: 6 sentence-completion, 3 restatement, 5 reading (ids `rc-0001` … `rc-0005`, all with `"passageId": "psg-001"`), 2 grammar-in-context.

At least one question must use `"trapType": "logic-inversion"` and at least one must have a distractor listed in the correct lexeme's `confusableWith` — the diagnosis engine tests in Task 7 depend on both existing.

One full example:

```json
[
  {
    "id": "sc-0001",
    "type": "sentence-completion",
    "difficulty": 0.4,
    "stem": "The committee refused to ___ the findings until further data arrived.",
    "options": ["analyze", "analogy", "apologize", "anarchy"],
    "correctIndex": 0,
    "explanationPerOption": [
      "Correct. The slot needs a transitive verb meaning to examine in detail.",
      "A noun meaning comparison, and a phonetic neighbor of the answer. Cannot follow 'to'.",
      "A verb, but semantically unrelated to examining findings.",
      "A noun meaning absence of government. Wrong part of speech and wrong meaning."
    ],
    "targetLexemes": ["awl-analyze"],
    "trapType": "phonetic-neighbor"
  }
]
```

- [ ] **Step 5: Author the seed passage**

Create `src/content/passages/seed.json` with **1 entry**, `id: "psg-001"`, `questionIds` listing exactly `rc-0001` … `rc-0005`, and a `body` of 3 short academic paragraphs. Set `wordCount` to the true word count of `body`.

- [ ] **Step 6: Implement the content loader**

Create `src/content/index.ts`:

```ts
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
```

Enable JSON imports in `tsconfig.json` under `compilerOptions`:

```json
{ "resolveJsonModule": true }
```

- [ ] **Step 7: Add the standalone validation script**

Create `scripts/validate-content.ts`:

```ts
import { content } from '../src/content/index';
import { validateContent } from '../src/content/validate';

const result = validateContent(content);
if (!result.ok) {
  console.error('Content validation FAILED:\n' + result.errors.join('\n'));
  process.exit(1);
}
console.log(
  `Content OK — ${content.lexemes.length} lexemes, ` +
    `${content.questions.length} questions, ${content.passages.length} passages`,
);
```

Add to `package.json` scripts:

```json
{ "validate:content": "vite-node scripts/validate-content.ts" }
```

```bash
npm install -D vite-node
```

- [ ] **Step 8: Run tests and the validation script**

Run: `npm test -- content/index && npm run validate:content`
Expected: 6 tests PASS, and the script prints the content counts

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add seed content fixture with load-time validation gate"
```

---

## Task 4: Theta engine and score mapping

Pure functions. This is where a silent bug would misreport progress for weeks, so coverage is thorough.

**Files:**
- Create: `src/engines/theta.ts`
- Test: `src/engines/theta.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `updateTheta(theta: number, itemDifficulty: number, correct: boolean, answered: number): number`
  - `thetaToScore(theta: number): number`
  - `stepSize(answered: number): number`
  - Constants `THETA_MIN = -3`, `THETA_MAX = 3`, `PASS_THRESHOLD_SCORE = 134`, `PASS_THRESHOLD_THETA = 2.04`

- [ ] **Step 1: Write the failing tests**

Create `src/engines/theta.test.ts`:

```ts
import {
  updateTheta,
  thetaToScore,
  stepSize,
  THETA_MIN,
  THETA_MAX,
  PASS_THRESHOLD_SCORE,
  PASS_THRESHOLD_THETA,
} from './theta';

describe('thetaToScore', () => {
  it('maps theta 0 to score 100', () => {
    expect(thetaToScore(0)).toBe(100);
  });

  it('maps the pass threshold theta to the pass threshold score', () => {
    expect(thetaToScore(PASS_THRESHOLD_THETA)).toBe(PASS_THRESHOLD_SCORE);
  });

  it('maps theta +3 to 150', () => {
    expect(thetaToScore(3)).toBe(150);
  });

  it('maps theta -3 to 50', () => {
    expect(thetaToScore(-3)).toBe(50);
  });

  it('clamps above the maximum', () => {
    expect(thetaToScore(99)).toBe(150);
  });

  it('clamps below the minimum', () => {
    expect(thetaToScore(-99)).toBe(50);
  });

  it('returns integers', () => {
    expect(Number.isInteger(thetaToScore(1.234))).toBe(true);
  });
});

describe('stepSize', () => {
  it('shrinks as more items are answered', () => {
    expect(stepSize(0)).toBeGreaterThan(stepSize(10));
    expect(stepSize(10)).toBeGreaterThan(stepSize(50));
  });

  it('stays positive', () => {
    expect(stepSize(1000)).toBeGreaterThan(0);
  });
});

describe('updateTheta', () => {
  it('raises theta on a correct answer', () => {
    expect(updateTheta(0, 0, true, 0)).toBeGreaterThan(0);
  });

  it('lowers theta on a wrong answer', () => {
    expect(updateTheta(0, 0, false, 0)).toBeLessThan(0);
  });

  it('rewards a correct answer on a hard item more than on an easy one', () => {
    const hard = updateTheta(0, 2, true, 0);
    const easy = updateTheta(0, -2, true, 0);
    expect(hard).toBeGreaterThan(easy);
  });

  it('penalizes a wrong answer on an easy item more than on a hard one', () => {
    const easy = updateTheta(0, -2, false, 0);
    const hard = updateTheta(0, 2, false, 0);
    expect(easy).toBeLessThan(hard);
  });

  it('clamps to the theta ceiling', () => {
    expect(updateTheta(THETA_MAX, -3, true, 0)).toBeLessThanOrEqual(THETA_MAX);
  });

  it('clamps to the theta floor', () => {
    expect(updateTheta(THETA_MIN, 3, false, 0)).toBeGreaterThanOrEqual(THETA_MIN);
  });

  it('converges toward true ability under repeated correct answers', () => {
    let theta = 0;
    for (let i = 0; i < 40; i++) theta = updateTheta(theta, 1.5, true, i);
    expect(theta).toBeGreaterThan(1.5);
  });

  it('moves less per answer as the estimate settles', () => {
    const early = Math.abs(updateTheta(0, 0, true, 0) - 0);
    const late = Math.abs(updateTheta(0, 0, true, 40) - 0);
    expect(early).toBeGreaterThan(late);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- theta`
Expected: FAIL — `Failed to resolve import "./theta"`

- [ ] **Step 3: Implement the theta engine**

Create `src/engines/theta.ts`:

```ts
export const THETA_MIN = -3;
export const THETA_MAX = 3;
export const PASS_THRESHOLD_SCORE = 134;
export const PASS_THRESHOLD_THETA = 2.04;

const SCORE_CENTER = 100;
const SCORE_PER_THETA = 50 / 3;
const SCORE_MIN = 50;
const SCORE_MAX = 150;
const STEP_BASE = 1.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Probability of a correct response under a 1PL (Rasch) model. */
function pCorrect(theta: number, difficulty: number): number {
  return 1 / (1 + Math.exp(-(theta - difficulty)));
}

/** Step shrinks as evidence accumulates, so the estimate settles. */
export function stepSize(answered: number): number {
  return STEP_BASE / Math.sqrt(answered + 1);
}

export function updateTheta(
  theta: number,
  itemDifficulty: number,
  correct: boolean,
  answered: number,
): number {
  const expected = pCorrect(theta, itemDifficulty);
  const observed = correct ? 1 : 0;
  const next = theta + stepSize(answered) * (observed - expected);
  return clamp(next, THETA_MIN, THETA_MAX);
}

export function thetaToScore(theta: number): number {
  const raw = SCORE_CENTER + theta * SCORE_PER_THETA;
  return clamp(Math.round(raw), SCORE_MIN, SCORE_MAX);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- theta`
Expected: PASS — 17 tests

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add theta ability estimate and score mapping"
```

---

## Task 5: Drift-free timer

The spec calls for a thin progress line rather than running digits, and the real exam's section timing is unforgiving. `setInterval` tick-counting drifts; timestamp deltas do not.

**Files:**
- Create: `src/lib/timer.ts`
- Test: `src/lib/timer.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `createTimer(durationMs: number, now?: () => number): Timer` where `Timer = { remainingMs(): number; fraction(): number; isExpired(): boolean; isWarning(): boolean }`. `fraction()` returns remaining time as `0..1`. `isWarning()` is true below 20% remaining.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/timer.test.ts`:

```ts
import { createTimer, WARNING_FRACTION } from './timer';

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('createTimer', () => {
  it('starts with the full duration remaining', () => {
    const clock = fakeClock();
    const timer = createTimer(60000, clock.now);
    expect(timer.remainingMs()).toBe(60000);
  });

  it('starts at fraction 1', () => {
    const clock = fakeClock();
    expect(createTimer(60000, clock.now).fraction()).toBe(1);
  });

  it('decreases as the clock advances', () => {
    const clock = fakeClock();
    const timer = createTimer(60000, clock.now);
    clock.advance(15000);
    expect(timer.remainingMs()).toBe(45000);
    expect(timer.fraction()).toBeCloseTo(0.75);
  });

  it('does not drift across many reads', () => {
    const clock = fakeClock();
    const timer = createTimer(60000, clock.now);
    for (let i = 0; i < 500; i++) {
      clock.advance(100);
      timer.remainingMs();
    }
    expect(timer.remainingMs()).toBe(10000);
  });

  it('floors remaining time at zero', () => {
    const clock = fakeClock();
    const timer = createTimer(5000, clock.now);
    clock.advance(999999);
    expect(timer.remainingMs()).toBe(0);
    expect(timer.fraction()).toBe(0);
  });

  it('reports expiry only after the duration elapses', () => {
    const clock = fakeClock();
    const timer = createTimer(5000, clock.now);
    expect(timer.isExpired()).toBe(false);
    clock.advance(4999);
    expect(timer.isExpired()).toBe(false);
    clock.advance(1);
    expect(timer.isExpired()).toBe(true);
  });

  it('enters the warning state below the warning fraction', () => {
    const clock = fakeClock();
    const timer = createTimer(10000, clock.now);
    expect(timer.isWarning()).toBe(false);
    clock.advance(10000 * (1 - WARNING_FRACTION) + 1);
    expect(timer.isWarning()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- timer`
Expected: FAIL — `Failed to resolve import "./timer"`

- [ ] **Step 3: Implement the timer**

Create `src/lib/timer.ts`:

```ts
export const WARNING_FRACTION = 0.2;

export interface Timer {
  remainingMs(): number;
  fraction(): number;
  isExpired(): boolean;
  isWarning(): boolean;
}

/**
 * Timestamp-delta countdown. Reads are computed from a start timestamp
 * rather than accumulated ticks, so repeated polling cannot drift.
 */
export function createTimer(durationMs: number, now: () => number = Date.now): Timer {
  const startedAt = now();

  function remainingMs(): number {
    return Math.max(0, durationMs - (now() - startedAt));
  }

  function fraction(): number {
    return durationMs === 0 ? 0 : remainingMs() / durationMs;
  }

  return {
    remainingMs,
    fraction,
    isExpired: () => remainingMs() === 0,
    isWarning: () => fraction() < WARNING_FRACTION,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- timer`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add drift-free countdown timer"
```

---

## Task 6: IndexedDB persistence layer

**Files:**
- Create: `src/db/db.ts`
- Create: `src/db/repository.ts`
- Test: `src/db/repository.test.ts`

**Interfaces:**
- Consumes: types from Task 2
- Produces:
  - `db` — Dexie instance with tables `profile`, `cards`, `attempts`, `remediation`
  - `recordAttempt(attempt: Attempt): Promise<void>`
  - `getProfile(): Promise<Profile>` and `saveProfile(p: Profile): Promise<void>`, where `Profile = { id: 'me'; theta: number; answered: number; placementDone: boolean; thetaHistory: { at: number; theta: number }[] }`
  - `getAttempts(): Promise<Attempt[]>`
  - `saveCard(lexemeId: string, card: FsrsCard): Promise<void>` and `getCards(): Promise<StoredCard[]>` where `StoredCard = { lexemeId: string; card: FsrsCard }`
  - `getRemediation(): Promise<RemediationEntry[]>` and `saveRemediation(entries: RemediationEntry[]): Promise<void>`

- [ ] **Step 1: Install dependencies**

```bash
npm install dexie@4 ts-fsrs@5
npm install -D fake-indexeddb@6
```

- [ ] **Step 2: Write the failing tests**

Create `src/db/repository.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { createEmptyCard } from 'ts-fsrs';
import { db } from './db';
import {
  recordAttempt,
  getAttempts,
  getProfile,
  saveProfile,
  saveCard,
  getCards,
  saveRemediation,
  getRemediation,
} from './repository';
import type { Attempt, RemediationEntry } from '../content/types';

const attempt: Attempt = {
  questionId: 'sc-0001',
  chosenIndex: 1,
  correct: false,
  elapsedMs: 42000,
  at: 1_700_000_000_000,
  diagnosis: 'vocabulary-gap',
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('profile', () => {
  it('returns a default profile before anything is saved', async () => {
    const profile = await getProfile();
    expect(profile.theta).toBe(0);
    expect(profile.answered).toBe(0);
    expect(profile.placementDone).toBe(false);
  });

  it('round-trips a saved profile', async () => {
    await saveProfile({
      id: 'me',
      theta: 1.4,
      answered: 12,
      placementDone: true,
      thetaHistory: [{ at: 1, theta: 1.4 }],
    });
    const profile = await getProfile();
    expect(profile.theta).toBe(1.4);
    expect(profile.placementDone).toBe(true);
    expect(profile.thetaHistory).toHaveLength(1);
  });
});

describe('attempts', () => {
  it('persists an attempt immediately', async () => {
    await recordAttempt(attempt);
    const stored = await getAttempts();
    expect(stored).toHaveLength(1);
    expect(stored[0].questionId).toBe('sc-0001');
    expect(stored[0].diagnosis).toBe('vocabulary-gap');
  });

  it('survives a database reopen', async () => {
    await recordAttempt(attempt);
    db.close();
    await db.open();
    expect(await getAttempts()).toHaveLength(1);
  });

  it('accumulates attempts in order', async () => {
    await recordAttempt(attempt);
    await recordAttempt({ ...attempt, questionId: 'sc-0002', at: attempt.at + 1000 });
    const stored = await getAttempts();
    expect(stored.map((a) => a.questionId)).toEqual(['sc-0001', 'sc-0002']);
  });
});

describe('cards', () => {
  it('round-trips an FSRS card', async () => {
    const card = createEmptyCard(new Date('2026-08-09T09:00:00Z'));
    await saveCard('awl-analyze', card);
    const stored = await getCards();
    expect(stored).toHaveLength(1);
    expect(stored[0].lexemeId).toBe('awl-analyze');
    expect(stored[0].card.reps).toBe(0);
  });

  it('overwrites a card for the same lexeme rather than duplicating', async () => {
    const card = createEmptyCard(new Date('2026-08-09T09:00:00Z'));
    await saveCard('awl-analyze', card);
    await saveCard('awl-analyze', { ...card, reps: 5 });
    const stored = await getCards();
    expect(stored).toHaveLength(1);
    expect(stored[0].card.reps).toBe(5);
  });
});

describe('remediation', () => {
  it('replaces the queue wholesale', async () => {
    const entries: RemediationEntry[] = [
      { cause: 'vocabulary-gap', targetId: 'awl-analyze', createdAt: 1, servings: 0 },
    ];
    await saveRemediation(entries);
    expect(await getRemediation()).toHaveLength(1);

    await saveRemediation([]);
    expect(await getRemediation()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- repository`
Expected: FAIL — `Failed to resolve import "./db"`

- [ ] **Step 4: Implement the Dexie instance**

Create `src/db/db.ts`:

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { Card as FsrsCard } from 'ts-fsrs';
import type { Attempt, RemediationEntry } from '../content/types';

export interface Profile {
  id: 'me';
  theta: number;
  answered: number;
  placementDone: boolean;
  thetaHistory: { at: number; theta: number }[];
}

export interface StoredCard {
  lexemeId: string;
  card: FsrsCard;
}

export interface StoredAttempt extends Attempt {
  seq?: number;
}

export const db = new Dexie('amirnet') as Dexie & {
  profile: EntityTable<Profile, 'id'>;
  cards: EntityTable<StoredCard, 'lexemeId'>;
  attempts: EntityTable<StoredAttempt, 'seq'>;
  remediation: EntityTable<RemediationEntry & { key: string }, 'key'>;
};

db.version(1).stores({
  profile: 'id',
  cards: 'lexemeId',
  attempts: '++seq, at, questionId',
  remediation: 'key, cause, targetId',
});
```

- [ ] **Step 5: Implement the repository**

Create `src/db/repository.ts`:

```ts
import type { Card as FsrsCard } from 'ts-fsrs';
import { db, type Profile, type StoredCard } from './db';
import type { Attempt, RemediationEntry } from '../content/types';

const DEFAULT_PROFILE: Profile = {
  id: 'me',
  theta: 0,
  answered: 0,
  placementDone: false,
  thetaHistory: [],
};

export async function getProfile(): Promise<Profile> {
  return (await db.profile.get('me')) ?? DEFAULT_PROFILE;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put(profile);
}

/** Called once per answered question. Never batched. */
export async function recordAttempt(attempt: Attempt): Promise<void> {
  await db.attempts.add(attempt);
}

export async function getAttempts(): Promise<Attempt[]> {
  return db.attempts.orderBy('seq').toArray();
}

export async function saveCard(lexemeId: string, card: FsrsCard): Promise<void> {
  await db.cards.put({ lexemeId, card });
}

export async function getCards(): Promise<StoredCard[]> {
  return db.cards.toArray();
}

export async function saveRemediation(entries: RemediationEntry[]): Promise<void> {
  await db.transaction('rw', db.remediation, async () => {
    await db.remediation.clear();
    await db.remediation.bulkAdd(
      entries.map((e) => ({ ...e, key: `${e.cause}:${e.targetId}` })),
    );
  });
}

export async function getRemediation(): Promise<RemediationEntry[]> {
  const rows = await db.remediation.toArray();
  return rows.map(({ key: _key, ...entry }) => entry);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- repository`
Expected: PASS — 9 tests

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add IndexedDB persistence with per-answer writes"
```

---

## Task 7: SRS engine

**Files:**
- Create: `src/engines/srs.ts`
- Test: `src/engines/srs.test.ts`

**Interfaces:**
- Consumes: `ts-fsrs`, `StoredCard` from Task 6
- Produces:
  - `isMastered(card: FsrsCard): boolean` — `state === State.Review && scheduled_days > MASTERY_INTERVAL_DAYS`
  - `reviewCard(card: FsrsCard, correct: boolean, now: Date): FsrsCard`
  - `dueLexemeIds(cards: StoredCard[], now: Date): string[]`
  - `seedCard(correct: boolean, now: Date): FsrsCard`
  - Constant `MASTERY_INTERVAL_DAYS = 21`

- [ ] **Step 1: Write the failing tests**

Create `src/engines/srs.test.ts`:

```ts
import { createEmptyCard, State } from 'ts-fsrs';
import {
  isMastered,
  reviewCard,
  dueLexemeIds,
  seedCard,
  MASTERY_INTERVAL_DAYS,
} from './srs';

const NOW = new Date('2026-08-09T09:00:00Z');

describe('isMastered', () => {
  it('is false for a new card', () => {
    expect(isMastered(createEmptyCard(NOW))).toBe(false);
  });

  it('is false for a review card below the mastery interval', () => {
    const card = { ...createEmptyCard(NOW), state: State.Review, scheduled_days: 10 };
    expect(isMastered(card)).toBe(false);
  });

  it('is false exactly at the mastery interval', () => {
    const card = {
      ...createEmptyCard(NOW),
      state: State.Review,
      scheduled_days: MASTERY_INTERVAL_DAYS,
    };
    expect(isMastered(card)).toBe(false);
  });

  it('is true above the mastery interval in the review state', () => {
    const card = {
      ...createEmptyCard(NOW),
      state: State.Review,
      scheduled_days: MASTERY_INTERVAL_DAYS + 1,
    };
    expect(isMastered(card)).toBe(true);
  });

  it('is false for a long interval that is not in the review state', () => {
    const card = {
      ...createEmptyCard(NOW),
      state: State.Relearning,
      scheduled_days: 60,
    };
    expect(isMastered(card)).toBe(false);
  });
});

describe('reviewCard', () => {
  it('increments the repetition count', () => {
    expect(reviewCard(createEmptyCard(NOW), true, NOW).reps).toBe(1);
  });

  it('schedules a correct answer further out than a wrong one', () => {
    const correct = reviewCard(createEmptyCard(NOW), true, NOW);
    const wrong = reviewCard(createEmptyCard(NOW), false, NOW);
    expect(correct.due.getTime()).toBeGreaterThan(wrong.due.getTime());
  });

  it('records a lapse when a review card is answered wrong', () => {
    let card = createEmptyCard(NOW);
    for (let i = 0; i < 6; i++) {
      card = reviewCard(card, true, new Date(card.due));
    }
    const lapsed = reviewCard(card, false, new Date(card.due));
    expect(lapsed.lapses).toBeGreaterThan(0);
  });
});

describe('dueLexemeIds', () => {
  it('returns cards due at or before now', () => {
    const cards = [
      { lexemeId: 'a', card: { ...createEmptyCard(NOW), due: new Date('2026-08-08T09:00:00Z') } },
      { lexemeId: 'b', card: { ...createEmptyCard(NOW), due: new Date('2026-08-10T09:00:00Z') } },
    ];
    expect(dueLexemeIds(cards, NOW)).toEqual(['a']);
  });

  it('orders the most overdue first', () => {
    const cards = [
      { lexemeId: 'recent', card: { ...createEmptyCard(NOW), due: new Date('2026-08-08T09:00:00Z') } },
      { lexemeId: 'stale', card: { ...createEmptyCard(NOW), due: new Date('2026-08-01T09:00:00Z') } },
    ];
    expect(dueLexemeIds(cards, NOW)).toEqual(['stale', 'recent']);
  });

  it('returns an empty list when nothing is due', () => {
    const cards = [
      { lexemeId: 'a', card: { ...createEmptyCard(NOW), due: new Date('2026-09-01T09:00:00Z') } },
    ];
    expect(dueLexemeIds(cards, NOW)).toEqual([]);
  });
});

describe('seedCard', () => {
  it('seeds a wrong-answer lexeme as due immediately', () => {
    expect(seedCard(false, NOW).due.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it('seeds a correct-answer lexeme with a future review', () => {
    expect(seedCard(true, NOW).due.getTime()).toBeGreaterThan(NOW.getTime());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- srs`
Expected: FAIL — `Failed to resolve import "./srs"`

- [ ] **Step 3: Implement the SRS engine**

Create `src/engines/srs.ts`:

```ts
import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Card as FsrsCard,
} from 'ts-fsrs';
import type { StoredCard } from '../db/db';

export const MASTERY_INTERVAL_DAYS = 21;

// Fuzz off: deterministic scheduling keeps tests meaningful and, with a
// single user, adds nothing.
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

export function isMastered(card: FsrsCard): boolean {
  return card.state === State.Review && card.scheduled_days > MASTERY_INTERVAL_DAYS;
}

export function reviewCard(card: FsrsCard, correct: boolean, now: Date): FsrsCard {
  const rating = correct ? Rating.Good : Rating.Again;
  return scheduler.next(card, now, rating).card;
}

export function dueLexemeIds(cards: StoredCard[], now: Date): string[] {
  return cards
    .filter((c) => c.card.due.getTime() <= now.getTime())
    .sort((a, b) => a.card.due.getTime() - b.card.due.getTime())
    .map((c) => c.lexemeId);
}

/**
 * Initial card for a lexeme first encountered during placement.
 * Wrong answers come back immediately; correct ones enter normal scheduling.
 */
export function seedCard(correct: boolean, now: Date): FsrsCard {
  const empty = createEmptyCard(now);
  if (!correct) return { ...empty, due: now };
  return reviewCard(empty, true, now);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- srs`
Expected: PASS — 13 tests

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add FSRS spaced repetition engine with mastery threshold"
```

---

## Task 8: Diagnosis engine and remediation queue

The differentiator of the whole design. Priority order is load-bearing: vocabulary gap must be checked first, because when the word is unknown every other classification is a symptom.

**Files:**
- Create: `src/engines/diagnosis.ts`
- Create: `src/engines/remediation.ts`
- Test: `src/engines/diagnosis.test.ts`
- Test: `src/engines/remediation.test.ts`

**Interfaces:**
- Consumes: `Lexeme`, `QuestionItem`, `DiagnosisCause`, `RemediationEntry` from Task 2
- Produces:
  - `diagnose(input: DiagnosisInput): DiagnosisCause | null` — `null` when the answer was correct
  - `DiagnosisInput = { question: QuestionItem; chosenIndex: number; elapsedMs: number; isMastered: (lexemeId: string) => boolean; lexemeById: (id: string) => Lexeme | undefined; timeThresholdMs: number }`
  - `timeThresholdFor(type: QuestionType, personalP90: number | null): number`
  - `MIN_ATTEMPTS_FOR_PERSONAL_P90 = 20`
  - `addRemediation(queue, cause, targetId, now): RemediationEntry[]`
  - `recordServing(queue, targetId, wasCorrect, now): RemediationEntry[]`
  - `EVICT_AFTER_CORRECT_SERVINGS = 2`, `EVICT_AFTER_MS = 14 * 24 * 60 * 60 * 1000`

- [ ] **Step 1: Write the failing diagnosis tests**

Create `src/engines/diagnosis.test.ts`:

```ts
import { diagnose, timeThresholdFor, MIN_ATTEMPTS_FOR_PERSONAL_P90 } from './diagnosis';
import type { Lexeme, QuestionItem } from '../content/types';

const lexAnalyze: Lexeme = {
  id: 'awl-analyze',
  headword: 'analyze',
  family: ['analyze'],
  definitionHe: 'לנתח',
  definitionEn: 'examine in detail',
  pos: 'verb',
  morphology: { root: 'lys', suffixes: [] },
  confusableWith: ['analogy'],
  exampleSentence: 'They analyze data.',
  difficulty: 2,
  tags: [],
};

const question: QuestionItem = {
  id: 'sc-0001',
  type: 'sentence-completion',
  difficulty: 0.5,
  stem: 'They will ___ the data.',
  options: ['analyze', 'analogy', 'apologize', 'anarchy'],
  correctIndex: 0,
  explanationPerOption: ['a', 'b', 'c', 'd'],
  targetLexemes: ['awl-analyze'],
  trapType: 'phonetic-neighbor',
};

const deps = {
  lexemeById: (id: string) => (id === 'awl-analyze' ? lexAnalyze : undefined),
  timeThresholdMs: 90_000,
};

describe('diagnose', () => {
  it('returns null for a correct answer', () => {
    const result = diagnose({
      question,
      chosenIndex: 0,
      elapsedMs: 20_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBeNull();
  });

  it('classifies an unmastered target lexeme as a vocabulary gap', () => {
    const result = diagnose({
      question,
      chosenIndex: 2,
      elapsedMs: 20_000,
      isMastered: () => false,
      ...deps,
    });
    expect(result).toBe('vocabulary-gap');
  });

  it('treats an unseen lexeme as a vocabulary gap', () => {
    const result = diagnose({
      question: { ...question, targetLexemes: ['awl-unseen'] },
      chosenIndex: 2,
      elapsedMs: 20_000,
      isMastered: () => false,
      ...deps,
    });
    expect(result).toBe('vocabulary-gap');
  });

  it('prioritizes vocabulary gap over the phonetic trap', () => {
    const result = diagnose({
      question,
      chosenIndex: 1, // 'analogy' — a confusable
      elapsedMs: 20_000,
      isMastered: () => false,
      ...deps,
    });
    expect(result).toBe('vocabulary-gap');
  });

  it('classifies a confusable distractor when vocabulary is mastered', () => {
    const result = diagnose({
      question,
      chosenIndex: 1,
      elapsedMs: 20_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('distractor-phonetic');
  });

  it('classifies a logic-inversion trap as a connector misread', () => {
    const result = diagnose({
      question: { ...question, trapType: 'logic-inversion' },
      chosenIndex: 2,
      elapsedMs: 20_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('connector-misread');
  });

  it('classifies a slow wrong answer as time pressure', () => {
    const result = diagnose({
      question: { ...question, trapType: 'scope-shift' },
      chosenIndex: 2,
      elapsedMs: 120_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('time-pressure');
  });

  it('falls back to inference error', () => {
    const result = diagnose({
      question: { ...question, trapType: 'scope-shift' },
      chosenIndex: 2,
      elapsedMs: 20_000,
      isMastered: () => true,
      ...deps,
    });
    expect(result).toBe('inference-error');
  });
});

describe('timeThresholdFor', () => {
  it('uses the cold-start fallback when personal data is insufficient', () => {
    // sentence-completion is allotted 60s in the real exam; fallback is 1.5x
    expect(timeThresholdFor('sentence-completion', null)).toBe(90_000);
  });

  it('uses the personal percentile once it is available', () => {
    expect(timeThresholdFor('sentence-completion', 47_000)).toBe(47_000);
  });

  it('exposes the minimum attempts needed for a personal percentile', () => {
    expect(MIN_ATTEMPTS_FOR_PERSONAL_P90).toBe(20);
  });

  it('gives restatements a longer fallback than sentence completion', () => {
    expect(timeThresholdFor('restatement', null)).toBeGreaterThan(
      timeThresholdFor('sentence-completion', null),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- diagnosis`
Expected: FAIL — `Failed to resolve import "./diagnosis"`

- [ ] **Step 3: Implement the diagnosis engine**

Create `src/engines/diagnosis.ts`:

```ts
import type {
  DiagnosisCause,
  Lexeme,
  QuestionItem,
  QuestionType,
} from '../content/types';

export const MIN_ATTEMPTS_FOR_PERSONAL_P90 = 20;

/** Seconds allotted per question in the real exam, by type. */
const EXAM_SECONDS: Record<QuestionType, number> = {
  'sentence-completion': 60,
  'grammar-in-context': 60,
  restatement: 120,
  reading: 180,
};

const COLD_START_MULTIPLIER = 1.5;

export function timeThresholdFor(
  type: QuestionType,
  personalP90: number | null,
): number {
  if (personalP90 !== null) return personalP90;
  return EXAM_SECONDS[type] * COLD_START_MULTIPLIER * 1000;
}

export interface DiagnosisInput {
  question: QuestionItem;
  chosenIndex: number;
  elapsedMs: number;
  isMastered: (lexemeId: string) => boolean;
  lexemeById: (id: string) => Lexeme | undefined;
  timeThresholdMs: number;
}

/**
 * Classifies the root cause of a wrong answer. Order matters: an unknown
 * target word makes every other signal a symptom rather than a cause.
 */
export function diagnose(input: DiagnosisInput): DiagnosisCause | null {
  const { question, chosenIndex, elapsedMs, isMastered, lexemeById, timeThresholdMs } = input;

  if (chosenIndex === question.correctIndex) return null;

  // 1. Vocabulary gap — an unseen lexeme has no card and is not mastered.
  const hasGap = question.targetLexemes.some((id) => !isMastered(id));
  if (hasGap) return 'vocabulary-gap';

  // 2. Chose a word the target is known to be confused with.
  const chosenText = question.options[chosenIndex];
  const isConfusable = question.targetLexemes.some((id) =>
    lexemeById(id)?.confusableWith.includes(chosenText),
  );
  if (isConfusable) return 'distractor-phonetic';

  // 3. The item's trap was a reversed logical relation.
  if (question.trapType === 'logic-inversion') return 'connector-misread';

  // 4. Wrong and slow.
  if (elapsedMs > timeThresholdMs) return 'time-pressure';

  return 'inference-error';
}
```

- [ ] **Step 4: Write the failing remediation tests**

Create `src/engines/remediation.test.ts`:

```ts
import {
  addRemediation,
  recordServing,
  EVICT_AFTER_CORRECT_SERVINGS,
  EVICT_AFTER_MS,
} from './remediation';
import type { RemediationEntry } from '../content/types';

const T0 = 1_700_000_000_000;

describe('addRemediation', () => {
  it('adds a new entry', () => {
    const queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual({
      cause: 'vocabulary-gap',
      targetId: 'awl-analyze',
      createdAt: T0,
      servings: 0,
    });
  });

  it('does not duplicate an existing target for the same cause', () => {
    let queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    queue = addRemediation(queue, 'vocabulary-gap', 'awl-analyze', T0 + 5000);
    expect(queue).toHaveLength(1);
  });

  it('keeps the same target under a different cause as a separate entry', () => {
    let queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    queue = addRemediation(queue, 'distractor-phonetic', 'awl-analyze', T0);
    expect(queue).toHaveLength(2);
  });

  it('does not mutate the input queue', () => {
    const original: RemediationEntry[] = [];
    addRemediation(original, 'vocabulary-gap', 'awl-analyze', T0);
    expect(original).toHaveLength(0);
  });
});

describe('recordServing', () => {
  it('increments servings on a correct answer', () => {
    const queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    const next = recordServing(queue, 'awl-analyze', true, T0 + 1000);
    expect(next[0].servings).toBe(1);
  });

  it('resets servings on a wrong answer', () => {
    let queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    queue = recordServing(queue, 'awl-analyze', true, T0 + 1000);
    queue = recordServing(queue, 'awl-analyze', false, T0 + 2000);
    expect(queue[0].servings).toBe(0);
  });

  it('evicts after the required correct servings', () => {
    let queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    for (let i = 0; i < EVICT_AFTER_CORRECT_SERVINGS; i++) {
      queue = recordServing(queue, 'awl-analyze', true, T0 + i * 1000);
    }
    expect(queue).toHaveLength(0);
  });

  it('evicts stale entries past the age limit', () => {
    const queue = addRemediation([], 'vocabulary-gap', 'awl-analyze', T0);
    const next = recordServing(queue, 'other-target', true, T0 + EVICT_AFTER_MS + 1);
    expect(next).toHaveLength(0);
  });

  it('leaves untouched targets alone', () => {
    let queue = addRemediation([], 'vocabulary-gap', 'a', T0);
    queue = addRemediation(queue, 'vocabulary-gap', 'b', T0);
    queue = recordServing(queue, 'a', true, T0 + 1000);
    expect(queue.find((e) => e.targetId === 'b')?.servings).toBe(0);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -- remediation`
Expected: FAIL — `Failed to resolve import "./remediation"`

- [ ] **Step 6: Implement the remediation queue**

Create `src/engines/remediation.ts`:

```ts
import type { DiagnosisCause, RemediationEntry } from '../content/types';

export const EVICT_AFTER_CORRECT_SERVINGS = 2;
export const EVICT_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function addRemediation(
  queue: RemediationEntry[],
  cause: DiagnosisCause,
  targetId: string,
  now: number,
): RemediationEntry[] {
  const exists = queue.some((e) => e.cause === cause && e.targetId === targetId);
  if (exists) return queue.map((e) => ({ ...e }));
  return [...queue.map((e) => ({ ...e })), { cause, targetId, createdAt: now, servings: 0 }];
}

/**
 * Applies the outcome of serving a remediation target, then evicts entries
 * that are satisfied or stale. Without eviction the queue grows without
 * bound and crowds out new material.
 */
export function recordServing(
  queue: RemediationEntry[],
  targetId: string,
  wasCorrect: boolean,
  now: number,
): RemediationEntry[] {
  return queue
    .map((entry) => {
      if (entry.targetId !== targetId) return { ...entry };
      return { ...entry, servings: wasCorrect ? entry.servings + 1 : 0 };
    })
    .filter((entry) => {
      if (entry.servings >= EVICT_AFTER_CORRECT_SERVINGS) return false;
      if (now - entry.createdAt > EVICT_AFTER_MS) return false;
      return true;
    });
}
```

- [ ] **Step 7: Run all engine tests to verify they pass**

Run: `npm test -- diagnosis remediation`
Expected: PASS — 12 diagnosis tests, 10 remediation tests

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add five-cause diagnosis engine and remediation queue"
```

---

## Task 9: Session builder

**Files:**
- Create: `src/engines/session-builder.ts`
- Test: `src/engines/session-builder.test.ts`

**Interfaces:**
- Consumes: `QuestionItem`, `Passage`, `RemediationEntry` from Task 2
- Produces:
  - `buildSession(request: SessionRequest): SessionPlan`
  - `SessionItem = { kind: 'srs'; lexemeId: string } | { kind: 'question'; questionId: string } | { kind: 'passage'; passageId: string }`
  - `SessionPlan = { items: SessionItem[]; estimatedSeconds: number }`
  - `SessionRequest = { budgetSeconds: number; theta: number; dueLexemeIds: string[]; remediation: RemediationEntry[]; questions: QuestionItem[]; passages: Passage[]; answeredQuestionIds: Set<string> }`
  - `COST_SECONDS` and `NEW_MATERIAL_THETA_OFFSET = 0.5`

- [ ] **Step 1: Write the failing tests**

Create `src/engines/session-builder.test.ts`:

```ts
import { buildSession, COST_SECONDS, NEW_MATERIAL_THETA_OFFSET } from './session-builder';
import type { QuestionItem, Passage, RemediationEntry } from '../content/types';

function q(id: string, difficulty: number, over: Partial<QuestionItem> = {}): QuestionItem {
  return {
    id,
    type: 'sentence-completion',
    difficulty,
    stem: 'stem',
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    explanationPerOption: ['1', '2', '3', '4'],
    targetLexemes: [],
    trapType: 'phonetic-neighbor',
    ...over,
  };
}

const passage: Passage = {
  id: 'psg-001',
  title: 't',
  body: 'b',
  domain: 'science',
  difficulty: 0.5,
  wordCount: 1,
  questionIds: ['rc-1', 'rc-2', 'rc-3', 'rc-4', 'rc-5'],
};

const base = {
  theta: 1.0,
  dueLexemeIds: [] as string[],
  remediation: [] as RemediationEntry[],
  questions: [] as QuestionItem[],
  passages: [] as Passage[],
  answeredQuestionIds: new Set<string>(),
};

describe('buildSession', () => {
  it('returns an empty plan for a zero budget', () => {
    expect(buildSession({ ...base, budgetSeconds: 0 })).toEqual({
      items: [],
      estimatedSeconds: 0,
    });
  });

  it('places due SRS cards first', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 600,
      dueLexemeIds: ['awl-analyze'],
      questions: [q('sc-1', 1.5)],
    });
    expect(plan.items[0]).toEqual({ kind: 'srs', lexemeId: 'awl-analyze' });
  });

  it('never exceeds the time budget', () => {
    const questions = Array.from({ length: 50 }, (_, i) => q(`sc-${i}`, 1.5));
    const plan = buildSession({ ...base, budgetSeconds: 300, questions });
    expect(plan.estimatedSeconds).toBeLessThanOrEqual(300);
  });

  it('reports an estimate matching the item costs', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 200,
      dueLexemeIds: ['a', 'b'],
      questions: [q('sc-1', 1.5)],
    });
    const expected = 2 * COST_SECONDS.srs + COST_SECONDS['sentence-completion'];
    expect(plan.estimatedSeconds).toBe(expected);
  });

  it('selects new questions above current theta', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 120,
      theta: 1.0,
      questions: [q('easy', -1.0), q('target', 1.5)],
    });
    const ids = plan.items.map((i) => (i.kind === 'question' ? i.questionId : null));
    expect(ids).toContain('target');
    expect(ids).not.toContain('easy');
  });

  it('aims new material at theta plus the offset', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 60,
      theta: 1.0,
      questions: [q('far', 3.0), q('near', 1.0 + NEW_MATERIAL_THETA_OFFSET)],
    });
    expect(plan.items[0]).toEqual({ kind: 'question', questionId: 'near' });
  });

  it('excludes already-answered questions', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 120,
      questions: [q('seen', 1.5), q('fresh', 1.5)],
      answeredQuestionIds: new Set(['seen']),
    });
    const ids = plan.items.map((i) => (i.kind === 'question' ? i.questionId : null));
    expect(ids).not.toContain('seen');
    expect(ids).toContain('fresh');
  });

  it('serves remediation targets before new material', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: 120,
      theta: 1.0,
      remediation: [
        { cause: 'vocabulary-gap', targetId: 'awl-x', createdAt: 1, servings: 0 },
      ],
      questions: [
        q('remedial', 0.2, { targetLexemes: ['awl-x'] }),
        q('new', 1.5),
      ],
    });
    expect(plan.items[0]).toEqual({ kind: 'question', questionId: 'remedial' });
  });

  it('omits a passage that does not fit the remaining budget', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: COST_SECONDS.passage - 1,
      passages: [passage],
    });
    expect(plan.items.some((i) => i.kind === 'passage')).toBe(false);
  });

  it('includes a passage when the budget allows', () => {
    const plan = buildSession({
      ...base,
      budgetSeconds: COST_SECONDS.passage,
      passages: [passage],
    });
    expect(plan.items).toContainEqual({ kind: 'passage', passageId: 'psg-001' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- session-builder`
Expected: FAIL — `Failed to resolve import "./session-builder"`

- [ ] **Step 3: Implement the session builder**

Create `src/engines/session-builder.ts`:

```ts
import type { QuestionItem, Passage, RemediationEntry, QuestionType } from '../content/types';

export const NEW_MATERIAL_THETA_OFFSET = 0.5;

export const COST_SECONDS: Record<QuestionType | 'srs' | 'passage', number> = {
  srs: 8,
  'sentence-completion': 60,
  'grammar-in-context': 60,
  restatement: 120,
  reading: 180,
  passage: 900,
};

export type SessionItem =
  | { kind: 'srs'; lexemeId: string }
  | { kind: 'question'; questionId: string }
  | { kind: 'passage'; passageId: string };

export interface SessionPlan {
  items: SessionItem[];
  estimatedSeconds: number;
}

export interface SessionRequest {
  budgetSeconds: number;
  theta: number;
  dueLexemeIds: string[];
  remediation: RemediationEntry[];
  questions: QuestionItem[];
  passages: Passage[];
  answeredQuestionIds: Set<string>;
}

export function buildSession(request: SessionRequest): SessionPlan {
  const items: SessionItem[] = [];
  let spent = 0;

  const fits = (cost: number) => spent + cost <= request.budgetSeconds;
  const take = (item: SessionItem, cost: number) => {
    items.push(item);
    spent += cost;
  };

  // 1. Due SRS cards — cheapest, highest value.
  for (const lexemeId of request.dueLexemeIds) {
    if (!fits(COST_SECONDS.srs)) break;
    take({ kind: 'srs', lexemeId }, COST_SECONDS.srs);
  }

  const used = new Set(request.answeredQuestionIds);
  const available = request.questions.filter(
    (q) => !used.has(q.id) && q.type !== 'reading',
  );

  // 2. Remediation — questions touching a queued target.
  const targets = new Set(request.remediation.map((e) => e.targetId));
  const remedial = available.filter((q) =>
    q.targetLexemes.some((id) => targets.has(id)),
  );
  for (const q of remedial) {
    if (!fits(COST_SECONDS[q.type])) break;
    take({ kind: 'question', questionId: q.id }, COST_SECONDS[q.type]);
    used.add(q.id);
  }

  // 3. New material deliberately above the comfort level.
  const aim = request.theta + NEW_MATERIAL_THETA_OFFSET;
  const fresh = available
    .filter((q) => !used.has(q.id) && q.difficulty > request.theta)
    .sort((a, b) => Math.abs(a.difficulty - aim) - Math.abs(b.difficulty - aim));

  for (const q of fresh) {
    if (!fits(COST_SECONDS[q.type])) break;
    take({ kind: 'question', questionId: q.id }, COST_SECONDS[q.type]);
    used.add(q.id);
  }

  // 4. A reading passage is atomic — all or nothing.
  for (const p of request.passages) {
    if (!fits(COST_SECONDS.passage)) break;
    take({ kind: 'passage', passageId: p.id }, COST_SECONDS.passage);
  }

  return { items, estimatedSeconds: spent };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- session-builder`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add elastic session builder with time budget and difficulty push"
```

---

## Task 10: Question renderer components

**Files:**
- Create: `src/components/ui/TimerBar.tsx`
- Create: `src/components/question/ChoiceList.tsx`
- Create: `src/components/question/QuestionCard.tsx`
- Create: `src/components/question/question.css`
- Test: `src/components/question/QuestionCard.test.tsx`
- Test: `src/components/ui/TimerBar.test.tsx`

**Interfaces:**
- Consumes: `EnglishText` (Task 1), `Timer` (Task 5), `QuestionItem` (Task 2)
- Produces:
  - `QuestionCard` — `({ question, onAnswer, revealed, chosenIndex }: { question: QuestionItem; onAnswer: (index: number) => void; revealed: boolean; chosenIndex: number | null })`
  - `TimerBar` — `({ fraction, warning }: { fraction: number; warning: boolean })`

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/TimerBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { TimerBar } from './TimerBar';

describe('TimerBar', () => {
  it('exposes remaining time to assistive technology', () => {
    render(<TimerBar fraction={0.5} warning={false} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
  });

  it('scales the fill to the remaining fraction', () => {
    render(<TimerBar fraction={0.25} warning={false} />);
    const fill = screen.getByTestId('timer-fill');
    expect(fill).toHaveStyle({ transform: 'scaleX(0.25)' });
  });

  it('adds the warning modifier below the threshold', () => {
    render(<TimerBar fraction={0.1} warning />);
    expect(screen.getByTestId('timer-fill')).toHaveClass('timer-fill--warning');
  });

  it('renders no digits', () => {
    const { container } = render(<TimerBar fraction={0.42} warning={false} />);
    expect(container.textContent).toBe('');
  });
});
```

Create `src/components/question/QuestionCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionCard } from './QuestionCard';
import type { QuestionItem } from '../../content/types';

const question: QuestionItem = {
  id: 'sc-0001',
  type: 'sentence-completion',
  difficulty: 0.5,
  stem: 'They will ___ the data.',
  options: ['analyze', 'analogy', 'apologize', 'anarchy'],
  correctIndex: 0,
  explanationPerOption: ['right', 'sounds alike', 'unrelated', 'unrelated'],
  targetLexemes: [],
  trapType: 'phonetic-neighbor',
};

describe('QuestionCard', () => {
  it('renders the stem as left-to-right English', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed={false} chosenIndex={null} />);
    expect(screen.getByText('They will ___ the data.')).toHaveAttribute('dir', 'ltr');
  });

  it('renders all four options', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed={false} chosenIndex={null} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('reports the chosen index', async () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={question} onAnswer={onAnswer} revealed={false} chosenIndex={null} />);
    await userEvent.click(screen.getByRole('button', { name: /analogy/ }));
    expect(onAnswer).toHaveBeenCalledWith(1);
  });

  it('hides explanations before reveal', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed={false} chosenIndex={null} />);
    expect(screen.queryByText('sounds alike')).not.toBeInTheDocument();
  });

  it('shows every explanation after reveal, not only the chosen one', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    expect(screen.getByText('right')).toBeInTheDocument();
    expect(screen.getByText('sounds alike')).toBeInTheDocument();
    expect(screen.getByText('unrelated')).toBeDefined();
  });

  it('marks the correct option after reveal', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    expect(screen.getByRole('button', { name: /analyze/ })).toHaveClass('choice--correct');
  });

  it('marks the wrong chosen option after reveal', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    expect(screen.getByRole('button', { name: /analogy/ })).toHaveClass('choice--wrong');
  });

  it('disables the options after reveal', () => {
    render(<QuestionCard question={question} onAnswer={() => {}} revealed chosenIndex={1} />);
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  });
});
```

- [ ] **Step 2: Install the interaction test helper and run the tests**

```bash
npm install -D @testing-library/user-event
npm test -- QuestionCard TimerBar
```

Expected: FAIL — modules not found

- [ ] **Step 3: Implement TimerBar**

Create `src/components/ui/TimerBar.tsx`:

```tsx
interface TimerBarProps {
  fraction: number;
  warning: boolean;
}

/**
 * A thin line, never digits. Counting digits pull the eye every second
 * and spend attention the question needs.
 */
export function TimerBar({ fraction, warning }: TimerBarProps) {
  return (
    <div
      className="timer-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      aria-label="זמן שנותר"
    >
      <div
        data-testid="timer-fill"
        className={`timer-fill${warning ? ' timer-fill--warning' : ''}`}
        style={{ transform: `scaleX(${fraction})` }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Implement ChoiceList and QuestionCard**

Create `src/components/question/ChoiceList.tsx`:

```tsx
import { EnglishText } from '../ui/EnglishText';

interface ChoiceListProps {
  options: readonly string[];
  explanations: readonly string[];
  correctIndex: number;
  chosenIndex: number | null;
  revealed: boolean;
  onChoose: (index: number) => void;
}

function modifier(index: number, correctIndex: number, chosenIndex: number | null): string {
  if (index === correctIndex) return ' choice--correct';
  if (index === chosenIndex) return ' choice--wrong';
  return '';
}

export function ChoiceList({
  options,
  explanations,
  correctIndex,
  chosenIndex,
  revealed,
  onChoose,
}: ChoiceListProps) {
  return (
    <ol className="choice-list">
      {options.map((option, index) => (
        <li key={option}>
          <button
            type="button"
            className={`choice${revealed ? modifier(index, correctIndex, chosenIndex) : ''}`}
            disabled={revealed}
            onClick={() => onChoose(index)}
          >
            <EnglishText>{option}</EnglishText>
          </button>
          {revealed && <p className="choice-explanation">{explanations[index]}</p>}
        </li>
      ))}
    </ol>
  );
}
```

Create `src/components/question/QuestionCard.tsx`:

```tsx
import { EnglishText } from '../ui/EnglishText';
import { ChoiceList } from './ChoiceList';
import type { QuestionItem } from '../../content/types';
import './question.css';

interface QuestionCardProps {
  question: QuestionItem;
  onAnswer: (index: number) => void;
  revealed: boolean;
  chosenIndex: number | null;
}

export function QuestionCard({ question, onAnswer, revealed, chosenIndex }: QuestionCardProps) {
  return (
    <article className="question-card reading-measure">
      <EnglishText as="p">{question.stem}</EnglishText>
      <ChoiceList
        options={question.options}
        explanations={question.explanationPerOption}
        correctIndex={question.correctIndex}
        chosenIndex={chosenIndex}
        revealed={revealed}
        onChoose={onAnswer}
      />
    </article>
  );
}
```

- [ ] **Step 5: Write the stylesheet**

Create `src/components/question/question.css`:

```css
.question-card {
  padding: var(--space-4);
}

.question-card > p {
  font-size: var(--text-lg);
  margin-bottom: var(--space-4);
}

.choice-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}

.choice {
  inline-size: 100%;
  text-align: start;
  padding: var(--space-3);
  font-size: var(--text-base);
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out);
}

.choice:hover:not(:disabled) {
  border-color: var(--color-text);
}

.choice--correct {
  border-color: var(--color-correct);
  border-inline-start-width: 3px;
}

.choice--wrong {
  border-color: var(--color-wrong);
  border-inline-start-width: 3px;
}

.choice-explanation {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.timer-track {
  block-size: 2px;
  inline-size: 100%;
  background: var(--color-border);
  overflow: hidden;
}

.timer-fill {
  block-size: 100%;
  inline-size: 100%;
  background: var(--color-text-muted);
  transform-origin: right center;
  transition: transform 200ms linear;
}

.timer-fill--warning {
  background: var(--color-due);
}
```

Import it once in `src/components/ui/TimerBar.tsx`:

```tsx
import '../question/question.css';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- QuestionCard TimerBar`
Expected: PASS — 8 QuestionCard tests, 4 TimerBar tests

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add question card, choice list, and digitless timer bar"
```

---

## Task 11: Session runner and Today screen

**Files:**
- Create: `src/components/session/SessionRunner.tsx`
- Create: `src/hooks/useSessionState.ts`
- Create: `src/screens/TodayScreen.tsx`
- Test: `src/components/session/SessionRunner.test.tsx`

**Interfaces:**
- Consumes: `buildSession` (Task 9), `QuestionCard` (Task 10), `diagnose` (Task 8), `reviewCard`/`isMastered` (Task 7), `updateTheta` (Task 4), repository (Task 6)
- Produces:
  - `SessionRunner` — `({ plan, onComplete }: { plan: SessionPlan; onComplete: () => void })`
  - `TIME_BUDGET_OPTIONS: { label: string; seconds: number }[]` — 10, 25, 45, 90 minutes

- [ ] **Step 1: Write the failing test**

Create `src/components/session/SessionRunner.test.tsx`:

```tsx
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionRunner } from './SessionRunner';
import { db } from '../../db/db';
import { getAttempts } from '../../db/repository';
import { content } from '../../content/index';

const firstQuestion = content.questions.find((q) => q.type === 'sentence-completion')!;

const plan = {
  items: [{ kind: 'question' as const, questionId: firstQuestion.id }],
  estimatedSeconds: 60,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('SessionRunner', () => {
  it('renders the first question of the plan', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    expect(await screen.findByText(firstQuestion.stem)).toBeInTheDocument();
  });

  it('persists an attempt immediately after answering', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    await userEvent.click(screen.getAllByRole('button')[0]);

    const attempts = await getAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].questionId).toBe(firstQuestion.id);
  });

  it('reveals explanations after answering', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    await userEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText(firstQuestion.explanationPerOption[0])).toBeInTheDocument();
  });

  it('records a diagnosis for a wrong answer', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    const wrongIndex = firstQuestion.correctIndex === 0 ? 1 : 0;
    await userEvent.click(screen.getAllByRole('button')[wrongIndex]);

    const attempts = await getAttempts();
    expect(attempts[0].correct).toBe(false);
    expect(attempts[0].diagnosis).not.toBeNull();
  });

  it('records no diagnosis for a correct answer', async () => {
    render(<SessionRunner plan={plan} onComplete={() => {}} />);
    await screen.findByText(firstQuestion.stem);
    await userEvent.click(screen.getAllByRole('button')[firstQuestion.correctIndex]);

    const attempts = await getAttempts();
    expect(attempts[0].correct).toBe(true);
    expect(attempts[0].diagnosis).toBeNull();
  });

  it('calls onComplete after the last item', async () => {
    const onComplete = vi.fn();
    render(<SessionRunner plan={plan} onComplete={onComplete} />);
    await screen.findByText(firstQuestion.stem);
    await userEvent.click(screen.getAllByRole('button')[0]);
    await userEvent.click(screen.getByRole('button', { name: /המשך/ }));
    expect(onComplete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- SessionRunner`
Expected: FAIL — `Failed to resolve import "./SessionRunner"`

- [ ] **Step 3: Implement the session state hook**

Create `src/hooks/useSessionState.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { content, lexemeById, questionById } from '../content/index';
import { diagnose, timeThresholdFor } from '../engines/diagnosis';
import { isMastered, reviewCard, seedCard } from '../engines/srs';
import { addRemediation, recordServing } from '../engines/remediation';
import { updateTheta } from '../engines/theta';
import {
  getCards,
  getProfile,
  getRemediation,
  recordAttempt,
  saveCard,
  saveProfile,
  saveRemediation,
} from '../db/repository';
import type { Card as FsrsCard } from 'ts-fsrs';

export function useSessionState() {
  const [cards, setCards] = useState<Map<string, FsrsCard>>(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = await getCards();
      setCards(new Map(stored.map((s) => [s.lexemeId, s.card])));
      setReady(true);
    })();
  }, []);

  const masteredCheck = useCallback(
    (lexemeId: string) => {
      const card = cards.get(lexemeId);
      return card ? isMastered(card) : false;
    },
    [cards],
  );

  /** Persists everything a single answer changes, in one call. */
  const submitAnswer = useCallback(
    async (questionId: string, chosenIndex: number, elapsedMs: number) => {
      const question = questionById(questionId);
      if (!question) throw new Error(`Unknown question: ${questionId}`);

      const correct = chosenIndex === question.correctIndex;
      const now = Date.now();

      const cause = diagnose({
        question,
        chosenIndex,
        elapsedMs,
        isMastered: masteredCheck,
        lexemeById,
        timeThresholdMs: timeThresholdFor(question.type, null),
      });

      await recordAttempt({
        questionId,
        chosenIndex,
        correct,
        elapsedMs,
        at: now,
        diagnosis: cause,
      });

      const profile = await getProfile();
      const nextTheta = updateTheta(
        profile.theta,
        question.difficulty,
        correct,
        profile.answered,
      );
      await saveProfile({
        ...profile,
        theta: nextTheta,
        answered: profile.answered + 1,
        thetaHistory: [...profile.thetaHistory, { at: now, theta: nextTheta }],
      });

      const nextCards = new Map(cards);
      for (const lexemeId of question.targetLexemes) {
        const existing = nextCards.get(lexemeId);
        const updated = existing
          ? reviewCard(existing, correct, new Date(now))
          : seedCard(correct, new Date(now));
        nextCards.set(lexemeId, updated);
        await saveCard(lexemeId, updated);
      }
      setCards(nextCards);

      let queue = await getRemediation();
      for (const lexemeId of question.targetLexemes) {
        queue = recordServing(queue, lexemeId, correct, now);
      }
      if (cause) {
        const target = question.targetLexemes[0] ?? question.trapType;
        queue = addRemediation(queue, cause, target, now);
      }
      await saveRemediation(queue);

      return { correct, cause };
    },
    [cards, masteredCheck],
  );

  return { ready, submitAnswer, totalQuestions: content.questions.length };
}
```

- [ ] **Step 4: Implement SessionRunner**

Create `src/components/session/SessionRunner.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { QuestionCard } from '../question/QuestionCard';
import { EnglishText } from '../ui/EnglishText';
import { useSessionState } from '../../hooks/useSessionState';
import { questionById } from '../../content/index';
import type { SessionPlan } from '../../engines/session-builder';

interface SessionRunnerProps {
  plan: SessionPlan;
  onComplete: () => void;
}

export function SessionRunner({ plan, onComplete }: SessionRunnerProps) {
  const { ready, submitAnswer } = useSessionState();
  const [index, setIndex] = useState(0);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const startedAt = useRef(Date.now());

  const item = plan.items[index];

  useEffect(() => {
    startedAt.current = Date.now();
  }, [index]);

  // Skipping and completion are state changes, so they belong in effects.
  // Calling setIndex or onComplete during render re-enters render immediately
  // and React loops.
  useEffect(() => {
    if (ready && !item) onComplete();
  }, [ready, item, onComplete]);

  useEffect(() => {
    // Non-question kinds have no runner yet; Task 12 adds the SRS branch.
    if (item && item.kind !== 'question') setIndex((i) => i + 1);
  }, [item]);

  if (!ready) return <p>טוען…</p>;
  if (!item || item.kind !== 'question') return null;

  const question = questionById(item.questionId);
  if (!question) return <p>שאלה חסרה</p>;

  async function handleAnswer(choice: number) {
    setChosenIndex(choice);
    await submitAnswer(item.questionId, choice, Date.now() - startedAt.current);
  }

  function advance() {
    setChosenIndex(null);
    setIndex((i) => i + 1);
  }

  return (
    <section aria-label="שאלה">
      <QuestionCard
        question={question}
        onAnswer={handleAnswer}
        revealed={chosenIndex !== null}
        chosenIndex={chosenIndex}
      />
      {chosenIndex !== null && (
        <button type="button" onClick={advance}>
          המשך
        </button>
      )}
      <p className="progress-note">
        <EnglishText>{`${index + 1} / ${plan.items.length}`}</EnglishText>
      </p>
    </section>
  );
}
```

- [ ] **Step 5: Implement TodayScreen**

Create `src/screens/TodayScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { SessionRunner } from '../components/session/SessionRunner';
import { buildSession, type SessionPlan } from '../engines/session-builder';
import { dueLexemeIds } from '../engines/srs';
import { content } from '../content/index';
import { getAttempts, getCards, getProfile, getRemediation } from '../db/repository';

export const TIME_BUDGET_OPTIONS = [
  { label: '10 דקות', seconds: 600 },
  { label: '25 דקות', seconds: 1500 },
  { label: '45 דקות', seconds: 2700 },
  { label: '90 דקות', seconds: 5400 },
];

export function TodayScreen() {
  const [plan, setPlan] = useState<SessionPlan | null>(null);

  async function start(budgetSeconds: number) {
    const [profile, cards, remediation, attempts] = await Promise.all([
      getProfile(),
      getCards(),
      getRemediation(),
      getAttempts(),
    ]);
    setPlan(
      buildSession({
        budgetSeconds,
        theta: profile.theta,
        dueLexemeIds: dueLexemeIds(cards, new Date()),
        remediation,
        questions: content.questions,
        passages: content.passages,
        answeredQuestionIds: new Set(attempts.map((a) => a.questionId)),
      }),
    );
  }

  if (plan) return <SessionRunner plan={plan} onComplete={() => setPlan(null)} />;

  return (
    <section aria-labelledby="today-heading">
      <h1 id="today-heading">כמה זמן יש לך היום?</h1>
      <div className="budget-options">
        {TIME_BUDGET_OPTIONS.map((option) => (
          <button key={option.seconds} type="button" onClick={() => void start(option.seconds)}>
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- SessionRunner`
Expected: PASS — 6 tests

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add session runner and elastic Today screen"
```

---

## Task 12: Flashcard review for SRS items

The session builder puts due SRS cards first, and the whole design is vocabulary-first — so the runner must actually render them. Task 11 leaves `kind: 'srs'` items skipped; this task closes that.

**Files:**
- Create: `src/components/session/FlashCard.tsx`
- Modify: `src/hooks/useSessionState.ts` (add `reviewLexeme`)
- Modify: `src/components/session/SessionRunner.tsx` (render `kind: 'srs'`)
- Test: `src/components/session/FlashCard.test.tsx`

**Interfaces:**
- Consumes: `Lexeme` (Task 2), `reviewCard` (Task 7), `saveCard` (Task 6), `EnglishText` (Task 1)
- Produces:
  - `FlashCard` — `({ lexeme, onRate }: { lexeme: Lexeme; onRate: (known: boolean) => void })`
  - `reviewLexeme(lexemeId: string, known: boolean): Promise<void>` added to the `useSessionState` return value

- [ ] **Step 1: Write the failing tests**

Create `src/components/session/FlashCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlashCard } from './FlashCard';
import type { Lexeme } from '../../content/types';

const lexeme: Lexeme = {
  id: 'awl-analyze',
  headword: 'analyze',
  family: ['analyze', 'analysis', 'analytical'],
  definitionHe: 'לנתח',
  definitionEn: 'examine in detail',
  pos: 'verb',
  morphology: { root: 'lys', suffixes: ['-is'] },
  confusableWith: ['analogy'],
  exampleSentence: 'Researchers analyze the data.',
  difficulty: 2,
  tags: [],
};

describe('FlashCard', () => {
  it('renders the headword as left-to-right English', () => {
    render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    expect(screen.getByText('analyze')).toHaveAttribute('dir', 'ltr');
  });

  it('hides the Hebrew gloss before reveal', () => {
    render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    expect(screen.queryByText('לנתח')).not.toBeInTheDocument();
  });

  it('offers no rating buttons before reveal', () => {
    render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    expect(screen.queryByRole('button', { name: 'ידעתי' })).not.toBeInTheDocument();
  });

  it('reveals the gloss on request', async () => {
    render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    expect(screen.getByText('לנתח')).toBeInTheDocument();
  });

  it('shows the word family and example after reveal', async () => {
    render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    expect(screen.getByText('analyze, analysis, analytical')).toBeInTheDocument();
    expect(screen.getByText('Researchers analyze the data.')).toBeInTheDocument();
  });

  it('reports a known rating', async () => {
    const onRate = vi.fn();
    render(<FlashCard lexeme={lexeme} onRate={onRate} />);
    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    await userEvent.click(screen.getByRole('button', { name: 'ידעתי' }));
    expect(onRate).toHaveBeenCalledWith(true);
  });

  it('reports an unknown rating', async () => {
    const onRate = vi.fn();
    render(<FlashCard lexeme={lexeme} onRate={onRate} />);
    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    await userEvent.click(screen.getByRole('button', { name: 'לא ידעתי' }));
    expect(onRate).toHaveBeenCalledWith(false);
  });

  it('re-hides the gloss when the lexeme changes', async () => {
    const { rerender } = render(<FlashCard lexeme={lexeme} onRate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /הצג/ }));
    expect(screen.getByText('לנתח')).toBeInTheDocument();

    rerender(
      <FlashCard lexeme={{ ...lexeme, id: 'awl-other', headword: 'implicit', definitionHe: 'מרומז' }} onRate={() => {}} />,
    );
    expect(screen.queryByText('מרומז')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- FlashCard`
Expected: FAIL — `Failed to resolve import "./FlashCard"`

- [ ] **Step 3: Implement FlashCard**

Create `src/components/session/FlashCard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { EnglishText } from '../ui/EnglishText';
import type { Lexeme } from '../../content/types';

interface FlashCardProps {
  lexeme: Lexeme;
  onRate: (known: boolean) => void;
}

export function FlashCard({ lexeme, onRate }: FlashCardProps) {
  const [revealed, setRevealed] = useState(false);

  // Reset on card change, or the next word arrives already answered.
  useEffect(() => {
    setRevealed(false);
  }, [lexeme.id]);

  return (
    <article className="flashcard reading-measure">
      <EnglishText as="p">{lexeme.headword}</EnglishText>

      {!revealed && (
        <button type="button" onClick={() => setRevealed(true)}>
          הצג משמעות
        </button>
      )}

      {revealed && (
        <>
          <p className="flashcard-gloss">{lexeme.definitionHe}</p>
          <p className="flashcard-family">
            <EnglishText>{lexeme.family.join(', ')}</EnglishText>
          </p>
          <p className="flashcard-example">
            <EnglishText>{lexeme.exampleSentence}</EnglishText>
          </p>
          <div className="flashcard-rating">
            <button type="button" onClick={() => onRate(false)}>
              לא ידעתי
            </button>
            <button type="button" onClick={() => onRate(true)}>
              ידעתי
            </button>
          </div>
        </>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Add reviewLexeme to the session state hook**

In `src/hooks/useSessionState.ts`, add this callback alongside `submitAnswer` and include it in the returned object:

```ts
  const reviewLexeme = useCallback(
    async (lexemeId: string, known: boolean) => {
      const now = new Date();
      const existing = cards.get(lexemeId);
      const updated = existing
        ? reviewCard(existing, known, now)
        : seedCard(known, now);

      const nextCards = new Map(cards);
      nextCards.set(lexemeId, updated);
      setCards(nextCards);
      await saveCard(lexemeId, updated);
    },
    [cards],
  );
```

Change the return statement to:

```ts
  return { ready, submitAnswer, reviewLexeme, totalQuestions: content.questions.length };
```

- [ ] **Step 5: Render SRS items in SessionRunner**

In `src/components/session/SessionRunner.tsx`, pull `reviewLexeme` from the hook:

```tsx
  const { ready, submitAnswer, reviewLexeme } = useSessionState();
```

Then replace Task 11's catch-all guard line —

```tsx
  if (!item || item.kind !== 'question') return null;
```

— with an SRS branch followed by a narrower guard:

```tsx
  if (!item) return null;

  if (item.kind === 'srs') {
    const lexeme = lexemeById(item.lexemeId);
    if (!lexeme) return <p>מילה חסרה</p>;
    return (
      <section aria-label="כרטיסיית מילה">
        <FlashCard
          lexeme={lexeme}
          onRate={async (known) => {
            await reviewLexeme(item.lexemeId, known);
            setIndex((i) => i + 1);
          }}
        />
        <p className="progress-note">
          <EnglishText>{`${index + 1} / ${plan.items.length}`}</EnglishText>
        </p>
      </section>
    );
  }

  if (item.kind !== 'question') return null;
```

The skip effect from Task 11 now needs to leave SRS items alone — narrow its condition to passages only:

```tsx
  useEffect(() => {
    // Passage runner is out of scope for wave 1; skip past it.
    if (item && item.kind === 'passage') setIndex((i) => i + 1);
  }, [item]);
```

Add the imports at the top of the file:

```tsx
import { FlashCard } from './FlashCard';
import { lexemeById, questionById } from '../../content/index';
```

- [ ] **Step 6: Add the flashcard styles**

Append to `src/components/question/question.css`:

```css
.flashcard {
  padding: var(--space-5) var(--space-4);
  text-align: center;
}

.flashcard > p:first-child {
  font-size: var(--text-2xl);
  line-height: var(--leading-tight);
  margin-bottom: var(--space-4);
}

.flashcard-gloss {
  font-size: var(--text-lg);
}

.flashcard-family,
.flashcard-example {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.flashcard-rating {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
  margin-top: var(--space-4);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- FlashCard SessionRunner`
Expected: PASS — 8 FlashCard tests, 6 SessionRunner tests still green

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add flashcard review so due SRS cards run in a session"
```

---

## Task 13: Placement engine and screen

**Files:**
- Create: `src/engines/placement.ts`
- Create: `src/screens/PlacementScreen.tsx`
- Test: `src/engines/placement.test.ts`

**Interfaces:**
- Consumes: `updateTheta` (Task 4), `QuestionItem` (Task 2), `seedCard` (Task 7)
- Produces:
  - `PLACEMENT_ITEM_COUNT = 20`
  - `nextPlacementItem(state: PlacementState, pool: QuestionItem[]): QuestionItem | null`
  - `applyPlacementAnswer(state: PlacementState, item: QuestionItem, correct: boolean): PlacementState`
  - `PlacementState = { theta: number; answered: number; usedIds: string[] }`
  - `initialPlacementState(): PlacementState`

- [ ] **Step 1: Write the failing tests**

Create `src/engines/placement.test.ts`:

```ts
import {
  initialPlacementState,
  nextPlacementItem,
  applyPlacementAnswer,
  PLACEMENT_ITEM_COUNT,
} from './placement';
import type { QuestionItem } from '../content/types';

function q(id: string, difficulty: number): QuestionItem {
  return {
    id,
    type: 'sentence-completion',
    difficulty,
    stem: 's',
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    explanationPerOption: ['1', '2', '3', '4'],
    targetLexemes: [],
    trapType: 'phonetic-neighbor',
  };
}

const pool = [q('easy', -2), q('mid', 0), q('hard', 2)];

describe('placement', () => {
  it('starts at theta zero with nothing answered', () => {
    expect(initialPlacementState()).toEqual({ theta: 0, answered: 0, usedIds: [] });
  });

  it('opens with an item near the middle of the scale', () => {
    expect(nextPlacementItem(initialPlacementState(), pool)?.id).toBe('mid');
  });

  it('never repeats an item', () => {
    const state = { theta: 0, answered: 1, usedIds: ['mid'] };
    expect(nextPlacementItem(state, pool)?.id).not.toBe('mid');
  });

  it('stops after the placement item count', () => {
    const state = { theta: 0, answered: PLACEMENT_ITEM_COUNT, usedIds: [] };
    expect(nextPlacementItem(state, pool)).toBeNull();
  });

  it('returns null when the pool is exhausted', () => {
    const state = { theta: 0, answered: 1, usedIds: ['easy', 'mid', 'hard'] };
    expect(nextPlacementItem(state, pool)).toBeNull();
  });

  it('moves to a harder item after a correct answer', () => {
    let state = initialPlacementState();
    state = applyPlacementAnswer(state, q('mid', 0), true);
    expect(nextPlacementItem(state, pool)?.id).toBe('hard');
  });

  it('moves to an easier item after a wrong answer', () => {
    let state = initialPlacementState();
    state = applyPlacementAnswer(state, q('mid', 0), false);
    expect(nextPlacementItem(state, pool)?.id).toBe('easy');
  });

  it('counts the answer and marks the item used', () => {
    const state = applyPlacementAnswer(initialPlacementState(), q('mid', 0), true);
    expect(state.answered).toBe(1);
    expect(state.usedIds).toContain('mid');
  });

  it('does not mutate the state it is given', () => {
    const state = initialPlacementState();
    applyPlacementAnswer(state, q('mid', 0), true);
    expect(state.answered).toBe(0);
    expect(state.usedIds).toHaveLength(0);
  });

  it('converges upward for a consistently strong responder', () => {
    let state = initialPlacementState();
    const items = Array.from({ length: 20 }, (_, i) => q(`i${i}`, 1.5));
    for (const item of items) state = applyPlacementAnswer(state, item, true);
    expect(state.theta).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- placement`
Expected: FAIL — `Failed to resolve import "./placement"`

- [ ] **Step 3: Implement the placement engine**

Create `src/engines/placement.ts`:

```ts
import { updateTheta } from './theta';
import type { QuestionItem } from '../content/types';

export const PLACEMENT_ITEM_COUNT = 20;

export interface PlacementState {
  theta: number;
  answered: number;
  usedIds: string[];
}

export function initialPlacementState(): PlacementState {
  return { theta: 0, answered: 0, usedIds: [] };
}

/** Picks the unused item whose difficulty sits closest to the current estimate. */
export function nextPlacementItem(
  state: PlacementState,
  pool: QuestionItem[],
): QuestionItem | null {
  if (state.answered >= PLACEMENT_ITEM_COUNT) return null;

  const used = new Set(state.usedIds);
  const candidates = pool.filter((q) => !used.has(q.id));
  if (candidates.length === 0) return null;

  return candidates.reduce((best, item) =>
    Math.abs(item.difficulty - state.theta) < Math.abs(best.difficulty - state.theta)
      ? item
      : best,
  );
}

export function applyPlacementAnswer(
  state: PlacementState,
  item: QuestionItem,
  correct: boolean,
): PlacementState {
  return {
    theta: updateTheta(state.theta, item.difficulty, correct, state.answered),
    answered: state.answered + 1,
    usedIds: [...state.usedIds, item.id],
  };
}
```

- [ ] **Step 4: Implement PlacementScreen**

Create `src/screens/PlacementScreen.tsx`:

```tsx
import { useState } from 'react';
import { QuestionCard } from '../components/question/QuestionCard';
import { content } from '../content/index';
import {
  initialPlacementState,
  nextPlacementItem,
  applyPlacementAnswer,
  type PlacementState,
} from '../engines/placement';
import { seedCard } from '../engines/srs';
import { thetaToScore } from '../engines/theta';
import { getProfile, saveCard, saveProfile } from '../db/repository';

interface PlacementScreenProps {
  onDone: () => void;
}

export function PlacementScreen({ onDone }: PlacementScreenProps) {
  const [state, setState] = useState<PlacementState>(initialPlacementState());
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);

  const item = nextPlacementItem(state, content.questions);

  if (!item) {
    return (
      <section aria-labelledby="placement-done">
        <h1 id="placement-done">מבחן המיקום הסתיים</h1>
        <p>הערכה ראשונית: {thetaToScore(state.theta)}</p>
        <p className="disclaimer">
          זהו אומדן פנימי בלבד, לא ציון מאל"ו. הוא נועד למעקב אחר מגמה.
        </p>
        <button type="button" onClick={() => void finish()}>
          התחל ללמוד
        </button>
      </section>
    );
  }

  async function handleAnswer(choice: number) {
    setChosenIndex(choice);
    const correct = choice === item!.correctIndex;
    const now = new Date();

    for (const lexemeId of item!.targetLexemes) {
      await saveCard(lexemeId, seedCard(correct, now));
    }
    setState((prev) => applyPlacementAnswer(prev, item!, correct));
    setChosenIndex(null);
  }

  async function finish() {
    const profile = await getProfile();
    await saveProfile({
      ...profile,
      theta: state.theta,
      answered: state.answered,
      placementDone: true,
      thetaHistory: [{ at: Date.now(), theta: state.theta }],
    });
    onDone();
  }

  return (
    <section aria-labelledby="placement-heading">
      <h1 id="placement-heading">מבחן מיקום</h1>
      <p>
        שאלה {state.answered + 1} מתוך {content.questions.length > 20 ? 20 : content.questions.length}
      </p>
      <QuestionCard
        question={item}
        onAnswer={handleAnswer}
        revealed={false}
        chosenIndex={chosenIndex}
      />
    </section>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- placement`
Expected: PASS — 10 tests

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add placement engine and first-run placement screen"
```

---

## Task 14: Simulation screen with irreversible section locking

Mirrors the real exam structure exactly, including the rule that a completed section can never be revisited.

**Files:**
- Create: `src/engines/simulation.ts`
- Create: `src/screens/SimulationScreen.tsx`
- Test: `src/engines/simulation.test.ts`

**Interfaces:**
- Consumes: `QuestionItem` (Task 2), `createTimer` (Task 5), `updateTheta` (Task 4)
- Produces:
  - `EXAM_SECTIONS: SectionSpec[]` where `SectionSpec = { index: number; type: QuestionType; questionCount: number; seconds: number }`
  - `TOTAL_SCORED_QUESTIONS = 23`
  - `advanceSection(state: SimulationState): SimulationState`
  - `SimulationState = { sectionIndex: number; locked: number[]; answers: Record<string, number> }`
  - `canReturnToSection(state: SimulationState, index: number): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/engines/simulation.test.ts`:

```ts
import {
  EXAM_SECTIONS,
  TOTAL_SCORED_QUESTIONS,
  advanceSection,
  canReturnToSection,
  initialSimulationState,
} from './simulation';

describe('EXAM_SECTIONS', () => {
  it('has six scored sections', () => {
    expect(EXAM_SECTIONS).toHaveLength(6);
  });

  it('totals 23 scored questions', () => {
    const total = EXAM_SECTIONS.reduce((sum, s) => sum + s.questionCount, 0);
    expect(total).toBe(TOTAL_SCORED_QUESTIONS);
  });

  it('totals 39 minutes', () => {
    const total = EXAM_SECTIONS.reduce((sum, s) => sum + s.seconds, 0);
    expect(total).toBe(39 * 60);
  });

  it('matches the published section order', () => {
    expect(EXAM_SECTIONS.map((s) => s.type)).toEqual([
      'sentence-completion',
      'sentence-completion',
      'reading',
      'restatement',
      'restatement',
      'sentence-completion',
    ]);
  });

  it('allots 15 minutes to the reading section', () => {
    expect(EXAM_SECTIONS[2].seconds).toBe(900);
  });
});

describe('section locking', () => {
  it('starts on the first section with nothing locked', () => {
    const state = initialSimulationState();
    expect(state.sectionIndex).toBe(0);
    expect(state.locked).toEqual([]);
  });

  it('allows returning within the current section', () => {
    expect(canReturnToSection(initialSimulationState(), 0)).toBe(true);
  });

  it('locks a section on advance', () => {
    const state = advanceSection(initialSimulationState());
    expect(state.locked).toContain(0);
    expect(state.sectionIndex).toBe(1);
  });

  it('forbids returning to a locked section', () => {
    const state = advanceSection(initialSimulationState());
    expect(canReturnToSection(state, 0)).toBe(false);
  });

  it('does not mutate the state it is given', () => {
    const state = initialSimulationState();
    advanceSection(state);
    expect(state.sectionIndex).toBe(0);
    expect(state.locked).toHaveLength(0);
  });

  it('accumulates locks across sections', () => {
    let state = initialSimulationState();
    state = advanceSection(state);
    state = advanceSection(state);
    expect(state.locked).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- simulation`
Expected: FAIL — `Failed to resolve import "./simulation"`

- [ ] **Step 3: Implement the simulation engine**

Create `src/engines/simulation.ts`:

```ts
import type { QuestionType } from '../content/types';

export interface SectionSpec {
  index: number;
  type: QuestionType;
  questionCount: number;
  seconds: number;
}

/** Published Amirnet core structure: 23 scored questions across 39 minutes. */
export const EXAM_SECTIONS: SectionSpec[] = [
  { index: 0, type: 'sentence-completion', questionCount: 4, seconds: 240 },
  { index: 1, type: 'sentence-completion', questionCount: 4, seconds: 240 },
  { index: 2, type: 'reading', questionCount: 5, seconds: 900 },
  { index: 3, type: 'restatement', questionCount: 3, seconds: 360 },
  { index: 4, type: 'restatement', questionCount: 3, seconds: 360 },
  { index: 5, type: 'sentence-completion', questionCount: 4, seconds: 240 },
];

export const TOTAL_SCORED_QUESTIONS = 23;

export interface SimulationState {
  sectionIndex: number;
  locked: number[];
  answers: Record<string, number>;
}

export function initialSimulationState(): SimulationState {
  return { sectionIndex: 0, locked: [], answers: {} };
}

/**
 * Locks the current section permanently. The real exam offers no way back
 * once a section is confirmed, and practising under a softer rule builds
 * the wrong habit.
 */
export function advanceSection(state: SimulationState): SimulationState {
  return {
    ...state,
    answers: { ...state.answers },
    locked: [...state.locked, state.sectionIndex],
    sectionIndex: state.sectionIndex + 1,
  };
}

export function canReturnToSection(state: SimulationState, index: number): boolean {
  return !state.locked.includes(index);
}
```

- [ ] **Step 4: Implement SimulationScreen**

Create `src/screens/SimulationScreen.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { QuestionCard } from '../components/question/QuestionCard';
import { TimerBar } from '../components/ui/TimerBar';
import { createTimer } from '../lib/timer';
import { content } from '../content/index';
import {
  EXAM_SECTIONS,
  advanceSection,
  initialSimulationState,
  type SimulationState,
} from '../engines/simulation';
import { thetaToScore, updateTheta } from '../engines/theta';

export function SimulationScreen() {
  const [state, setState] = useState<SimulationState>(initialSimulationState());
  const [questionIndex, setQuestionIndex] = useState(0);
  const [tick, setTick] = useState(0);

  const section = EXAM_SECTIONS[state.sectionIndex];

  const timer = useMemo(
    () => (section ? createTimer(section.seconds * 1000) : null),
    [state.sectionIndex, section],
  );

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (timer?.isExpired()) confirmSection();
  }, [tick, timer]);

  const sectionQuestions = useMemo(
    () =>
      content.questions
        .filter((q) => q.type === section?.type)
        .slice(0, section?.questionCount ?? 0),
    [section],
  );

  function confirmSection() {
    setState((prev) => advanceSection(prev));
    setQuestionIndex(0);
  }

  if (!section) {
    const theta = Object.entries(state.answers).reduce((acc, [id, choice], i) => {
      const q = content.questions.find((x) => x.id === id);
      if (!q) return acc;
      return updateTheta(acc, q.difficulty, choice === q.correctIndex, i);
    }, 0);

    return (
      <section aria-labelledby="sim-done">
        <h1 id="sim-done">הסימולציה הסתיימה</h1>
        <p>אומדן ציון: {thetaToScore(theta)}</p>
        <p className="disclaimer">
          אומדן פנימי בלבד, לא ציון מאל"ו. השתמש בו למעקב אחר מגמה.
        </p>
      </section>
    );
  }

  const question = sectionQuestions[questionIndex];

  return (
    <section aria-labelledby="sim-heading">
      <TimerBar fraction={timer?.fraction() ?? 0} warning={timer?.isWarning() ?? false} />
      <h1 id="sim-heading">
        פרק {section.index + 1} מתוך {EXAM_SECTIONS.length}
      </h1>
      {question && (
        <QuestionCard
          question={question}
          revealed={false}
          chosenIndex={state.answers[question.id] ?? null}
          onAnswer={(choice) =>
            setState((prev) => ({
              ...prev,
              answers: { ...prev.answers, [question.id]: choice },
            }))
          }
        />
      )}
      <nav aria-label="ניווט בתוך הפרק">
        <button
          type="button"
          disabled={questionIndex === 0}
          onClick={() => setQuestionIndex((i) => i - 1)}
        >
          הקודמת
        </button>
        <button
          type="button"
          disabled={questionIndex >= sectionQuestions.length - 1}
          onClick={() => setQuestionIndex((i) => i + 1)}
        >
          הבאה
        </button>
      </nav>
      <button
        type="button"
        onClick={() => {
          if (confirm('לאשר סיום פרק? לא ניתן לחזור אליו אחר כך.')) confirmSection();
        }}
      >
        אשר וסיים פרק
      </button>
    </section>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- simulation`
Expected: PASS — 11 tests

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add exam simulation with irreversible section locking"
```

---

## Task 15: Progress screen, remaining screens, and routing

**Files:**
- Create: `src/components/ui/ThetaChart.tsx`
- Create: `src/screens/ProgressScreen.tsx`
- Create: `src/screens/PracticeScreen.tsx`
- Create: `src/screens/LexiconScreen.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/ui/ThetaChart.test.tsx`

**Interfaces:**
- Consumes: repository (Task 6), `thetaToScore`/`PASS_THRESHOLD_SCORE` (Task 4)
- Produces: `ThetaChart` — `({ history }: { history: { at: number; theta: number }[] })`, a hand-rolled SVG line chart with a horizontal reference line at the pass threshold

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/ThetaChart.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { ThetaChart } from './ThetaChart';

const history = [
  { at: 1_700_000_000_000, theta: 0.2 },
  { at: 1_700_100_000_000, theta: 0.9 },
  { at: 1_700_200_000_000, theta: 1.6 },
];

describe('ThetaChart', () => {
  it('renders an accessible figure', () => {
    render(<ThetaChart history={history} />);
    expect(screen.getByRole('img', { name: /התקדמות/ })).toBeInTheDocument();
  });

  it('draws one point per history entry', () => {
    const { container } = render(<ThetaChart history={history} />);
    expect(container.querySelectorAll('circle')).toHaveLength(3);
  });

  it('draws the 134 reference line', () => {
    const { container } = render(<ThetaChart history={history} />);
    expect(container.querySelector('[data-testid="pass-line"]')).toBeInTheDocument();
  });

  it('renders an empty state with no history', () => {
    render(<ThetaChart history={[]} />);
    expect(screen.getByText(/אין עדיין נתונים/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ThetaChart`
Expected: FAIL — `Failed to resolve import "./ThetaChart"`

- [ ] **Step 3: Implement ThetaChart**

Create `src/components/ui/ThetaChart.tsx`:

```tsx
import { PASS_THRESHOLD_SCORE, thetaToScore } from '../../engines/theta';

interface ThetaChartProps {
  history: { at: number; theta: number }[];
}

const WIDTH = 640;
const HEIGHT = 240;
const PAD = 24;
const SCORE_MIN = 50;
const SCORE_MAX = 150;

function yFor(score: number): number {
  const ratio = (score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN);
  return HEIGHT - PAD - ratio * (HEIGHT - 2 * PAD);
}

export function ThetaChart({ history }: ThetaChartProps) {
  if (history.length === 0) {
    return <p className="empty-state">אין עדיין נתונים. השלם סשן ראשון.</p>;
  }

  const step = history.length === 1 ? 0 : (WIDTH - 2 * PAD) / (history.length - 1);
  const points = history.map((entry, i) => ({
    x: PAD + i * step,
    y: yFor(thetaToScore(entry.theta)),
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="גרף התקדמות אומדן הציון לאורך זמן"
      className="theta-chart"
    >
      <line
        data-testid="pass-line"
        x1={PAD}
        x2={WIDTH - PAD}
        y1={yFor(PASS_THRESHOLD_SCORE)}
        y2={yFor(PASS_THRESHOLD_SCORE)}
        stroke="var(--color-due)"
        strokeDasharray="4 4"
      />
      <path d={path} fill="none" stroke="var(--color-text)" strokeWidth={1.5} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--color-text)" />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Implement ProgressScreen**

Create `src/screens/ProgressScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ThetaChart } from '../components/ui/ThetaChart';
import { getAttempts, getProfile } from '../db/repository';
import { PASS_THRESHOLD_SCORE, thetaToScore } from '../engines/theta';
import type { Attempt, DiagnosisCause } from '../content/types';

const CAUSE_LABELS: Record<DiagnosisCause, string> = {
  'vocabulary-gap': 'פער אוצר מילים',
  'distractor-phonetic': 'מסיח דומה בצליל',
  'connector-misread': 'קריאה שגויה של מילת קישור',
  'time-pressure': 'לחץ זמן',
  'inference-error': 'שגיאת הסקה',
};

export function ProgressScreen() {
  const [history, setHistory] = useState<{ at: number; theta: number }[]>([]);
  const [score, setScore] = useState(100);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    void (async () => {
      const [profile, all] = await Promise.all([getProfile(), getAttempts()]);
      setHistory(profile.thetaHistory);
      setScore(thetaToScore(profile.theta));
      setAttempts(all);
    })();
  }, []);

  const counts = attempts.reduce<Record<string, number>>((acc, a) => {
    if (!a.diagnosis) return acc;
    acc[a.diagnosis] = (acc[a.diagnosis] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section aria-labelledby="progress-heading">
      <h1 id="progress-heading">התקדמות</h1>

      <p className="score-display">
        אומדן נוכחי: <strong>{score}</strong> · יעד: {PASS_THRESHOLD_SCORE}
      </p>
      <p className="disclaimer">
        זהו אומדן פנימי של האפליקציה, לא ציון מאל"ו. הכיול הרשמי אינו פומבי.
        השתמש במספר כדי לעקוב אחר מגמה, לא כתחזית לציון בבחינה.
      </p>

      <ThetaChart history={history} />

      <h2>התפלגות סיבות טעות</h2>
      {Object.keys(counts).length === 0 ? (
        <p className="empty-state">אין עדיין טעויות מסווגות.</p>
      ) : (
        <ul>
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([cause, count]) => (
              <li key={cause}>
                {CAUSE_LABELS[cause as DiagnosisCause]}: {count}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Implement PracticeScreen and LexiconScreen**

Create `src/screens/PracticeScreen.tsx`:

```tsx
import { useState } from 'react';
import { SessionRunner } from '../components/session/SessionRunner';
import { content } from '../content/index';
import type { QuestionType } from '../content/types';
import type { SessionPlan } from '../engines/session-builder';

const TYPE_LABELS: Record<QuestionType, string> = {
  'sentence-completion': 'השלמת משפטים',
  restatement: 'ניסוח מחדש',
  reading: 'הבנת הנקרא',
  'grammar-in-context': 'דקדוק בהקשר',
};

export function PracticeScreen() {
  const [plan, setPlan] = useState<SessionPlan | null>(null);

  function startType(type: QuestionType) {
    const items = content.questions
      .filter((q) => q.type === type)
      .slice(0, 10)
      .map((q) => ({ kind: 'question' as const, questionId: q.id }));
    setPlan({ items, estimatedSeconds: 0 });
  }

  if (plan) return <SessionRunner plan={plan} onComplete={() => setPlan(null)} />;

  return (
    <section aria-labelledby="practice-heading">
      <h1 id="practice-heading">תרגול חופשי</h1>
      {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
        <button key={type} type="button" onClick={() => startType(type)}>
          {TYPE_LABELS[type]}
        </button>
      ))}
    </section>
  );
}
```

Create `src/screens/LexiconScreen.tsx`:

```tsx
import { useState } from 'react';
import { EnglishText } from '../components/ui/EnglishText';
import { content } from '../content/index';

export function LexiconScreen() {
  const [query, setQuery] = useState('');

  const matches = content.lexemes.filter(
    (l) =>
      l.headword.includes(query.toLowerCase()) ||
      l.definitionHe.includes(query) ||
      l.family.some((f) => f.includes(query.toLowerCase())),
  );

  return (
    <section aria-labelledby="lexicon-heading">
      <h1 id="lexicon-heading">מילון</h1>
      <label>
        חיפוש
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul>
        {matches.map((lexeme) => (
          <li key={lexeme.id}>
            <EnglishText>{lexeme.headword}</EnglishText> — {lexeme.definitionHe}
            <br />
            <small>
              <EnglishText>{lexeme.family.join(', ')}</EnglishText>
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Wire routing in App.tsx**

Replace `src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { TodayScreen } from './screens/TodayScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { SimulationScreen } from './screens/SimulationScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { LexiconScreen } from './screens/LexiconScreen';
import { PlacementScreen } from './screens/PlacementScreen';
import { getProfile } from './db/repository';

type Tab = 'today' | 'practice' | 'simulation' | 'progress' | 'lexicon';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'היום' },
  { id: 'practice', label: 'תרגול' },
  { id: 'simulation', label: 'סימולציה' },
  { id: 'progress', label: 'התקדמות' },
  { id: 'lexicon', label: 'מילון' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [placementDone, setPlacementDone] = useState<boolean | null>(null);

  useEffect(() => {
    void getProfile().then((p) => setPlacementDone(p.placementDone));
  }, []);

  if (placementDone === null) return <p>טוען…</p>;
  if (!placementDone) return <PlacementScreen onDone={() => setPlacementDone(true)} />;

  return (
    <>
      <header>
        <nav aria-label="ניווט ראשי">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'today' && <TodayScreen />}
        {tab === 'practice' && <PracticeScreen />}
        {tab === 'simulation' && <SimulationScreen />}
        {tab === 'progress' && <ProgressScreen />}
        {tab === 'lexicon' && <LexiconScreen />}
      </main>
    </>
  );
}
```

- [ ] **Step 7: Run the full test suite and the dev server**

Run: `npm test`
Expected: all suites PASS

Run: `npm run dev` and open the printed localhost URL. Complete the placement flow end to end and confirm no console errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add progress chart, practice, lexicon screens, and app routing"
```

---

## Task 16: Author wave-1 content

The application is complete but under-fed. This task fills it to the volume the spec requires for wave 1. The validator from Task 2 is the acceptance gate — nothing lands without passing it.

**Files:**
- Modify: `src/content/lexemes/seed.json` → split into `awl-sublist-1.json`, `awl-sublist-2.json`, `awl-sublist-3.json`, `connectors.json`
- Modify: `src/content/questions/seed.json` → split into `sentence-completion.json`, `restatement.json`, `grammar-in-context.json`, `reading.json`
- Modify: `src/content/passages/seed.json` → `passages.json`
- Modify: `src/content/index.ts` (import the split files)
- Test: `src/content/wave1.test.ts`

**Interfaces:**
- Consumes: `validateContent` (Task 2), `content` loader (Task 3)
- Produces: no new code interfaces — a content volume increase enforced by test

- [ ] **Step 1: Write the failing volume test**

Create `src/content/wave1.test.ts`:

```ts
import { content } from './index';
import { validateContent } from './validate';

const TARGET = {
  lexemes: 190,        // 150 AWL + 40 connectors
  connectors: 40,
  sentenceCompletion: 60,
  restatement: 30,
  grammarInContext: 20,
  passages: 6,
};

function count(type: string): number {
  return content.questions.filter((q) => q.type === type).length;
}

describe('wave 1 content volume', () => {
  it('still passes the integrity validator', () => {
    expect(validateContent(content)).toEqual({ ok: true });
  });

  it('has at least the target lexeme count', () => {
    expect(content.lexemes.length).toBeGreaterThanOrEqual(TARGET.lexemes);
  });

  it('has at least the target connector count', () => {
    const connectors = content.lexemes.filter((l) => l.pos === 'connector');
    expect(connectors.length).toBeGreaterThanOrEqual(TARGET.connectors);
  });

  it('has at least the target sentence-completion count', () => {
    expect(count('sentence-completion')).toBeGreaterThanOrEqual(TARGET.sentenceCompletion);
  });

  it('has at least the target restatement count', () => {
    expect(count('restatement')).toBeGreaterThanOrEqual(TARGET.restatement);
  });

  it('has at least the target grammar-in-context count', () => {
    expect(count('grammar-in-context')).toBeGreaterThanOrEqual(TARGET.grammarInContext);
  });

  it('has at least the target passage count', () => {
    expect(content.passages.length).toBeGreaterThanOrEqual(TARGET.passages);
  });

  it('spreads question difficulty across the scale', () => {
    const above = content.questions.filter((q) => q.difficulty >= 2).length;
    const middle = content.questions.filter((q) => q.difficulty > -1 && q.difficulty < 2).length;
    const below = content.questions.filter((q) => q.difficulty <= -1).length;
    expect(above).toBeGreaterThan(0);
    expect(middle).toBeGreaterThan(0);
    expect(below).toBeGreaterThan(0);
  });

  it('has enough hard items to support a pass-level session', () => {
    const hard = content.questions.filter((q) => q.difficulty >= 2).length;
    expect(hard).toBeGreaterThanOrEqual(30);
  });

  it('gives every lexeme at least one question that targets it', () => {
    const targeted = new Set(content.questions.flatMap((q) => q.targetLexemes));
    const orphans = content.lexemes.filter((l) => !targeted.has(l.id));
    expect(orphans.map((l) => l.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- wave1`
Expected: FAIL — volume assertions fail against the 12-lexeme seed

- [ ] **Step 3: Author the lexeme files**

Split and expand `src/content/lexemes/` into four files, matching the `Lexeme` shape from Task 2 exactly:

- `awl-sublist-1.json` — 60 entries, `tags: ["awl-sublist-1"]`
- `awl-sublist-2.json` — 50 entries, `tags: ["awl-sublist-2"]`
- `awl-sublist-3.json` — 40 entries, `tags: ["awl-sublist-3"]`
- `connectors.json` — 40 entries, `pos: "connector"`, tagged by relation: `connector-contrast`, `connector-cause`, `connector-time`, `connector-addition`

Authoring rules, all enforced by tests already written:
1. `confusableWith` must list real phonetic or orthographic neighbours, not arbitrary words — the diagnosis engine's `distractor-phonetic` branch depends on it.
2. `definitionHe` is required and must be a genuine Hebrew gloss.
3. Every lexeme must be targeted by at least one question (final test in Step 1).
4. Source the headwords from Coxhead's Academic Word List sublists 1–3.

- [ ] **Step 4: Author the question files**

Split and expand `src/content/questions/` into four files:

- `sentence-completion.json` — 60 entries
- `restatement.json` — 30 entries
- `grammar-in-context.json` — 20 entries
- `reading.json` — 30 entries (6 passages × 5)

Authoring rules:
1. `explanationPerOption` needs four non-empty, genuinely distinct explanations. Each wrong option's explanation must name *why* it fails — wrong part of speech, reversed logic, added information, phonetic lure.
2. Difficulty spread: at least 30 items at `difficulty >= 2`. Without hard items the session builder cannot push toward the pass threshold, and the app cannot do its job.
3. At least 12 restatement items must use `"trapType": "logic-inversion"` — connector misreads are the signature restatement failure.
4. Every `targetLexemes` entry must reference an existing lexeme id.

- [ ] **Step 5: Author the passage file**

`src/content/passages/passages.json` — 6 entries. Each with 3–5 academic paragraphs of 180–280 words, an accurate `wordCount`, and exactly 5 `questionIds`.

Spread `domain` across at least four of the five allowed values. Each passage's five questions must include at least one local question (word meaning or reference in context) and at least one global question (author's purpose, inference, or best title).

- [ ] **Step 6: Update the content loader**

Modify `src/content/index.ts` to import and concatenate the split files:

```ts
import awl1 from './lexemes/awl-sublist-1.json';
import awl2 from './lexemes/awl-sublist-2.json';
import awl3 from './lexemes/awl-sublist-3.json';
import connectors from './lexemes/connectors.json';
import sentenceCompletion from './questions/sentence-completion.json';
import restatement from './questions/restatement.json';
import grammar from './questions/grammar-in-context.json';
import reading from './questions/reading.json';
import passagesJson from './passages/passages.json';
import { validateContent } from './validate';
import type { ContentBundle, Lexeme, QuestionItem, Passage } from './types';

export const content: ContentBundle = {
  lexemes: [...awl1, ...awl2, ...awl3, ...connectors] as Lexeme[],
  questions: [
    ...sentenceCompletion,
    ...restatement,
    ...grammar,
    ...reading,
  ] as QuestionItem[],
  passages: passagesJson as Passage[],
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
```

Delete the three `seed.json` files.

- [ ] **Step 7: Run the full suite and the content validator**

Run: `npm test && npm run validate:content`
Expected: all tests PASS, validator reports roughly 190 lexemes, 140 questions, 6 passages

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: author wave-1 content bank with volume and quality gates"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Implementing task |
|---|---|
| 1.1 exam structure | Task 14 (`EXAM_SECTIONS`) |
| 2 constraints | Global Constraints; Task 1 (offline, bidi, light default) |
| 4.1 stack | Task 1 |
| 4.2 per-answer persistence | Task 6, Task 11 |
| 4.3 folder structure | File Structure section |
| 5.1 Lexeme | Task 2 |
| 5.2 QuestionItem | Task 2 |
| 5.3 Passage | Task 2 |
| 5.4 UserState | Task 2 (types), Task 6 (storage) |
| 6.1 placement + card seeding | Task 13, Task 7 (`seedCard`) |
| 6.2 theta → score, disclaimer | Task 4; disclaimer surfaced in Tasks 13, 14, 15 |
| 6.3 FSRS + 21-day mastery | Task 7 (engine), Task 12 (review UI) |
| 6.4 five-cause diagnosis + order + cold start | Task 8 |
| 6.5 session builder + costs + atomic passage | Task 9 |
| 6.6 empirical recalibration | **Gap — see below** |
| 7 six screens | Tasks 11, 13, 14, 15 |
| 8 grammar-in-context in, pilots out | Task 2 (type union), Task 16 (authoring) |
| 9 content volume + waves | Task 16 |
| 10 visual direction, bidi, timer, tokens | Task 1, Task 10, Task 12 |
| 11 testing | Every task is TDD |
| 12 risks | Disclaimers in Tasks 13–15; validator in Task 2 |

**Two gaps found:**

1. **SRS review UI was missing — fixed by adding Task 12.** The session builder places due cards first and the entire approach is vocabulary-first, yet the runner in Task 11 skipped `kind: 'srs'` items entirely. That would have shipped an app whose core loop silently did nothing. Task 12 now supplies the flashcard component and wires it into the runner.

2. **Spec 6.6 (empirical difficulty recalibration) has no task — deferred deliberately.** The formula needs at least 8 attempts per item before it changes any value, which cannot happen until wave-1 content has been in real use for weeks. Building it now means shipping code no test can meaningfully exercise. Recorded as follow-on work below.

**Placeholder scan:** no TBDs, no "add error handling", no "similar to Task N". Every code step contains runnable code.

**Type consistency check:** `Lexeme`, `QuestionItem`, `Passage`, `DiagnosisCause`, `RemediationEntry`, `Attempt` are defined once in Task 2 and imported everywhere. `isMastered` has one signature across Tasks 7, 8, and 11. `reviewCard` and `seedCard` keep the Task 7 signatures in Tasks 11, 12, and 13. `COST_SECONDS` keys align with the `QuestionType` union plus `srs` and `passage`. `thetaToScore` and `PASS_THRESHOLD_SCORE` are imported from `engines/theta` in Tasks 13, 14, and 15 — no redefinition.

---

## Follow-on work (not in this plan)

1. **Empirical difficulty recalibration** (spec 6.6) — implement once roughly 8 attempts per item have accumulated in real use.
2. **Content waves 2 and 3** (spec 9.3) — authored against the diagnosis distribution the app reports, not guessed in advance.
3. **Passage runner** — Task 12 skips `kind: 'passage'` items in the session runner. Reading passages are reachable through the simulation screen, but a dedicated in-session passage reader is needed before they appear in daily sessions.
