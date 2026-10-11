import { useTranslation } from 'react-i18next';
import { Moon, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/Button';
import { CommitInput, Field, Section, Select, TextInput } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useDevicePrefs, useLive, useSettings, useStore } from '@/data/StoreContext';
import { MAX_CAREGIVERS, PARENT_IDS, useCaregivers } from '@/lib/caregivers';
import type { NightShift } from '@/data/types';
import { CaregiverPicker } from './CaregiverPicker';

/** Who uses this phone, the parents' names and helpers (grandparents, a nanny…). */
export function FamilySettings() {
  const { t } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const settings = useSettings();
  const prefs = useDevicePrefs();
  const caregivers = useCaregivers();
  const helpers = useLive(async (s) => (await s.caregivers.list()).sort((a, b) => a.order - b.order), []);
  if (!settings || !prefs || !caregivers || !helpers) return null;

  const addHelper = () => store.caregivers.create({ name: '', order: Math.max(0, ...helpers.map((h) => h.order)) + 1 });

  const removeHelper = async (id: string, name: string) => {
    await store.caregivers.remove(id);
    toast({
      message: t('caregivers.removed', { name: name || t('caregivers.helper') }),
      action: { label: t('common.undo'), onClick: () => void store.caregivers.restore(id) },
    });
  };

  return (
    <Section title={t('settings.family')}>
      <CaregiverPicker
        label={t('settings.thisPhone')}
        value={caregivers.some((c) => c.id === prefs.parent) ? prefs.parent : 'p1'}
        options={caregivers.map((c) => ({ value: c.id, label: c.name }))}
        onChange={(parent) => store.device.update({ parent })}
        hint={t('settings.thisPhoneHint')}
      />
      {PARENT_IDS.map((p) => (
        <Field key={p} label={t('settings.parentName', { parent: t(`parents.${p}`) })}>
          {(props) => (
            <CommitInput
              {...props}
              value={p === 'p1' ? settings.parent1Name : settings.parent2Name}
              placeholder={t(`parents.${p}`)}
              autoComplete="off"
              maxLength={40}
              onCommit={(name) => store.settings.update(p === 'p1' ? { parent1Name: name } : { parent2Name: name })}
            />
          )}
        </Field>
      ))}

      <fieldset className="space-y-3">
        <legend className="mb-1.5 font-medium">{t('caregivers.helpers')}</legend>
        <p className="text-sm text-muted">{t('caregivers.helpersHint')}</p>
        {helpers.map((h) => (
          <div key={h.id} className="flex items-center gap-2">
            <CommitInput
              value={h.name}
              placeholder={t('caregivers.namePlaceholder')}
              aria-label={t('caregivers.name')}
              autoComplete="off"
              maxLength={40}
              onCommit={(name) => store.caregivers.update(h.id, { name })}
            />
            <IconButton
              label={t('caregivers.remove', { name: h.name || t('caregivers.helper') })}
              onClick={() => removeHelper(h.id, h.name)}
            >
              <Trash2 aria-hidden size={20} />
            </IconButton>
          </div>
        ))}
        {caregivers.length < MAX_CAREGIVERS ? (
          <Button variant="ghost" onClick={addHelper}>
            <Plus aria-hidden size={18} />
            {t('caregivers.add')}
          </Button>
        ) : (
          <p className="text-sm text-muted">{t('caregivers.max', { count: MAX_CAREGIVERS })}</p>
        )}
      </fieldset>
    </Section>
  );
}

/** Tonight's shifts (repeated every night), e.g. Marija 22:00–02:00, Darko 02:00–06:00. */
export function NightDutySettings() {
  const { t } = useTranslation();
  const store = useStore();
  const settings = useSettings();
  const caregivers = useCaregivers();
  if (!settings || !caregivers) return null;

  const shifts = settings.nightShifts;
  const save = (next: NightShift[]) => store.settings.update({ nightShifts: next });
  const change = (i: number, patch: Partial<NightShift>) => save(shifts.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => {
    const last = shifts[shifts.length - 1];
    save([...shifts, { caregiverId: caregivers[0].id, from: last?.to ?? '22:00', to: last ? '06:00' : '02:00' }]);
  };

  return (
    <Section title={t('duty.title')}>
      <p className="flex items-start gap-2 text-sm text-muted">
        <Moon aria-hidden size={18} className="mt-0.5 shrink-0 text-accent" />
        {t('duty.hint')}
      </p>
      {shifts.map((shift, i) => (
        <div key={i} className="space-y-2 rounded-2xl border border-line p-3">
          <div className="flex items-center gap-2">
            <Select aria-label={t('duty.who')} value={shift.caregiverId} onChange={(e) => change(i, { caregiverId: e.target.value })}>
              {caregivers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <IconButton label={t('duty.remove')} onClick={() => save(shifts.filter((_, j) => j !== i))}>
              <Trash2 aria-hidden size={20} />
            </IconButton>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('duty.from')}>
              {(p) => (
                <TextInput {...p} type="time" value={shift.from} onChange={(e) => e.target.value && change(i, { from: e.target.value })} />
              )}
            </Field>
            <Field label={t('duty.to')}>
              {(p) => (
                <TextInput {...p} type="time" value={shift.to} onChange={(e) => e.target.value && change(i, { to: e.target.value })} />
              )}
            </Field>
          </div>
        </div>
      ))}
      <Button variant="ghost" onClick={add}>
        <Plus aria-hidden size={18} />
        {t('duty.add')}
      </Button>
    </Section>
  );
}
