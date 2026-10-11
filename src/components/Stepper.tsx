import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';

/** Large −/+ number control for quantities; the number itself can also be typed. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const btn = 'flex size-12 items-center justify-center rounded-xl bg-surface-2 text-ink disabled:opacity-40';

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label={t('common.decrease', { label })}
        >
          <Minus aria-hidden size={20} />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(Math.round(Number(e.target.value) || 0)))}
          onFocus={(e) => e.target.select()}
          className="min-h-12 w-20 rounded-xl border border-line bg-surface-2 text-center text-lg font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          className={btn}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label={t('common.increase', { label })}
        >
          <Plus aria-hidden size={20} />
        </button>
      </div>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}
