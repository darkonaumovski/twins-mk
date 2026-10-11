import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Field, Segmented, Select, TextInput, Toggle } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { todayISO } from '@/lib/format';
import type { BabyScope, LogType, NewRecord, Routine, RoutineRule } from '@/data/types';
import { ScopePicker, useLogTypeName } from './shared';

const LOG_TYPES: LogType[] = ['feed', 'diaper', 'sleep', 'med'];

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

export function RoutineEditor({ routine, onClose }: { routine: Routine | null; onClose: () => void }) {
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
  const [error, setError] = useState<string | null>(null);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return setError(t('log.required'));
    if (kind === 'afterLast' && babies === 'none') return setError(t('routine.needsBaby'));
    const cleanTimes = [...new Set(times.filter(Boolean))].sort();
    if (kind === 'everyDays' && cleanTimes.length === 0) return setError(t('routine.needsTime'));
    const record = {
      title: title.trim(),
      babies,
      active,
      rule: kind === 'afterLast' ? { kind, hours, logType } : { kind, days, times: cleanTimes, startDate },
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
