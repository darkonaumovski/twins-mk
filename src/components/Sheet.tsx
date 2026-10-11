import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

/**
 * Modal built on the native <dialog>: focus is trapped and Escape closes it.
 * Slides up from the bottom on phones (thumb-reachable), centred on wider screens.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the first focusable element (the close button); prefer a marked field.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the dialog element itself (not its content) is a click on the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 sm:inset-0 sm:m-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-3xl"
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <h2 id={titleId} className="flex-1 text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="-mr-2 flex size-12 items-center justify-center rounded-full text-muted hover:bg-surface-2"
            >
              <X aria-hidden size={22} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
          {footer && (
            <div className="flex gap-3 border-t border-line px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  );
}
