import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive } from 'lucide-react';
import { useDevicePrefs } from '@/data/StoreContext';
import { needsBackupReminder, onBackupDone, readLastBackup } from './backupLogic';

/** A gentle note when sync is off and the last backup from this phone is over a week old. */
export function BackupReminder({ link = false }: { link?: boolean }) {
  const { t } = useTranslation();
  const prefs = useDevicePrefs();
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  useEffect(() => onBackupDone(() => setLastBackup(readLastBackup())), []);
  if (!prefs || !needsBackupReminder({ syncOn: Boolean(prefs.sync), lastBackup, now: new Date() })) return null;

  const body = (
    <>
      <Archive aria-hidden size={20} className="mt-0.5 shrink-0 text-accent" />
      <span>
        <span className="block font-semibold">{lastBackup ? t('backup.reminderOld') : t('backup.reminderNever')}</span>
        <span className="block text-sm text-muted">{t('backup.reminderHint')}</span>
      </span>
    </>
  );
  return link ? (
    <Link to="/settings" className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-3">
      {body}
    </Link>
  ) : (
    <p role="status" className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-3">
      {body}
    </p>
  );
}
