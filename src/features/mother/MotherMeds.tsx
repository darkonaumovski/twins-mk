import { useTranslation } from 'react-i18next';
import { Check, Minus, Pill } from 'lucide-react';
import { cx } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useDevicePrefs, useStore } from '@/data/StoreContext';
import type { Routine } from '@/data/types';
import { dayBounds } from '@/features/log/logic';
import { motherCareStatus, type MotherCareRow } from '@/features/plan/logic';
import { useMedData, useMedGuard } from '@/features/plan/useMeds';
import { useFormatAgo } from '@/lib/useNow';

/** One tap logs a dose for the mother (after the same interval check as the twins' medicines). */
export function useGiveMotherMed() {
  const { t } = useTranslation();
  const store = useStore();
  const prefs = useDevicePrefs();
  const guard = useMedGuard();
  const toast = useToast();
  return async (name: string, dose: string, start = new Date().toISOString()) => {
    if (!(await guard(['mother'], name))) return;
    const created = await store.motherLogs.create({ type: 'med', start, data: { name, dose }, loggedBy: prefs?.parent ?? 'p1' });
    toast({
      message: t('mother.logged', { med: name }),
      action: { label: t('common.undo'), onClick: () => void store.motherLogs.remove(created.id) },
    });
  };
}

/** Rows for today's medicines "for the mother", or null when she has none. */
export function useMotherCare(now: Date) {
  const data = useMedData();
  if (!data) return undefined;
  const { from, to } = dayBounds(now);
  // "Last given" counts up to this moment, not the page clock (which may be a little behind a dose just logged).
  return motherCareStatus(data.routines, data.logs, new Date(from), new Date(to), new Date(Math.max(now.getTime(), Date.now())));
}

/** Her daily medicines with ✓ or – for today and when each was last given; one tap logs a dose. */
export function MotherMedsList({ now }: { now: Date }) {
  const rows = useMotherCare(now);
  return rows ? <MotherMedsRows rows={rows} now={now} /> : null;
}

/** The rows themselves, for a caller that already has them (Today's card). */
export function MotherMedsRows({ rows, now }: { rows: MotherCareRow[]; now: Date }) {
  const { t } = useTranslation();
  const give = useGiveMotherMed();
  const ago = useFormatAgo();
  if (rows.length === 0) return <p className="text-sm text-muted">{t('mother.noMeds')}</p>;

  const tap = (routine: Routine) => void give(routine.med!.name, routine.med!.dose);
  return (
    <ul className="space-y-2">
      {rows.map(({ routine, given, planned, lastAt }) => {
        const done = given >= planned;
        return (
          <li key={routine.id}>
            <button
              type="button"
              onClick={() => tap(routine)}
              aria-label={done ? t('mother.given', { med: routine.title }) : t('mother.give', { med: routine.title })}
              className={cx(
                'flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition active:scale-[0.98]',
                done ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2',
              )}
            >
              <Pill aria-hidden size={20} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {routine.title}
                  {routine.med?.dose && <span className="font-normal text-muted"> · {routine.med.dose}</span>}
                </span>
                <span className="block text-sm text-muted">
                  {lastAt ? t('mother.lastGiven', { when: ago(lastAt, now) }) : t('mother.neverGiven')}
                </span>
              </span>
              {planned > 1 && <span className="text-sm font-semibold tabular-nums">{t('med.count', { given, planned })}</span>}
              {done ? <Check aria-hidden size={22} strokeWidth={3} /> : <Minus aria-hidden size={22} className="text-muted" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
