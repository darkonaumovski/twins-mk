import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ArrowRight, BellOff, ChevronDown } from 'lucide-react';
import { Button } from '@/components/Button';
import { useConfirm } from '@/components/Confirm';
import { Page, Segmented, cx } from '@/components/ui';
import { useDevicePrefs, useLive, useStore } from '@/data/StoreContext';
import type { ActivityEntry } from '@/data/types';
import { useDescribeEntry } from '@/features/log/describe';
import { changeLine, type ChangeTextHelpers } from '@/features/sync/changes';
import { useBabies, useTwinName } from '@/features/twins/twins';
import { dateLocale } from '@/i18n';
import { useCaregiverName, useCaregivers } from '@/lib/caregivers';
import { useLabel } from '@/lib/labels';
import { asChange, entryAction, fieldChanges, filterEntries, groupByDay, type HistoryFilter } from './logic';
import { useFieldText } from './useFieldText';

const PAGE = 100;

/** The same one-line descriptions the change alerts use. */
function useChangeLine() {
  const { t, i18n } = useTranslation();
  const describe = useDescribeEntry();
  const twin = useTwinName(useBabies());
  const label = useLabel();
  const parentName = useCaregiverName();
  const caregiverIds = useCaregivers()?.map((c) => c.id) ?? ['p1', 'p2'];
  const routines = useLive(async (s) => new Map((await s.routines.listAll()).map((r) => [r.id, r.title])), []);
  const locale = dateLocale(i18n.language);
  const helpers: ChangeTextHelpers = {
    t: t as unknown as ChangeTextHelpers['t'],
    entry: (e) => describe(e),
    twin,
    label,
    routineTitle: (id) => routines?.get(id),
    when: (iso) => format(new Date(iso), 'd MMM HH:mm', { locale }),
    day: (date) => format(parseISO(date), 'd MMM', { locale }),
    parentName,
    caregiverIds,
  };
  return (entry: ActivityEntry) => {
    try {
      return changeLine(asChange(entry), helpers);
    } catch {
      // A record of a kind this version does not know (from a newer version).
      return t('activity.unknown');
    }
  };
}

