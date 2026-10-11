import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { cx } from '@/components/ui';
import { colorOf, twinStyle, TwinBadge, useTwinName, type Babies } from '@/features/twins/twins';
import type { Who } from './logic';

const WHO_KEY = 'twinsmk.who';

/** The last chosen twin is remembered per phone, so a repeat log is a single tap. */
export function useWho(): [Who, (who: Who) => void] {
  const [who, setWho] = useState<Who>(() => {
    try {
      const saved = localStorage.getItem(WHO_KEY);
      return saved === 'A' || saved === 'B' || saved === 'both' ? saved : 'both';
    } catch {
      return 'both';
    }
  });
  const choose = (next: Who) => {
    setWho(next);
    try {
      localStorage.setItem(WHO_KEY, next);
    } catch {
      /* per-phone convenience only */
    }
  };
  return [who, choose];
}

export function WhoPicker({ babies, value, onChange }: { babies: Babies | undefined; value: Who; onChange: (who: Who) => void }) {
  const { t } = useTranslation();
  const name = useTwinName(babies);
  const options: Who[] = ['A', 'both', 'B'];
  // Unique per picker: Today and an open sheet can both show one.
  const group = useId();

  return (
    <fieldset>
      <legend className="sr-only">{t('log.who')}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((who) => {
          const selected = value === who;
          const style = who === 'both' ? undefined : twinStyle(colorOf(babies, who));
          return (
            <label key={who} style={style} className="relative">
              <input type="radio" name={group} value={who} checked={selected} onChange={() => onChange(who)} className="peer sr-only" />
              <span
                className={cx(
                  'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 text-center text-sm font-semibold transition peer-focus-visible:outline-3 peer-focus-visible:outline-accent',
                  selected
                    ? who === 'both'
                      ? 'border-ink bg-surface-2'
                      : 'border-(--tw-ink) bg-(--tw-soft) text-(--tw-ink)'
                    : 'border-line bg-surface text-muted',
                )}
              >
                {who === 'both' ? <Users aria-hidden size={24} /> : <TwinBadge slot={who} color={colorOf(babies, who)} size="sm" />}
                <span className="line-clamp-1 break-all">{who === 'both' ? t('twins.both') : name(who)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
