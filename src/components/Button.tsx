import type { ButtonHTMLAttributes } from 'react';
import { cx } from './ui';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-110',
  secondary: 'bg-surface-2 text-ink hover:brightness-95 dark:hover:brightness-125',
  danger: 'bg-danger text-white dark:text-bg hover:brightness-110',
  ghost: 'text-ink hover:bg-surface-2',
};

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      {...rest}
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-semibold transition disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    />
  );
}

/** Square icon-only button; `label` is required so screen readers can announce it. */
export function IconButton({ label, className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      {...rest}
      className={cx('flex size-12 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2', className)}
    />
  );
}
