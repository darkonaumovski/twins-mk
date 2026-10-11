import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CloudOff, TriangleAlert } from 'lucide-react';
import { useSyncStatus } from '@/data/sync/SyncContext';

/** A small header icon, shown only when sync needs attention: offline with unsent changes, or failing. */
export function SyncBadge() {
  const { t } = useTranslation();
  const status = useSyncStatus();

  const offline = status.state === 'offline' && status.pending > 0;
  const error = status.state === 'error';
  if (!offline && !error) return null;

  const label = error ? t('sync.badgeError') : t('sync.badgeOffline');
  return (
    <Link
      to="/settings"
      aria-label={label}
      title={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-2"
    >
      {error ? <TriangleAlert aria-hidden size={20} className="text-danger" /> : <CloudOff aria-hidden size={20} className="text-warn" />}
    </Link>
  );
}