function Initial({ name, mine }: { name: string; mine: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold',
        mine ? 'bg-surface-2 text-muted' : 'bg-accent-soft text-accent',
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

function Details({ entry }: { entry: ActivityEntry }) {
  const { t, i18n } = useTranslation();
  const { fieldName, fieldValue } = useFieldText();
  const action = entryAction(entry);
  const fields = fieldChanges(entry);
  const locale = dateLocale(i18n.language);
  const value = (v: unknown, path: string) => fieldValue(entry.collection, path, v);

  return (
    <div className="space-y-3 border-t border-line px-4 pt-3 pb-4">
      {fields.length === 0 ? (
        <p className="text-sm text-muted">{t('activity.noFieldChanges')}</p>
      ) : (
        <dl className="space-y-2">
          {fields.map((f) => (
            <div key={f.path} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 text-sm">
              <dt className="text-muted">{fieldName(f.path)}</dt>
              <dd className="min-w-0 break-words">
                {action === 'changed' ? (
                  <span className="inline-flex flex-wrap items-center gap-x-1.5">
                    <del className="text-muted">{value(f.before, f.path)}</del>
                    <ArrowRight aria-label={t('activity.becomes')} size={14} className="shrink-0 text-muted" />
                    <ins className="font-medium no-underline">{value(f.after, f.path)}</ins>
                  </span>
                ) : action === 'deleted' ? (
                  <del className="text-muted">{value(f.before, f.path)}</del>
                ) : (
                  <span className="font-medium">{value(f.after, f.path)}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-xs text-muted">
        {t('activity.exactTime', { when: format(new Date(entry.at), 'd MMMM yyyy, HH:mm:ss', { locale }) })} ·{' '}
        {entry.mine ? t('activity.thisPhone') : t('activity.otherPhone')}
      </p>
    </div>
  );
}

function Item({ entry, line, fresh }: { entry: ActivityEntry; line: string; fresh: boolean }) {
  const { t } = useTranslation();
  const name = useCaregiverName();
  const [open, setOpen] = useState(false);
  const action = entryAction(entry);
  const who = entry.by ? name(entry.by) : t('changes.otherPhone');

  return (
    <li className={cx('overflow-hidden rounded-2xl border bg-surface', fresh ? 'border-accent' : 'border-line')}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <Initial name={who} mine={entry.mine} />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="block font-medium break-words">{line}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>
              {who}
              {entry.mine && ` ${t('activity.you')}`}
            </span>
            <span
              className={cx(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                action === 'deleted' ? 'bg-danger/15 text-danger' : action === 'added' ? 'bg-accent-soft text-accent' : 'bg-surface-2',
              )}
            >
              {t(`activity.action.${action}`)}
            </span>
            {fresh && <span className="text-xs font-semibold text-accent">{t('activity.new')}</span>}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-sm text-muted">
          <time dateTime={entry.at}>{format(new Date(entry.at), 'HH:mm')}</time>
          <ChevronDown aria-hidden size={18} className={cx('transition', open && 'rotate-180')} />
        </span>
      </button>
      {open && <Details entry={entry} />}
    </li>
  );
}

export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const prefs = useDevicePrefs();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const entries = useLive((s) => s.activity.list(limit), [limit]);
  const line = useChangeLine();
  const locale = dateLocale(i18n.language);

  // What was new when the page opened (or arrived while it is open) stays marked for this visit.
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    const unseen = entries?.filter((e) => e.seen === 0 && e.key !== undefined).map((e) => e.key!) ?? [];
    if (!unseen.length) return;
    setFresh((prev) => new Set([...prev, ...unseen]));
    void store.activity.markAllSeen();
  }, [entries, store]);

  const groups = useMemo(() => groupByDay(filterEntries(entries ?? [], filter)), [entries, filter]);

  const dayTitle = (day: string) => {
    const date = parseISO(day);
    if (isToday(date)) return t('activity.today');
    if (isYesterday(date)) return t('activity.yesterday');
    return format(date, 'EEEE, d MMMM yyyy', { locale });
  };

  const clear = async () => {
    const ok = await confirm({
      title: t('activity.clearTitle'),
      body: t('activity.clearBody'),
      confirmLabel: t('activity.clear'),
      danger: true,
    });
    if (ok) await store.activity.clear();
  };

  return (
    <Page title={t('activity.title')}>
      <p className="text-sm text-muted">{t('activity.intro')}</p>
      {prefs?.changeAlerts === false && <p className="text-sm text-muted">{t('activity.alertsOff')}</p>}
      <Segmented
        label={t('activity.filter')}
        hideLabel
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('activity.filterAll') },
          { value: 'others', label: t('activity.filterOthers') },
          { value: 'mine', label: t('activity.filterMine') },
        ]}
      />

      {entries && groups.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center text-muted">
          <BellOff aria-hidden size={32} />
          <p>{t(filter === 'all' ? 'activity.empty' : 'activity.emptyFiltered')}</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.day} className="space-y-2">
          <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">{dayTitle(g.day)}</h2>
          <ul className="space-y-2">
            {g.entries.map((e) => (
              <Item key={e.key} entry={e} line={line(e)} fresh={e.key !== undefined && fresh.has(e.key)} />
            ))}
          </ul>
        </section>
      ))}

      {entries && entries.length >= limit && (
        <Button variant="secondary" className="w-full" onClick={() => setLimit(limit + PAGE)}>
          {t('activity.showMore')}
        </Button>
      )}
      {entries && entries.length > 0 && (
        <Button variant="ghost" className="w-full text-danger" onClick={() => void clear()}>
          {t('activity.clear')}
        </Button>
      )}
    </Page>
  );
}
