import { PhotoUsage } from '@/features/photos/PhotoSettings';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, Info, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Field, Page, Section, Segmented, Select, TextInput, Toggle } from '@/components/ui';
import { useDevicePrefs, useSettings, useStore } from '@/data/StoreContext';
import { CURRENCIES } from '@/data/defaults';
import { LANGUAGES } from '@/i18n';
import { pregnancyProgress } from '@/lib/pregnancy';
import { ensurePersistentStorage, type PersistState } from '@/lib/storage';
import type { Language, ThemePref } from '@/data/types';
import { FamilySettings, NightDutySettings } from '@/features/family/FamilySettings';
import { Choice } from '@/components/Choice';
import { BackupReminder } from './BackupReminder';
import { useBabies } from '@/features/twins/twins';
import { RemindersSettings } from '@/features/plan/RemindersSettings';
import { BackupSettings } from './BackupSettings';
import { InstallSettings } from './InstallSettings';
import { SyncSettings } from './SyncSettings';
import { Stepper } from '@/components/Stepper';

export function SettingsPage() {
  const { t } = useTranslation();
  const store = useStore();
  const settings = useSettings();
  const prefs = useDevicePrefs();
  const babies = useBabies();
  const [persist, setPersist] = useState<PersistState | null>(null);

  useEffect(() => {
    void ensurePersistentStorage().then(setPersist);
  }, []);

  if (!settings || !prefs) return null;

  const progress = settings.dueDate ? pregnancyProgress(settings.dueDate, new Date()) : null;

  return (
    <Page title={t('settings.title')}>
      <BackupReminder />

      <Section title={t('settings.general')}>
        <Segmented<Language>
          label={t('settings.language')}
          value={prefs.language}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          onChange={(language) => store.device.update({ language })}
        />
        <Choice
          label={t('settings.theme')}
          value={prefs.theme}
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
            { value: 'night', label: t('settings.themeNight') },
            { value: 'autoNight', label: t('settings.themeAutoNight') },
          ]}
          onChange={(theme) => store.device.update({ theme: theme as ThemePref })}
          hint={t('settings.themeNightHint')}
        />
        <div>
          <Toggle
            label={t('settings.haptics')}
            checked={prefs.haptics !== false}
            onChange={(haptics) => store.device.update({ haptics })}
          />
          <p className="text-sm text-muted">{t('settings.hapticsHint')}</p>
        </div>
      </Section>

      <FamilySettings />

      {babies?.ready && <NightDutySettings />}

      <SyncSettings />

      <Section title={t('settings.twins')}>
        <Link to="/setup" className="-my-1 flex min-h-12 items-center gap-3 font-medium">
          <span className="flex-1">{babies?.ready ? t('settings.editTwins') : t('settings.setUpTwins')}</span>
          <ChevronRight aria-hidden size={20} className="text-muted" />
        </Link>
        {babies?.ready && (
          <div>
            <Toggle
              label={t('settings.plannerMode')}
              checked={settings.phase === 'planner'}
              onChange={(on) => store.settings.update({ phase: on ? 'planner' : 'prep' })}
            />
            <p className="text-sm text-muted">{t('settings.plannerModeHint')}</p>
          </div>
        )}
        {babies?.ready && (
          <Stepper
            label={t('settings.feedNudge')}
            hint={t('settings.feedNudgeHint')}
            value={settings.feedNudgeMin}
            min={0}
            max={180}
            step={15}
            onChange={(feedNudgeMin) => store.settings.update({ feedNudgeMin })}
          />
        )}
        {babies?.ready && (
          <>
            <Stepper
              label={t('settings.rhythmTogether')}
              hint={t('settings.rhythmTogetherHint')}
              value={settings.rhythmTogetherMin}
              min={5}
              max={60}
              step={5}
              onChange={(rhythmTogetherMin) => store.settings.update({ rhythmTogetherMin })}
            />
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 font-medium">{t('settings.nightHours')}</legend>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('settings.nightFrom')}>
                  {(p) => (
                    <TextInput
                      {...p}
                      type="time"
                      value={settings.nightHours.from}
                      onChange={(e) =>
                        e.target.value && store.settings.update({ nightHours: { ...settings.nightHours, from: e.target.value } })
                      }
                    />
                  )}
                </Field>
                <Field label={t('settings.nightTo')}>
                  {(p) => (
                    <TextInput
                      {...p}
                      type="time"
                      value={settings.nightHours.to}
                      onChange={(e) =>
                        e.target.value && store.settings.update({ nightHours: { ...settings.nightHours, to: e.target.value } })
                      }
                    />
                  )}
                </Field>
              </div>
              <p className="text-sm text-muted">{t('settings.nightHoursHint')}</p>
            </fieldset>
          </>
        )}
      </Section>

      <Section title={t('settings.pregnancy')}>
        <Field
          label={t('settings.dueDate')}
          hint={
            <>
              {progress &&
                (progress.daysLeft >= 0 ? (
                  <strong className="block font-semibold text-ink">
                    {t('settings.progress', { week: progress.week, day: progress.day, count: progress.daysLeft })}
                  </strong>
                ) : (
                  <strong className="block font-semibold text-ink">{t('settings.pastDue')}</strong>
                ))}
              {t('settings.dueDateHint')}
            </>
          }
        >
          {(props) => (
            <TextInput
              {...props}
              type="date"
              value={settings.dueDate ?? ''}
              onChange={(e) => store.settings.update({ dueDate: e.target.value || null })}
            />
          )}
        </Field>
        <Field label={t('settings.expectedDelivery')} hint={t('settings.expectedDeliveryHint')}>
          {(props) => (
            <TextInput
              {...props}
              type="date"
              value={settings.expectedDelivery ?? ''}
              onChange={(e) => store.settings.update({ expectedDelivery: e.target.value || null })}
            />
          )}
        </Field>
      </Section>

      <Section title={t('settings.money')}>
        <Field label={t('settings.currency')} hint={t('settings.currencyHint')}>
          {(props) => (
            <Select {...props} value={settings.currency} onChange={(e) => store.settings.update({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Section>

      <RemindersSettings />

      <BackupSettings />

      <InstallSettings />

      <Section title={t('settings.storage')}>
        <PhotoUsage />
        {persist && (
          <p className="flex gap-3">
            {persist === 'persisted' ? (
              <ShieldCheck aria-hidden className="mt-0.5 shrink-0 text-ok" size={20} />
            ) : (
              <ShieldAlert aria-hidden className="mt-0.5 shrink-0 text-warn" size={20} />
            )}
            <span>
              {persist === 'persisted'
                ? t('settings.persisted')
                : persist === 'notPersisted'
                  ? t('settings.notPersisted')
                  : t('settings.persistUnknown')}
            </span>
          </p>
        )}
      </Section>

      <Section title={t('about.title')}>
        <p className="flex gap-3">
          <Info aria-hidden className="mt-0.5 shrink-0 text-accent" size={20} />
          <span>{t('about.disclaimer')}</span>
        </p>
        <p className="text-muted">{t('about.privacy')}</p>
        <p className="text-sm text-muted">
          {t('app.name')} · {t('about.version', { version: __APP_VERSION__ })}
        </p>
      </Section>
    </Page>
  );
}
