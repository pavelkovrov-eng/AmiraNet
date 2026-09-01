import { createClient } from '@supabase/supabase-js';

/**
 * Sync backend.
 *
 * Both values below are public by design and ship inside a public repository.
 * That is safe only because row level security decides what the publishable
 * key can reach — see supabase/schema.sql, which must be applied before this
 * key does anything useful. A key without those policies would let anyone who
 * reads the repo touch the table.
 *
 * The service_role key is a different thing entirely: it bypasses RLS, and it
 * must never appear in this file or anywhere else in this repository.
 */
export const SUPABASE_URL = 'https://nousqiqvrablcijnknkq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_4QMw6tH4G_y3G2rIKL8dDg_j-yMuMGu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // The session has to survive a reload and an app relaunch from the home
    // screen; signing in once per device is the whole point of using email
    // links rather than a password.
    persistSession: true,
    autoRefreshToken: true,
    // The magic link returns with the session in the URL fragment.
    detectSessionInUrl: true,
  },
});
