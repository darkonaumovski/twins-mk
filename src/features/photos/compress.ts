import type { PhotoMime } from '@/data/types';
import { stripMetadata } from './metadata';

/** Longest side of the stored image, and of the thumbnail for grids. */
export const FULL_SIZE = 1600;
export const THUMB_SIZE = 320;
export const QUALITY = 0.8;

/** Scales (width, height) down so the longest side is at most `max`; never up. Whole pixels, at least 1. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * What compressing needs from the browser, so it can be tested without one: decode a picture (with its
 * EXIF orientation applied, so a portrait photo stands up) and draw it at a size into an encoded image.
 */
export interface ImageEnv {
  load(file: Blob): Promise<{ width: number; height: number; source: unknown; close?: () => void }>;
  /** Encodes `source` at this size; the blob's type says what the browser could make (Safari may give PNG for WebP). */
  render(source: unknown, width: number, height: number, type: PhotoMime, quality: number): Promise<Blob | null>;
}

export interface CompressedPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  mime: PhotoMime;
}

/**
 * A photo as stored: WebP (JPEG where the phone cannot encode WebP), longest side 1600 px at quality 0.8,
 * plus a 320 px thumbnail. Re-encoding drops the camera's metadata, and `stripMetadata` removes any that
 * an encoder might copy, so no location or camera details leave the phone.
 */
export async function compressPhoto(file: Blob, env: ImageEnv): Promise<CompressedPhoto> {
  const image = await env.load(file);
  try {
    const full = fitWithin(image.width, image.height, FULL_SIZE);
    const thumb = fitWithin(image.width, image.height, THUMB_SIZE);
    let mime: PhotoMime = 'image/webp';
    let fullBlob = await env.render(image.source, full.width, full.height, mime, QUALITY);
    if (!fullBlob || fullBlob.type !== 'image/webp') {
      mime = 'image/jpeg';
      fullBlob = await env.render(image.source, full.width, full.height, mime, QUALITY);
    }
    const thumbBlob = await env.render(image.source, thumb.width, thumb.height, mime, QUALITY);
    if (!fullBlob || !thumbBlob || fullBlob.type !== mime) throw new Error('photo_encode_failed');
    return {
      full: await stripMetadata(fullBlob, mime),
      thumb: await stripMetadata(thumbBlob, mime),
      width: full.width,
      height: full.height,
      mime,
    };
  } finally {
    image.close?.();
  }
}

/** The browser's implementation: createImageBitmap (EXIF orientation applied) and a canvas. */
export const browserImageEnv: ImageEnv = {
  async load(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  },
  async render(source, width, height, type, quality) {
    const bitmap = source as ImageBitmap;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);
      return canvas.convertToBlob({ type, quality }).catch(() => null);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  },
};
