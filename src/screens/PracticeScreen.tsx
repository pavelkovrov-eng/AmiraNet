import { useState } from 'react';
import { SessionRunner } from '../components/session/SessionRunner';
import { content } from '../content/index';
import type { QuestionType } from '../content/types';
import type { SessionPlan } from '../engines/session-builder';
import './practice.css';

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
