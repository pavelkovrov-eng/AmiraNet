import { useRef, useState } from 'react';
import { exportBackup, importBackup, resetProgress } from '../../db/backup';

type Status =
  | { kind: 'idle' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

/**
 * Export and restore the whole progress record as a JSON file.
 *
 * On iOS this is not a convenience. A home-screen web app's IndexedDB can be
 * evicted under storage pressure with no warning, and this database is the
 * only copy of the user's study history — there is no server behind it.
 */
export function BackupControls() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleReset() {
    try {
      await resetProgress();
      setStatus({ kind: 'ok', message: 'ההתקדמות אופסה. טוען מחדש…' });
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setStatus({ kind: 'error', message: 'האיפוס נכשל. ההתקדמות נשארה כפי שהיא.' });
      console.error('Reset failed', err);
    }
  }

  async function handleExport() {
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `amirnet-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus({
        kind: 'ok',
        message: `נשמרו ${backup.cards.length} כרטיסיות ו-${backup.attempts.length} תשובות.`,
      });
    } catch (err) {
      setStatus({ kind: 'error', message: 'הייצוא נכשל. ההתקדמות לא נפגעה.' });
      console.error('Export failed', err);
    }
  }

  async function handleImport(file: File) {
    try {
      await importBackup(JSON.parse(await file.text()));
      setStatus({ kind: 'ok', message: 'ההתקדמות שוחזרה. טוען מחדש…' });
      // A full reload rather than juggling local state: every screen reads
      // this data on mount, and half-refreshed screens would show a mix of
      // the old and the restored record.
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setStatus({
        kind: 'error',
        message:
          err instanceof Error && /Corrupt backup|Unsupported/.test(err.message)
            ? 'הקובץ אינו גיבוי תקין. ההתקדמות הקיימת נשארה כפי שהיא.'
            : 'השחזור נכשל. ההתקדמות הקיימת נשארה כפי שהיא.',
      });
      console.error('Import failed', err);
    }
  }

  return (
    <section aria-labelledby="backup-heading" className="backup">
      <h2 id="backup-heading">גיבוי</h2>
      <p className="backup-why">
        ההתקדמות נשמרת רק במכשיר הזה. בטלפון היא עלולה להימחק בלי התראה, אז כדאי לייצא מדי פעם.
      </p>

      <div className="backup-actions">
        <button type="button" onClick={() => void handleExport()}>
          ייצוא לקובץ
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          שחזור מקובץ
        </button>
      </div>

      {/* Irreversible and unrecoverable - there is no server copy to restore
          from - so it asks first, and the confirmation names what is lost
          rather than saying "are you sure". */}
      <section className="danger-zone" aria-labelledby="reset-heading">
        <h3 id="reset-heading">התחלה מחדש</h3>
        {confirmReset ? (
          <div className="confirm-dialog">
            <p>
              פעולה זו מוחקת את מבחן המיקום, כל התשובות, כרטיסיות החזרה ואומדן הציון. אין דרך
              לשחזר אותם אלא מקובץ גיבוי שייצאת קודם.
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setConfirmReset(false)}>
                ביטול
              </button>
              <button type="button" className="btn-danger" onClick={() => void handleReset()}>
                כן, מחק הכול
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)}>
            איפוס ההתקדמות
          </button>
        )}
      </section>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        aria-label="בחירת קובץ גיבוי"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleImport(file);
        }}
      />

      {status.kind !== 'idle' && (
        <p
          className={`backup-status backup-status--${status.kind}`}
          role="status"
          aria-label={status.kind === 'error' ? 'שגיאת גיבוי' : 'מצב גיבוי'}
        >
          <span className="backup-glyph" aria-hidden="true">
            {status.kind === 'error' ? '✕' : '✓'}
          </span>
          {status.message}
        </p>
      )}
    </section>
  );
}
