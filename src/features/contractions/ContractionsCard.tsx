import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Timer } from 'lucide-react';
import { useLive } from '@/data/StoreContext';
import { useNow } from '@/lib/useNow';
import { formatSeconds, lastHourSummary, runningContraction } from './logic';

/** A link to the contraction timer, with the last hour in one line. */
export function ContractionsCard() {
  const { t } = useTranslation();
  const now = useNow(10_000);
  const list = useLive((s) => s.contractions.list(), []);
  if (!list) return null;
  const running = runningContraction(list);
  const hour = lastHourSummary(list, now);
  const line = running
    ? t('contractions.cardRunning')
    : hour.count > 0
      ? hour.avgIntervalSec === null
        ? t('contractions.cardHourCount', { count: hour.count })
        : t('contractions.cardHour', { count: hour.count, interval: formatSeconds(hour.avgIntervalSec) })
      : t('contractions.cardIdle');

  return (
    <Link to="/contractions" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:bg-surface-2">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Timer size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{t('contractions.title')}</span>
        <span className="block text-sm text-muted">{line}</span>
      </span>
      <ChevronRight aria-hidden size={20} className="text-muted" />
    </Link>
  );
}
