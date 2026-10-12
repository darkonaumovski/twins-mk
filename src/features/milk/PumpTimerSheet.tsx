import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import type { PumpSide } from '@/data/types';
import { oneOf, useRemembered } from '@/lib/remember';
import { useFormatMinutes, useNow } from '@/lib/useNow';
import { minutesBetween } from '@/features/log/logic';
import { usePumpTimer } from './usePumpTimer';

/**
 * Starts the pumping timer (left, right or both) and shows it running with a big elapsed time.
 * Stop saves the end time and opens the pumping sheet for the amounts.
 */
export function PumpTimerSheet({ pumpId, onClose }: { pumpId?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const now = useNow(1_000);
  const fmt = useFormatMinutes();
  const { running, start, stop } = usePumpTimer(pumpId);
  const [side, setSide] = useRemembered<PumpSide>('twinsmk.pump.side', 'both', oneOf('left', 'right', 'both'));
  const shown = useRef<string | null>(null);
  /** Set when this sheet stops or discards the timer itself, so that is not taken for the other phone. */
  const ownAction = useRef(false);

  // The timer this sheet showed was stopped or discarded on the other phone: close rather than turn
  // into "Start" under the parent's thumb.
  useEffect(() => {
    if (running) shown.current = running.id;
    else if (running === null && !ownAction.current && (shown.current || pumpId)) {
      onClose();
      toast({ message: t('milk.stoppedElsewhere') });
    }
  }, [running, pumpId, onClose, toast, t]);

  if (!running && (running === undefined || shown.current || pumpId)) return null;

  const discard = async () => {
    if (!running) return;
    ownAction.current = true;
    await store.pumps.remove(running.id);
    onClose();
    toast({ message: t('milk.timerDiscarded'), action: { label: t('common.undo'), onClick: () => void store.pumps.restore(running.id) } });
  };

  const seconds = running ? Math.max(0, Math.floor((now.getTime() - new Date(running.start).getTime()) / 1000)) : 0;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <Sheet open onClose={onClose} title={running ? t('milk.timerRunning') : t('milk.startTimer')}>
      {running ? (
        <div className="space-y-5 text-center">
          <p className="text-muted">{running.side ? t(`milk.side.${running.side}`) : t('milk.pump')}</p>
          <p role="timer" aria-label={fmt(minutesBetween(running.start, now))} className="text-6xl font-bold tabular-nums">
            {clock}
          </p>
          <Button
            className="min-h-16 w-full text-lg"
            onClick={() => {
              ownAction.current = true;
              void stop(running);
            }}
          >
            <Square aria-hidden size={20} fill="currentColor" />
            {t('log.stop')}
          </Button>
          <Button variant="ghost" className="w-full text-muted" onClick={discard}>
            {t('milk.discardTimer')}
          </Button>
          <p className="text-sm text-muted">{t('milk.timerHint')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <Segmented<PumpSide>
            label={t('milk.sideLabel')}
            value={side}
            options={(['left', 'right', 'both'] as const).map((s) => ({ value: s, label: t(`milk.side.${s}`) }))}
            onChange={setSide}
          />
          <Button className="min-h-16 w-full text-lg" onClick={() => void start(side)}>
            <Play aria-hidden size={20} fill="currentColor" />
            {t('milk.startTimer')}
          </Button>
          <p className="text-sm text-muted">{t('milk.timerHint')}</p>
        </div>
      )}
    </Sheet>
  );
}
