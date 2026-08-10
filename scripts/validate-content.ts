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
