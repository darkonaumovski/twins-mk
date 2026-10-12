import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Field, Segmented, TextInput, Toggle } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useDevicePrefs, useStore } from '@/data/StoreContext';
import { oneOf, useRemembered } from '@/lib/remember';
import { buzz } from '@/lib/device';
import { fromLocalInput, toLocalInput } from '@/features/log/logic';
import type { Pump, StashLocation } from '@/data/types';
import { useLogUI } from '@/features/log/LogUIContext';
import { pumpTotal } from './logic';
import { saveSession, stashOfSession } from './pumpActions';

type Mode = 'sides' | 'total';

/**
 * Logs (or edits) a pumping session, optionally adding the milk to the stash in the same tap.
 * After the timer stops, it asks for the amounts of that session (the minutes are already in).
 */
export function PumpSheet({ pump, onClose }: { pump: Pump | null; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const prefs = useDevicePrefs();
  const toast = useToast();
  const confirm = useConfirm();
  const ui = useLogUI();
  // A stopped timer whose amounts are not entered yet.
  const finishing = pump !== null && Boolean(pump.end) && pump.side != null && pump.totalMl === 0;
  const timedSide = finishing ? pump.side : null;
  const [mode, setMode] = useState<Mode>(pump && !finishing && pump.leftMl === null && pump.rightMl === null ? 'total' : 'sides');
  const [left, setLeft] = useState(pump?.leftMl ?? (timedSide === 'right' ? 0 : 60));
  const [right, setRight] = useState(pump?.rightMl ?? (timedSide === 'left' ? 0 : 60));
  const [total, setTotal] = useState(finishing ? 120 : (pump?.totalMl ?? 120));
  const [minutes, setMinutes] = useState(pump?.minutes ?? 15);
  const [time, setTime] = useState(toLocalInput(pump?.start ?? new Date().toISOString()));
  const [toStash, setToStash] = useRemembered('twinsmk.pump.toStash', 'yes', oneOf('yes', 'no'));
  const [location, setLocation] = useRemembered<StashLocation>('twinsmk.pump.location', 'fridge', oneOf('fridge', 'freezer'));
  const [error, setError] = useState<string | null>(null);
  const [savedElsewhere, setSavedElsewhere] = useState<number | null>(null);

  // The other phone may have saved this session's milk already and then lost its amounts to a late
  // Stop from this phone (newest wins on the whole record): start from what is in the stash.
  useEffect(() => {
    if (!finishing) return;
    let cancelled = false;
    void stashOfSession(store, pump.id).then((item) => {
      if (cancelled || !item) return;
      setMode('total');
      setTotal(item.ml);
      setToStash('yes');
      setLocation(item.location);
      setSavedElsewhere(item.ml);
    });
    return () => {
      cancelled = true;
    };
    // Once, when the sheet opens.
  }, []);

  const totalMl = mode === 'sides' ? pumpTotal(left, right, null) : total;

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const start = fromLocalInput(time);
    if (!start) return setError(t('log.required'));
    if (totalMl <= 0) return setError(t('milk.noMl'));
    const fields = {
      start,
      minutes,
      leftMl: mode === 'sides' ? left : null,
      rightMl: mode === 'sides' ? right : null,
      totalMl,
    };
    const saved = await saveSession(store, {
      pump,
      fields,
      loggedBy: prefs?.parent ?? 'p1',
      stash: (!pump || finishing) && toStash === 'yes' ? location : null,
    });
    onClose();
    if (!saved) {
      toast({ message: t('milk.goneElsewhere') });
      return;
    }
    if (pump && !finishing) return;
    buzz(prefs);
    const created = { p: saved.pump, s: saved.stash };
    const message = created.s
      ? t('milk.loggedStash', { ml: totalMl, place: t(`stash.in.${location}`) })
      : t('milk.logged', { ml: totalMl });
    // Finishing a timer fills in a session that already exists: no undo (it can be edited or deleted from the timeline).
    if (finishing) {
      toast({ message });
      return;
    }
    toast({
      message,
      action: {
        label: t('common.undo'),
        onClick: () =>
          void store.transaction(async () => {
            await store.pumps.remove(created.p.id);
            if (created.s) await store.milkStash.remove(created.s.id);
          }),
      },
    });
  };

  const remove = async () => {
    if (!pump) return;
    if (!(await confirm({ title: t('milk.deleteConfirm'), body: t('milk.deleteBody'), confirmLabel: t('common.delete'), danger: true })))
      return;
    await store.pumps.remove(pump.id);
    onClose();
    toast({ message: t('milk.deleted'), action: { label: t('common.undo'), onClick: () => void store.pumps.restore(pump.id) } });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={finishing ? t('milk.finish') : pump ? t('milk.edit') : t('milk.pump')}
      footer={
        <>
          {pump && (
            <Button variant="ghost" onClick={remove} className="text-danger" aria-label={t('common.delete')}>
              <Trash2 aria-hidden size={20} />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="pump-form" className="flex-1">
            {t('milk.save', { ml: totalMl })}
          </Button>
        </>
      }
    >
      <form id="pump-form" onSubmit={save} className="space-y-5" noValidate>
        {savedElsewhere !== null && (
          <p className="rounded-xl bg-surface-2 p-3 text-sm">{t('milk.savedElsewhere', { ml: savedElsewhere })}</p>
        )}
        {!pump && (
          <Button variant="secondary" className="w-full" onClick={() => ui.pumpTimer()}>
            <Timer aria-hidden size={18} />
            {t('milk.startTimer')}
          </Button>
        )}
        <Segmented<Mode>
          label={t('milk.amount')}
          value={mode}
          options={[
            { value: 'sides', label: t('milk.perSide') },
            { value: 'total', label: t('milk.total') },
          ]}
          onChange={setMode}
        />
        {mode === 'sides' ? (
          <div className="space-y-3">
            <Stepper label={t('milk.leftMl')} value={left} min={0} max={500} step={5} onChange={setLeft} />
            <Stepper label={t('milk.rightMl')} value={right} min={0} max={500} step={5} onChange={setRight} />
          </div>
        ) : (
          <Stepper label={t('milk.totalMl')} value={total} min={0} max={1000} step={5} onChange={setTotal} />
        )}
        <Stepper label={t('log.minutes')} value={minutes} min={1} max={120} onChange={setMinutes} />
        <Field label={t('log.time')}>
          {(p) => <TextInput {...p} type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />}
        </Field>
        {(!pump || finishing) && (
          <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
            <Toggle label={t('milk.addToStash')} checked={toStash === 'yes'} onChange={(on) => setToStash(on ? 'yes' : 'no')} />
            {toStash === 'yes' && (
              <Segmented<StashLocation>
                label={t('stash.location')}
                value={location}
                options={[
                  { value: 'fridge', label: t('stash.fridge') },
                  { value: 'freezer', label: t('stash.freezer') },
                ]}
                onChange={setLocation}
              />
            )}
          </div>
        )}
        {pump && !finishing && <p className="text-sm text-muted">{t('milk.editNote')}</p>}
        {error && (
          <p role="alert" className="font-medium text-danger">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
