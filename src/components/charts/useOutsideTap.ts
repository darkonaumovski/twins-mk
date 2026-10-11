import { useEffect, type RefObject } from 'react';

/** Calls `onOutside` when the user taps or clicks anywhere outside `ref` while `active`. */
export function useOutsideTap(ref: RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [ref, active, onOutside]);
}
