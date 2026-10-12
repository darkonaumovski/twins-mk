import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { format, isSameDay } from 'date-fns';
import { Info, Play, Square, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/Button';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { cx, Page } from '@/components/ui';
import { useDevicePrefs, useLive, useStore } from '@/data/StoreContext';
import { buzz, useWakeLock } from '@/lib/device';
import { useNow } from '@/lib/useNow';
import { dateLocale } from '@/i18n';
import { contractionRows, formatSeconds, lastHourSummary, runningContraction, toggleContraction } from './logic';

/**
 * Full-screen contraction timer: one big Start / Stop button, the last hour in numbers and every
 * contraction with its length and the time since the one before. Descriptive only: no thresholds,
 * alerts or advice. The screen stays on while this page is open.
 */
export function ContractionsPage() {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const prefs = useDevicePrefs();
  const toast = useToast();
  const confirm = useConfirm();
  const now = useNow(1_000);
  const list = useLive((s) => s.contractions.list(), []);
  useWakeLock(true);
  const busy = useRef(false);

  if (!list) return null;
  const running = runningContraction(list);
  const rows = contractionRows(list);
  const hour = lastHourSummary(list, now);
  const dash = '–';

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const done = await toggleContraction(store, running ? 'stop' : 'start', new Date());
      // The other phone (or a double tap) was faster: nothing changed, so say so.
      if (done === 'none') toast({ message: t(running ? 'contractions.stoppedElsewhere' : 'contractions.startedElsewhere') });
      else buzz(prefs);
    } finally {
      busy.current = false;
    }
  };

  const removeOne = async (id: string) => {
    await store.contractions.remove(id);
    toast({ message: t('contractions.deleted'), action: { label: t('common.undo'), onClick: () => void store.contractions.restore(id) } });
  };

  const clearAll = async () => {
    const ids = list.map((c) => c.id);
    if (!ids.length) return;
    const ok = await confirm({
      title: t('contractions.clearConfirm'),
      body: t('contractions.clearBody', { count: ids.length }),
      confirmLabel: t('contractions.clear'),
      danger: true,
    });
    if (!ok) return;
    await store.transaction(async () => Promise.all(ids.map((id) => store.contractions.remove(id))));
    toast({
      message: t('contractions.cleared'),
      action: {
        label: t('common.undo'),
        onClick: () => void store.transaction(async () => Promise.all(ids.map((id) => store.contractions.restore(id)))),
      },
    });
  };

  const elapsed = running ? (now.getTime() - new Date(running.start).getTime()) / 1000 : 0;

  return (
    <Page title={t('contractions.title')}>
      <div className="flex flex-col items-center gap-3 py-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={running ? t('contractions.stop') : t('contractions.start')}
          className={cx(
            'flex size-52 flex-col items-center justify-center gap-2 rounded-full text-2xl font-bold shadow-lg transition active:scale-[0.98]',
            running ? 'bg-ink text-bg' : 'bg-accent text-on-accent',
          )}
        >
          {running ? <Square aria-hidden size={36} fill="currentColor" /> : <Play aria-hidden size={36} fill="currentColor" />}
          {running ? t('contractions.stop') : t('contractions.start')}
          {running && (
            <span aria-hidden className="text-3xl tabular-nums">
              {formatSeconds(elapsed)}
            </span>
          )}
        </button>
        {running && (
          <p role="timer" className="sr-only">
            {formatSeconds(elapsed)}
          </p>
        )}
        <p className="text-sm text-muted">{running ? t('contractions.runningHint') : t('contractions.startHint')}</p>
      </div>

      <section aria-labelledby="contractions-hour" className="rounded-2xl border border-line bg-surface p-4">
        <h2 id="contractions-hour" className="mb-3 font-semibold">
          {t('contractions.lastHour')}
        </h2>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: t('contractions.count'), value: String(hour.count) },
            { label: t('contractions.avgDuration'), value: hour.avgDurationSec === null ? dash : formatSeconds(hour.avgDurationSec) },
            { label: t('contractions.avgInterval'), value: hour.avgIntervalSec === null ? dash : formatSeconds(hour.avgIntervalSec) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-surface-2 p-2">
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="text-xl font-bold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="flex gap-3 rounded-2xl bg-accent-soft p-3 text-sm">
        <Info aria-hidden size={20} className="mt-0.5 shrink-0 text-accent" />
        <span>{t('contractions.note')}</span>
      </p>

      {rows.length > 0 && (
        <section aria-labelledby="contractions-list" className="rounded-2xl border border-line bg-surface">
          <h2 id="contractions-list" className="sr-only">
            {t('contractions.list')}
          </h2>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-2 pl-4 font-medium">
                  {t('contractions.started')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('contractions.duration')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('contractions.since')}
                </th>
                <th scope="col" className="w-12">
                  <span className="sr-only">{t('common.delete')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="py-1 pl-4 text-left font-semibold">
                    {format(new Date(r.start), isSameDay(new Date(r.start), now) ? 'HH:mm:ss' : 'd MMM HH:mm:ss', {
                      locale: dateLocale(i18n.language),
                    })}
                  </th>
                  <td>{r.durationSec === null ? t('contractions.now') : formatSeconds(r.durationSec)}</td>
                  <td>{r.sincePreviousSec === null ? dash : formatSeconds(r.sincePreviousSec)}</td>
                  <td>
                    <IconButton label={t('contractions.deleteOne')} onClick={() => void removeOne(r.id)} className="text-muted">
                      <Trash2 aria-hidden size={18} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {rows.length > 0 && (
        <Button variant="ghost" className="w-full text-danger" onClick={clearAll}>
          {t('contractions.clear')}
        </Button>
      )}
    </Page>
  );
}
