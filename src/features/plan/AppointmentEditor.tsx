import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Field, TextArea, TextInput } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useLive, useStore } from '@/data/StoreContext';
import type { Appointment, BabyScope } from '@/data/types';
import { fromLocalInput, toLocalInput } from '@/features/log/logic';
import { ScopePicker } from './shared';

/** `appointment` null creates one; `defaultStart` pre-fills the time (e.g. the day tapped in the calendar). */
export function AppointmentEditor({
  appointment,
  defaultStart,
  defaultTitle,
  onClose,
}: {
  appointment: Appointment | null;
  defaultStart?: string;
  /** Title for a new appointment, e.g. from an example. */
  defaultTitle?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [title, setTitle] = useState(appointment?.title ?? defaultTitle ?? '');
  const [babies, setBabies] = useState<BabyScope>(appointment?.babies ?? 'both');
  const [start, setStart] = useState(toLocalInput(appointment?.start ?? defaultStart ?? new Date().toISOString()));
  const [location, setLocation] = useState(appointment?.location ?? '');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [error, setError] = useState(false);

  // Earlier titles and places, offered as suggestions.
  const previous = useLive(async (s) => {
    const all = await s.appointments.list();
    return { titles: [...new Set(all.map((a) => a.title))], places: [...new Set(all.map((a) => a.location).filter(Boolean))] };
  }, []);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const at = fromLocalInput(start);
    if (!title.trim() || !at) {
      setError(true);
      return;
    }
    const record = { title: title.trim(), babies, start: at, location: location.trim(), notes: notes.trim() };
    if (appointment) await store.appointments.update(appointment.id, record);
    else await store.appointments.create(record);
    onClose();
  };

  const remove = async () => {
    if (!appointment) return;
    if (!(await confirm({ title: t('appt.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return;
    await store.appointments.remove(appointment.id);
    onClose();
    toast({
      message: t('appt.deleted'),
      action: { label: t('common.undo'), onClick: () => void store.appointments.restore(appointment.id) },
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={appointment ? t('appt.edit') : t('appt.new')}
      footer={
        <>
          {appointment && (
            <Button variant="ghost" onClick={remove} className="text-danger" aria-label={t('common.delete')}>
              <Trash2 aria-hidden size={20} />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="appt-form" className="flex-1">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="appt-form" onSubmit={save} className="space-y-5" noValidate>
        <Field label={t('appt.title')} hint={error ? <span className="text-danger">{t('log.required')}</span> : undefined}>
          {(p) => (
            <>
              <TextInput
                {...p}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError(false);
                }}
                placeholder={t('appt.titlePlaceholder')}
                list="appt-titles"
                maxLength={100}
                data-autofocus={!appointment || undefined}
              />
              <datalist id="appt-titles">
                {previous?.titles.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <ScopePicker value={babies} onChange={setBabies} />
        <Field label={t('appt.when')}>
          {(p) => <TextInput {...p} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}
        </Field>
        <Field label={t('appt.location')}>
          {(p) => (
            <>
              <TextInput {...p} value={location} onChange={(e) => setLocation(e.target.value)} list="appt-places" maxLength={120} />
              <datalist id="appt-places">
                {previous?.places.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label={t('appt.notes')}>
          {(p) => <TextArea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />}
        </Field>
      </form>
    </Sheet>
  );
}
