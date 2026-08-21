import { useState } from 'react';
import { EnglishText } from '../components/ui/EnglishText';
import { content } from '../content/index';
import './lexicon.css';

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
      <label className="lexicon-search">
        חיפוש
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul className="lexicon-list">
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
