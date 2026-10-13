import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDexieStore, type DexieStore } from '@/data/dexieStore';
import type { Photo } from '@/data/types';
import { SyncEngine, formatCode } from '@/data/sync/engine';
import { MemoryServer, type MemoryRemote } from '@/data/sync/memoryRemote';
import { compressPhoto, fitWithin, type ImageEnv } from './compress';
import { stripJpeg, stripMetadata, stripWebp } from './metadata';
import { addPhoto, bumpOwner, deletePhoto, monthlyOwner, photosByMonth, photosOf, pruneDeletedImages, takenAtFor, zipNames } from './logic';

/** A fake browser: pictures of a given size, and an encoder that can make WebP (or not, like old Safari). */
function fakeEnv(width: number, height: number, webp = true): ImageEnv & { renders: string[] } {
  const renders: string[] = [];
  return {
    renders,
    load: async () => ({ width, height, source: 'bitmap', close: vi.fn() }),
    render: async (_source, w, h, type) => {
      renders.push(`${w}x${h} ${type}`);
      const made = type === 'image/webp' && !webp ? 'image/png' : type;
      return new Blob([new Uint8Array(Math.max(1, Math.round((w * h) / 100)))], { type: made });
    },
  };
}

describe('compressing a photo', () => {
  it('scales the longest side down to 1600 px (thumbnail 320 px), never up', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(4032, 3024, 320)).toEqual({ width: 320, height: 240 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 1, 320)).toEqual({ width: 320, height: 1 });
  });

  it('makes a WebP image and a thumbnail at quality 0.8', async () => {
    const env = fakeEnv(4032, 3024);
    const photo = await compressPhoto(new Blob(['x']), env);
    expect(env.renders).toEqual(['1600x1200 image/webp', '320x240 image/webp']);
    expect(photo).toMatchObject({ width: 1600, height: 1200, mime: 'image/webp' });
    expect(photo.full.type).toBe('image/webp');
  });

  it('falls back to JPEG where the phone cannot make WebP', async () => {
    const env = fakeEnv(3000, 4000, false);
    const photo = await compressPhoto(new Blob(['x']), env);
    expect(env.renders).toEqual(['1200x1600 image/webp', '1200x1600 image/jpeg', '240x320 image/jpeg']);
    expect(photo.mime).toBe('image/jpeg');
    expect(photo.thumb.type).toBe('image/jpeg');
  });
});

