import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Baby, Milk, Moon, NotebookPen, Pill, Ruler, type LucideIcon } from 'lucide-react';
import { useFormatMinutes } from '@/lib/useNow';
import type { LogEntry, LogType } from '@/data/types';
import { minutesBetween } from './logic';

export const LOG_ICONS: Record<LogType, LucideIcon> = {
  feed: Milk,
  diaper: Baby,
  sleep: Moon,
  med: Pill,
  measure: Ruler,
  note: NotebookPen,
};

export interface EntryText {
  title: string;
  detail: string;
}

/** Human-readable title and detail for an entry, e.g. "Feed" / "Left · 15 min". */
export function useDescribeEntry(): (entry: LogEntry, now?: Date) => EntryText {
  const { t } = useTranslation();
  const formatMinutes = useFormatMinutes();
  return useCallback(
    (entry, now = new Date()) => {
      const duration = () => formatMinutes(minutesBetween(entry.start, entry.end ?? now));
      switch (entry.type) {
        case 'feed': {
          if (entry.data.method === 'bottle') {
            const milk = entry.data.milk === 'breast' ? t('log.breastMilk') : t('log.formula');
            return { title: t('log.bottle'), detail: t('log.summary.bottle', { ml: entry.data.ml, milk }) };
          }
          const side = { left: t('log.left'), right: t('log.right'), both: t('log.bothSides') }[entry.data.side];
          const topUp = entry.data.topUp;
          const base = entry.end ? t('log.summary.breast', { side, duration: duration() }) : t('log.summary.breastRunning', { side });
          return {
            title: t('log.breast'),
            detail: topUp
              ? t('log.summary.withTopUp', {
                  base,
                  topUp: t('log.summary.bottle', { ml: topUp.ml, milk: topUp.milk === 'breast' ? t('log.breastMilk') : t('log.formula') }),
                })
              : base,
          };
        }
        case 'diaper':
          return {
            title: t('log.diaper'),
            detail: { wet: t('log.wet'), dirty: t('log.dirty'), both: t('log.wetDirty') }[entry.data.kind],
          };
        case 'sleep':
          return {
            title: t('log.sleep'),
            detail: entry.end ? t('log.summary.sleep', { duration: duration() }) : t('log.summary.sleepRunning'),
          };
        case 'med':
          return { title: entry.data.name, detail: entry.data.dose };
        case 'measure': {
          const parts = [];
          if (entry.data.weightG !== null) parts.push(t('log.summary.weight', { g: entry.data.weightG }));
          if (entry.data.lengthCm !== null) parts.push(t('log.summary.length', { cm: entry.data.lengthCm }));
          return { title: t('log.measure'), detail: parts.join(' · ') };
        }
        case 'note':
          return { title: t('log.note'), detail: entry.data.text };
        default:
          // An entry type from a newer version of the app.
          return { title: t('log.unknown'), detail: '' };
      }
    },
    [t, formatMinutes],
  );
}
