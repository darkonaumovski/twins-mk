/**
 * A minimal ZIP writer: files are stored without compression (CSV and photos are small or
 * already compressed), with CRC-32 checksums and UTF-8 file names. Enough for Excel,
 * the phone's file manager and every unzip tool, without a dependency.
 */
export interface ZipFile {
  name: string;
  data: string | Uint8Array;
  /** Modification time stored in the archive; defaults to `now`. */
  date?: Date;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date, as ZIP stores them (local time, two-second precision, 1980 or later). */
function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const UTF8_FLAG = 0x0800;

/** The archive's parts in order (local headers with data, central directory, end record). */
function zipParts(files: readonly ZipFile[], now: Date): Uint8Array[] {
  // Plain ZIP (no ZIP64) counts entries in 16 bits; far more than any family will export.
  if (files.length > 0xffff) throw new Error('zip: too many files');
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const crc = crc32(data);
    const { time, day } = dosDateTime(file.date ?? now);

    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); // local file header
    l.setUint16(4, 20, true); // version needed (2.0)
    l.setUint16(6, UTF8_FLAG, true);
    l.setUint16(8, 0, true); // stored
    l.setUint16(10, time, true);
    l.setUint16(12, day, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); // central directory header
    c.setUint16(4, 20, true); // made by
    c.setUint16(6, 20, true); // version needed
    c.setUint16(8, UTF8_FLAG, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, day, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    // Extra field, comment, disk number, internal and external attributes stay 0.
    c.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
    if (offset > 0xffffffff) throw new Error('zip: archive larger than 4 GB');
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); // end of central directory
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);

  return [...locals, ...centrals, end];
}

/** The archive's bytes (for tests; the app uses `zip()`, which avoids a second copy). */
export function zipBytes(files: readonly ZipFile[], now = new Date()): Uint8Array {
  const parts = zipParts(files, now);
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The archive as a downloadable / shareable Blob. */
export function zip(files: readonly ZipFile[], now = new Date()): Blob {
  return new Blob(zipParts(files, now) as Uint8Array<ArrayBuffer>[], { type: 'application/zip' });
}
