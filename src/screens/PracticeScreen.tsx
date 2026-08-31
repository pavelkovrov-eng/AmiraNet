import { useState } from 'react';
import { SessionRunner } from '../components/session/SessionRunner';
import { passageBackedQuestions, standaloneQuestions } from '../content/index';
import type { QuestionType } from '../content/types';
import type { SessionPlan } from '../engines/session-builder';
import './practice.css';

const TYPE_LABELS: Partial<Record<QuestionType, string>> = {
  'sentence-completion': 'השלמת משפטים',
  restatement: 'ניסוח מחדש',
  reading: 'הבנת הנקרא',
  'grammar-in-context': 'דקדוק בהקשר',
};

export function PracticeScreen() {
  const [plan, setPlan] = useState<SessionPlan | null>(null);

  function startType(type: QuestionType) {
    // Reading draws from the passage-backed pool and everything else from the
    // self-contained one. Both are filtered on whether a passage exists rather
    // than on the type name, so an item can never reach the runner without the
    // text it asks about.
    const pool = type === 'reading' ? passageBackedQuestions : standaloneQuestions;
    const items = pool
      .filter((q) => q.type === type)
      .slice(0, 10)
      .map((q) => ({ kind: 'question' as const, questionId: q.id }));
    setPlan({ items, estimatedSeconds: 0 });
  }

  if (plan) return <SessionRunner plan={plan} onComplete={() => setPlan(null)} />;

  return (
    <section aria-labelledby="practice-heading">
      <h1 id="practice-heading">תרגול חופשי</h1>
      <div className="type-options">
        {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
          <button key={type} type="button" onClick={() => startType(type)}>
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    </section>
  );
}
