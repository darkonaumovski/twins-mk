import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Camera, ChevronLeft, ChevronRight, ImageOff, ImagePlus, Images, Loader2, Trash2, X } from 'lucide-react';
import { Button, IconButton } from '@/components/Button';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { cx } from '@/components/ui';
import { useLive, useStore } from '@/data/StoreContext';
import type { BabyScope, Photo, PhotoOwner } from '@/data/types';
import { dateLocale } from '@/i18n';
import { browserImageEnv } from './compress';
import { addPhoto, deletePhoto, photosOf } from './logic';
import { usePhotoImage } from './usePhotoImage';

/** "Take photo" (camera) and "Choose photo" (gallery); the picture is compressed on the phone and saved. */
export function AddPhotoButtons({
  owner,
  babies,
  compact = false,
  onAdded,
}: {
  owner: PhotoOwner;
  babies: BabyScope;
  compact?: boolean;
  onAdded?: (photo: Photo) => void;
}) {
  const { t } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const photo = await addPhoto(store, file, { owner, babies, now: new Date() }, browserImageEnv);
        onAdded?.(photo);
      }
    } catch {
      toast({ message: t('photos.failed') });
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = '';
      if (gallery.current) gallery.current.value = '';
    }
  };

  return (
    <div className={cx('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-1 min-[360px]:grid-cols-2')}>
      <Button variant="secondary" onClick={() => camera.current?.click()} disabled={busy} aria-busy={busy}>
        {busy ? <Loader2 aria-hidden size={18} className="animate-spin" /> : <Camera aria-hidden size={18} />}
        {t('photos.take')}
      </Button>
      <Button variant="secondary" onClick={() => gallery.current?.click()} disabled={busy}>
        <ImagePlus aria-hidden size={18} />
        {t('photos.choose')}
      </Button>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void add(e.target.files)}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void add(e.target.files)}
      />
    </div>
  );
}

/** A square thumbnail button. Its image loads only once it scrolls into view, so a long grid does not fetch everything. */
export function PhotoThumb({ photo, label, onOpen }: { photo: Photo; label: string; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  const image = usePhotoImage(photo, 'thumb', visible);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="relative block aspect-square min-h-11 w-full overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line"
    >
      {image.state === 'ready' ? (
        <img src={image.url} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        <span className="flex size-full items-center justify-center text-muted">
          {image.state === 'loading' ? <Images aria-hidden size={20} /> : <ImageOff aria-hidden size={20} />}
        </span>
      )}
    </button>
  );
}

/**
 * Full screen: the image, swipe or arrows for the next one, the date, and delete. A modal <dialog> of its
 * own, so it sits above an open sheet, keeps the focus inside, gives it back on close, and Escape (or
 * Android back) closes only the viewer. `onDeleted` takes over the undo (inside a sheet, where a toast
 * would sit behind it); without it, a toast offers the undo.
 */
