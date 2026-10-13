import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { CalendarPlus, Plus, Syringe, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Field, Page, TextArea, TextInput } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useLive, useStore } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { todayISO } from '@/lib/format';
import { newId } from '@/lib/ids';
import type { BabyScope, Vaccine } from '@/data/types';
import { SLOTS, slotOf, type Who } from '@/features/log/logic';
import { WhoPicker } from '@/features/log/WhoPicker';
import { AppointmentEditor } from '@/features/plan/AppointmentEditor';
import { colorOf, tintFor, twinStyle, TwinBadge, useBabies, useTwinName, type Babies } from '@/features/twins/twins';
import { nameSuggestions, nextDose, parseDose, placeSuggestions, scopeOf, vaccineRecords, vaccinesBySlot } from './logic';

type Editing = { vaccine: Vaccine } | { add: true };

function VaccineSheet({
  editing,
  babies,
  all,
  onClose,
  onPlanNext,
}: {
  editing: Editing;
  babies: Babies;
  all: readonly Vaccine[];
  onClose: () => void;
  onPlanNext: (title: string, babies: BabyScope) => void;
}) {
  const { t } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const name = useTwinName(babies);
  const existing = 'vaccine' in editing ? editing.vaccine : null;
  // A new vaccination is usually given to both twins on the same visit.
  const [who, setWho] = useState<Who>('both');
  const [vaccineName, setVaccineName] = useState(existing?.name ?? '');
  const [dose, setDose] = useState(existing?.dose?.toString() ?? '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [place, setPlace] = useState(existing?.place ?? '');
  const [lot, setLot] = useState(existing?.lot ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState(false);
  const [doseError, setDoseError] = useState(false);

  const slot = existing ? slotOf(existing.babyId) : null;
  const forWho = slot ? name(slot) : who === 'both' ? t('twins.both') : name(who);

  /** Writes the form; returns what was saved (for "Plan next dose"), or null if something is missing. */
  const persist = async (): Promise<Pick<Vaccine, 'name' | 'dose'> | null> => {
    const parsed = parseDose(dose);
    if (parsed === 'invalid') {
      setDoseError(true);
      return null;
    }
    if (!vaccineName.trim() || !date) {
      setError(true);
      return null;
    }
    const fields = { name: vaccineName, dose: parsed, date, place, lot, notes };
    if (existing) {
      // Only this twin's record: the other twin's stays as it was.
      const [record] = vaccineRecords(slot!, fields, () => '');
      const { name: n, dose: d, place: p, lot: l, notes: x } = record;
      await store.vaccines.update(existing.id, { name: n, dose: d, date, place: p, lot: l, notes: x });
      return record;
    }
    const [record] = await store.vaccines.createMany(vaccineRecords(who, fields, newId));
    return record;
  };

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (await persist()) onClose();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({ title: t('vaccines.deleteConfirm', { name: name(slot!) }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    await store.vaccines.remove(existing.id);
    onClose();
    toast({ message: t('vaccines.deleted'), action: { label: t('common.undo'), onClick: () => void store.vaccines.restore(existing.id) } });
  };

  /** Saves what is in the form first, so a corrected dose is kept and counted on. */
  const planNext = async () => {
    if (!existing) return;
    const saved = await persist();
    if (!saved) return;
    const n = nextDose(saved);
    const title = n === null ? t('vaccines.nextTitleOpen', { name: saved.name }) : t('vaccines.nextTitle', { name: saved.name, dose: n });
    onPlanNext(title, scopeOf(existing, all));
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? `${existing.name} · ${name(slot!)}` : t('vaccines.new')}
      tint={slot ? twinStyle(colorOf(babies, slot)) : tintFor(babies, who)}
      footer={
        <>
          {existing && (
            <Button variant="ghost" onClick={remove} className="text-danger" aria-label={t('common.delete')}>
              <Trash2 aria-hidden size={20} />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="vaccine-form" className="flex-1">
            {t('log.saveFor', { name: forWho })}
          </Button>
        </>
      }
    >
      <form id="vaccine-form" onSubmit={save} className="space-y-5" noValidate>
        {existing ? (
          existing.groupId && <p className="text-sm text-muted">{t('vaccines.groupNote', { name: name(slot!) })}</p>
        ) : (
          <WhoPicker babies={babies} value={who} onChange={setWho} />
        )}
        <Field label={t('vaccines.name')} hint={error ? <span className="text-danger">{t('log.required')}</span> : undefined}>
          {(p) => (
            <>
              <TextInput
                {...p}
                value={vaccineName}
                onChange={(e) => {
                  setVaccineName(e.target.value);
                  setError(false);
                }}
                placeholder={t('vaccines.namePlaceholder')}
                list="vaccine-names"
                maxLength={80}
                data-autofocus={!existing || undefined}
              />
              <datalist id="vaccine-names">
                {nameSuggestions(all).map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('vaccines.dose')} hint={doseError ? <span className="text-danger">{t('vaccines.doseInvalid')}</span> : undefined}>
            {(p) => (
              <TextInput
                {...p}
                inputMode="numeric"
                maxLength={3}
                value={dose}
                onChange={(e) => {
                  setDose(e.target.value);
                  setDoseError(false);
                }}
              />
            )}
          </Field>
          <Field label={t('vaccines.date')}>
            {(p) => <TextInput {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
        <Field label={t('vaccines.place')}>
          {(p) => (
            <>
              <TextInput {...p} value={place} onChange={(e) => setPlace(e.target.value)} list="vaccine-places" maxLength={120} />
              <datalist id="vaccine-places">
                {placeSuggestions(all).map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label={t('vaccines.lot')}>
          {(p) => <TextInput {...p} value={lot} onChange={(e) => setLot(e.target.value)} maxLength={60} autoCapitalize="characters" />}
        </Field>
        <Field label={t('vaccines.notes')}>
          {(p) => <TextArea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />}
        </Field>
        {existing && (
          <Button variant="secondary" className="w-full" onClick={planNext}>
            <CalendarPlus aria-hidden size={20} />
            {t('vaccines.planNext')}
          </Button>
        )}
      </form>
    </Sheet>
  );
}

/** Each twin's vaccinations side by side, newest first. */
export function VaccinesPage() {
  const { t, i18n } = useTranslation();
  const babies = useBabies();
  const name = useTwinName(babies);
  const all = useLive((s) => s.vaccines.listAll(), []);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [next, setNext] = useState<{ title: string; babies: BabyScope } | null>(null);
  if (!babies || !all) return null;

  const locale = dateLocale(i18n.language);
  const columns = vaccinesBySlot(all);

  return (
    <Page
      title={t('vaccines.title')}
      actions={
        <Button variant="secondary" onClick={() => setEditing({ add: true })}>
          <Plus aria-hidden size={18} />
          {t('vaccines.add')}
        </Button>
      }
    >
      <p className="text-sm text-muted">{t('vaccines.intro')}</p>
      <div className="grid grid-cols-2 gap-2">
        {SLOTS.map((slot) => (
          <section key={slot} className="min-w-0 space-y-2" style={twinStyle(colorOf(babies, slot))}>
            <h2 className="flex items-center gap-2 px-1 font-semibold">
              <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
              <span className="truncate">{name(slot)}</span>
            </h2>
            {columns[slot].length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-2 py-3 text-sm text-muted">{t('vaccines.empty')}</p>
            ) : (
              <ul className="space-y-2">
                {columns[slot].map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setEditing({ vaccine: v })}
                      className="block min-h-14 w-full rounded-xl border-l-4 border-(--tw) bg-surface px-2 py-1.5 text-left text-sm ring-1 ring-line"
                    >
                      <span className="flex items-start gap-1 font-semibold break-words">
                        <Syringe aria-hidden size={14} className="mt-1 shrink-0 text-(--tw-ink)" />
                        <span className="min-w-0">{v.name}</span>
                      </span>
                      {v.dose !== null && <span className="block text-xs">{t('vaccines.doseShort', { dose: v.dose })}</span>}
                      <span className="block text-xs text-muted">{format(parseISO(v.date), 'd MMM yyyy', { locale })}</span>
                      {v.place && <span className="block truncate text-xs text-muted">{v.place}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {editing && (
        <VaccineSheet
          editing={editing}
          babies={babies}
          all={all}
          onClose={() => setEditing(null)}
          onPlanNext={(title, scope) => {
            setEditing(null);
            setNext({ title, babies: scope });
          }}
        />
      )}
      {next && <AppointmentEditor appointment={null} defaultTitle={next.title} defaultBabies={next.babies} onClose={() => setNext(null)} />}
    </Page>
  );
}
