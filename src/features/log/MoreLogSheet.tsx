import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Carrot, Milk, NotebookText, Package, Refrigerator, Timer, type LucideIcon } from 'lucide-react';
import { useSettings } from '@/data/StoreContext';
import { Sheet } from '@/components/Sheet';
import { tintFor, useBabies } from '@/features/twins/twins';
import { LOG_ICONS } from './describe';
import type { Who } from './logic';
import { useLogUI, type FormType } from './LogUIContext';
import { WhoPicker } from './WhoPicker';

function Tile({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface px-2 text-center text-sm font-semibold transition hover:bg-surface-2 active:scale-[0.98]"
    >
      <Icon aria-hidden size={24} className="text-accent" />
      {label}
    </button>
  );
}

/** Less frequent things to log, kept off the main Quick Log panel. */
export function MoreLogSheet({ who: initialWho, onClose }: { who: Who; onClose: () => void }) {
  const { t } = useTranslation();
  const babies = useBabies();
  const ui = useLogUI();
  const navigate = useNavigate();
  const solids = useSettings()?.solidsEnabled === true;
  const [who, setWho] = useState<Who>(initialWho);

  const forms: { type: FormType; label: string }[] = [
    { type: 'temp', label: t('log.temp') },
    { type: 'spitup', label: t('log.spitup') },
    { type: 'bath', label: t('log.bath') },
    { type: 'tummy', label: t('log.tummy') },
  ];
  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Sheet open onClose={onClose} title={t('log.more')} tint={tintFor(babies, who)}>
      <div className="space-y-5">
        <WhoPicker babies={babies} value={who} onChange={setWho} />
        <div className="grid grid-cols-2 gap-2">
          {forms.map((f) => (
            <Tile key={f.type} icon={LOG_ICONS[f.type]} label={f.label} onClick={() => ui.create(f.type, who)} />
          ))}
          <Tile icon={NotebookText} label={t('journal.entry')} onClick={() => go('/journal?new=1')} />
          {solids && <Tile icon={Carrot} label={t('foods.solids')} onClick={() => go('/foods?log=1')} />}
        </div>
        <section className="space-y-2 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-muted">{t('milk.section')}</h3>
          <div className="grid grid-cols-2 gap-2">
            <Tile icon={Timer} label={t('milk.startTimer')} onClick={() => ui.pumpTimer()} />
            <Tile icon={Milk} label={t('milk.pump')} onClick={() => ui.pump()} />
            <Tile icon={Refrigerator} label={t('stash.title')} onClick={() => go('/stash')} />
            <Tile icon={Package} label={t('supplies.title')} onClick={() => go('/supplies')} />
          </div>
        </section>
      </div>
    </Sheet>
  );
}
