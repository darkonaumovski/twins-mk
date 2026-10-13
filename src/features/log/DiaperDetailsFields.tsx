import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cx } from '@/components/ui';
import type { DiaperData } from '@/data/types';
import { hasDetails, isDirty, savesDetails, STOOL_COLORS, STOOL_TEXTURES, type DiaperDetails } from './diaperDetails';

/** Chips where a second tap clears the choice (every detail is optional). */
function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : o.value)}
              className={cx(
                'flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition',
                on ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-muted',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Optional diaper details, collapsed under "Details" so logging stays quick. Open from the start
 * when the entry already has some. Every option is a neutral description.
 */
export function DiaperDetailsFields({
  kind,
  value,
  onChange,
}: {
  kind: DiaperData['kind'];
  value: DiaperDetails;
  onChange: (value: DiaperDetails) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => hasDetails(value));
  const panel = useId();
  const set = <K extends keyof DiaperDetails>(key: K, v: DiaperDetails[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="rounded-2xl border border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panel : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-2 px-3 text-left font-medium"
      >
        <span className="flex-1">{t('diaper.details')}</span>
        {!open && savesDetails(kind, value) && (
          <>
            <span aria-hidden className="size-2 rounded-full bg-accent" />
            <span className="sr-only">{t('diaper.detailsSet')}</span>
          </>
        )}
        <ChevronDown aria-hidden size={20} className={cx('text-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={panel} className="space-y-4 px-3 pb-3">
          <ChipGroup<'yes'>
            label={t('diaper.rash')}
            options={[{ value: 'yes', label: t('diaper.rashYes') }]}
            value={value.rash ? 'yes' : null}
            onChange={(v) => set('rash', v === 'yes')}
          />
          {isDirty(kind) ? (
            <>
              <ChipGroup
                label={t('diaper.color')}
                options={STOOL_COLORS.map((c) => ({ value: c, label: t(`diaper.colors.${c}`) }))}
                value={value.color}
                onChange={(v) => set('color', v)}
              />
              <ChipGroup
                label={t('diaper.texture')}
                options={STOOL_TEXTURES.map((x) => ({ value: x, label: t(`diaper.textures.${x}`) }))}
                value={value.texture}
                onChange={(v) => set('texture', v)}
              />
            </>
          ) : (
            <p className="text-sm text-muted">{t('diaper.dirtyOnly')}</p>
          )}
        </div>
      )}
    </div>
  );
}
