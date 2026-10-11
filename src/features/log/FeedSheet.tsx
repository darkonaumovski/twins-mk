import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Segmented, Toggle, cx } from '@/components/ui';
import { oneOf, positiveInt, useRemembered } from '@/lib/remember';
import { useLive, useStore } from '@/data/StoreContext';
import { drawFromStash, stashTotals } from '@/features/milk/logic';
import { colorOf, tintFor, twinStyle, TwinBadge, useBabies, useTwinName } from '@/features/twins/twins';
import type { FeedData, Milk, TopUp, TwinSlot } from '@/data/types';
import { BABY_IDS, SLOTS, slotOf, type BreastSide, type LogDraft, type Who } from './logic';
import { useLastSides, useLogActions } from './useLogActions';
import { WhoPicker } from './WhoPicker';

/** Quick amounts only; any amount can be entered with the stepper. */
const ML_CHIPS = [30, 60, 90, 120, 150];
/** For tandem feeds: twin A starts on the left, twin B on the right (changeable). */
const TANDEM_DEFAULT: Record<TwinSlot, BreastSide> = { A: 'left', B: 'right' };

function MlPicker({ label, value, onChange }: { label: string; value: number; onChange: (ml: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 font-medium">{label}</legend>
      <div className="mb-3 flex flex-wrap gap-2">
        {ML_CHIPS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={cx(
              'min-h-12 min-w-14 rounded-xl border px-3 font-semibold tabular-nums',
              value === n ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-muted',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <Stepper label={label} value={value} min={5} max={500} step={5} onChange={onChange} />
    </fieldset>
  );
}

export function FeedSheet({ who: initialWho, onClose }: { who: Who; onClose: () => void }) {
  const { t } = useTranslation();
  const babies = useBabies();
  const name = useTwinName(babies);
  const lastSides = useLastSides();
  const { log } = useLogActions();
  const store = useStore();
  const stash = useLive((s) => s.milkStash.list(), []);
  const stored = stash ? stashTotals(stash) : null;
  const storedMl = stored ? stored.fridge + stored.freezer : 0;
  const [fromStash, setFromStash] = useState(false);
  const [who, setWho] = useState<Who>(initialWho);
  const [method, setMethod] = useRemembered('twinsmk.feed.method', 'breast', oneOf('breast', 'bottle'));
  const [side, setSide] = useRemembered<BreastSide>('twinsmk.feed.side', 'left', oneOf('left', 'right', 'both'));
  const [tandem, setTandem] = useState<Record<TwinSlot, BreastSide>>(TANDEM_DEFAULT);
  const [milk, setMilk] = useRemembered<Milk>('twinsmk.feed.milk', 'breast', oneOf('breast', 'formula'));
  const [ml, setMl] = useRemembered('twinsmk.feed.ml', 60, positiveInt);
  const [splitMl, setSplitMl] = useState(false);
  const [mlB, setMlB] = useState(ml);
  const [minutes, setMinutes] = useState(15);
  const [topUpOn, setTopUpOn] = useState(false);
  const [topUpMl, setTopUpMl] = useRemembered('twinsmk.feed.topUpMl', 30, positiveInt);
  const [topUpMilk, setTopUpMilk] = useRemembered<Milk>('twinsmk.feed.topUpMilk', 'formula', oneOf('breast', 'formula'));

  const both = who === 'both';
  const forWho = both ? t('twins.both') : name(who);
  const sideLabel = (s: BreastSide) => ({ left: t('log.left'), right: t('log.right'), both: t('log.bothSides') })[s];
  const sideOptions = (['left', 'right', 'both'] as const).map((value) => ({ value, label: sideLabel(value) }));
  const lastSideHint = (slot: TwinSlot) => {
    const last = lastSides?.[slot];
    return last ? t('log.lastSide', { side: sideLabel(last) }) : undefined;
  };

  const save = async (fn: () => Promise<unknown>) => {
    await fn();
    onClose();
  };

  const topUp: TopUp | null = topUpOn ? { ml: topUpMl, milk: topUpMilk } : null;
  const breastDraft =
    (start: string, end: string | null) =>
    (babyId: string): LogDraft => {
      const s = both ? tandem[slotOf(babyId)] : side;
      const data: FeedData = topUp ? { method: 'breast', side: s, topUp } : { method: 'breast', side: s };
      return { type: 'feed', data, start, end };
    };

  const startTimer = () => save(() => log(who, breastDraft(new Date().toISOString(), null), t('log.breast')));

  const saveMinutes = () => {
    const end = new Date();
    const start = new Date(end.getTime() - minutes * 60_000);
    return save(() => log(who, breastDraft(start.toISOString(), end.toISOString()), t('log.breast')));
  };

  const saveBottle = () => {
    const start = new Date().toISOString();
    const amount = (babyId: string) => (both && splitMl && babyId === BABY_IDS.B ? mlB : ml);
    const what = both && splitMl ? `${t('log.bottle')} ${ml} + ${mlB} ml` : `${t('log.bottle')} ${ml} ml`;
    const totalMl = both ? ml + (splitMl ? mlB : ml) : ml;
    return save(async () => {
      await log(who, (babyId) => ({ type: 'feed', data: { method: 'bottle', ml: amount(babyId), milk }, start, end: null }), what);
      if (milk === 'breast' && fromStash && storedMl > 0) {
        // Oldest milk first; a container only partly used keeps the rest.
        const items = await store.milkStash.list();
        const draw = drawFromStash(items, totalMl, new Date());
        await store.transaction(async () => {
          for (const c of draw.changes) await store.milkStash.update(c.id, { ml: c.ml, usedAt: c.usedAt });
        });
      }
    });
  };

  return (
    <Sheet open onClose={onClose} title={t('log.feed')} tint={tintFor(babies, who)}>
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
            {both ? (
              <div className="space-y-3">
                {SLOTS.map((slot) => (
                  <div key={slot} style={twinStyle(colorOf(babies, slot))} className="rounded-2xl border-2 border-(--tw) p-3">
                    <Segmented<BreastSide>
                      label={`${t('log.side')}: ${name(slot)}`}
                      value={tandem[slot]}
                      options={sideOptions}
                      onChange={(s) => setTandem((cur) => ({ ...cur, [slot]: s }))}
                      hint={lastSideHint(slot)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Segmented<BreastSide> label={t('log.side')} value={side} options={sideOptions} onChange={setSide} hint={lastSideHint(who)} />
            )}

            <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
              <Toggle label={t('log.topUp')} checked={topUpOn} onChange={setTopUpOn} />
              {topUpOn && (
                <>
                  <p className="text-sm text-muted">{both ? t('log.topUpHintBoth') : t('log.topUpHint')}</p>
                  <Stepper label={t('log.amount')} value={topUpMl} min={5} max={300} step={5} onChange={setTopUpMl} />
                  <Segmented<Milk>
                    label={t('log.milk')}
                    value={topUpMilk}
                    options={[
                      { value: 'breast', label: t('log.breastMilk') },
                      { value: 'formula', label: t('log.formula') },
                    ]}
                    onChange={setTopUpMilk}
                  />
                </>
              )}
            </div>

            <Button className="min-h-16 w-full text-lg" onClick={startTimer}>
              <Timer aria-hidden size={24} />
              {t('log.startTimerFor', { name: forWho })}
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
            {both && <Toggle label={t('log.differentAmounts')} checked={splitMl} onChange={setSplitMl} />}
            {both && splitMl ? (
              SLOTS.map((slot) => (
                <div key={slot} style={twinStyle(colorOf(babies, slot))} className="rounded-2xl border-2 border-(--tw) p-3">
                  <p className="mb-2 flex items-center gap-2 font-semibold">
                    <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
                    {name(slot)}
                  </p>
                  <Stepper
                    label={t('log.amountFor', { name: name(slot) })}
                    value={slot === 'A' ? ml : mlB}
                    min={5}
                    max={500}
                    step={5}
                    onChange={slot === 'A' ? setMl : setMlB}
                  />
                </div>
              ))
            ) : (
              <MlPicker
                label={both ? t('log.amountEach') : t('log.amount')}
                value={ml}
                onChange={(n) => {
                  setMl(n);
                  setMlB(n);
                }}
              />
            )}
            <Segmented<Milk>
              label={t('log.milk')}
              value={milk}
              options={[
                { value: 'breast', label: t('log.breastMilk') },
                { value: 'formula', label: t('log.formula') },
              ]}
              onChange={setMilk}
            />
            {milk === 'breast' && storedMl > 0 && (
              <div className="rounded-2xl bg-surface-2 p-3">
                <Toggle label={t('stash.useFromStash', { ml: storedMl })} checked={fromStash} onChange={setFromStash} />
                <p className="text-sm text-muted">{t('stash.useFromStashHint')}</p>
              </div>
            )}
            <Button className="min-h-16 w-full text-lg" onClick={saveBottle}>
              {t('log.saveFor', { name: forWho })}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
