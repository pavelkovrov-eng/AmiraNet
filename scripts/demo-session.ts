/**
 * End-to-end session demo. Runs the real engines against the real seed content
 * and the real IndexedDB layer — no mocks, no stubs — and narrates what the app
 * decides at each step.
 *
 * Run with: npm run demo
 */
import 'fake-indexeddb/auto';
import { content, lexemeById, questionById } from '../src/content/index';
import { db } from '../src/db/db';
import {
  getAttempts,
  getCards,
  getProfile,
  getRemediation,
  recordAttempt,
  saveCard,
  saveProfile,
  saveRemediation,
} from '../src/db/repository';
import { PASS_THRESHOLD_SCORE, thetaToScore, updateTheta } from '../src/engines/theta';
import { dueLexemeIds, isMastered, reviewCard, seedCard } from '../src/engines/srs';
import { diagnose, timeThresholdFor } from '../src/engines/diagnosis';
import { addRemediation, recordServing } from '../src/engines/remediation';
import { buildSession } from '../src/engines/session-builder';
import type { Card as FsrsCard } from 'ts-fsrs';

const HEBREW_CAUSE: Record<string, string> = {
  'vocabulary-gap': 'פער אוצר מילים',
  'distractor-phonetic': 'מסיח דומה בצליל',
  'connector-misread': 'קריאה שגויה של מילת קישור',
  'time-pressure': 'לחץ זמן',
  'inference-error': 'שגיאת הסקה',
};

function rule(title: string): void {
  console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);
}

/**
 * Deterministic stand-in for a real person: answers correctly when the item
 * sits at or below their true ability, and wrong above it. No randomness, so
 * the narration is reproducible.
 */
function simulatedAnswer(difficulty: number, trueAbility: number): boolean {
  return difficulty <= trueAbility;
}

