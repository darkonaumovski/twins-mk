import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { Field, Page, Section, Segmented, Select, TextArea, TextInput, Toggle } from '@/components/ui';
import { useLive, useSettings, useStore } from '@/data/StoreContext';
import type { Food, FoodReaction, FoodTry, TwinSlot } from '@/data/types';
import { dateLocale } from '@/i18n';
import { todayISO } from '@/lib/format';
import { newId } from '@/lib/ids';
import { useLabel } from '@/lib/labels';
import { SLOTS, slotOf, type Who } from '@/features/log/logic';
import { WhoPicker } from '@/features/log/WhoPicker';
import { colorOf, tintFor, twinStyle, TwinBadge, useBabies, useTwinName } from '@/features/twins/twins';
import { addExampleFoods, EXAMPLE_FOODS, foodId, latestTries, nextOrder, sortedFoods, triesOf, tryRecords } from './logic';

const REACTIONS: FoodReaction[] = ['liked', 'neutral', 'refused'];

/** Log a try of a food (both twins by default) and see the earlier ones. `food` null asks which food. */
function TrySheet({
  food,
  slot,
  foods,
  tries,
  onClose,
}: {
  food: Food | null;
  slot: TwinSlot | null;
  foods: Food[];
  tries: FoodTry[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const label = useLabel();
  const babies = useBabies();
  const name = useTwinName(babies);
  const [who, setWho] = useState<Who>('both');
  const [chosen, setChosen] = useState(food?.id ?? foods[0]?.id ?? '');
  const [date, setDate] = useState(todayISO());
  // No reaction chosen at first: the parent picks what they saw.
  const [reaction, setReaction] = useState<FoodReaction | null>(null);
  const [note, setNote] = useState('');
  const current = foods.find((f) => f.id === chosen) ?? null;
  const history = current ? triesOf(tries, current.id, slot ?? undefined) : [];
  const locale = dateLocale(i18n.language);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!current || !date || !reaction) return;
    await store.foodTries.createMany(tryRecords(who, { foodId: current.id, date, reaction, note }, newId));
    onClose();
  };

  const remove = async (tr: FoodTry) => {
    await store.foodTries.remove(tr.id);
    toast({ message: t('foods.tryDeleted'), action: { label: t('common.undo'), onClick: () => void store.foodTries.restore(tr.id) } });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={current ? label(current) : t('foods.logTry')}
      tint={tintFor(babies, who)}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="try-form" className="flex-1" disabled={!current || !reaction}>
            {t('log.saveFor', { name: who === 'both' ? t('twins.both') : name(who) })}
          </Button>
        </>
      }
    >
      <form id="try-form" onSubmit={save} className="space-y-5" noValidate>
        {!food && foods.length === 0 && <p className="text-sm text-muted">{t('foods.empty')}</p>}
        {!food && foods.length > 0 && (
          <Field label={t('foods.food')}>
            {(p) => (
              <Select {...p} value={chosen} onChange={(e) => setChosen(e.target.value)}>
                {foods.map((f) => (
                  <option key={f.id} value={f.id}>
                    {label(f)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <WhoPicker babies={babies} value={who} onChange={setWho} />
        <Segmented<FoodReaction>
          label={t('foods.reactionLabel')}
          value={reaction ?? ('' as FoodReaction)}
          options={REACTIONS.map((r) => ({ value: r, label: t(`foods.reaction.${r}`) }))}
          onChange={setReaction}
        />
        <Field label={t('foods.date')}>
          {(p) => <TextInput {...p} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label={t('foods.note')} hint={t('foods.noteHint')}>
          {(p) => <TextArea {...p} rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {history.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="font-medium">{slot ? t('foods.historyFor', { name: name(slot) }) : t('foods.history')}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {history.map((tr) => (
                <li key={tr.id} className="flex min-h-11 items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{format(parseISO(tr.date), 'd MMM yyyy', { locale })}</span>
                    {!slot && ` · ${name(slotOf(tr.babyId))}`} · {t(`foods.reaction.${tr.reaction}`)}
                    {tr.note && <span className="block text-muted">{tr.note}</span>}
                  </span>
                  <Button
                    variant="ghost"
                    className="min-h-11 min-w-11 px-2 text-danger"
                    aria-label={t('common.delete')}
                    onClick={() => void remove(tr)}
                  >
                    <Trash2 aria-hidden size={18} />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </form>
    </Sheet>
  );
}

/** Add, rename or delete a food on the list. */
function FoodSheet({ food, foods, onClose }: { food: Food | null; foods: Food[]; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const label = useLabel();
  const [name, setName] = useState(food ? label(food) : '');
  const [error, setError] = useState(false);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return setError(true);
    // Renaming an example food stops it following the language (like the checklist).
    if (food) {
      if (name.trim() !== label(food)) await store.foods.update(food.id, { name: name.trim(), seedKey: null });
    } else await store.foods.create({ name: name.trim(), seedKey: null, order: nextOrder(foods) });
    onClose();
  };

  const remove = async () => {
    if (!food) return;
    if (
      !(await confirm({
        title: t('foods.deleteConfirm', { name: label(food) }),
        body: t('foods.deleteBody'),
        confirmLabel: t('common.delete'),
        danger: true,
      }))
    )
      return;
    await store.foods.remove(food.id);
    onClose();
    toast({ message: t('foods.deleted'), action: { label: t('common.undo'), onClick: () => void store.foods.restore(food.id) } });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={food ? t('foods.editFood') : t('foods.addFood')}
      footer={
        <>
          {food && (
            <Button variant="ghost" onClick={remove} className="text-danger" aria-label={t('common.delete')}>
              <Trash2 aria-hidden size={20} />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="food-form" className="flex-1">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="food-form" onSubmit={save} noValidate>
        <Field label={t('foods.name')} hint={error ? <span className="text-danger">{t('log.required')}</span> : undefined}>
          {(p) => (
            <TextInput
              {...p}
              value={name}
              maxLength={60}
              data-autofocus
              onChange={(e) => {
                setName(e.target.value);
                setError(false);
              }}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}

type Open = { try: { food: Food | null; slot: TwinSlot | null } } | { food: Food | null };

/** First foods: a grid of foods × twins with each twin's latest reaction. Off until the parents turn it on. */
export function FoodsPage() {
  const { t } = useTranslation();
  const store = useStore();
  const settings = useSettings();
  const label = useLabel();
  const babies = useBabies();
  const name = useTwinName(babies);
  const data = useLive(async (s) => ({ foods: await s.foods.listAll(), tries: await s.foodTries.list() }), []);
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<Open | null>(null);

  // "Solids" in Today's More sheet opens the try sheet straight away.
  useEffect(() => {
    if (params.get('log') === '1') {
      setOpen({ try: { food: null, slot: null } });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);
  if (!settings || !data || !babies) return null;

  const enable = (on: boolean) => void store.settings.update({ solidsEnabled: on });
  if (!settings.solidsEnabled) {
    return (
      <Page title={t('foods.title')}>
        <Section title={t('foods.title')}>
          <p>{t('foods.offIntro')}</p>
          <Toggle label={t('foods.enable')} checked={false} onChange={enable} />
        </Section>
      </Page>
    );
  }

  const foods = sortedFoods(data.foods);
  const latest = latestTries(data.tries);
  // A deleted example counts as there: adding the examples again would not bring it back.
  const missingExamples = EXAMPLE_FOODS.some((k) => !data.foods.some((f) => f.id === foodId(k)));

  return (
    <Page
      title={t('foods.title')}
      actions={
        <Button variant="secondary" onClick={() => setOpen({ food: null })}>
          <Plus aria-hidden size={18} />
          {t('foods.add')}
        </Button>
      }
    >
      <p className="text-sm text-muted">{t('foods.intro')}</p>
      {foods.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t('foods.empty')}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 px-1">
            <span />
            {SLOTS.map((slot) => (
              <span key={slot} className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
                <span className="truncate">{name(slot)}</span>
              </span>
            ))}
          </div>
          <ul className="space-y-2">
            {foods.map((food) => (
              <li key={food.id} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-2">
                <button type="button" onClick={() => setOpen({ food })} className="min-h-12 truncate rounded-xl px-1 text-left font-medium">
                  {label(food)}
                </button>
                {SLOTS.map((slot) => {
                  const last = latest.get(food.id)?.[slot];
                  return (
                    <button
                      key={slot}
                      type="button"
                      style={twinStyle(colorOf(babies, slot))}
                      onClick={() => setOpen({ try: { food, slot } })}
                      aria-label={`${label(food)}, ${name(slot)}: ${last ? t(`foods.reaction.${last.reaction}`) : t('foods.notTried')}`}
                      className={
                        last
                          ? 'min-h-12 truncate rounded-xl border-2 border-(--tw) bg-(--tw-soft) px-2 text-sm font-semibold text-(--tw-ink)'
                          : 'min-h-12 truncate rounded-xl border border-dashed border-line px-2 text-sm text-muted'
                      }
                    >
                      {last ? t(`foods.reaction.${last.reaction}`) : <span aria-hidden>–</span>}
                    </button>
                  );
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {missingExamples && (
        <Button variant="secondary" className="w-full" onClick={() => void addExampleFoods(store)}>
          <Sparkles aria-hidden size={18} />
          {t('foods.addExamples')}
        </Button>
      )}

      <Section title={t('settings.title')}>
        <Toggle label={t('foods.enable')} checked onChange={enable} />
        <p className="text-sm text-muted">{t('foods.offHint')}</p>
      </Section>

      {open &&
        ('try' in open ? (
          <TrySheet food={open.try.food} slot={open.try.slot} foods={foods} tries={data.tries} onClose={() => setOpen(null)} />
        ) : (
          <FoodSheet food={open.food} foods={foods} onClose={() => setOpen(null)} />
        ))}
    </Page>
  );
}
