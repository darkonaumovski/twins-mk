import { useTranslation } from 'react-i18next';
import { Check, Minus, Pill } from 'lucide-react';
import { cx } from '@/components/ui';
import { colorOf, twinStyle, TwinBadge, useBabies, useTwinName } from '@/features/twins/twins';
import { awaySlots } from '@/features/twins/useAge';
import { dayBounds } from '@/features/log/logic';
import { useLogActions } from '@/features/log/useLogActions';
import type { Routine, TwinSlot } from '@/data/types';
import { dailyCareStatus } from './logic';
import { useMedData, useMedGuard } from './useMeds';

/**
 * Today's "Daily care": every active daily medicine routine with ✓ or – per twin
 * for today. One tap logs the dose for that twin (after the interval check).
 */
export function DailyCareSection({ now }: { now: Date }) {
  const { t } = useTranslation();
  const babies = useBabies();
  const name = useTwinName(babies);
  const data = useMedData();
  const guard = useMedGuard();
  const { log } = useLogActions();
  if (!data) return null;

  const { from, to } = dayBounds(now);
  const rows = dailyCareStatus(data.routines, data.logs, new Date(from), new Date(to), awaySlots(babies));
  if (rows.length === 0) return null;

  const give = async (routine: Routine, slot: TwinSlot) => {
    const med = routine.med!;
    if (!(await guard([slot], med.name))) return;
    await log(slot, { type: 'med', data: { name: med.name, dose: med.dose }, start: new Date().toISOString(), end: null }, med.name);
  };

  return (
    <section className="space-y-2" aria-labelledby="daily-care-title">
      <h2 id="daily-care-title" className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">
        {t('med.dailyCare')}
      </h2>
      <ul className="space-y-2">
        {rows.map(({ routine, cells }) => (
          <li key={routine.id} className="rounded-2xl border border-line bg-surface p-3">
            <p className="mb-2 flex items-center gap-2 font-medium">
              <Pill aria-hidden size={18} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">{routine.title}</span>
              {routine.med?.dose && <span className="shrink-0 text-sm text-muted">{routine.med.dose}</span>}
            </p>
            <div className={cx('grid gap-2', cells.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
              {cells.map(({ slot, given, planned }) => {
                const done = given >= planned;
                const label = done
                  ? t('med.givenToday', { name: name(slot), med: routine.title })
                  : t('med.giveNow', { name: name(slot), med: routine.title });
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => void give(routine, slot)}
                    aria-label={label}
                    style={twinStyle(colorOf(babies, slot))}
                    className={cx(
                      'flex min-h-14 items-center gap-2 rounded-xl border-2 px-3 text-left font-semibold transition active:scale-[0.98]',
                      done ? 'border-(--tw) bg-(--tw-soft) text-(--tw-ink)' : 'border-line bg-surface-2',
                    )}
                  >
                    <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{name(slot)}</span>
                    {planned > 1 && <span className="text-sm tabular-nums">{t('med.count', { given, planned })}</span>}
                    {done ? <Check aria-hidden size={22} strokeWidth={3} /> : <Minus aria-hidden size={22} className="text-muted" />}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
