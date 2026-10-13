import type { PhotoMime } from '@/data/types';

/**
 * Removes metadata segments from an encoded image, so no location, camera or date details leave the
 * phone even if a browser's encoder copied them:
 * - JPEG: every APP1–APP15 segment (EXIF, XMP, …) and comments; APP0 (JFIF) and the image data stay.
 * - WebP: the EXIF and XMP chunks, and their flags in the VP8X header.
 * Anything it cannot parse is returned unchanged (it was made by the canvas, which writes no metadata).
 */
export async function stripMetadata(blob: Blob, mime: PhotoMime): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const stripped = mime === 'image/jpeg' ? stripJpeg(bytes) : stripWebp(bytes);
  return stripped === bytes ? blob : new Blob([stripped as Uint8Array<ArrayBuffer>], { type: mime });
}

export function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const keep: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  let changed = false;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return bytes;
    const marker = bytes[i + 1];
    // Start of scan: the compressed image follows; copy the rest as it is.
    if (marker === 0xda) {
      keep.push(bytes.subarray(i));
      return changed ? concat(keep) : bytes;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const end = i + 2 + length;
    if (length < 2 || end > bytes.length) return bytes;
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (metadata) changed = true;
    else keep.push(bytes.subarray(i, end));
    i = end;
  }
  return bytes;
}

export function stripWebp(bytes: Uint8Array): Uint8Array {
  const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || text(0) !== 'RIFF' || text(8) !== 'WEBP') return bytes;
  const chunks: Uint8Array[] = [];
  let i = 12;
  let changed = false;
  while (i + 8 <= bytes.length) {
    const id = text(i);
    const size = bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24);
    const end = i + 8 + size + (size % 2);
    if (size < 0 || i + 8 + size > bytes.length) return bytes;
    if (id === 'EXIF' || id === 'XMP ') {
      changed = true;
    } else if (id === 'VP8X') {
      const chunk = bytes.slice(i, Math.min(end, bytes.length));
      // Flags byte: 0x08 EXIF, 0x04 XMP.
      if (chunk[8] & 0x0c) changed = true;
      chunk[8] &= ~0x0c;
      chunks.push(chunk);
    } else {
      chunks.push(bytes.subarray(i, Math.min(end, bytes.length)));
    }
    i = end;
  }
  if (!changed) return bytes;
  const body = concat(chunks);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.subarray(0, 12));
  const riffSize = 4 + body.length;
  out[4] = riffSize & 0xff;
  out[5] = (riffSize >> 8) & 0xff;
  out[6] = (riffSize >> 16) & 0xff;
  out[7] = (riffSize >> 24) & 0xff;
  out.set(body, 12);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
