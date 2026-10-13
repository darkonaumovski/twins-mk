import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Ellipsis, History, Keyboard, Moon, Sun, type LucideIcon } from 'lucide-react';
import { IconButton } from '@/components/Button';
import { QuickTextSheet } from './QuickTextSheet';
import { cx } from '@/components/ui';
import { useBabies } from '@/features/twins/twins';
import type { DiaperData } from '@/data/types';
import { LOG_ICONS } from './describe';
import { planSleepToggle } from './logic';
import { useLogUI, type FormType } from './LogUIContext';
import { useLogActions, useRunning } from './useLogActions';
import { useWho, WhoPicker } from './WhoPicker';

function BigButton({
  icon: Icon,
  label,
  onClick,
  tone = 'plain',
  className,
}: {
  icon?: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: 'plain' | 'accent';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex min-h-16 items-center justify-center gap-2 rounded-2xl px-3 text-center font-semibold transition active:scale-[0.98]',
        tone === 'accent' ? 'bg-accent text-on-accent' : 'border border-line bg-surface hover:bg-surface-2',
        className,
      )}
    >
      {Icon && <Icon aria-hidden size={22} className="shrink-0" />}
      <span>{label}</span>
    </button>
  );
}

/**
 * The core of the app: pick a twin (remembered), then one tap logs a diaper or
 * starts/stops sleep; feeds and the rest open a short form.
 */
export function QuickLogPanel({ onLogged }: { onLogged?: () => void }) {
  const { t } = useTranslation();
  const babies = useBabies();
  const running = useRunning() ?? [];
  const [who, setWho] = useWho();
  const ui = useLogUI();
  const { log, toggleSleep } = useLogActions();
  const [typing, setTyping] = useState(false);

  const diaper = async (kind: DiaperData['kind'], label: string) => {
    await log(who, { type: 'diaper', data: { kind }, start: new Date().toISOString(), end: null }, `${t('log.diaper')}: ${label}`);
    onLogged?.();
  };

  const sleepStops = planSleepToggle(who, running).stop.length > 0;
  const forms: { type: FormType; label: string; icon: LucideIcon }[] = [
    { type: 'med', label: t('log.med'), icon: LOG_ICONS.med },
    { type: 'measure', label: t('log.measure'), icon: LOG_ICONS.measure },
    { type: 'note', label: t('log.note'), icon: LOG_ICONS.note },
    { type: 'sleep', label: t('log.pastSleep'), icon: History },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <WhoPicker babies={babies} value={who} onChange={setWho} />
        </div>
        <IconButton label={t('quick.open')} onClick={() => setTyping(true)} className="mt-2 bg-surface-2">
          <Keyboard aria-hidden size={22} />
        </IconButton>
      </div>
      {typing && <QuickTextSheet who={who} onClose={() => setTyping(false)} onSaved={onLogged} />}

      <div className="grid grid-cols-2 gap-2">
        <BigButton icon={LOG_ICONS.feed} label={t('log.feed')} tone="accent" onClick={() => ui.feed(who)} />
        <BigButton
          icon={sleepStops ? Sun : Moon}
          label={sleepStops ? t('log.endSleep') : t('log.startSleep')}
          tone="accent"
          onClick={async () => {
            await toggleSleep(who, running);
            onLogged?.();
          }}
        />
      </div>

      <fieldset>
        <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
          <LOG_ICONS.diaper aria-hidden size={16} />
          {t('log.diaper')}
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <BigButton label={t('log.wet')} onClick={() => diaper('wet', t('log.wet'))} />
          <BigButton label={t('log.dirty')} onClick={() => diaper('dirty', t('log.dirty'))} />
          <BigButton label={t('log.wetDirty')} onClick={() => diaper('both', t('log.wetDirty'))} className="text-sm" />
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        {forms.map((f) => (
          <BigButton key={f.type} icon={f.icon} label={f.label} onClick={() => ui.create(f.type, who)} className="min-h-14 text-sm" />
        ))}
        <BigButton icon={Ellipsis} label={t('log.more')} onClick={() => ui.more(who)} className="col-span-2 min-h-14 text-sm" />
      </div>
    </div>
  );
}
