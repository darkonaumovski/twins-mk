import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Moon, Sunrise, X } from 'lucide-react';
import { IconButton } from '@/components/Button';
import { useDevicePrefs, useLive, useSettings, useStore } from '@/data/StoreContext';
import { useCaregiverName } from '@/lib/caregivers';
import { useFormatMinutes } from '@/lib/useNow';
import { SLOTS } from '@/features/log/logic';
import { colorOf, TwinBadge, useTwinName, type Babies } from '@/features/twins/twins';
import { handoverSummary, onDutyNow } from './logic';

const DAY_MS = 24 * 3600_000;

/** Remembers when this phone last left the app, for "since you last opened". Not synced. */
export function LastSeenTracker() {
  const store = useStore();
  useEffect(() => {
    const mark = () => {
      if (document.visibilityState === 'hidden') void store.device.update({ lastSeenAt: new Date().toISOString() });
    };
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [store]);
  return null;
}

/** "Since you last opened (03:10)": per twin what was logged meanwhile, and by whom. */
export function HandoverCard({ babies, now }: { babies: Babies; now: Date }) {
  const { t } = useTranslation();
  const store = useStore();
  const prefs = useDevicePrefs();
  const name = useTwinName(babies);
  const who = useCaregiverName();
  const fmt = useFormatMinutes();
  const lastSeenAt = prefs?.lastSeenAt ?? null;
  // A sleep that started before still counts for the time since, so look back one more day.
  const entries = useLive(
    (s) =>
      lastSeenAt
        ? s.logs.listBetween(new Date(new Date(lastSeenAt).getTime() - DAY_MS).toISOString(), new Date(Date.now() + 60_000).toISOString())
        : Promise.resolve([]),
    [lastSeenAt],
  );
  const handover = entries ? handoverSummary(entries, lastSeenAt, now) : null;
  if (!handover) return null;

  const dismiss = () => store.device.update({ lastSeenAt: new Date().toISOString() });

  return (
    <section aria-labelledby="handover-title" className="space-y-2 rounded-2xl border border-accent/40 bg-accent-soft p-3">
      <div className="flex items-center gap-2">
        <Sunrise aria-hidden size={20} className="shrink-0 text-accent" />
        <h2 id="handover-title" className="flex-1 font-semibold">
          {t('handover.title', { time: format(handover.since, 'HH:mm') })}
        </h2>
        <IconButton label={t('handover.dismiss')} onClick={dismiss}>
          <X aria-hidden size={20} />
        </IconButton>
      </div>
      <ul className="space-y-1.5 text-sm">
        {SLOTS.map((slot) => {
          const s = handover.perTwin[slot];
          const parts = [
            t('handover.feeds', { count: s.feeds }) + (s.ml > 0 ? ` (${t('summary.ml', { ml: s.ml })})` : ''),
            t('handover.diapers', { count: s.diapers }) +
              (s.diapers > 0 ? ` (${t('summary.diaperDetail', { wet: s.wet, dirty: s.dirty })})` : ''),
            s.sleepMinutes > 0 ? t('handover.sleep', { duration: fmt(s.sleepMinutes) }) : null,
            s.meds > 0 ? t('handover.meds', { count: s.meds }) : null,
          ].filter(Boolean);
          return (
            <li key={slot} className="flex items-start gap-2">
              <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
              <span>
                <span className="font-semibold">{name(slot)}:</span> {parts.join(' · ')}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted">{t('handover.by', { names: handover.loggedBy.map(who).join(', ') })}</p>
    </section>
  );
}

/** "On duty now: Marija until 02:00", while a night shift is running. */
export function DutyLine({ now }: { now: Date }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const who = useCaregiverName();
  const duty = settings ? onDutyNow(settings.nightShifts, now) : null;
  if (!duty) return null;
  return (
    <p className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-medium">
      <Moon aria-hidden size={16} className="shrink-0 text-accent" />
      {t('duty.now', { name: who(duty.caregiverId), until: format(duty.until, 'HH:mm') })}
    </p>
  );
}
