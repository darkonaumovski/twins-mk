/** Remind about a backup when the last one from this phone is older than this. */
export const BACKUP_REMINDER_DAYS = 7;

/**
 * A gentle reminder to download a backup: only while sync is off (with sync the other
 * phone holds a copy), and when this phone never made one or the last is over a week old.
 */
export function needsBackupReminder(input: { syncOn: boolean; lastBackup: string | null; now: Date }): boolean {
  if (input.syncOn) return false;
  if (!input.lastBackup) return true;
  const last = Date.parse(input.lastBackup);
  if (Number.isNaN(last)) return true;
  return input.now.getTime() - last > BACKUP_REMINDER_DAYS * 24 * 3600_000;
}

export const LAST_BACKUP_KEY = 'twinsmk.lastBackup';
const BACKUP_EVENT = 'twinsmk:backup';

/** When this phone last downloaded or sent a backup (kept on the phone only). */
export function readLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

export function markBackupDone(now = new Date()): string {
  const iso = now.toISOString();
  try {
    localStorage.setItem(LAST_BACKUP_KEY, iso);
  } catch {
    /* only used for the "last backup" hint and reminder */
  }
  window.dispatchEvent(new Event(BACKUP_EVENT));
  return iso;
}

/** Calls back when a backup was made on this phone (so reminders can disappear right away). */
export function onBackupDone(listener: () => void): () => void {
  window.addEventListener(BACKUP_EVENT, listener);
  return () => window.removeEventListener(BACKUP_EVENT, listener);
}
