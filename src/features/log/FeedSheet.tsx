import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Segmented, cx } from '@/components/ui';
import { oneOf, positiveInt, useRemembered } from '@/lib/remember';
import { useBabies } from '@/features/twins/twins';
import type { FeedData } from '@/data/types';
import type { Who } from './logic';
import { useLogActions } from './useLogActions';
import { WhoPicker } from './WhoPicker';

type Side = Extract<FeedData, { method: 'breast' }>['side'];
type Milk = Extract<FeedData, { method: 'bottle' }>['milk'];

/** Quick amounts only; any amount can be entered with the stepper. */
const ML_CHIPS = [30, 60, 90, 120, 150];

export function FeedSheet({ who: initialWho, onClose }: { who: Who; onClose: () => void }) {
  const { t } = useTranslation();
  const babies = useBabies();
  const { log } = useLogActions();
  const [who, setWho] = useState<Who>(initialWho);
  const [method, setMethod] = useRemembered('twinsmk.feed.method', 'breast', oneOf('breast', 'bottle'));
  const [side, setSide] = useRemembered<Side>('twinsmk.feed.side', 'left', oneOf('left', 'right', 'both'));
  const [milk, setMilk] = useRemembered<Milk>('twinsmk.feed.milk', 'breast', oneOf('breast', 'formula'));
  const [ml, setMl] = useRemembered('twinsmk.feed.ml', 60, positiveInt);
  const [minutes, setMinutes] = useState(15);

  const save = async (fn: () => Promise<unknown>) => {
    await fn();
    onClose();
  };

  const startTimer = () =>
    save(() => log(who, { type: 'feed', data: { method: 'breast', side }, start: new Date().toISOString(), end: null }, t('log.breast')));

  const saveMinutes = () => {
    const end = new Date();
    const start = new Date(end.getTime() - minutes * 60_000);
    return save(() =>
      log(who, { type: 'feed', data: { method: 'breast', side }, start: start.toISOString(), end: end.toISOString() }, t('log.breast')),
    );
  };

  const saveBottle = () =>
    save(() =>
      log(
        who,
        { type: 'feed', data: { method: 'bottle', ml, milk }, start: new Date().toISOString(), end: null },
        `${t('log.bottle')} ${ml} ml`,
      ),
    );

  return (
    <Sheet open onClose={onClose} title={t('log.feed')}>
      <div className="space-y-5">
        <WhoPicker babies={babies} value={who} onChange={setWho} />
        <Segmented
          label={t('log.feed')}
          value={method}
          options={[
            { value: 'breast', label: t('log.breast') },
            { value: 'bottle', label: t('log.bottle') },
          ]}
          onChange={setMethod}
        />

        {method === 'breast' ? (
          <>
            <Segmented<Side>
              label={t('log.side')}
              value={side}
              options={[
                { value: 'left', label: t('log.left') },
                { value: 'right', label: t('log.right') },
                { value: 'both', label: t('log.bothSides') },
              ]}
              onChange={setSide}
            />
            <Button className="min-h-16 w-full text-lg" onClick={startTimer}>
              <Timer aria-hidden size={24} />
              {t('log.startTimer')}
            </Button>
            <div className="space-y-3 border-t border-line pt-4">
              <p className="text-sm font-medium text-muted">{t('log.orMinutes')}</p>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Stepper label={t('log.minutes')} value={minutes} min={1} max={180} onChange={setMinutes} />
                <Button variant="secondary" onClick={saveMinutes}>
                  {t('log.saveMinutes', { count: minutes })}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <fieldset>
              <legend className="mb-1.5 font-medium">{t('log.amount')}</legend>
              <div className="mb-3 flex flex-wrap gap-2">
                {ML_CHIPS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={ml === n}
                    onClick={() => setMl(n)}
                    className={cx(
                      'min-h-12 min-w-14 rounded-xl border px-3 font-semibold tabular-nums',
                      ml === n ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-muted',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <Stepper label={t('log.amount')} value={ml} min={5} max={500} step={5} onChange={setMl} />
            </fieldset>
            <Segmented<Milk>
              label={t('log.milk')}
              value={milk}
              options={[
                { value: 'breast', label: t('log.breastMilk') },
                { value: 'formula', label: t('log.formula') },
              ]}
              onChange={setMilk}
            />
            <Button className="min-h-16 w-full text-lg" onClick={saveBottle}>
              {t('log.save')}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
