import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Heart } from 'lucide-react';
import { useSettings } from '@/data/StoreContext';
import { MotherMedsRows, useMotherCare } from './MotherMeds';

/**
 * Today's card for the mother's own medicines. Shown while the family keeps it on (on by default)
 * and she has an active daily medicine routine; never shows her check-ins or mood.
 */
export function MotherCard({ now }: { now: Date }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const rows = useMotherCare(now);
  if (!settings?.motherCard || !rows?.length) return null;

  return (
    <section className="space-y-2" aria-labelledby="mother-card-title">
      <div className="flex items-center gap-2 px-1">
        <h2 id="mother-card-title" className="flex flex-1 items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
          <Heart aria-hidden size={16} />
          {t('mother.title')}
        </h2>
        <Link to="/mother" className="-my-2 flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">
          {t('mother.open')}
          <ChevronRight aria-hidden size={16} />
        </Link>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-3">
        <MotherMedsRows rows={rows} now={now} />
      </div>
    </section>
  );
}
