import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { sendSignInLink, signOut, syncProgress } from '../../db/sync';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

/**
 * Sign in once per device, then pull-merge-push on demand.
 *
 * Email link rather than a password: nothing secret is typed into the app or
 * stored by it, and signing in with the same address on the phone and the
 * laptop is what makes them one account rather than two.
 */
export function SyncControls() {
  const [email, setEmail] = useState('');
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSignedInAs(data.session?.user.email ?? null);
    });
    // Covers the return trip from the email link, which lands back on this
    // page with the session in the URL fragment.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedInAs(session?.user.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSend() {
    setStatus({ kind: 'busy', message: 'שולח קישור…' });
    try {
      await sendSignInLink(email.trim());
      setStatus({ kind: 'ok', message: `נשלח קישור ל-${email.trim()}. פתח אותו מהמכשיר הזה.` });
    } catch (err) {
      setStatus({ kind: 'error', message: 'שליחת הקישור נכשלה.' });
      console.error('Sign-in link failed', err);
    }
  }

  async function handleSync() {
    setStatus({ kind: 'busy', message: 'מסנכרן…' });
    try {
      const result = await syncProgress();
      setStatus({
        kind: 'ok',
        message: result.seededRemote
          ? `הועלו ${result.attempts} תשובות ו-${result.cards} כרטיסיות.`
          : `מסונכרן: ${result.attempts} תשובות, ${result.cards} כרטיסיות.`,
      });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setStatus({ kind: 'error', message: 'הסנכרון נכשל. ההתקדמות המקומית לא נפגעה.' });
      console.error('Sync failed', err);
    }
  }

  return (
    <section className="sync" aria-labelledby="sync-heading">
      <h2 id="sync-heading">סנכרון בין מכשירים</h2>

      {signedInAs ? (
        <>
          <p className="sync-account">
            מחובר כ־<strong>{signedInAs}</strong>
          </p>
          <div className="backup-actions">
            <button type="button" className="btn-primary" onClick={() => void handleSync()}>
              סנכרן עכשיו
            </button>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => void signOut().then(() => setSignedInAs(null))}
            >
              התנתק
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="backup-why">
            התחבר עם אותה כתובת מייל בטלפון ובמחשב, ושניהם יראו את אותה התקדמות. לא נשמרת סיסמה —
            רק קישור חד־פעמי למייל.
          </p>
          <label className="sync-email">
            <span className="eyebrow">כתובת מייל</span>
            <input
              type="email"
              value={email}
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <div className="backup-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={!email.includes('@')}
              onClick={() => void handleSend()}
            >
              שלח קישור התחברות
            </button>
          </div>
        </>
      )}

      {status.kind !== 'idle' && (
        <p
          className={`backup-status backup-status--${status.kind === 'error' ? 'error' : 'ok'}`}
          role="status"
          aria-label={status.kind === 'error' ? 'שגיאת סנכרון' : 'מצב סנכרון'}
        >
          <span className="backup-glyph" aria-hidden="true">
            {status.kind === 'error' ? '✕' : status.kind === 'busy' ? '…' : '✓'}
          </span>
          {status.message}
        </p>
      )}
    </section>
  );
}
