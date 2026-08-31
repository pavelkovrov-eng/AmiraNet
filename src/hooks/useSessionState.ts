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
      for (const lexemeId of question.targetLexemes ?? []) {
        const existing = nextCards.get(lexemeId);
        const updated = existing
          ? reviewCard(existing, correct, new Date(now))
          : seedCard(correct, new Date(now));
        nextCards.set(lexemeId, updated);
        await saveCard(lexemeId, updated);
      }
      setCards(nextCards);

      let queue = await getRemediation();
      for (const lexemeId of question.targetLexemes ?? []) {
        queue = recordServing(queue, lexemeId, correct, now);
      }
      if (cause) {
        // Remediate the word the item was actually testing, not an incidental
        // distractor that happens to sort first.
        queue = addRemediation(queue, cause, question.primaryLexeme, now);
      }
      await saveRemediation(queue);

      return { correct, cause };
    },
    [cards, masteredCheck],
  );

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

  // A lexeme with no FSRS record has never been shown. New words get the
  // reveal card; words already met get scored multiple choice.
  const hasSeenLexeme = useCallback((lexemeId: string) => cards.has(lexemeId), [cards]);

  return {
    ready,
    submitAnswer,
    reviewLexeme,
    hasSeenLexeme,
    totalQuestions: content.questions.length,
  };
}
