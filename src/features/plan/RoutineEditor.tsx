import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Field, Segmented, Select, TextInput, Toggle } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { todayISO } from '@/lib/format';
import { parseAmount } from '@/features/checklist/logic';
import type { BabyScope, LogType, NewRecord, Routine, RoutineMed, RoutineRule } from '@/data/types';
import { ScopePicker, useLogTypeName } from './shared';

const LOG_TYPES: LogType[] = ['feed', 'diaper', 'sleep', 'med'];

/**
 * Starting points for common routines. They only fill in a name and how often;
 * the parents choose the times (and any dose) themselves.
 */
const TEMPLATES = [
  { key: 'vitD', days: 1, med: true },
  { key: 'bath', days: 2, med: false },
  { key: 'tummy', days: 1, med: false },
  { key: 'nails', days: 7, med: false },
] as const;
type TemplateKey = (typeof TEMPLATES)[number]['key'];

export function useDescribeRoutine(): (rule: RoutineRule) => string {
  const { t } = useTranslation();
  const typeName = useLogTypeName();
  return useCallback(
    (rule) => {
      if (rule.kind === 'afterLast') return t('routine.describeAfter', { hours: rule.hours, type: typeName(rule.logType).toLowerCase() });
      const times = [...rule.times].sort().join(', ');
      return rule.days === 1 ? t('routine.describeDaily', { times }) : t('routine.describeEvery', { days: rule.days, times });
    },
    [t, typeName],
  );
}

