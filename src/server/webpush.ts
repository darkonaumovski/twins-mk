/**
 * Web Push on plain WebCrypto (runs in Supabase Edge Functions, Node and tests):
 * payload encryption per RFC 8291 (aes128gcm) and VAPID sender identification per RFC 8292.
 */

export interface VapidKeys {
  /** Uncompressed P-256 public key (65 bytes), base64url. Also given to the phones. */
  publicKey: string;
  /** P-256 private key `d` (32 bytes), base64url. Server secret. */
  privateKey: string;
  /** Contact for the push services: a mailto: or https: URL. */
  subject: string;
}

export interface PushTarget {
  endpoint: string;
  /** The phone's P-256 public key, base64url. */
  p256dh: string;
  /** The phone's 16-byte auth secret, base64url. */
  auth: string;
}

export interface PushRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: Uint8Array;
}

const enc = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Uint8Array {
  const b64 = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** WebCrypto wants plain ArrayBuffers in some runtimes; copy to be safe. */
const buf = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }, key, length * 8);
  return new Uint8Array(bits);
}

/** Record size written in the header; one record is enough for a small reminder. */
const RECORD_SIZE = 4096;

/**
 * Encrypts a payload for one phone (RFC 8291, "aes128gcm" content encoding).
 * `salt` and `serverKeys` are only passed by tests.
 */
export async function encryptPayload(
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  payload: Uint8Array,
  options: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  const uaPublic = base64UrlDecode(target.p256dh);
  const authSecret = base64UrlDecode(target.auth);
  const serverKeys =
    options.serverKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0 || ua_public || as_public, 32)
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // A single, last record: the payload followed by the 0x02 delimiter (no padding).
  const plain = concat(payload, new Uint8Array([2]));
  if (plain.length + 16 > RECORD_SIZE) throw new Error('payload too large');
  const aesKey = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aesKey, buf(plain)));

  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/** The VAPID `Authorization` header value for a push service (a signed ES256 JWT). */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = new Date()): Promise<string> {
  const pub = base64UrlDecode(vapid.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be an uncompressed P-256 key');
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(pub.slice(1, 33)),
    y: base64UrlEncode(pub.slice(33, 65)),
    d: vapid.privateKey,
    ext: true,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = base64UrlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64UrlEncode(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: vapid.subject })),
  );
  const unsigned = `${header}.${claims}`;
  // WebCrypto returns the raw r||s signature, which is exactly what a JWT (JWS) uses.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(enc.encode(unsigned))));
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${vapid.publicKey}`;
}

/**
 * The HTTP request that delivers `payload` to one phone. `ttlSeconds`: how long the push
 * service keeps it while the phone is offline (a reminder is useless much later).
 */
export async function buildPushRequest(target: PushTarget, payload: string, vapid: VapidKeys, ttlSeconds = 3600): Promise<PushRequest> {
  return {
    url: target.endpoint,
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'high',
    },
    body: await encryptPayload(target, enc.encode(payload)),
  };
}
