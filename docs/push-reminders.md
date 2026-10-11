# Design note: push reminders

Status: **implemented** (Phase 8). Setup steps are in the README under "Push reminders". Differences from the proposal are noted below.

## Why

Today, reminders only fire while the app is open or was used recently. A closed app cannot wake itself up. Real push reminders arrive even when the app is closed: routines, medicines, appointments, and optionally "feed due" from the parents' own feed interval.

## How it would work

1. **Subscribe (per phone).**
   - **Settings → Reminders** gets a switch: **"Also when the app is closed"**.
   - It asks for notification permission (after a tap, as iPhone requires) and subscribes with the Web Push API, using the service worker that already exists.
   - It saves the subscription to Supabase together with this phone's choices: which kinds of reminders, and "only when I'm on night duty".
2. **Schedule (on the server).**
   - A Supabase **Edge Function** `send-reminders` runs every 5 minutes, triggered by `pg_cron`.
   - For each family with subscriptions, it reads the routines, appointments, done marks and latest log entries from `records`. The server already stores them as JSON.
   - It works out what is due with the **same pure code the app uses** (`upcomingItems`, `medCheck`, `onDutyNow`), shared as a module.
3. **Send.**
   - Each due item goes to each subscribed phone once. A `push_sent` table keyed by occurrence stops repeats.
   - The payload is encrypted with the phone's subscription keys (standard Web Push, signed with **VAPID** keys).
   - Tapping the notification opens Today. That handler already exists.
4. **Time zone.**
   - Routine times like "09:00" are local time. Shared settings would gain `timeZone` (the phone's time zone, e.g. `Europe/Skopje`) so the server reads times the same way.

## What changes in `schema.sql`

These changes ship as `supabase/migrations/004_push_milestones.sql` and in `schema.sql` for new projects.

- `push_subscriptions`: `id`, `family_id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `caregiver_id`, `kinds` (jsonb), `created_at`, `last_ok_at`.
  - Row-level security: a phone sees and deletes only its own rows.
  - Writes go through `save_push_subscription()` and `delete_push_subscription()`, like `push_records()` today.
- `push_sent`: `family_id`, `key`, `sent_at`, with primary key (`family_id`, `key`).
  - Only the Edge Function writes to it, using the service role, which never ships in the app.
- A `cron.schedule(...)` job that calls the function every 5 minutes. `pg_cron` and `pg_net` are free on Supabase.
- Secrets live in Supabase's function secrets, not in the repository:
  - the **VAPID private key** stays in the function secrets;
  - the public key ships in the app as `VITE_VAPID_PUBLIC_KEY`.
- Expired subscriptions (the push service answers 404/410) are deleted automatically.

## Cost

- **Supabase free tier.** Edge Functions include 500,000 calls a month. A run every 5 minutes is about 8,600 a month, and the database work is tiny.
- **Push delivery is free.** Google, Apple and Mozilla run the push services.
- **Expected total: €0.**
- **Pausing.** A free Supabase project that is paused (a week with no activity at all) also pauses reminders. Daily use keeps it awake.

## iPhone limits

- Works only on **iOS / iPadOS 16.4 or newer**, and only when the app was **added to the Home Screen** from Safari. It does not work in a Safari tab.
- Permission must be asked from a tap. If the icon is removed from the Home Screen, the subscription is gone and has to be set up again.
- iOS may delay notifications in Low Power Mode or Focus modes. No silent pushes.
- Android (Chrome) works with the app fully closed.
- On both platforms, delivery is "usually within a minute", never guaranteed. The **"do not rely on reminders for medicines"** wording stays.

## Privacy

- **Readable data on the server.** Today the server already stores the family's records, so the only new readable data is the push subscription (an opaque URL plus keys) and when reminders were sent.
- **Where the reminder text goes.** It travels from Supabase to Google, Apple or Mozilla, **end-to-end encrypted**: the push service sees only the endpoint, size and timing, not the text.
- **Optional "private reminders" setting.** It would send only "A reminder is due" and show the details when the phone opens it.
- No analytics or tracking. Turning the switch off deletes the subscription on the server.

## Changes in the app

- A service worker `push` handler shows the notification and reuses the existing tag scheme, so a burst replaces itself.
- Settings → Reminders gets:
  - a "Also when the app is closed" switch;
  - kinds of reminders (routines, medicines, appointments, "feed due" from the feed interval);
  - "only when I'm on night duty";
  - a test push.
- The existing in-app reminders stay for phones that do not subscribe.

## Decisions (answered)

1. Notifications show the details ("Vitamin D · Ema").
2. All kinds are on by default: routines, medicines, appointments, feed due. Each phone can turn kinds off.
3. At night, reminders go only to the phones of whoever is on duty. If that person has no phone with push turned on, every phone gets them, so a reminder is never lost.

## As built

- Web Push encryption (RFC 8291) and VAPID (RFC 8292) are implemented on WebCrypto in `src/server/webpush.ts` (no Node-only library in the Edge Function) and checked in tests against Mozilla's reference decryptor.
- The scheduling code is the app's own; `npm run build:functions` bundles `src/server` into `supabase/functions/_shared/reminders.js`, and a test fails if the committed bundle is out of date.
- Time zone: shared settings gain `timeZone`, set from the phone when push is first turned on (default Europe/Skopje).
- The schedule (`supabase/push-cron.sql`) keeps the cron secret in Supabase Vault.
- The "private reminders" option was not built (details were chosen).
