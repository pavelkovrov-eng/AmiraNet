import { useState } from 'react';
import { SessionRunner } from '../components/session/SessionRunner';
import { standaloneQuestions } from '../content/index';
import type { QuestionType } from '../content/types';
import type { SessionPlan } from '../engines/session-builder';
import './practice.css';

/**
 * Reading is deliberately absent.
 *
 * Its questions only make sense beside their passage, and this screen renders
 * a bare QuestionCard. Offering the type here served ten unanswerable
 * questions ("the main purpose of the second paragraph is -") with nothing to
 * read. It comes back the moment a passage reader exists; until then the
 * honest option list is the one this screen can actually present.
 */
const TYPE_LABELS: Partial<Record<QuestionType, string>> = {
  'sentence-completion': 'השלמת משפטים',
  restatement: 'ניסוח מחדש',
  'grammar-in-context': 'דקדוק בהקשר',
};

export function PracticeScreen() {
  const [plan, setPlan] = useState<SessionPlan | null>(null);

  function startType(type: QuestionType) {
    const items = standaloneQuestions
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
