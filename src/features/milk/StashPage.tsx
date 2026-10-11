import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { ArrowLeftRight, Check, Milk, Plus, Refrigerator, Snowflake } from 'lucide-react';
import { Button, IconButton } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Sheet } from '@/components/Sheet';
import { Field, Page, Section, Segmented, TextInput } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useLive, useSettings, useStore } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { fromLocalInput, toLocalInput } from '@/features/log/logic';
import { useLogUI } from '@/features/log/LogUIContext';
import type { MilkStashItem, StashLocation } from '@/data/types';
import { stashAge, stashOldestFirst, stashTotals } from './logic';

const ICONS = { fridge: Refrigerator, freezer: Snowflake } as const;

function AddStashSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const [ml, setMl] = useState(100);
  const [location, setLocation] = useState<StashLocation>('fridge');
  const [when, setWhen] = useState(toLocalInput(new Date().toISOString()));

  const save = async () => {
    const pumpedAt = fromLocalInput(when);
    if (!pumpedAt) return;
    await store.milkStash.create({ pumpedAt, ml, location, usedAt: null, pumpId: null });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('stash.add')}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button className="flex-1" onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Stepper label={t('log.amount')} value={ml} min={5} max={1000} step={5} onChange={setMl} />
        <Segmented<StashLocation>
          label={t('stash.location')}
          value={location}
          options={[
            { value: 'fridge', label: t('stash.fridge') },
            { value: 'freezer', label: t('stash.freezer') },
          ]}
          onChange={setLocation}
        />
        <Field label={t('stash.pumpedAt')}>
          {(p) => <TextInput {...p} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  );
}

/** Stored breast milk: totals per place and every container, oldest (used first) at the top. */
export function StashPage() {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const ui = useLogUI();
  const settings = useSettings();
  const items = useLive((s) => s.milkStash.list(), []);
  const [adding, setAdding] = useState(false);
  if (!items || !settings) return null;

  const now = new Date();
  const totals = stashTotals(items);
  const list = stashOldestFirst(items);
  const useWithin = settings.stashUseWithinDays;
  const locale = dateLocale(i18n.language);

  const markUsed = async (item: MilkStashItem) => {
    await store.milkStash.update(item.id, { usedAt: new Date().toISOString() });
    toast({
      message: t('stash.markedUsed', { ml: item.ml }),
      action: { label: t('common.undo'), onClick: () => void store.milkStash.update(item.id, { usedAt: null }) },
    });
  };
  const move = (item: MilkStashItem) => store.milkStash.update(item.id, { location: item.location === 'fridge' ? 'freezer' : 'fridge' });
  const setLimit = (location: StashLocation, days: number) =>
    store.settings.update({ stashUseWithinDays: { ...useWithin, [location]: days > 0 ? days : null } });

  return (
    <Page
      title={t('stash.title')}
      actions={
        <IconButton label={t('stash.add')} onClick={() => setAdding(true)}>
          <Plus aria-hidden size={22} />
        </IconButton>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {(['fridge', 'freezer'] as const).map((loc) => {
          const Icon = ICONS[loc];
          return (
            <div key={loc} className="rounded-2xl border border-line bg-surface p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                <Icon aria-hidden size={18} />
                {t(`stash.${loc}`)}
              </p>
              <p className="text-2xl font-bold tabular-nums">{t('stash.ml', { ml: totals[loc] })}</p>
            </div>
          );
        })}
      </div>

      <Button variant="secondary" className="w-full" onClick={() => ui.pump()}>
        <Milk aria-hidden size={20} />
        {t('milk.pump')}
      </Button>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t('stash.empty')}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {list.map((item) => {
            const age = stashAge(item, useWithin, now);
            const Icon = ICONS[item.location];
            const ageText = age.days === 0 ? t('stash.today') : t('stash.daysOld', { count: age.days });
            const limitText =
              age.daysLeft === null
                ? null
                : age.daysLeft >= 0
                  ? t('stash.daysLeft', { count: age.daysLeft })
                  : t('stash.pastLimit', { count: useWithin[item.location] ?? 0 });
            return (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <Icon aria-hidden size={20} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold tabular-nums">{t('stash.ml', { ml: item.ml })}</span>
                  <span className="block text-sm text-muted">
                    {format(new Date(item.pumpedAt), 'EEE d MMM HH:mm', { locale })} · {ageText}
                    {limitText && ` · ${limitText}`}
                  </span>
                </span>
                <IconButton
                  label={t('stash.move', { place: t(`stash.${item.location === 'fridge' ? 'freezer' : 'fridge'}`) })}
                  onClick={() => move(item)}
                >
                  <ArrowLeftRight aria-hidden size={20} />
                </IconButton>
                <IconButton label={t('stash.markUsedLabel', { ml: item.ml })} onClick={() => markUsed(item)}>
                  <Check aria-hidden size={20} />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}

      <Section title={t('stash.useWithinTitle')}>
        <p className="text-sm text-muted">{t('stash.useWithinHint')}</p>
        {(['fridge', 'freezer'] as const).map((loc) => (
          <Stepper
            key={loc}
            label={t('stash.useWithin', { place: t(`stash.${loc}`) })}
            value={useWithin[loc] ?? 0}
            min={0}
            max={365}
            onChange={(days) => setLimit(loc, days)}
            hint={useWithin[loc] ? undefined : t('stash.notSet')}
          />
        ))}
      </Section>

      {adding && <AddStashSheet onClose={() => setAdding(false)} />}
    </Page>
  );
}
