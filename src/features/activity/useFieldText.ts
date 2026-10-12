import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { useLive } from '@/data/StoreContext';
import type { NightShift } from '@/data/types';
import { useBabies, useTwinName } from '@/features/twins/twins';
import { dateLocale } from '@/i18n';
import { useCaregiverName } from '@/lib/caregivers';
import { useLabel } from '@/lib/labels';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Fields holding one of a fixed set of values, and the translation group for them. */
const ENUMS: Record<string, string> = {
  'data.method': 'method',
  'data.side': 'side',
  'data.milk': 'milk',
  'data.topUp.milk': 'milk',
  'data.size': 'size',
  'rule.kind': 'ruleKind',
  'neededBy.kind': 'neededByKind',
  phase: 'phase',
  scope: 'scope',
  priority: 'priority',
  source: 'source',
};

const UNITS: Record<string, string> = {
  'data.ml': 'ml',
  'data.topUp.ml': 'ml',
  leftMl: 'ml',
  rightMl: 'ml',
  totalMl: 'ml',
  ml: 'ml',
  'data.weightG': 'g',
  birthWeightG: 'g',
  'data.lengthCm': 'cm',
  birthLengthCm: 'cm',
  'data.celsius': '°C',
  'data.minutes': 'min',
  minutes: 'min',
  feedIntervalMin: 'min',
  feedNudgeMin: 'min',
  'rule.hours': 'h',
  'med.minIntervalHours': 'h',
};

const DAYS = new Set(['rule.days', 'lowThresholdDays', 'stashUseWithinDays.fridge', 'stashUseWithinDays.freezer']);
const PRICES = new Set(['estimatedUnitPrice', 'actualPrice']);
const PEOPLE = new Set(['loggedBy', 'assignee', 'caregiverId']);

/** Field names and values of a record in words, for the notification history. */
export function useFieldText() {
  const { t, i18n } = useTranslation();
  const twin = useTwinName(useBabies());
  const person = useCaregiverName();
  const label = useLabel();
  const lookups = useLive(
    async (s) => ({
      categories: await s.categories.listAll(),
      routines: await s.routines.listAll(),
      currency: (await s.settings.get()).currency,
    }),
    [],
  );
  const locale = dateLocale(i18n.language);

  const fieldName = useCallback((path: string) => t(`activity.field.${path.replace(/\./g, '_')}`, { defaultValue: path }), [t]);

  const fieldValue = useCallback(
    (collection: string, path: string, value: unknown): string => {
      if (value === undefined || value === null || value === '') return '—';
      if (typeof value === 'boolean') return value ? t('activity.yes') : t('activity.no');
      const text = String(value);

      if (path === 'babyId') return twin(text);
      if (PEOPLE.has(path)) return person(text);
      if (path === 'babies') return text === 'both' ? t('twins.both') : text === 'none' ? t('activity.value.noTwin') : twin(text);
      if (path === 'categoryId') {
        const category = lookups?.categories.find((c) => c.id === text);
        return category ? label(category) : '—';
      }
      if (path === 'routineId') return lookups?.routines.find((r) => r.id === text)?.title ?? '—';
      if (path === 'status') return t(`status.${text}`, { defaultValue: text });
      if (path === 'type' || path === 'rule.logType') return t(`log.${text}`, { defaultValue: text });
      if (path === 'key' && collection === 'milestones') return t(`milestones.keys.${text}`, { defaultValue: text });
      if (path === 'color') return t(`twins.colors.${text}`, { defaultValue: text });
      if (path === 'slot') return text === 'A' ? t('twins.letterA') : t('twins.letterB');
      if (path === 'kind' && collection === 'prepItems') return t(`activity.value.prepKind.${text}`, { defaultValue: text });
      if (path === 'data.kind') return t(`activity.value.diaper.${text}`, { defaultValue: text });
      if (path === 'location' && collection !== 'appointments') {
        return t(`activity.value.location.${text}`, { defaultValue: text });
      }
      if (ENUMS[path]) return t(`activity.value.${ENUMS[path]}.${text}`, { defaultValue: text });

      if (path === 'nightShifts' && Array.isArray(value)) {
        return (value as NightShift[]).map((s) => `${person(s.caregiverId)} ${s.from}–${s.to}`).join(', ') || '—';
      }
      if (Array.isArray(value)) return value.map(String).join(', ') || '—';

      if (typeof value === 'number') {
        const n = value.toLocaleString(i18n.language);
        if (UNITS[path]) return `${n} ${UNITS[path]}`;
        if (DAYS.has(path)) return t('activity.days', { count: value });
        if (PRICES.has(path)) return `${n} ${lookups?.currency ?? ''}`.trim();
        return n;
      }
      if (typeof value === 'string') {
        if (ISO_DATE.test(value)) return format(parseISO(value), 'd MMM yyyy', { locale });
        if (ISO_DATE_TIME.test(value)) return format(new Date(value), 'd MMM yyyy, HH:mm', { locale });
        return value;
      }
      return JSON.stringify(value);
    },
    [t, i18n.language, twin, person, label, lookups, locale],
  );

  return { fieldName, fieldValue };
}
