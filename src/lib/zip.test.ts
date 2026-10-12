import { crc32 as nodeCrc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, zip, zipBytes } from './zip';

/** Reads a stored (uncompressed) ZIP the way an unzip tool does: from the central directory. */
function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  expect(view.getUint16(end + 8, true)).toBe(count);
  let at = view.getUint32(end + 16, true);
  // The central directory runs from its offset right up to the end record.
  expect(view.getUint32(end + 12, true)).toBe(end - at);
  const decoder = new TextDecoder();
  const files: { name: string; data: Uint8Array; crc: number; flags: number; day: number; time: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const time = view.getUint16(at + 12, true);
    const day = view.getUint16(at + 14, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(method).toBe(0);

    // The local header must agree with the central directory.
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    // Streaming readers only see the local header, so it must repeat the central directory's fields.
    expect(view.getUint16(localOffset + 4, true)).toBe(20);
    expect(view.getUint16(localOffset + 6, true)).toBe(flags);
    expect(view.getUint16(localOffset + 10, true)).toBe(time);
    expect(view.getUint16(localOffset + 12, true)).toBe(day);
    expect(view.getUint32(localOffset + 14, true)).toBe(crc);
    expect(view.getUint32(localOffset + 18, true)).toBe(size);
    expect(view.getUint32(localOffset + 22, true)).toBe(size);
    const localName = view.getUint16(localOffset + 26, true);
    const extra = view.getUint16(localOffset + 28, true);
    expect(decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localName))).toBe(name);
    const start = localOffset + 30 + localName + extra;
    files.push({ name, data: bytes.subarray(start, start + size), crc, flags, day, time });
    at += 46 + nameLength;
  }
  return files;
}

describe('zip', () => {
  it('computes CRC-32 like zlib', () => {
    const bytes = new TextEncoder().encode('The quick brown fox jumps over the lazy dog');
    expect(crc32(bytes)).toBe(0x414fa339);
    expect(crc32(new Uint8Array())).toBe(0);
    const cyrillic = new TextEncoder().encode('Ема и Ана, 90 мл');
    expect(crc32(cyrillic)).toBe(nodeCrc32(cyrillic));
  });

  it('stores files with UTF-8 names that unzip back to the same bytes', () => {
    const photo = new Uint8Array([0, 1, 2, 250, 255]);
    const date = new Date(2026, 9, 12, 14, 30, 10);
    const bytes = zipBytes(
      [
        { name: 'logs.csv', data: '\uFEFFДатум,Белешка\r\n' },
        { name: 'фотографии/ема.webp', data: photo },
        { name: 'empty.csv', data: '' },
      ],
      date,
    );
    const files = unzip(bytes);
    expect(files.map((f) => f.name)).toEqual(['logs.csv', 'фотографии/ема.webp', 'empty.csv']);
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(files[0].data)).toBe('\uFEFFДатум,Белешка\r\n');
    expect([...files[1].data]).toEqual([...photo]);
    expect(files[2].data.length).toBe(0);
    for (const f of files) {
      expect(f.crc).toBe(nodeCrc32(f.data));
      expect(f.flags & 0x0800).toBe(0x0800);
      // 2026-10-12 14:30:10 in MS-DOS format.
      expect(f.day).toBe(((2026 - 1980) << 9) | (10 << 5) | 12);
      expect(f.time).toBe((14 << 11) | (30 << 5) | 5);
    }
  });

  it('writes an empty archive', () => {
    expect(unzip(zipBytes([]))).toEqual([]);
  });

  it('returns a zip Blob', async () => {
    const blob = zip([{ name: 'a.txt', data: 'a' }]);
    expect(blob.type).toBe('application/zip');
    expect(unzip(new Uint8Array(await blob.arrayBuffer()))[0].name).toBe('a.txt');
  });
});
