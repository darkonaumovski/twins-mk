import { useTranslation } from 'react-i18next';
import { finishedPumps } from '@/features/milk/logic';
import { Hospital, Milk, UserRound } from 'lucide-react';
import { useLive } from '@/data/StoreContext';
import { useFormatAgo } from '@/lib/useNow';
import { useLogUI } from '@/features/log/LogUIContext';
import { useLogActions } from '@/features/log/useLogActions';
import { colorOf, twinStyle, TwinBadge, useTwinName, type Babies } from './twins';
import { awaySlots } from './useAge';

/**
 * While a twin is in hospital, Today puts pumping and visits first:
 * when milk was last pumped, and one tap to log a pumping session or a visit.
 */
export function HospitalStrip({ babies, now }: { babies: Babies; now: Date }) {
  const { t } = useTranslation();
  const ui = useLogUI();
  const { log } = useLogActions();
  const ago = useFormatAgo();
  const name = useTwinName(babies);
  const lastPump = useLive(async (s) => finishedPumps(await s.pumps.list()).sort((a, b) => b.start.localeCompare(a.start))[0] ?? null, []);
  const away = awaySlots(babies);
  if (away.length === 0) return null;

  const visit = (slot: (typeof away)[number]) =>
    log(slot, { type: 'note', data: { text: t('hospital.visitNote') }, start: new Date().toISOString(), end: null }, t('hospital.visit'));

  return (
    <section aria-label={t('hospital.title')} className="space-y-3 rounded-2xl border border-line bg-surface p-3">
      <p className="flex items-center gap-2 font-semibold">
        <Hospital aria-hidden size={20} className="shrink-0 text-accent" />
        {t('hospital.title')}
      </p>
      <p className="text-sm text-muted">
        {lastPump ? t('hospital.lastPumped', { when: ago(lastPump.start, now), ml: lastPump.totalMl }) : t('hospital.noPump')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => ui.pump()}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent px-3 font-semibold text-on-accent"
        >
          <Milk aria-hidden size={20} />
          {t('milk.pump')}
        </button>
        {away.map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => void visit(slot)}
            style={twinStyle(colorOf(babies, slot))}
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-(--tw) bg-(--tw-soft) px-3 text-sm font-semibold text-(--tw-ink)"
          >
            <UserRound aria-hidden size={18} />
            <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
            {t('hospital.visitFor', { name: name(slot) })}
          </button>
        ))}
      </div>
    </section>
  );
}
