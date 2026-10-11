import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/Button';
import { Field, Page, TextInput, cx } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { parseAmount } from '@/features/checklist/logic';
import { BABY_IDS, SLOTS, fromLocalInput, toLocalInput } from '@/features/log/logic';
import type { Baby, NewRecord, TwinColor, TwinSlot } from '@/data/types';
import { DEFAULT_COLORS, TWIN_COLORS, twinStyle, TwinBadge, useBabies } from './twins';

interface TwinDraft {
  name: string;
  color: TwinColor;
  born: string;
  weight: string;
  length: string;
}

function toDraft(baby: Baby | undefined, slot: TwinSlot): TwinDraft {
  return {
    name: baby?.name ?? '',
    color: baby?.color ?? DEFAULT_COLORS[slot],
    born: toLocalInput(baby?.birthDateTime ?? new Date().toISOString()),
    weight: baby?.birthWeightG?.toString() ?? '',
    length: baby?.birthLengthCm?.toString().replace('.', ',') ?? '',
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
      records[slot] = {
        slot,
        name: d.name.trim(),
        color: d.color,
        birthDateTime: fromLocalInput(d.born),
        birthWeightG: weight === null ? null : Math.round(weight),
        birthLengthCm: d.length.trim() ? parseAmount(d.length) : null,
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
                    const taken = c === other;
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
