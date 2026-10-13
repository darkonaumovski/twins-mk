import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { Page, Section, Segmented } from '@/components/ui';
import { useLive, useSettings, useStore } from '@/data/StoreContext';
import type { Photo } from '@/data/types';
import { dateLocale } from '@/i18n';
import { pregnancyProgress } from '@/lib/pregnancy';
import { colorOf, TwinBadge, useBabies, useTwinName } from '@/features/twins/twins';
import { AddPhotoButtons, PhotoThumb, PhotoViewer, useOwnerLabel } from './PhotoParts';
import { bumpOwner, monthlyOwner, photosByMonth, pruneDeletedImages, type PhotoFilter } from './logic';

/** Every photo by month, filterable by twin; tap one for full screen. Adds the monthly and bump photos. */
export function PhotosPage() {
  const { t, i18n } = useTranslation();
  const settings = useSettings();
  const babies = useBabies();
  const name = useTwinName(babies);
  const all = useLive((s) => s.photos.list(), []);
  const [filter, setFilter] = useState<PhotoFilter>('all');
  const [open, setOpen] = useState<{ photos: Photo[]; index: number } | null>(null);
  const ownerLabel = useOwnerLabel();

  // Images of photos deleted more than a week ago leave the phone.
  const store = useStore();
  useEffect(() => {
    void pruneDeletedImages(store, new Date()).catch(() => undefined);
  }, [store]);

  // Keep the viewer's list in step when a photo is deleted from it.
  useEffect(() => {
    if (!open || !all) return;
    const ids = new Set(all.map((p) => p.id));
    if (open.photos.some((p) => !ids.has(p.id))) setOpen(null);
  }, [all, open]);
  if (!all || !settings) return null;

  const locale = dateLocale(i18n.language);
  const now = new Date();
  const prep = settings.phase === 'prep';
  const week = settings.dueDate ? pregnancyProgress(settings.dueDate, now).week : null;
  const groups = photosByMonth(all, filter);

  return (
    <Page title={t('photos.title')}>
      {prep && week !== null && week > 0 ? (
        <Section title={t('photos.bumpTitle', { week })}>
          <p className="text-sm text-muted">{t('photos.bumpHint')}</p>
          <AddPhotoButtons owner={bumpOwner(week)} babies="none" />
        </Section>
      ) : (
        <Section title={t('photos.monthlyTitle', { month: format(now, 'LLLL', { locale }) })}>
          <p className="text-sm text-muted">{t('photos.monthlyHint')}</p>
          <AddPhotoButtons owner={monthlyOwner(now)} babies="both" />
        </Section>
      )}

      {!prep && (
        <Segmented<PhotoFilter>
          label={t('photos.show')}
          value={filter}
          options={[
            { value: 'all', label: t('photos.all') },
            { value: 'A', label: name('A') },
            { value: 'B', label: name('B') },
            { value: 'both', label: t('photos.together') },
          ]}
          onChange={setFilter}
        />
      )}

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t('photos.empty')}</p>
      ) : (
        groups.map(({ month, photos }) => (
          <section key={month} className="space-y-2">
            <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">
              {format(parseISO(`${month}-01`), 'LLLL yyyy', { locale })}
            </h2>
            <ul className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4">
              {photos.map((p, i) => (
                <li key={p.id} className="relative">
                  <PhotoThumb
                    photo={p}
                    label={`${ownerLabel(p.owner)}, ${format(new Date(p.takenAt), 'd MMM', { locale })}`}
                    onOpen={() => setOpen({ photos, index: i })}
                  />
                  {(p.babies === 'A' || p.babies === 'B') && (
                    <span className="pointer-events-none absolute right-1 bottom-1">
                      <TwinBadge slot={p.babies} color={colorOf(babies, p.babies)} size="sm" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {open && <PhotoViewer photos={open.photos} start={open.index} onClose={() => setOpen(null)} />}
    </Page>
  );
}
