import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/Button';
import { Field, Page, Segmented, TextInput, cx } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { parseAmount } from '@/features/checklist/logic';
import { BABY_IDS, SLOTS, fromLocalInput, toLocalInput } from '@/features/log/logic';
import type { Baby, BabySex, NewRecord, TwinColor, TwinSlot } from '@/data/types';
import { colorsClash, DEFAULT_COLORS, TWIN_COLORS, twinStyle, TwinBadge, useBabies } from './twins';

interface TwinDraft {
  name: string;
  color: TwinColor;
  born: string;
  weight: string;
  length: string;
  /** Hours between feeds, as typed (e.g. "3" or "2,5"); empty means not set. */
  feedHours: string;
  /** Gestational age at birth, weeks and days as typed; empty means not entered. */
  gaWeeks: string;
  gaDays: string;
  sex: SexChoice;
}

type SexChoice = BabySex | 'unset';

function toDraft(baby: Baby | undefined, slot: TwinSlot): TwinDraft {
  return {
    name: baby?.name ?? '',
    color: baby?.color ?? DEFAULT_COLORS[slot],
    born: toLocalInput(baby?.birthDateTime ?? new Date().toISOString()),
    weight: baby?.birthWeightG?.toString() ?? '',
    length: baby?.birthLengthCm?.toString().replace('.', ',') ?? '',
    feedHours: baby?.feedIntervalMin ? String(Math.round((baby.feedIntervalMin / 60) * 100) / 100).replace('.', ',') : '',
    gaWeeks: baby?.gestationWeeksAtBirth?.toString() ?? '',
    gaDays: baby?.gestationDaysAtBirth?.toString() ?? '',
    sex: baby?.sex ?? 'unset',
  };
}

