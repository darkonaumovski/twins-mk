import { createECDH, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// Mozilla's reference implementation of the encrypted content encoding (used by the web-push library).
import ece from 'http_ece';
import { base64UrlDecode, base64UrlEncode, buildPushRequest, encryptPayload, vapidAuthorization, type VapidKeys } from './webpush';

const ab = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer;

/** A phone's push keys, made the way a browser makes them. */
function phoneKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    auth,
    target: { endpoint: 'https://push.example.com/send/abc', p256dh: base64UrlEncode(ecdh.getPublicKey()), auth: base64UrlEncode(auth) },
  };
}

function vapidKeys(): VapidKeys {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: base64UrlEncode(ecdh.getPublicKey()),
    privateKey: base64UrlEncode(ecdh.getPrivateKey()),
    subject: 'https://example.com/',
  };
}

describe('web push', () => {
  it('encrypts so that the reference implementation can decrypt it (RFC 8291)', async () => {
    const { ecdh, auth, target } = phoneKeys();
    const message = JSON.stringify({ title: 'Витамин Д · Ема', body: '', tag: 'routine:r1' });
    const body = await encryptPayload(target, new TextEncoder().encode(message));
    const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ecdh, authSecret: auth });
    expect(plain.toString('utf8')).toBe(message);
  });

  it('signs a VAPID token the push service can check (RFC 8292)', async () => {
    const vapid = vapidKeys();
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/xyz', vapid, new Date('2026-10-11T12:00:00Z'));
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(vapid.publicKey);
    const [h, c, sig] = token.split('.');
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(c)));
    expect(claims).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'https://example.com/' });
    expect(claims.exp).toBe(Date.parse('2026-10-11T12:00:00Z') / 1000 + 12 * 3600);

    const pub = await crypto.subtle.importKey('raw', ab(base64UrlDecode(vapid.publicKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'verify',
    ]);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pub,
      ab(base64UrlDecode(sig)),
      ab(new TextEncoder().encode(`${h}.${c}`)),
    );
    expect(ok).toBe(true);
  });

  it('builds the request with the headers push services require', async () => {
    const { target } = phoneKeys();
    const req = await buildPushRequest(target, '{"title":"x"}', vapidKeys(), 600);
    expect(req.url).toBe(target.endpoint);
    expect(req.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: '600', Urgency: 'high' });
    expect(req.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
  });
});
