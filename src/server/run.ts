/**
 * One run of the push reminder function: for every family with subscribed phones, send
 * the reminders that came due, each once. Storage and HTTP are passed in, so the Edge
 * Function supplies Supabase and `fetch`, and tests supply fakes.
 */
import type { ReminderKind } from '../data/types';
import { dueReminders, recipientsFor, reminderMessage, testMessage, type FamilyData, type PushMessage, type Subscriber } from './reminders';
import { buildPushRequest, type PushRequest, type VapidKeys } from './webpush';

export interface StoredSubscription extends Subscriber {
  familyId: string;
  p256dh: string;
  auth: string;
}

export interface ReminderStore {
  subscriptions(): Promise<StoredSubscription[]>;
  /** The family's records the reminders depend on; log entries from `logsSince` on. */
  family(familyId: string, logsSince: string): Promise<FamilyData>;
  /** Marks keys as sent and returns the ones that were not sent before. */
  claim(familyId: string, keys: string[]): Promise<string[]>;
  /** The push service says this phone is gone (unsubscribed or app removed). */
  removeSubscription(endpoint: string): Promise<void>;
  delivered(endpoint: string): Promise<void>;
  /** Forget sent keys older than this. */
  cleanup(before: string): Promise<void>;
}

export type Send = (request: PushRequest) => Promise<{ status: number }>;

export interface RunOptions {
  now: Date;
  vapid: VapidKeys;
  send: Send;
}

export interface RunResult {
  families: number;
  due: number;
  sent: number;
  failed: number;
  removed: number;
}

const LOG_LOOKBACK_MS = 3 * 24 * 3600_000;
const SENT_KEEP_MS = 7 * 24 * 3600_000;

/** Sends one message to one phone; drops subscriptions the push service no longer knows. */
async function deliver(store: ReminderStore, sub: StoredSubscription, message: PushMessage, opts: Pick<RunOptions, 'vapid' | 'send'>) {
  const request = await buildPushRequest(sub, JSON.stringify(message), opts.vapid);
  const { status } = await opts.send(request);
  if (status === 404 || status === 410) {
    await store.removeSubscription(sub.endpoint);
    return 'removed' as const;
  }
  if (status >= 200 && status < 300) {
    await store.delivered(sub.endpoint);
    return 'sent' as const;
  }
  return 'failed' as const;
}

export async function runReminders(store: ReminderStore, opts: RunOptions): Promise<RunResult> {
  const result: RunResult = { families: 0, due: 0, sent: 0, failed: 0, removed: 0 };
  const subs = await store.subscriptions();
  const byFamily = new Map<string, StoredSubscription[]>();
  for (const s of subs) byFamily.set(s.familyId, [...(byFamily.get(s.familyId) ?? []), s]);

  for (const [familyId, familySubs] of byFamily) {
    result.families++;
    try {
      const data = await store.family(familyId, new Date(opts.now.getTime() - LOG_LOOKBACK_MS).toISOString());
      const due = dueReminders(data, opts.now);
      result.due += due.length;
      if (!due.length) continue;
      const fresh = new Set(
        await store.claim(
          familyId,
          due.map((d) => d.key),
        ),
      );
      for (const reminder of due.filter((d) => fresh.has(d.key))) {
        for (const sub of recipientsFor(familySubs, reminder.kind, data.settings, opts.now)) {
          try {
            result[await deliver(store, sub, reminderMessage(reminder, sub.lang, data), opts)]++;
          } catch (err) {
            console.warn('Push failed', err);
            result.failed++;
          }
        }
      }
    } catch (err) {
      // One family's problem must not stop the others' reminders.
      console.warn('Reminders failed for a family', err);
      result.failed++;
    }
  }
  await store.cleanup(new Date(opts.now.getTime() - SENT_KEEP_MS).toISOString());
  return result;
}

/** The "Send a test reminder" button: one notification to the phone that asked. */
export async function sendTestReminder(store: ReminderStore, sub: StoredSubscription, opts: Pick<RunOptions, 'vapid' | 'send'>) {
  return deliver(store, sub, testMessage(sub.lang), opts);
}

export const ALL_KINDS: readonly ReminderKind[] = ['routines', 'medicines', 'appointments', 'feedDue'];
