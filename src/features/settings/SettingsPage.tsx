import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, Info, ShieldCheck, ShieldAlert } from 'lucide-react';
import { CommitInput, Field, Page, Section, Segmented, Select, TextInput, Toggle } from '@/components/ui';
import { useDevicePrefs, useSettings, useStore } from '@/data/StoreContext';
import { CURRENCIES } from '@/data/defaults';
import { LANGUAGES } from '@/i18n';
import { pregnancyProgress } from '@/lib/pregnancy';
import { ensurePersistentStorage, type PersistState } from '@/lib/storage';
import type { Language, ParentId, ThemePref } from '@/data/types';
import { useParentName } from '@/lib/parents';
import { useBabies } from '@/features/twins/twins';

export function SettingsPage() {
  const { t } = useTranslation();
  const store = useStore();
  const settings = useSettings();
  const prefs = useDevicePrefs();
  const parentName = useParentName();
  const babies = useBabies();
  const [persist, setPersist] = useState<PersistState | null>(null);

  useEffect(() => {
    void ensurePersistentStorage().then(setPersist);
  }, []);

  if (!settings || !prefs) return null;

  const progress = settings.dueDate ? pregnancyProgress(settings.dueDate, new Date()) : null;

  return (
    <Page title={t('settings.title')}>
      <Section title={t('settings.general')}>
        <Segmented<Language>
          label={t('settings.language')}
          value={prefs.language}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          onChange={(language) => store.device.update({ language })}
        />
        <Segmented<ThemePref>
          label={t('settings.theme')}
          value={prefs.theme}
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
          ]}
          onChange={(theme) => store.device.update({ theme })}
        />
      </Section>

      <Section title={t('settings.family')}>
        <Segmented<ParentId>
          label={t('settings.thisPhone')}
          value={prefs.parent}
          options={[
            { value: 'p1', label: parentName('p1') },
            { value: 'p2', label: parentName('p2') },
          ]}
          onChange={(parent) => store.device.update({ parent })}
          hint={t('settings.thisPhoneHint')}
        />
        {(['p1', 'p2'] as const).map((p) => (
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
      </Section>

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

      <Section title={t('settings.storage')}>
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
