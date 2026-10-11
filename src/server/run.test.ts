import { createECDH, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import ece from 'http_ece';
import type { Routine, SharedSettings } from '@/data/types';
import { DEFAULT_SETTINGS } from '@/data/defaults';
import type { FamilyData } from './reminders';
import { runReminders, sendTestReminder, type ReminderStore, type StoredSubscription } from './run';
import { base64UrlEncode, type PushRequest } from './webpush';

const meta = { createdAt: '', updatedAt: '', deletedAt: null, deviceId: 'd' };

function phone(endpoint: string, caregiverId: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const sub: StoredSubscription = {
    familyId: 'fam-1',
    endpoint,
    caregiverId,
    kinds: ['routines', 'medicines', 'appointments', 'feedDue'],
    lang: 'en',
    p256dh: base64UrlEncode(ecdh.getPublicKey()),
    auth: base64UrlEncode(auth),
  };
  const read = (req: PushRequest) =>
    JSON.parse(ece.decrypt(Buffer.from(req.body), { version: 'aes128gcm', privateKey: ecdh, authSecret: auth }).toString('utf8'));
  return { sub, read };
}

const vapidEcdh = createECDH('prime256v1');
vapidEcdh.generateKeys();
const vapid = {
  publicKey: base64UrlEncode(vapidEcdh.getPublicKey()),
  privateKey: base64UrlEncode(vapidEcdh.getPrivateKey()),
  subject: 'https://example.com/',
};

const routine: Routine = {
  ...meta,
  id: 'bath',
  title: 'Bath',
  babies: 'A',
  active: true,
  rule: { kind: 'everyDays', days: 1, times: ['19:00'], startDate: '2026-10-01' },
};

function fakeStore(subs: StoredSubscription[]): ReminderStore & { sent: Set<string>; removed: string[] } {
  const family: FamilyData = {
    settings: { ...DEFAULT_SETTINGS, ...meta, timeZone: 'Europe/Skopje' } as SharedSettings,
    babies: [
      { ...meta, id: 'baby-A', slot: 'A', name: 'Ema', color: 'teal', birthDateTime: null, birthWeightG: null, birthLengthCm: null },
    ],
    routines: [routine],
    done: [],
    appointments: [],
    logs: [],
  };
  const sent = new Set<string>();
  const removed: string[] = [];
  return {
    sent,
    removed,
    subscriptions: async () => subs.filter((s) => !removed.includes(s.endpoint)),
    family: async () => family,
    claim: async (_f, keys) => keys.filter((k) => !sent.has(k) && sent.add(k)),
    removeSubscription: async (endpoint) => void removed.push(endpoint),
    delivered: async () => {},
    cleanup: async () => {},
  };
}

describe('push reminder run', () => {
  it('sends a due reminder once to each phone, encrypted for that phone', async () => {
    const mom = phone('https://push.example/mom', 'p1');
    const dad = phone('https://push.example/dad', 'p2');
    const store = fakeStore([mom.sub, dad.sub]);
    const requests: PushRequest[] = [];
    const send = async (req: PushRequest) => {
      requests.push(req);
      return { status: 201 };
    };
    // 19:00 in Skopje is 17:00 UTC.
    const result = await runReminders(store, { now: new Date('2026-10-11T17:02:00Z'), vapid, send });
    expect(result).toMatchObject({ families: 1, due: 1, sent: 2, failed: 0 });
    expect(requests.map((r) => r.url)).toEqual(['https://push.example/mom', 'https://push.example/dad']);
    expect(mom.read(requests[0])).toMatchObject({ title: 'Bath · Ema', url: './#/today' });

    // The next run (5 minutes later) does not send it again.
    const again = await runReminders(store, { now: new Date('2026-10-11T17:07:00Z'), vapid, send });
    expect(again.sent).toBe(0);
    expect(requests).toHaveLength(2);
  });

  it('forgets phones the push service no longer knows', async () => {
    const gone = phone('https://push.example/gone', 'p1');
    const store = fakeStore([gone.sub]);
    const result = await runReminders(store, { now: new Date('2026-10-11T17:02:00Z'), vapid, send: async () => ({ status: 410 }) });
    expect(result.removed).toBe(1);
    expect(store.removed).toEqual(['https://push.example/gone']);
  });

  it('sends a test notification to the phone that asked', async () => {
    const mom = phone('https://push.example/mom', 'p1');
    let message: unknown;
    const outcome = await sendTestReminder(fakeStore([mom.sub]), mom.sub, {
      vapid,
      send: async (req) => {
        message = mom.read(req);
        return { status: 201 };
      },
    });
    expect(outcome).toBe('sent');
    expect(message).toMatchObject({ title: 'Twins Organizer', body: 'Reminders are working.' });
  });
});
