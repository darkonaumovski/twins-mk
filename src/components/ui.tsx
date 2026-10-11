import {
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/95 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <h1 className="flex-1 text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </header>
  );
}

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <PageHeader title={title}>{actions}</PageHeader>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-4">{children}</div>
    </>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-4">{children}</div>
    </section>
  );
}

/** Label + control + optional hint, wired up for screen readers. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (props: { id: string; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {children({ id, 'aria-describedby': hint ? hintId : undefined })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

const control =
  'block min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-ink placeholder:text-muted focus-visible:border-accent';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(control, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(control, 'appearance-auto', props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(control, 'py-2', props.className)} />;
}

/** Text input that saves when it loses focus (or on Enter), not on every keystroke. */
export function CommitInput({
  value,
  onCommit,
  allowEmpty = true,
  ...rest
}: { value: string; onCommit: (v: string) => void; allowEmpty?: boolean } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (!next && !allowEmpty) return setDraft(value);
    if (next !== value) onCommit(next);
  };
  return (
    <TextInput
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

/** A large switch-style checkbox. */
export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
      <span className="font-medium">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" role="switch" />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-surface-2 ring-1 ring-line transition peer-checked:bg-accent peer-focus-visible:outline-3 peer-focus-visible:outline-accent after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
      />
    </label>
  );
}

/** A row of mutually exclusive options, built on native radios for keyboard and screen-reader support. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  hideLabel = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
  /** Keep the label for screen readers only (e.g. when used as tabs under a page title). */
  hideLabel?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="space-y-1.5">
      <legend className={hideLabel ? 'sr-only' : 'mb-1.5 font-medium'}>{label}</legend>
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {options.map((o) => (
          <label key={o.value} className="relative flex-1">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-medium text-muted transition peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-sm peer-focus-visible:outline-3 peer-focus-visible:outline-accent">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </fieldset>
  );
}
