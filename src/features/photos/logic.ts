import { format } from 'date-fns';
import type { DataStore } from '@/data/repository';
import type { BabyScope, ISODate, ISODateTime, Photo, PhotoOwner } from '@/data/types';
import { photoExtension } from '@/data/photoPaths';
import { compressPhoto, type ImageEnv } from './compress';

/** Twin filter on the photo page: one twin (with the photos of both), photos of both together, or all. */
export type PhotoFilter = 'all' | 'A' | 'B' | 'both';

/** When a photo was taken: the file's date when it is believable (not in the future, not before 2000), else now. */
export function takenAtFor(lastModified: number | undefined, now: Date): ISODateTime {
  if (lastModified && lastModified <= now.getTime() && lastModified > Date.UTC(2000, 0, 1)) return new Date(lastModified).toISOString();
  return now.toISOString();
}

/** The monthly "twins together" photo belongs to its month; a bump photo to its pregnancy week. */
export const monthlyOwner = (date: Date): PhotoOwner => ({ kind: 'monthly', id: format(date, 'yyyy-MM') });
export const bumpOwner = (week: number): PhotoOwner => ({ kind: 'bump', id: `week-${week}` });

/**
 * Compresses the picture and saves its details and images together. The details sync; the images go up
 * to the family's Storage on the next sync (with sync off they stay on this phone).
 */
export async function addPhoto(
  store: Pick<DataStore, 'photos' | 'photoBlobs' | 'transaction'>,
  file: Blob & { lastModified?: number },
  input: { owner: PhotoOwner; babies: BabyScope; now: Date },
  env: ImageEnv,
): Promise<Photo> {
  const compressed = await compressPhoto(file, env);
  return store.transaction(async () => {
    const photo = await store.photos.create({
      takenAt: takenAtFor(file.lastModified, input.now),
      owner: input.owner,
      babies: input.babies,
      width: compressed.width,
      height: compressed.height,
      bytes: compressed.full.size,
      uploaded: false,
      mime: compressed.mime,
    });
    await store.photoBlobs.put({ id: photo.id, full: compressed.full, thumb: compressed.thumb });
    return photo;
  });
}

/**
 * Deleting is a soft delete (undo brings it back). The images stay on this phone for undo; the sync
 * removes them from Storage. Undo marks the photo for upload again, in case they were already removed.
 */
export async function deletePhoto(store: Pick<DataStore, 'photos'>, id: string): Promise<() => Promise<void>> {
  await store.photos.remove(id);
  return async () => {
    await store.photos.restore(id);
    await store.photos.update(id, { uploaded: false });
  };
}

/** How long the images of a deleted photo stay on the phone (for undo, and the other phone's delete). */
export const KEEP_DELETED_MS = 7 * 24 * 3600_000;

/** Removes the images of photos deleted more than a week ago from this phone. Returns how many. */
export async function pruneDeletedImages(store: Pick<DataStore, 'photos' | 'photoBlobs'>, now: Date): Promise<number> {
  const old = (await store.photos.listAll()).filter(
    (p) => p.deletedAt !== null && now.getTime() - Date.parse(p.deletedAt) > KEEP_DELETED_MS,
  );
  let removed = 0;
  for (const p of old) {
    if (!(await store.photoBlobs.get(p.id))) continue;
    await store.photoBlobs.remove(p.id);
    removed++;
  }
  return removed;
}

function matches(photo: Photo, filter: PhotoFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'both') return photo.babies === 'both';
  return photo.babies === filter || photo.babies === 'both';
}

/** Live photos for the filter, newest first, grouped by month (`2026-10`). */
export function photosByMonth(photos: readonly Photo[], filter: PhotoFilter): { month: string; photos: Photo[] }[] {
  const live = photos.filter((p) => p.deletedAt === null && matches(p, filter)).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const groups = new Map<string, Photo[]>();
  for (const p of live) {
    const month = format(new Date(p.takenAt), 'yyyy-MM');
    groups.set(month, [...(groups.get(month) ?? []), p]);
  }
  return [...groups].map(([month, list]) => ({ month, photos: list }));
}

/** Live photos of one owner (a milestone, a journal entry, a month), oldest first. */
export function photosOf(photos: readonly Photo[], owner: PhotoOwner): Photo[] {
  return photos
    .filter((p) => p.deletedAt === null && p.owner.kind === owner.kind && p.owner.id === owner.id)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/** Characters a file name on a phone or PC cannot have. */
const unsafe = /[\\/:*?"<>|\u0000-\u001f]+/g;
const clean = (part: string) => part.replace(unsafe, ' ').trim().replace(/\s+/g, '-') || 'photo';

/**
 * File names in the photo zip: `2026-10-13_Ema_milestone.webp`, `…_both_monthly.webp`; a second photo with
 * the same name gets `-2`. `who` names the twin(s) and `owner` the kind, in the phone's language.
 */
export function zipNames(
  photos: readonly Photo[],
  label: { who: (babies: BabyScope) => string; owner: (owner: PhotoOwner) => string },
): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Map<string, number>();
  for (const p of [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.id.localeCompare(b.id))) {
    const date: ISODate = format(new Date(p.takenAt), 'yyyy-MM-dd');
    const base = `${date}_${clean(label.who(p.babies))}_${clean(label.owner(p.owner))}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    names.set(p.id, `${n === 1 ? base : `${base}-${n}`}.${photoExtension(p.mime)}`);
  }
  return names;
}
