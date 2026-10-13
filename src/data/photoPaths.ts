import type { Photo, PhotoMime } from './types';

/** The file extension of a photo format. */
export const photoExtension = (mime: PhotoMime | undefined) => (mime === 'image/jpeg' ? 'jpg' : 'webp');

/** Paths inside the family's Storage folder (`<family_id>/` is added by the remote): `<id>.webp` and `<id>.thumb.webp`. */
export function photoPath(photo: Pick<Photo, 'id' | 'mime'>, which: 'full' | 'thumb'): string {
  const ext = photoExtension(photo.mime);
  return which === 'thumb' ? `${photo.id}.thumb.${ext}` : `${photo.id}.${ext}`;
}
