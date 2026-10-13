// Twins Organizer push reminders (Supabase Edge Function, Deno).
//
// Called every 5 minutes by pg_cron (see supabase/push-cron.sql) with the x-cron-secret
// header: sends every reminder that came due, once per phone. Also called by a signed-in
// phone with { "test": true, "endpoint": … } for "Send a test reminder".
//
// The scheduling and Web Push code is the app's own (src/server), bundled into
// ../_shared/reminders.js by `npm run build:functions`.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets, or `supabase secrets set`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { runReminders, sendTestReminder } from '../_shared/reminders.js';

// Shapes of the bundle's inputs (see src/server/run.ts); the bundle itself is plain JavaScript.
type StoredSubscription = {
  familyId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  caregiverId: string;
  kinds: string[];
  lang: 'mk' | 'en';
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const vapid = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://darkonaumovski.github.io/twins-mk/',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Row = {
  endpoint: string;
  family_id: string;
  p256dh: string;
  auth: string;
  caregiver_id: string;
  kinds: string[];
  lang: 'mk' | 'en';
};

const toSubscription = (r: Row): StoredSubscription => ({
  familyId: r.family_id,
  endpoint: r.endpoint,
  p256dh: r.p256dh,
  auth: r.auth,
  caregiverId: r.caregiver_id,
  kinds: r.kinds,
  lang: r.lang,
});

function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const store = {
  async subscriptions() {
    return check<Row[]>(await admin.from('push_subscriptions').select('*')).map(toSubscription);
  },

  async family(familyId: string, logsSince: string) {
    const all = async (collection: string, filter?: (q: any) => any) => {
      let query = admin.from('records').select('data').eq('family_id', familyId).eq('collection', collection);
      if (filter) query = filter(query);
      const rows = check<{ data: any }[]>(await query.range(0, 9999));
      return rows.map((r) => r.data).filter((d) => d.deletedAt === null);
    };
    const [settings, babies, routines, done, appointments, logs, motherLogs, snoozes] = await Promise.all([
      all('settings'),
      all('babies'),
      all('routines'),
      all('routineDone', (q) => q.gte('data->>occurrence', logsSince)),
      all('appointments', (q) => q.gte('data->>start', logsSince)),
      all('logs', (q) => q.gte('data->>start', logsSince)),
      // The mother's medicine doses, for medicine routines "for the mother".
      all('motherLogs', (q) => q.gte('data->>start', logsSince)),
      // "Snooze 15 min" from the phones' notifications.
      all('reminderSnoozes', (q) => q.gte('data->>until', logsSince)),
    ]);
    return { settings: settings[0], babies, routines, done, appointments, logs, motherLogs, snoozes };
  },

  async claim(familyId: string, keys: string[]) {
    const rows = check<{ key: string }[]>(
      await admin
        .from('push_sent')
        .upsert(
          keys.map((key) => ({ family_id: familyId, key })),
          { onConflict: 'family_id,key', ignoreDuplicates: true },
        )
        .select('key'),
    );
    return rows.map((r) => r.key);
  },

  async removeSubscription(endpoint: string) {
    await admin.from('push_subscriptions').delete().eq('endpoint', endpoint);
  },

  async delivered(endpoint: string) {
    await admin.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('endpoint', endpoint);
  },

  async cleanup(before: string) {
    await admin.from('push_sent').delete().lt('sent_at', before);
  },
};

const send = async (req: { url: string; method: string; headers: Record<string, string>; body: Uint8Array }) => {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  if (!res.ok) console.warn('Push service answered', res.status, await res.text().catch(() => ''));
  return { status: res.status };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!vapid.publicKey || !vapid.privateKey) return new Response('VAPID keys are not set', { status: 500, headers: cors });
  const body = await req.json().catch(() => ({}));

  // "Send a test reminder" from a signed-in phone, to its own subscription only.
  if (body?.test) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: user } = await admin.auth.getUser(token);
    if (!user?.user) return new Response('Not signed in', { status: 401, headers: cors });
    const { data: row } = await admin
      .from('push_subscriptions')
      .select('*')
      .eq('endpoint', String(body.endpoint ?? ''))
      .eq('user_id', user.user.id)
      .maybeSingle();
    if (!row) return new Response('No subscription for this phone', { status: 404, headers: cors });
    const outcome = await sendTestReminder(store, toSubscription(row as Row), { vapid, send });
    return Response.json({ outcome }, { headers: cors });
  }

  // The schedule (pg_cron).
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('Forbidden', { status: 403, headers: cors });
  const result = await runReminders(store, { now: new Date(), vapid, send });
  return Response.json(result, { headers: cors });
});
