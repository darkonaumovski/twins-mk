import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useLive } from '@/data/StoreContext';
import { useFormatMinutes } from '@/lib/useNow';
import { useCaregiverName } from '@/lib/caregivers';
import { Milk } from 'lucide-react';
import type { ISODate, LogEntry, Pump } from '@/data/types';
import { LOG_ICONS, useDescribeEntry } from '@/features/log/describe';
import { BABY_IDS, minutesBetween, SLOTS } from '@/features/log/logic';
import { isRunningPump } from '@/features/milk/logic';
import { useLogUI } from '@/features/log/LogUIContext';
import { colorOf, twinStyle, TwinBadge, useTwinName, type Babies } from '@/features/twins/twins';
import { localDay, summarize } from './summary';

const DAY_MS = 24 * 3600_000;

/**
 * Entries for a local day, plus the day before (a sleep that started last night
 * still counts towards this day's sleep). `starting` holds only those that start on the day.
 */
export function useDayEntries(date: ISODate) {
  return useLive(
    async (s) => {
      const { from, to } = localDay(date);
      const all = await s.logs.listBetween(new Date(from.getTime() - DAY_MS).toISOString(), to.toISOString());
      const fromIso = from.toISOString();
      const toIso = to.toISOString();
      // Pumping sessions are few, so filtering the whole collection is fine.
      const pumps = (await s.pumps.list()).filter((p) => p.start >= fromIso && p.start < toIso);
      return { all, starting: all.filter((e) => e.start >= fromIso), pumps };
    },
    [date],
  );
}