export function PhotoViewer({
  photos,
  start,
  onClose,
  onDeleted,
}: {
  photos: Photo[];
  start: number;
  onClose: () => void;
  onDeleted?: (undo: () => Promise<void>) => void;
}) {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(start);
  const swipe = useRef<number | null>(null);
  const photo = photos[Math.min(index, photos.length - 1)];
  const image = usePhotoImage(photo ?? { id: '', uploaded: false }, 'full', Boolean(photo));
  const go = (step: number) => setIndex((i) => Math.max(0, Math.min(photos.length - 1, i + step)));

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal?.();
    return () => el?.close?.();
  }, []);
  useEffect(() => {
    if (!photo) onClose();
  }, [photo, onClose]);
  if (!photo) return null;

  const onDown = (e: PointerEvent) => {
    swipe.current = e.clientX;
  };
  const onUp = (e: PointerEvent) => {
    if (swipe.current === null) return;
    const dx = e.clientX - swipe.current;
    swipe.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  const remove = async () => {
    if (!(await confirm({ title: t('photos.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return;
    const undo = await deletePhoto(store, photo.id);
    if (onDeleted) onDeleted(undo);
    else toast({ message: t('photos.deleted'), action: { label: t('common.undo'), onClick: () => void undo() } });
    if (photos.length === 1) onClose();
  };

  return (
    <dialog
      ref={dialog}
      aria-label={t('photos.viewer')}
      onCancel={(e) => {
        // Escape or Android back: close the viewer only, never the sheet behind it.
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      }}
      className="fixed inset-0 m-0 flex h-dvh max-h-none w-screen max-w-none flex-col bg-black p-0 text-white backdrop:bg-black"
    >
      <div className="flex items-center gap-2 px-2 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
        <IconButton label={t('common.close')} onClick={onClose} className="text-white hover:bg-white/10">
          <X aria-hidden size={24} />
        </IconButton>
        <p className="flex-1 truncate text-sm" aria-live="polite">
          {format(new Date(photo.takenAt), 'd MMM yyyy', { locale: dateLocale(i18n.language) })} · {index + 1}/{photos.length}
        </p>
        <IconButton label={t('common.delete')} onClick={() => void remove()} className="text-white hover:bg-white/10">
          <Trash2 aria-hidden size={22} />
        </IconButton>
      </div>
      <div
        className="relative flex flex-1 touch-pan-y items-center justify-center overflow-hidden"
        onPointerDown={onDown}
        onPointerUp={onUp}
      >
        {image.state === 'ready' ? (
          <img src={image.url} alt="" className="max-h-full max-w-full object-contain select-none" draggable={false} />
        ) : image.state === 'missing' ? (
          <p className="flex items-center gap-2 px-6 text-center text-sm">
            <ImageOff aria-hidden size={20} />
            {t('photos.notHere')}
          </p>
        ) : (
          <Loader2 aria-hidden size={28} className="animate-spin" />
        )}
        {index > 0 && (
          <IconButton label={t('photos.previous')} onClick={() => go(-1)} className="absolute left-1 text-white hover:bg-white/10">
            <ChevronLeft aria-hidden size={28} />
          </IconButton>
        )}
        {index < photos.length - 1 && (
          <IconButton label={t('photos.next')} onClick={() => go(1)} className="absolute right-1 text-white hover:bg-white/10">
            <ChevronRight aria-hidden size={28} />
          </IconButton>
        )}
      </div>
    </dialog>
  );
}

/** The photos of one milestone, journal entry or month, with buttons to add more (and undo right here). */
export function PhotoStrip({ owner, babies }: { owner: PhotoOwner; babies: BabyScope }) {
  const { t } = useTranslation();
  const all = useLive((s) => s.photos.list(), []);
  const [open, setOpen] = useState<number | null>(null);
  const [undo, setUndo] = useState<(() => Promise<void>) | null>(null);
  const photos = all ? photosOf(all, owner) : [];

  return (
    <div className="space-y-2">
      <p className="font-medium">{t('photos.title')}</p>
      {photos.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <li key={p.id}>
              <PhotoThumb photo={p} label={t('photos.open', { n: i + 1 })} onOpen={() => setOpen(i)} />
            </li>
          ))}
        </ul>
      )}
      {undo && (
        <p className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm" role="status">
          <span className="flex-1">{t('photos.deleted')}</span>
          <Button
            variant="ghost"
            className="min-h-11 px-3"
            onClick={() => {
              void undo();
              setUndo(null);
            }}
          >
            {t('common.undo')}
          </Button>
        </p>
      )}
      <AddPhotoButtons owner={owner} babies={babies} compact />
      {open !== null && <PhotoViewer photos={photos} start={open} onClose={() => setOpen(null)} onDeleted={(fn) => setUndo(() => fn)} />}
    </div>
  );
}

/** "Milestone", "Monthly photo", "Bump photo": what kind of photo it is, in words. */
export function useOwnerLabel() {
  const { t } = useTranslation();
  return (owner: PhotoOwner) => t(`photos.owner.${owner.kind}`);
}
