import { useEffect, useState } from 'react';
import { useStore } from '@/data/StoreContext';
import { useSyncEngine } from '@/data/sync/SyncContext';
import type { Photo } from '@/data/types';

/** `loading` while looking; `missing` when the image is neither on this phone nor (reachable) in the family's Storage. */
export type PhotoImage = { state: 'loading' } | { state: 'ready'; url: string } | { state: 'missing' };

/**
 * An object URL for a photo's thumbnail or full image: from this phone if it is here, otherwise
 * downloaded from the family's Storage (with sync on) and kept on the phone for next time. A full image
 * that cannot be had falls back to the thumbnail.
 */
export function usePhotoImage(
  photo: Pick<Photo, 'id' | 'mime' | 'uploaded'>,
  which: 'full' | 'thumb',
  /** False until it is wanted (e.g. scrolled into view): nothing is read or downloaded before. */
  enabled = true,
): PhotoImage {
  const store = useStore();
  const engine = useSyncEngine();
  const [image, setImage] = useState<PhotoImage>({ state: 'loading' });
  const { id, mime, uploaded } = photo;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let url: string | null = null;
    const show = (blob: Blob | null | undefined) => {
      if (!alive) return;
      if (!blob) return setImage({ state: 'missing' });
      url = URL.createObjectURL(blob);
      setImage({ state: 'ready', url });
    };
    setImage({ state: 'loading' });
    void (async () => {
      const local = await store.photoBlobs.get(id);
      if (local?.[which]) return show(local[which]);
      if (uploaded) {
        const downloaded = await engine.downloadPhoto({ id, mime }, which).catch(() => null);
        if (downloaded) {
          await store.photoBlobs.put({ id, full: which === 'full' ? downloaded : null, thumb: which === 'thumb' ? downloaded : null });
          return show(downloaded);
        }
      }
      // A full image that is not to be had: the thumbnail is better than nothing.
      show(which === 'full' ? (local?.thumb ?? null) : null);
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [store, engine, id, mime, uploaded, which, enabled]);

  return image;
}