export function DaySummaryView({ date, entries, babies, now }: { date: ISODate; entries: LogEntry[]; babies: Babies; now: Date }) {
  const { t } = useTranslation();
  const name = useTwinName(babies);
  const fmt = useFormatMinutes();
  const { from, to } = localDay(date);

  return (
    <section aria-label={t('summary.title')} className="grid grid-cols-2 gap-3">
      {SLOTS.map((slot) => {
        const s = summarize(entries, BABY_IDS[slot], from, to, now);
        const feedParts = [String(s.feeds)];
        if (s.ml > 0) feedParts.push(t('summary.ml', { ml: s.ml }));
        if (s.breastMinutes > 0) feedParts.push(t('summary.breast', { duration: fmt(s.breastMinutes) }));
        const rows = [
          { label: t('summary.feeds'), icon: LOG_ICONS.feed, value: feedParts.join(' · ') },
          {
            label: t('summary.diapers'),
            icon: LOG_ICONS.diaper,
            value: String(s.diapers),
            detail: t('summary.diaperDetail', { wet: s.wet, dirty: s.dirty }),
          },
          { label: t('summary.sleep'), icon: LOG_ICONS.sleep, value: fmt(s.sleepMinutes) },
        ];
        const care = [
          s.spitups > 0 && t('summary.spitups', { count: s.spitups }),
          s.baths > 0 && t('summary.baths', { count: s.baths }),
          s.tummyMinutes > 0 && t('summary.tummy', { duration: fmt(s.tummyMinutes) }),
        ].filter(Boolean);
        if (care.length) rows.push({ label: t('summary.care'), icon: LOG_ICONS.bath, value: care.join(' · '), detail: undefined });
        return (
          <div key={slot} style={twinStyle(colorOf(babies, slot))} className="rounded-2xl border border-line bg-surface p-3">
            <h3 className="mb-2 flex items-center gap-2 font-semibold">
              <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
              <span className="truncate">{name(slot)}</span>
            </h3>
            <dl className="space-y-2 text-sm">
              {rows.map(({ label, icon: Icon, value, detail }) => (
                <div key={label}>
                  <dt className="flex items-center gap-1.5 text-muted">
                    <Icon aria-hidden size={14} />
                    {label}
                  </dt>
                  <dd className="font-semibold">
                    {value}
                    {detail && <span className="block text-xs font-normal text-muted">{detail}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </section>
  );
}

/**
 * Both twins side by side: one row per minute, newest first, twin A on the
 * left and twin B on the right, so a "both" entry lines up across the row.
 */
export function Timeline({ entries, pumps = [], babies, now }: { entries: LogEntry[]; pumps?: Pump[]; babies: Babies; now: Date }) {
  const { t } = useTranslation();
  const describe = useDescribeEntry();
  const name = useTwinName(babies);
  const parentName = useCaregiverName();
  const ui = useLogUI();
  const fmt = useFormatMinutes();

  type Row = { twins: Record<string, LogEntry[]>; pumps: Pump[] };
  const rows = new Map<string, Row>();
  const rowFor = (iso: string) => {
    const key = format(new Date(iso), 'HH:mm');
    const row = rows.get(key) ?? { twins: { [BABY_IDS.A]: [], [BABY_IDS.B]: [] }, pumps: [] };
    rows.set(key, row);
    return row;
  };
  // Newest first; pumping sessions (the mother's) get their own full-width line.
  const items = [...entries.map((e) => ({ at: e.start, e })), ...pumps.map((p) => ({ at: p.start, p }))].sort((a, b) =>
    b.at.localeCompare(a.at),
  );
  for (const item of items) {
    const row = rowFor(item.at);
    if ('e' in item) (row.twins[item.e.babyId] ??= []).push(item.e);
    else row.pumps.push(item.p);
  }

  if (rows.size === 0) {
    return <p className="rounded-2xl border border-dashed border-line p-5 text-center text-muted">{t('timeline.empty')}</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="grid grid-cols-[3rem_1fr_1fr] border-b border-line bg-surface-2 text-sm font-semibold">
        <span />
        {SLOTS.map((slot) => (
          <span key={slot} className="flex min-w-0 items-center gap-1.5 px-2 py-2">
            <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
            <span className="truncate">{name(slot)}</span>
          </span>
        ))}
      </div>
      <ol>
        {[...rows].map(([time, row]) => (
          <li key={time} className="grid grid-cols-[3rem_1fr_1fr] border-b border-line last:border-0">
            <span className="py-2.5 pl-2 text-sm font-semibold tabular-nums">{time}</span>
            {row.pumps.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => ui.pump(p)}
                className="col-span-2 col-start-2 m-1 flex items-center gap-1.5 rounded-xl border-l-4 border-line bg-surface-2 px-2 py-1.5 text-left text-sm"
                title={t('log.by', { name: parentName(p.loggedBy) })}
              >
                <Milk aria-hidden size={14} className="shrink-0" />
                <span className="font-semibold">{t('milk.pumped')}</span>
                <span className="truncate">
                  {isRunningPump(p)
                    ? t('milk.runningDetail', { duration: fmt(minutesBetween(p.start, now)) })
                    : t('milk.pumpedDetail', { ml: p.totalMl, minutes: p.minutes ?? '–' })}
                </span>
              </button>
            ))}
            {SLOTS.map((slot) => (
              <div key={slot} className="min-w-0 space-y-1 px-1 py-1" style={twinStyle(colorOf(babies, slot))}>
                {row.twins[BABY_IDS[slot]].map((e) => {
                  const what = describe(e, now);
                  const Icon = LOG_ICONS[e.type];
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => ui.edit(e)}
                      className="block w-full rounded-xl border-l-4 border-(--tw) bg-(--tw-soft) px-2 py-1.5 text-left"
                      title={t('log.by', { name: parentName(e.loggedBy) })}
                    >
                      <span className="sr-only">
                        {name(slot)}, {time}:{' '}
                      </span>
                      <span className="flex items-center gap-1 text-sm font-semibold">
                        <Icon aria-hidden size={14} className="shrink-0" />
                        <span className="truncate">{what.title}</span>
                      </span>
                      {what.detail && <span className="block truncate text-xs">{what.detail}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </li>
        ))}
      </ol>
    </div>
  );
}
