import { content } from '../src/content/index';

// Importing `content` above already runs the load-time validation gate in
// src/content/index.ts, which throws (and so exits this script non-zero)
// if the bundle is invalid. Reaching this line means it is already valid —
// re-running validateContent() here would be dead code.
console.log(
  `Content OK — ${content.lexemes.length} lexemes, ` +
    `${content.questions.length} questions, ${content.passages.length} passages`,
);
