import { supabase } from '../lib/supabase';
import { db } from './db';
import { exportBackup, type Backup } from './backup';
import { mergeBackups, recomputeProfile } from '../engines/merge';
import { questionById } from '../content/index';

const TABLE = 'progress';

export interface SyncResult {
  attempts: number;
  cards: number;
  /** True when the remote had nothing yet and this device seeded it. */
  seededRemote: boolean;
}

/**
 * Reconciles this device with the server, in both directions, in one pass.
 *
 * Deliberately merge-then-write rather than "newest device wins". Two devices
 * both hold real work — an answer given on a phone and an answer given on a
 * laptop are both facts — so the only correct resolution is the union, which
 * is what engines/merge.ts computes. Whichever device syncs second would
 * otherwise erase the first one's session.
 *
 * The merge runs locally rather than in the database because it needs the
 * question bank: the ability estimate is re-folded over the merged answers,
 * and that fold needs each question's difficulty. Putting the content bundle
 * on the server to avoid one round trip would be a poor trade.
 */
export async function syncProgress(): Promise<SyncResult> {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user) throw new Error('Not signed in');

  const local = await exportBackup();

  const { data, error } = await supabase
    .from(TABLE)
    .select('payload')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;

  const remote = data?.payload as Backup | undefined;
  const merged = remote ? mergeBackups(local, remote) : local;
  if (remote) {
    merged.profile = recomputeProfile(local.profile, remote.profile, merged.attempts, (id) =>
      questionById(id)?.difficulty,
    );
  }

  // Local first. If the upload then fails, this device still holds everything
  // both sides had, and the next sync will push it — the opposite order could
  // leave the server ahead of a device that never received the merge.
  await writeLocal(merged);

  const { error: upsertError } = await supabase
    .from(TABLE)
    .upsert({ user_id: user.id, payload: merged }, { onConflict: 'user_id' });
  if (upsertError) throw upsertError;

  return {
    attempts: merged.attempts.length,
    cards: merged.cards.length,
    seededRemote: !remote,
  };
}

async function writeLocal(merged: Backup): Promise<void> {
  await db.transaction('rw', db.profile, db.cards, db.attempts, db.remediation, async () => {
    await Promise.all([
      db.profile.clear(),
      db.cards.clear(),
      db.attempts.clear(),
      db.remediation.clear(),
    ]);
    await db.profile.put(merged.profile);
    await db.cards.bulkAdd(merged.cards);
    await db.attempts.bulkAdd(merged.attempts);
    await db.remediation.bulkAdd(
      merged.remediation.map((e) => ({ ...e, key: `${e.cause}:${e.targetId}` })),
    );
  });
}

/**
 * Sends a sign-in link. No password is ever entered or stored — the email is
 * the only thing the learner types, and it is what makes the phone and the
 * laptop the same user.
 */
export async function sendSignInLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
