import { useId } from 'react';
import { cx, Segmented } from '@/components/ui';

export interface PickerOption {
  value: string;
  label: string;
}

/**
 * Picks one person (or "anyone"/"all"). Up to three options fit side by side;
 * with helpers there are more, so they wrap as large chips.
 */
export function CaregiverPicker({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  hint?: string;
}) {
  const name = useId();
  if (options.length <= 3) return <Segmented label={label} value={value} options={options} onChange={onChange} hint={hint} />;
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cx(
                'flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition peer-focus-visible:outline-3 peer-focus-visible:outline-accent',
                value === o.value ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-muted',
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </fieldset>
  );
}