export function RoutineEditor({
  routine,
  onClose,
  onAppointmentTemplate,
}: {
  routine: Routine | null;
  onClose: () => void;
  /** Opens a new appointment with the given title (from the "check-up" example). */
  onAppointmentTemplate?: (title: string) => void;
}) {
  const { t } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const typeName = useLogTypeName();
  const rule = routine?.rule;
  const [title, setTitle] = useState(routine?.title ?? '');
  const [babies, setBabies] = useState<BabyScope>(routine?.babies ?? 'both');
  const [kind, setKind] = useState<RoutineRule['kind']>(rule?.kind ?? 'everyDays');
  const [hours, setHours] = useState(rule?.kind === 'afterLast' ? rule.hours : 3);
  const [logType, setLogType] = useState<LogType>(rule?.kind === 'afterLast' ? rule.logType : 'feed');
  const [days, setDays] = useState(rule?.kind === 'everyDays' ? rule.days : 1);
  const [times, setTimes] = useState<string[]>(rule?.kind === 'everyDays' ? rule.times : ['19:00']);
  const [startDate, setStartDate] = useState(rule?.kind === 'everyDays' ? rule.startDate : todayISO());
  const [active, setActive] = useState(routine?.active ?? true);
  const [medOn, setMedOn] = useState(Boolean(routine?.med));
  const [medName, setMedName] = useState(routine?.med?.name ?? '');
  const [dose, setDose] = useState(routine?.med?.dose ?? '');
  const [minHours, setMinHours] = useState(routine?.med?.minIntervalHours?.toString().replace('.', ',') ?? '');

  const applyTemplate = (key: TemplateKey) => {
    const template = TEMPLATES.find((x) => x.key === key)!;
    const name = t(`routine.templates.${key}`);
    setTitle(name);
    setKind('everyDays');
    setDays(template.days);
    // The parents pick the time(s).
    setTimes(['']);
    setMedOn(template.med);
    setMedName(template.med ? name : '');
    setDose('');
    setMinHours('');
    setError(null);
  };
  const [error, setError] = useState<string | null>(null);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return setError(t('log.required'));
    if (kind === 'afterLast' && babies === 'none') return setError(t('routine.needsBaby'));
    const cleanTimes = [...new Set(times.filter(Boolean))].sort();
    if (kind === 'everyDays' && cleanTimes.length === 0) return setError(t('routine.needsTime'));
    let med: RoutineMed | null = null;
    if (medOn) {
      const interval = minHours.trim() ? parseAmount(minHours) : null;
      if (minHours.trim() && (interval === null || interval <= 0 || interval > 24 * 31)) return setError(t('med.invalidInterval'));
      med = { name: (medName.trim() || title.trim()).slice(0, 80), dose: dose.trim(), minIntervalHours: interval };
    }
    const record = {
      title: title.trim(),
      babies,
      active,
      rule: kind === 'afterLast' ? { kind, hours, logType } : { kind, days, times: cleanTimes, startDate },
      med,
    } satisfies NewRecord<Routine>;
    if (routine) await store.routines.update(routine.id, record);
    else await store.routines.create(record);
    onClose();
  };

  const remove = async () => {
    if (!routine) return;
    if (!(await confirm({ title: t('routine.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return;
    await store.routines.remove(routine.id);
    onClose();
    toast({ message: t('routine.deleted'), action: { label: t('common.undo'), onClick: () => void store.routines.restore(routine.id) } });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={routine ? t('routine.edit') : t('routine.new')}
      footer={
        <>
          {routine && (
            <Button variant="ghost" onClick={remove} className="text-danger" aria-label={t('common.delete')}>
              <Trash2 aria-hidden size={20} />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="routine-form" className="flex-1">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="routine-form" onSubmit={save} className="space-y-5" noValidate>
        {!routine && (
          <fieldset className="space-y-2 rounded-2xl bg-surface-2 p-3">
            <legend className="sr-only">{t('routine.templatesTitle')}</legend>
            <p className="flex items-start gap-2 text-sm text-muted">
              <Sparkles aria-hidden size={16} className="mt-0.5 shrink-0 text-accent" />
              {t('routine.templatesHint')}
            </p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map(({ key }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyTemplate(key)}
                  className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-medium"
                >
                  {t(`routine.templates.${key}`)}
                </button>
              ))}
              {onAppointmentTemplate && (
                <button
                  type="button"
                  onClick={() => onAppointmentTemplate(t('routine.templates.checkup'))}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-medium"
                >
                  <CalendarDays aria-hidden size={16} />
                  {t('routine.templates.checkup')}
                </button>
              )}
            </div>
          </fieldset>
        )}
        <Field label={t('routine.title')}>
          {(p) => (
            <TextInput
              {...p}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              placeholder={t('routine.titlePlaceholder')}
              maxLength={80}
              data-autofocus={!routine || undefined}
            />
          )}
        </Field>
        <ScopePicker
          value={babies}
          onChange={(v) => {
            setBabies(v);
            setError(null);
          }}
          allowFamily={kind === 'everyDays'}
        />
        <Segmented<RoutineRule['kind']>
          label={t('routine.kind')}
          value={kind}
          options={[
            { value: 'everyDays', label: t('routine.everyDays') },
            { value: 'afterLast', label: t('routine.afterLast') },
          ]}
          onChange={(k) => {
            setKind(k);
            if (k === 'afterLast' && babies === 'none') setBabies('both');
          }}
        />

        {kind === 'afterLast' ? (
          <>
            <Stepper label={t('routine.hours')} value={hours} min={1} max={24} onChange={setHours} />
            <Field label={t('routine.after')}>
              {(p) => (
                <Select {...p} value={logType} onChange={(e) => setLogType(e.target.value as LogType)}>
                  {LOG_TYPES.map((lt) => (
                    <option key={lt} value={lt}>
                      {typeName(lt)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        ) : (
          <>
            <Stepper label={t('routine.days')} value={days} min={1} max={30} onChange={setDays} />
            <fieldset className="space-y-2">
              <legend className="mb-1.5 font-medium">{t('routine.times')}</legend>
              {times.map((time, i) => (
                <div key={i} className="flex items-center gap-2">
                  <TextInput
                    type="time"
                    value={time}
                    aria-label={`${t('routine.times')} ${i + 1}`}
                    onChange={(e) => setTimes((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <IconButton
                    label={t('routine.removeTime', { time })}
                    onClick={() => setTimes((ts) => ts.filter((_, j) => j !== i))}
                    disabled={times.length === 1}
                  >
                    <X aria-hidden size={20} />
                  </IconButton>
                </div>
              ))}
              <Button variant="ghost" onClick={() => setTimes((ts) => [...ts, '08:00'])}>
                <Plus aria-hidden size={18} />
                {t('routine.addTime')}
              </Button>
            </fieldset>
            <Field label={t('routine.startDate')}>
              {(p) => <TextInput {...p} type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />}
            </Field>
          </>
        )}

        <div className="space-y-3 rounded-2xl border border-line p-3">
          <Toggle label={t('med.isMed')} checked={medOn} onChange={setMedOn} />
          {medOn && (
            <>
              <Field label={t('med.name')} hint={t('med.nameHint')}>
                {(p) => (
                  <TextInput {...p} value={medName} placeholder={title} maxLength={80} onChange={(e) => setMedName(e.target.value)} />
                )}
              </Field>
              <Field label={t('log.dose')} hint={t('med.doseHint')}>
                {(p) => <TextInput {...p} value={dose} maxLength={80} onChange={(e) => setDose(e.target.value)} />}
              </Field>
              <Field label={t('med.minInterval')} hint={t('med.minIntervalHint')}>
                {(p) => (
                  <TextInput
                    {...p}
                    inputMode="decimal"
                    value={minHours}
                    onChange={(e) => {
                      setMinHours(e.target.value);
                      setError(null);
                    }}
                  />
                )}
              </Field>
            </>
          )}
        </div>

        <Toggle label={t('routine.active')} checked={active} onChange={setActive} />
        {error && (
          <p role="alert" className="font-medium text-danger">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