export function SetupPage() {
  const { t } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const babies = useBabies();
  const [drafts, setDrafts] = useState<Record<TwinSlot, TwinDraft> | null>(null);
  const [bornBTouched, setBornBTouched] = useState(false);
  const [error, setError] = useState<TwinSlot | null>(null);
  const [intervalError, setIntervalError] = useState<TwinSlot | null>(null);
  const [gaError, setGaError] = useState<TwinSlot | null>(null);
  const editing = Boolean(babies?.ready);

  useEffect(() => {
    if (babies && !drafts) {
      setDrafts({ A: toDraft(babies.A, 'A'), B: toDraft(babies.B, 'B') });
      setBornBTouched(Boolean(babies.B));
    }
  }, [babies, drafts]);

  if (!drafts) return null;

  const update = (slot: TwinSlot, patch: Partial<TwinDraft>) =>
    setDrafts((d) => {
      const next = { ...d!, [slot]: { ...d![slot], ...patch } };
      // Twins are born minutes apart: B follows A's birth time until edited separately.
      if (slot === 'A' && patch.born && !bornBTouched) next.B = { ...next.B, born: patch.born };
      return next;
    });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const records: Record<TwinSlot, NewRecord<Baby>> = { A: null!, B: null! };
    for (const slot of SLOTS) {
      const d = drafts[slot];
      const weight = d.weight.trim() ? parseAmount(d.weight) : null;
      if (d.weight.trim() && (weight === null || weight < 200 || weight > 8000)) {
        setError(slot);
        return;
      }
      const gaWeeks = d.gaWeeks.trim() ? Number(d.gaWeeks) : null;
      const gaDays = d.gaDays.trim() ? Number(d.gaDays) : 0;
      if (
        gaWeeks !== null &&
        (!Number.isInteger(gaWeeks) || gaWeeks < 22 || gaWeeks > 43 || !Number.isInteger(gaDays) || gaDays < 0 || gaDays > 6)
      ) {
        setGaError(slot);
        return;
      }
      const feedHours = d.feedHours.trim() ? parseAmount(d.feedHours) : null;
      if (d.feedHours.trim() && (feedHours === null || feedHours <= 0 || feedHours > 24)) {
        setIntervalError(slot);
        return;
      }
      records[slot] = {
        slot,
        name: d.name.trim(),
        color: d.color,
        birthDateTime: fromLocalInput(d.born),
        birthWeightG: weight === null ? null : Math.round(weight),
        birthLengthCm: d.length.trim() ? parseAmount(d.length) : null,
        feedIntervalMin: feedHours === null ? null : Math.round(feedHours * 60),
        gestationWeeksAtBirth: gaWeeks,
        gestationDaysAtBirth: gaWeeks === null ? null : gaDays,
        sex: d.sex === 'unset' ? null : d.sex,
      };
    }
    await store.transaction(async () => {
      const existing = await store.babies.listAll();
      for (const slot of SLOTS) {
        const id = BABY_IDS[slot];
        const found = existing.find((b) => b.id === id);
        if (!found) await store.babies.create({ ...records[slot], id });
        else {
          if (found.deletedAt) await store.babies.restore(id);
          await store.babies.update(id, records[slot]);
        }
      }
      await store.settings.update({ phase: 'planner' });
    });
    if (editing) {
      toast({ message: t('twins.saved') });
      navigate(-1);
    } else {
      navigate('/today', { replace: true });
    }
  };

  return (
    <Page title={editing ? t('twins.editTitle') : t('twins.setupTitle')}>
      {!editing && <p className="text-muted">{t('twins.setupIntro')}</p>}
      <form onSubmit={save} className="space-y-5" noValidate>
        {SLOTS.map((slot) => {
          const d = drafts[slot];
          const other = drafts[slot === 'A' ? 'B' : 'A'].color;
          const placeholder = slot === 'A' ? t('twins.twinA') : t('twins.twinB');
          return (
            <fieldset key={slot} style={twinStyle(d.color)} className="space-y-4 rounded-3xl border-2 border-(--tw) bg-surface p-4">
              <legend className="flex items-center gap-2 px-2 text-lg font-semibold">
                <TwinBadge slot={slot} color={d.color} size="lg" />
                {d.name.trim() || placeholder}
              </legend>
              <Field label={t('twins.name')}>
                {(p) => (
                  <TextInput
                    {...p}
                    value={d.name}
                    placeholder={placeholder}
                    maxLength={40}
                    onChange={(e) => update(slot, { name: e.target.value })}
                  />
                )}
              </Field>
              <fieldset>
                <legend className="mb-1.5 font-medium">{t('twins.color')}</legend>
                <div className="flex flex-wrap gap-2">
                  {TWIN_COLORS.map((c) => {
                    const taken = colorsClash(c, other);
                    return (
                      <label
                        key={c}
                        style={twinStyle(c)}
                        className={cx('relative', taken ? 'cursor-not-allowed opacity-30' : 'cursor-pointer')}
                      >
                        <input
                          type="radio"
                          name={`color-${slot}`}
                          value={c}
                          checked={d.color === c}
                          disabled={taken}
                          onChange={() => update(slot, { color: c })}
                          className="peer sr-only"
                          aria-label={taken ? `${t(`twins.colors.${c}`)} (${t('twins.colorTaken')})` : t(`twins.colors.${c}`)}
                        />
                        <span className="flex size-12 items-center justify-center rounded-full bg-(--tw) text-[#1b1410] ring-offset-2 ring-offset-surface peer-checked:ring-3 peer-checked:ring-ink peer-focus-visible:outline-3 peer-focus-visible:outline-accent">
                          {d.color === c && <Check aria-hidden size={22} strokeWidth={3} />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <Field label={t('twins.born')}>
                {(p) => (
                  <TextInput
                    {...p}
                    type="datetime-local"
                    value={d.born}
                    onChange={(e) => {
                      if (slot === 'B') setBornBTouched(true);
                      update(slot, { born: e.target.value });
                    }}
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={t('twins.weight')}
                  hint={error === slot ? <span className="text-danger">{t('twins.invalidWeight')}</span> : undefined}
                >
                  {(p) => (
                    <TextInput
                      {...p}
                      inputMode="numeric"
                      value={d.weight}
                      aria-invalid={error === slot}
                      onChange={(e) => {
                        setError(null);
                        update(slot, { weight: e.target.value });
                      }}
                    />
                  )}
                </Field>
                <Field label={t('twins.length')} hint={t('twins.optional')}>
                  {(p) => (
                    <TextInput {...p} inputMode="decimal" value={d.length} onChange={(e) => update(slot, { length: e.target.value })} />
                  )}
                </Field>
              </div>
              <fieldset>
                <legend className="mb-1.5 font-medium">{t('twins.gestation')}</legend>
                <div className="flex items-center gap-2">
                  <TextInput
                    inputMode="numeric"
                    aria-label={t('twins.gestationWeeks')}
                    placeholder={t('twins.gestationWeeksShort')}
                    className="w-20"
                    value={d.gaWeeks}
                    aria-invalid={gaError === slot}
                    onChange={(e) => {
                      setGaError(null);
                      update(slot, { gaWeeks: e.target.value.replace(/\D/g, '') });
                    }}
                  />
                  <span className="font-semibold">+</span>
                  <TextInput
                    inputMode="numeric"
                    aria-label={t('twins.gestationDays')}
                    placeholder={t('twins.gestationDaysShort')}
                    className="w-20"
                    value={d.gaDays}
                    aria-invalid={gaError === slot}
                    onChange={(e) => {
                      setGaError(null);
                      update(slot, { gaDays: e.target.value.replace(/\D/g, '') });
                    }}
                  />
                </div>
                <p className="mt-1.5 text-sm text-muted">
                  {gaError === slot ? <span className="text-danger">{t('twins.invalidGestation')}</span> : t('twins.gestationHint')}
                </p>
              </fieldset>
              <Field
                label={t('twins.feedInterval')}
                hint={
                  intervalError === slot ? <span className="text-danger">{t('twins.invalidInterval')}</span> : t('twins.feedIntervalHint')
                }
              >
                {(p) => (
                  <TextInput
                    {...p}
                    inputMode="decimal"
                    value={d.feedHours}
                    aria-invalid={intervalError === slot}
                    onChange={(e) => {
                      setIntervalError(null);
                      update(slot, { feedHours: e.target.value });
                    }}
                  />
                )}
              </Field>
              <Segmented<SexChoice>
                label={t('twins.sex')}
                hint={t('twins.sexHint')}
                value={d.sex}
                options={[
                  { value: 'female', label: t('twins.female') },
                  { value: 'male', label: t('twins.male') },
                  { value: 'unset', label: t('twins.sexNotSet') },
                ]}
                onChange={(sex) => update(slot, { sex })}
              />
            </fieldset>
          );
        })}
        <Button type="submit" className="min-h-14 w-full text-lg">
          {editing ? t('common.save') : t('twins.start')}
        </Button>
      </form>
    </Page>
  );
}
