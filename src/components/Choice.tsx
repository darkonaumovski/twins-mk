import { useId } from 'react';
import { cx, Segmented } from './ui';

export interface ChoiceOption {
  value: string;
  label: string;
}

/**
 * Picks one of a few options. Up to three fit side by side as a segmented control;
 * more (e.g. a family with helpers) wrap as large chips.
 */
export function Choice({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: ChoiceOption[];
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