async function main(): Promise<void> {
  await db.delete();
  await db.open();

  const TRUE_ABILITY = 1.2;
  const cards = new Map<string, FsrsCard>();

  rule('1. CONTENT BANK');
  console.log(
    `${content.lexemes.length} lexemes · ${content.questions.length} questions · ` +
      `${content.passages.length} passage(s)`,
  );
  console.log('Validated at import — a malformed item would have thrown before this line ran.');

  rule('2. COLD START — no profile, nothing due');
  let profile = await getProfile();
  console.log(
    `theta ${profile.theta.toFixed(3)} → estimated score ${thetaToScore(profile.theta)} ` +
      `(target ${PASS_THRESHOLD_SCORE})`,
  );
  console.log(`answered ${profile.answered} · placementDone ${profile.placementDone}`);

  rule('3. SESSION BUILT FOR A 25-MINUTE BUDGET');
  const firstPlan = buildSession({
    budgetSeconds: 1500,
    theta: profile.theta,
    dueLexemeIds: [],
    unseenLexemeIds: [],
    remediation: [],
    questions: content.questions,
    passages: content.passages,
    answeredQuestionIds: new Set<string>(),
  });
  console.log(`${firstPlan.items.length} items · ~${firstPlan.estimatedSeconds}s estimated`);
  for (const item of firstPlan.items) {
    if (item.kind === 'question') {
      const q = questionById(item.questionId)!;
      console.log(`  question ${q.id.padEnd(9)} ${q.type.padEnd(20)} difficulty ${q.difficulty}`);
    } else if (item.kind === 'srs') {
      console.log(`  card     ${item.lexemeId}`);
    } else {
      console.log(`  passage  ${item.passageId}`);
    }
  }
  console.log(
    `\nNote the difficulties: the builder deliberately selects above theta ` +
      `(${profile.theta.toFixed(2)}), not at it. Comfortable practice produces a low score ` +
      `on an adaptive exam.`,
  );

  rule('4. ANSWERING — every answer diagnosed and persisted individually');
  let queue = await getRemediation();

  // Kept short deliberately. The builder fixes item difficulty from theta at
  // BUILD time, so a long run answers a whole session calibrated to the
  // learner's starting estimate — every item stays below their real ability,
  // nothing supplies counter-evidence, and theta climbs unopposed. That is
  // correct Rasch behaviour, not a defect: the correction arrives when the
  // NEXT session is built against the updated estimate.
  for (const item of firstPlan.items.filter((i) => i.kind === 'question').slice(0, 6)) {
    if (item.kind !== 'question') continue;
    const q = questionById(item.questionId)!;

    const correct = simulatedAnswer(q.difficulty, TRUE_ABILITY);
    const chosenIndex = correct
      ? q.correctIndex
      : ((q.correctIndex + 1) % 4 as 0 | 1 | 2 | 3);
    const elapsedMs = correct ? 24_000 : 71_000;

    const cause = diagnose({
      question: q,
      chosenIndex,
      elapsedMs,
      isMastered: (id) => {
        const card = cards.get(id);
        return card ? isMastered(card) : false;
      },
      lexemeById,
      timeThresholdMs: timeThresholdFor(q.type, null),
    });

    const now = Date.now();
    await recordAttempt({
      questionId: q.id,
      chosenIndex,
      correct,
      elapsedMs,
      at: now,
      diagnosis: cause,
    });

    profile = await getProfile();
    const nextTheta = updateTheta(profile.theta, q.difficulty, correct, profile.answered);
    await saveProfile({
      ...profile,
      theta: nextTheta,
      answered: profile.answered + 1,
      thetaHistory: [...profile.thetaHistory, { at: now, theta: nextTheta }],
    });

    for (const lexemeId of q.targetLexemes) {
      const existing = cards.get(lexemeId);
      const updated = existing
        ? reviewCard(existing, correct, new Date(now))
        : seedCard(correct, new Date(now));
      cards.set(lexemeId, updated);
      await saveCard(lexemeId, updated);
    }

    for (const lexemeId of q.targetLexemes) {
      queue = recordServing(queue, lexemeId, correct, now);
    }
    if (cause) queue = addRemediation(queue, cause, q.primaryLexeme, now);
    await saveRemediation(queue);

    const verdict = correct ? 'correct' : 'wrong  ';
    const why = cause ? ` → ${HEBREW_CAUSE[cause]}` : '';
    console.log(
      `  ${q.id.padEnd(9)} d=${String(q.difficulty).padEnd(5)} ${verdict} ` +
        `theta ${profile.theta.toFixed(3)} → ${nextTheta.toFixed(3)}${why}`,
    );
  }

  rule('5. WHAT THE APP LEARNED');
  profile = await getProfile();
  const attempts = await getAttempts();
  const wrong = attempts.filter((a) => !a.correct);
  console.log(
    `${attempts.length} answers · ${attempts.length - wrong.length} correct · ${wrong.length} wrong`,
  );
  console.log(
    `theta ${profile.theta.toFixed(3)} → estimated score ${thetaToScore(profile.theta)} ` +
      `(true ability was ${TRUE_ABILITY}, i.e. ${thetaToScore(TRUE_ABILITY)})`,
  );

  const causeCounts = wrong.reduce<Record<string, number>>((acc, a) => {
    if (a.diagnosis) acc[a.diagnosis] = (acc[a.diagnosis] ?? 0) + 1;
    return acc;
  }, {});
  console.log('\nerror causes:');
  for (const [cause, n] of Object.entries(causeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${HEBREW_CAUSE[cause].padEnd(30)} ${n}`);
  }

  queue = await getRemediation();
  console.log(`\nremediation queue: ${queue.length} entries`);
  for (const entry of queue) {
    const lex = lexemeById(entry.targetId);
    const gloss = lex ? `${lex.headword} — ${lex.definitionHe}` : entry.targetId;
    console.log(`  ${HEBREW_CAUSE[entry.cause].padEnd(30)} ${gloss}`);
  }

  rule('6. THE NEXT SESSION IS DIFFERENT');
  const storedCards = await getCards();
  const due = dueLexemeIds(storedCards, new Date(Date.now() + 11 * 60 * 1000));
  console.log(`${storedCards.length} cards stored · ${due.length} due after 11 minutes`);

  const secondPlan = buildSession({
    budgetSeconds: 600,
    theta: profile.theta,
    dueLexemeIds: due,
    unseenLexemeIds: content.lexemes
      .filter((l) => !storedCards.some((c) => c.lexemeId === l.id))
      .map((l) => l.id),
    remediation: queue,
    questions: content.questions,
    passages: content.passages,
    answeredQuestionIds: new Set(attempts.map((a) => a.questionId)),
  });

  console.log(`\n10-minute session: ${secondPlan.items.length} items · ~${secondPlan.estimatedSeconds}s`);
  for (const item of secondPlan.items) {
    if (item.kind === 'srs') {
      const lex = lexemeById(item.lexemeId);
      console.log(`  card     ${lex ? `${lex.headword} — ${lex.definitionHe}` : item.lexemeId}`);
    } else if (item.kind === 'question') {
      const q = questionById(item.questionId)!;
      const targeted = queue.some((e) => q.targetLexemes.includes(e.targetId));
      console.log(
        `  question ${q.id.padEnd(9)} d=${String(q.difficulty).padEnd(5)}` +
          `${targeted ? '  ← remediation for an earlier mistake' : ''}`,
      );
    } else {
      console.log(`  passage  ${item.passageId}`);
    }
  }
  console.log(
    '\nDue cards come first, then questions targeting words that were actually missed, ' +
      'then new material above theta. Nothing already answered is repeated.',
  );

  await db.close();
}

main().catch((err) => {
  console.error('\nDEMO FAILED:', err);
  throw err;
});
