import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Images } from 'lucide-react';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { useLive, useStore } from '@/data/StoreContext';
import { useSyncEngine } from '@/data/sync/SyncContext';
import type { BabyScope } from '@/data/types';
import { formatNumber } from '@/lib/format';
import { zip } from '@/lib/zip';
import { useTwinName, useBabies } from '@/features/twins/twins';
import { pruneDeletedImages, zipNames } from './logic';
import { useOwnerLabel } from './PhotoParts';

/** Settings → Storage: how much room the photos take on this phone. */
export function PhotoUsage() {
  const { t, i18n } = useTranslation();
  // Only live photos count; images of photos deleted long ago are removed first.
  const usage = useLive(async (s) => {
    await pruneDeletedImages(s, new Date());
    return s.photoBlobs.usage(new Set((await s.photos.list()).map((p) => p.id)));
  }, []);
  if (!usage) return null;
  return (
    <p className="flex gap-3">
      <Images aria-hidden size={20} className="mt-0.5 shrink-0 text-accent" />
      <span>{t('photos.usage', { count: usage.count, mb: formatNumber(usage.bytes / 1024 / 1024, i18n.language) })}</span>
    </p>
  );
}

/**
 * Settings → Backup → "Download photos (zip)": every photo, full size where it can be had (from this phone,
 * or downloaded from the family's Storage), named `2026-10-13_Ema_milestone.webp`.
 */
export function PhotoZipButton() {
  const { t } = useTranslation();
  const store = useStore();
  const engine = useSyncEngine();
  const toast = useToast();
  const twin = useTwinName(useBabies());
  const ownerLabel = useOwnerLabel();
  const [busy, setBusy] = useState(false);

  const who = (babies: BabyScope) => (babies === 'both' ? t('photos.zipBoth') : babies === 'none' ? t('photos.zipNone') : twin(babies));

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const photos = await store.photos.list();
      const names = zipNames(photos, { who, owner: ownerLabel });
      const files = [];
      let missing = 0;
      for (const p of photos) {
        const local = await store.photoBlobs.get(p.id);
        let blob = local?.full ?? null;
        if (!blob && p.uploaded) blob = await engine.downloadPhoto(p, 'full').catch(() => null);
        blob ??= local?.thumb ?? null;
        if (!blob) {
          missing++;
          continue;
        }
        files.push({ name: names.get(p.id)!, data: new Uint8Array(await blob.arrayBuffer()), date: new Date(p.takenAt) });
      }
      if (!files.length) {
        toast({ message: t('photos.zipEmpty') });
        return;
      }
      const url = URL.createObjectURL(zip(files));
      const a = document.createElement('a');
      a.href = url;
      a.download = `twins-organizer-photos-${format(new Date(), 'yyyy-MM-dd')}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      if (missing) toast({ message: t('photos.zipMissing', { count: missing }) });
    } catch {
      toast({ message: t('photos.zipFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Button variant="secondary" className="w-full" onClick={() => void download()} disabled={busy} aria-busy={busy}>
        <Images aria-hidden size={18} />
        {t('photos.zip')}
      </Button>
      <p className="text-sm text-muted">{t('photos.zipHint')}</p>
    </div>
  );
}