describe('removing metadata', () => {
  // A JPEG with JFIF (APP0), EXIF with a GPS tag (APP1), XMP (APP1), a comment, then the image data.
  const segment = (marker: number, payload: number[]) => [0xff, marker, 0, payload.length + 2, ...payload];
  const exif = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0, ...[...'GPSLatitude'].map((c) => c.charCodeAt(0))]);
  const jpeg = new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]),
    ...segment(0xe1, exif),
    ...segment(
      0xe1,
      [...'http://ns.adobe.com/xap'].map((c) => c.charCodeAt(0)),
    ),
    ...segment(0xfe, [65, 66]),
    ...segment(0xdb, [1, 2, 3]),
    0xff,
    0xda,
    0,
    4,
    9,
    9,
    7,
    7,
    0xff,
    0xd9,
  ]);
  const has = (bytes: Uint8Array, text: string) => new TextDecoder('latin1').decode(bytes).includes(text);

  it('drops EXIF (with GPS), XMP and comments from a JPEG, keeping the image data', () => {
    const out = stripJpeg(jpeg);
    expect(has(jpeg, 'GPSLatitude')).toBe(true);
    expect(has(out, 'GPSLatitude')).toBe(false);
    expect(has(out, 'Exif')).toBe(false);
    expect(has(out, 'adobe')).toBe(false);
    expect([...out.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect(has(out, 'JFIF')).toBe(true);
    expect([...out.slice(-10)]).toEqual([...jpeg.slice(-10)]);
  });

  const chunk = (id: string, payload: number[]) => {
    const size = payload.length;
    return [...id].map((c) => c.charCodeAt(0)).concat([size & 0xff, (size >> 8) & 0xff, 0, 0, ...payload, ...(size % 2 ? [0] : [])]);
  };
  const webp = (() => {
    const body = [
      ...[...'WEBP'].map((c) => c.charCodeAt(0)),
      ...chunk('VP8X', [0x0c, 0, 0, 0, 1, 0, 0, 1, 0, 0]),
      ...chunk('VP8 ', [1, 2, 3, 4]),
      ...chunk(
        'EXIF',
        [...'GPSLatitude'].map((c) => c.charCodeAt(0)),
      ),
      ...chunk('XMP ', [1, 2, 3]),
    ];
    const size = body.length;
    return new Uint8Array([...[...'RIFF'].map((c) => c.charCodeAt(0)), size & 0xff, (size >> 8) & 0xff, 0, 0, ...body]);
  })();

  it('drops the EXIF and XMP chunks (and their flags) from a WebP, with a correct RIFF size', () => {
    const out = stripWebp(webp);
    expect(has(out, 'GPSLatitude')).toBe(false);
    expect(has(out, 'XMP ')).toBe(false);
    expect(has(out, 'VP8 ')).toBe(true);
    const riff = out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24);
    expect(riff).toBe(out.length - 8);
    expect(out[20] & 0x0c).toBe(0);
  });

  it('handles an odd-sized last chunk (padding) and truncated files with metadata safely', () => {
    const odd = (() => {
      const body = [...[...'WEBP'].map((c) => c.charCodeAt(0)), ...chunk('VP8 ', [1, 2, 3, 4]), ...chunk('EXIF', [7, 7, 7])];
      const size = body.length;
      return new Uint8Array([...[...'RIFF'].map((c) => c.charCodeAt(0)), size & 0xff, (size >> 8) & 0xff, 0, 0, ...body]);
    })();
    const out = stripWebp(odd);
    expect(has(out, 'EXIF')).toBe(false);
    expect(out[4] | (out[5] << 8)).toBe(out.length - 8);
    // Cut off in the middle of the EXIF chunk / segment: returned as it is, never a broken half.
    const cutWebp = webp.subarray(0, webp.length - 3);
    expect(stripWebp(cutWebp)).toBe(cutWebp);
    const cutJpeg = jpeg.subarray(0, 12);
    expect(stripJpeg(cutJpeg)).toBe(cutJpeg);
  });

  it('leaves an image without metadata (or something it cannot read) as it is', async () => {
    const clean = stripJpeg(jpeg);
    expect(stripJpeg(clean)).toBe(clean);
    const odd = new Uint8Array([1, 2, 3]);
    expect(stripWebp(odd)).toBe(odd);
    const blob = new Blob([clean as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
    expect(await stripMetadata(blob, 'image/jpeg')).toBe(blob);
  });
});

const meta = { createdAt: '', updatedAt: '', deletedAt: null, deviceId: 'd' };
const photo = (id: string, takenAt: string, over: Partial<Photo> = {}): Photo => ({
  ...meta,
  id,
  takenAt,
  owner: { kind: 'milestone', id: 'm1' },
  babies: 'A',
  width: 1600,
  height: 1200,
  bytes: 200_000,
  uploaded: true,
  ...over,
});

describe('the photo page', () => {
  const list = [
    photo('a', new Date(2026, 9, 12, 9).toISOString()),
    photo('b', new Date(2026, 9, 1, 0, 30).toISOString(), { babies: 'both', owner: monthlyOwner(new Date(2026, 9, 1)) }),
    photo('c', new Date(2026, 8, 30, 23, 30).toISOString(), { babies: 'B' }),
    photo('x', new Date(2026, 9, 5).toISOString(), { deletedAt: 'gone' }),
  ];

  it('groups by month, newest first, and filters by twin (a twin includes photos of both)', () => {
    expect(photosByMonth(list, 'all').map((g) => [g.month, g.photos.map((p) => p.id)])).toEqual([
      ['2026-10', ['a', 'b']],
      ['2026-09', ['c']],
    ]);
    expect(photosByMonth(list, 'A').flatMap((g) => g.photos.map((p) => p.id))).toEqual(['a', 'b']);
    expect(photosByMonth(list, 'B').flatMap((g) => g.photos.map((p) => p.id))).toEqual(['b', 'c']);
    expect(photosByMonth(list, 'both').flatMap((g) => g.photos.map((p) => p.id))).toEqual(['b']);
  });

  it('finds the photos of one milestone, month or pregnancy week', () => {
    expect(photosOf(list, { kind: 'milestone', id: 'm1' }).map((p) => p.id)).toEqual(['c', 'a']);
    expect(photosOf(list, { kind: 'monthly', id: '2026-10' }).map((p) => p.id)).toEqual(['b']);
    expect(bumpOwner(28)).toEqual({ kind: 'bump', id: 'week-28' });
  });

  it('takes the date from the file unless it is unbelievable', () => {
    const now = new Date('2026-10-13T10:00:00.000Z');
    expect(takenAtFor(Date.parse('2026-10-12T08:00:00.000Z'), now)).toBe('2026-10-12T08:00:00.000Z');
    expect(takenAtFor(Date.parse('2027-01-01T00:00:00.000Z'), now)).toBe(now.toISOString());
    expect(takenAtFor(0, now)).toBe(now.toISOString());
    expect(takenAtFor(undefined, now)).toBe(now.toISOString());
  });

  it('names the files in the zip by date, twin and kind, without clashes or unsafe characters', () => {
    const names = zipNames(
      [
        photo('p1', new Date(2026, 9, 12, 9).toISOString()),
        photo('p2', new Date(2026, 9, 12, 10).toISOString()),
        photo('p3', new Date(2026, 9, 1, 12).toISOString(), {
          babies: 'both',
          owner: monthlyOwner(new Date(2026, 9, 1)),
          mime: 'image/jpeg',
        }),
        photo('p4', new Date(2026, 6, 1, 12).toISOString(), { babies: 'none', owner: bumpOwner(30) }),
      ],
      {
        who: (b) => (b === 'A' ? 'Ема / Ана?' : b === 'both' ? 'both' : b === 'none' ? 'mother' : 'Ана'),
        owner: (o) => o.kind,
      },
    );
    expect([...names.values()]).toEqual([
      '2026-07-01_mother_bump.webp',
      '2026-10-01_both_monthly.jpg',
      '2026-10-12_Ема-Ана_milestone.webp',
      '2026-10-12_Ема-Ана_milestone-2.webp',
    ]);
  });
});

let n = 0;

describe('saving a photo', () => {
  it('stores small details (well under the server’s 64 KB) and the images on the phone', async () => {
    const store = await openDexieStore({ name: `photos-${++n}` });
    const file = Object.assign(new Blob(['raw']), { lastModified: Date.parse('2026-10-12T08:00:00.000Z') });
    const saved = await addPhoto(
      store,
      file,
      { owner: { kind: 'milestone', id: 'milestone-smile-baby-A' }, babies: 'A', now: new Date() },
      fakeEnv(4032, 3024),
    );
    expect(saved).toMatchObject({ width: 1600, height: 1200, uploaded: false, mime: 'image/webp', takenAt: '2026-10-12T08:00:00.000Z' });
    expect(JSON.stringify(saved).length).toBeLessThan(64 * 1024);
    expect(JSON.stringify(saved).length).toBeLessThan(1024);
    const blobs = await store.photoBlobs.get(saved.id);
    expect(blobs?.full?.size).toBe(saved.bytes);
    expect(blobs?.thumb?.size).toBeGreaterThan(0);
    expect(await store.photoBlobs.usage()).toEqual({ count: 1, bytes: blobs!.full!.size + blobs!.thumb!.size });
  });

  it('keeps the images out of the JSON backup (only the details are in it)', async () => {
    const { exportBackup } = await import('@/data/backup');
    const store = await openDexieStore({ name: `photos-${++n}` });
    await addPhoto(store, new Blob(['raw']), { owner: monthlyOwner(new Date()), babies: 'both', now: new Date() }, fakeEnv(100, 100));
    const backup = await exportBackup(store);
    expect(backup.data.photos).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toContain('photoBlobs');
  });
});

// ---------- Two phones and the family's Storage ----------

const engines: SyncEngine[] = [];
afterEach(() => {
  engines.splice(0).forEach((e) => e.stop());
});

async function phone(server: MemoryServer): Promise<{ store: DexieStore; engine: SyncEngine; remote: MemoryRemote }> {
  const store = await openDexieStore({ name: `photo-sync-${++n}` });
  const remote = server.client();
  const engine = new SyncEngine(store.sync, async () => remote, { debounceMs: 5, pollMs: 60_000, maxRetryMs: 20 });
  engines.push(engine);
  return { store, engine, remote };
}

async function family() {
  const server = new MemoryServer();
  const mom = await phone(server);
  const dad = await phone(server);
  const membership = await mom.engine.createFamily();
  mom.engine.start(membership);
  dad.engine.start(await dad.engine.joinFamily(formatCode(membership.code)));
  await Promise.all([mom.engine.syncNow(), dad.engine.syncNow()]);
  return { server, mom, dad, familyId: membership.familyId };
}

describe('photos between two phones', () => {
  it('uploads the images after the details, marks them uploaded, and lets the other phone download them lazily', async () => {
    const { server, mom, dad, familyId } = await family();
    const saved = await addPhoto(
      mom.store,
      new Blob(['raw']),
      { owner: monthlyOwner(new Date()), babies: 'both', now: new Date() },
      fakeEnv(2000, 1000),
    );
    await mom.engine.syncNow();
    expect([...server.storage.keys()].sort()).toEqual([`${familyId}/${saved.id}.thumb.webp`, `${familyId}/${saved.id}.webp`]);
    expect((await mom.store.photos.get(saved.id))?.uploaded).toBe(true);

    await dad.engine.syncNow();
    const onDad = await dad.store.photos.get(saved.id);
    expect(onDad?.uploaded).toBe(true);
    // Dad's phone has no images until a screen asks for one.
    expect(await dad.store.photoBlobs.get(saved.id)).toBeUndefined();
    const thumb = await dad.engine.downloadPhoto(onDad!, 'thumb');
    expect(thumb?.size).toBe((await mom.store.photoBlobs.get(saved.id))?.thumb?.size);
    expect(await dad.engine.downloadPhoto({ id: 'missing', mime: 'image/webp' }, 'full')).toBeNull();
  });

  it('removes the Storage objects when a photo is deleted, and uploads again after an undo', async () => {
    const { server, mom, dad, familyId } = await family();
    const saved = await addPhoto(
      mom.store,
      new Blob(['raw']),
      { owner: bumpOwner(30), babies: 'none', now: new Date() },
      fakeEnv(500, 500),
    );
    await mom.engine.syncNow();
    await dad.engine.syncNow();
    expect(server.storage.size).toBe(2);

    // Dad deletes it; his phone removes the objects at his next sync.
    const undo = await deletePhoto(dad.store, saved.id);
    await dad.engine.syncNow();
    expect([...server.storage.keys()].filter((k) => k.startsWith(familyId))).toEqual([]);
    await mom.engine.syncNow();
    expect(await mom.store.photos.get(saved.id)).toBeUndefined();

    // Undo on Dad's phone: Mom still has the images and puts them back.
    await undo();
    await dad.engine.syncNow();
    await mom.engine.syncNow();
    expect(server.storage.size).toBe(2);
    expect((await mom.store.photos.get(saved.id))?.uploaded).toBe(true);
  });

  it('keeps syncing records when Storage refuses the images (e.g. migration 006 not run)', async () => {
    const { mom, dad } = await family();
    const failing = vi.spyOn(mom.remote, 'uploadPhoto').mockRejectedValue(new Error('Bucket not found'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saved = await addPhoto(
      mom.store,
      new Blob(['raw']),
      { owner: monthlyOwner(new Date()), babies: 'A', now: new Date() },
      fakeEnv(10, 10),
    );
    await mom.engine.syncNow();
    expect(mom.engine.getSnapshot().state).toBe('synced');
    await dad.engine.syncNow();
    expect((await dad.store.photos.get(saved.id))?.uploaded).toBe(false);
    failing.mockRestore();
    warn.mockRestore();
    await mom.engine.syncNow();
    await dad.engine.syncNow();
    expect((await dad.store.photos.get(saved.id))?.uploaded).toBe(true);
  });

  it('uploads only from a phone with the full image (an undo on a phone with just a thumbnail leaves it to the other)', async () => {
    const { server, mom, dad, familyId } = await family();
    const saved = await addPhoto(
      mom.store,
      new Blob(['raw']),
      { owner: monthlyOwner(new Date()), babies: 'both', now: new Date() },
      fakeEnv(800, 600),
    );
    await mom.engine.syncNow();
    await dad.engine.syncNow();
    // Dad has looked at it: his phone has the thumbnail only.
    await dad.store.photoBlobs.put({ id: saved.id, full: null, thumb: await dad.engine.downloadPhoto(saved, 'thumb') });
    const undo = await deletePhoto(dad.store, saved.id);
    await dad.engine.syncNow();
    expect(server.storage.size).toBe(0);
    await undo();
    await dad.engine.syncNow();
    expect(server.storage.size).toBe(0);
    expect((await dad.store.photos.get(saved.id))?.uploaded).toBe(false);
    await mom.engine.syncNow();
    expect([...server.storage.keys()].sort()).toEqual([`${familyId}/${saved.id}.thumb.webp`, `${familyId}/${saved.id}.webp`]);
  });

  it('uploads the images again into a family joined later', async () => {
    const { server, mom } = await family();
    const saved = await addPhoto(
      mom.store,
      new Blob(['raw']),
      { owner: monthlyOwner(new Date()), babies: 'A', now: new Date() },
      fakeEnv(10, 10),
    );
    await mom.engine.syncNow();
    mom.engine.stop();
    const fresh = await mom.engine.createFamily();
    mom.engine.start(fresh);
    await mom.engine.syncNow();
    expect(server.storage.has(`${fresh.familyId}/${saved.id}.webp`)).toBe(true);
    expect((await mom.store.photos.get(saved.id))?.uploaded).toBe(true);
  });

  it('goes on with the other photos when one is refused, and stops (to retry) when offline', async () => {
    const { server, mom } = await family();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = await addPhoto(
      mom.store,
      new Blob(['a']),
      { owner: monthlyOwner(new Date()), babies: 'A', now: new Date(Date.now() - 1000) },
      fakeEnv(10, 10),
    );
    const second = await addPhoto(
      mom.store,
      new Blob(['b']),
      { owner: monthlyOwner(new Date()), babies: 'B', now: new Date() },
      fakeEnv(10, 10),
    );
    const upload = mom.remote.uploadPhoto.bind(mom.remote);
    const refusing = vi
      .spyOn(mom.remote, 'uploadPhoto')
      .mockImplementation((familyId, path, blob, type) =>
        path.startsWith(first.id) ? Promise.reject(new Error('too big')) : upload(familyId, path, blob, type),
      );
    await mom.engine.syncNow();
    expect((await mom.store.photos.get(first.id))?.uploaded).toBe(false);
    expect((await mom.store.photos.get(second.id))?.uploaded).toBe(true);

    refusing.mockRestore();
    mom.remote.setOnline(false);
    await mom.engine.syncNow();
    expect(mom.engine.getSnapshot().state).toBe('offline');
    mom.remote.setOnline(true);
    await mom.engine.syncNow();
    expect((await mom.store.photos.get(first.id))?.uploaded).toBe(true);
    expect(server.storage.size).toBe(4);
    warn.mockRestore();
  });
});

describe('images of deleted photos', () => {
  it('stay on the phone for a week (for undo), then go; storage counts only live photos', async () => {
    const store = await openDexieStore({ name: `photos-${++n}` });
    const kept = await addPhoto(store, new Blob(['a']), { owner: monthlyOwner(new Date()), babies: 'A', now: new Date() }, fakeEnv(10, 10));
    const gone = await addPhoto(store, new Blob(['b']), { owner: monthlyOwner(new Date()), babies: 'A', now: new Date() }, fakeEnv(10, 10));
    await deletePhoto(store, gone.id);
    const live = new Set((await store.photos.list()).map((p) => p.id));
    expect((await store.photoBlobs.usage(live)).count).toBe(1);
    expect(await pruneDeletedImages(store, new Date())).toBe(0);
    expect(await pruneDeletedImages(store, new Date(Date.now() + 8 * 24 * 3600_000))).toBe(1);
    expect(await store.photoBlobs.get(gone.id)).toBeUndefined();
    expect(await store.photoBlobs.get(kept.id)).toBeDefined();
  });
});
