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
      <div className="lexicon-controls">
        <label className="lexicon-search">
          <span className="eyebrow">חיפוש</span>
          <input
            type="search"
            value={query}
            placeholder="מילה באנגלית או בעברית"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {/* The bank holds hundreds of words, so the count is the difference
            between "my search found nothing" and "I typed something the
            filter cannot match". */}
        <p className="lexicon-count numeral" role="status" aria-live="polite">
          {matches.length} / {content.lexemes.length}
        </p>
      </div>
      <ul className="lexicon-list">
        {matches.map((lexeme) => (
          <li key={lexeme.id}>
            <EnglishText>{lexeme.headword}</EnglishText>
            <span className="lexicon-gloss">{lexeme.definitionHe}</span>
            <small>
              <EnglishText>{lexeme.family.join(', ')}</EnglishText>
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
