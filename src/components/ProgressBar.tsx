import { cx } from './ui';

export function ProgressBar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cx('h-2 overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}
