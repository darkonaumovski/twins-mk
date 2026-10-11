# Twins Organizer

A calm, phone-first app for parents expecting twins.

- **Before birth:** a preparation checklist with a starter list for twins (must-haves aimed to be ready by week 32, because twins often come early), a countdown to the due date or a planned delivery date, a budget and a shopping mode.
- **After birth:** a daily planner and tracker for feeds, diapers, sleep, medicines, growth, appointments, routines and parent tasks, always for Twin A, Twin B or both.

### Feeding twins

- **Tandem breastfeeding:** with both twins selected, each twin gets its own side (Twin A left, Twin B right by default). The feed sheet and Today show each twin's last side, so you can alternate.
- **Bottles for both:** one amount for each, or "different amounts" with a stepper per twin. Both entries stay linked as one feed.
- **Top-up bottle:** a breastfeed can include a bottle afterwards (ml and milk type). It counts in the day's ml, the charts and the messages to the other phone.
- **Feed interval (optional):** in the twin setup, enter how often each twin feeds, as you were told or as you follow it. Today then shows "next feed ~14:30" or "feed due 20 min ago". The app never suggests an interval.
- **Feed the other twin too?** When one twin is fed and the other's next feed is due within 45 minutes (changeable in Settings, 0 turns it off), the app offers to open the feed sheet for the other twin.
- Every log sheet is tinted with the chosen twin's colour, and the save button names the twin ("Save for Ema").

### Medicines and care routines

- **Medicine routines:** any routine can be marked "This is a medicine or supplement", with the name to log, the dose as your doctor gave it, and optionally a minimum time between doses. The app has no doses or intervals of its own.
- **Daily care on Today:** each active daily medicine routine shows ✓ or – per twin for today. One tap logs the dose for that twin. A medicine routine in "Coming up" counts as done once each twin was given it that day.
- **Before logging a dose:** if a twin had the same medicine sooner than the minimum time you set, the app asks "Ana already had Vitamin D 2 h ago. Log anyway?". Without a minimum time it only shows when it was last given.
- **Examples:** the "Add routine" sheet offers Vitamin D, bath, tummy time, nail trim and a check-up / vaccination appointment as starting points. They fill in a name and how often; you choose the times. Check with your paediatrician.

### More to log, pumping, milk stash and supplies

- **More:** the Quick Log panel keeps its main buttons; a "More" button opens temperature (°C), spit-up (small/large), bath and tummy time (minutes), plus pumping, the milk stash and supplies.
- **Pumping** belongs to the mother, not a twin: ml per side (or a total) and minutes. One tap can add the milk to the **milk stash** (fridge or freezer). Pumping shows in the timeline and as "Pumped ml per day" in History.
- **Milk stash** (More → Milk stash): totals for fridge and freezer, every container oldest first, with its age. If you enter your own "use within" days, it also shows the days left. A bottle of breast milk can take its millilitres from the stash, oldest container first.
- **Supplies** (More → Supplies): count your diapers once (and, for formula, how much one tin makes and how many tins you have). The count then goes down by itself as you log: one diaper per diaper entry for each twin, and the ml of formula bottles and top-ups. It shows about how many days are left at the last 3 days' pace. When that drops below your threshold, Today shows a note with **+ pack** and **Add to the shopping list** (which puts the checklist item back on the shopping list).

### Family, handover and night duty

- **Helpers:** besides the two parents, add grandparents or a nanny under **Settings → Family** (up to 8 people). Anyone can be chosen as "This phone is used by", as the person a task is for, and on night duty. Entries show who logged them. The parents keep their fixed ids (`p1`, `p2`) and their names stay in the shared settings, so existing entries and older phones are unaffected.
- **Since you last opened:** when you come back to the app after a while, Today shows what happened since (per twin: feeds and ml, diapers, sleep, medicines) and who logged it. Tap **Seen** to dismiss it. The time you last left is kept on the phone only.
- **Night duty:** under **Settings → Night duty**, set tonight's shifts (for example Marija 22:00–02:00, Darko 02:00–06:00). They repeat every night until changed. Today shows "On duty now: Marija until 02:00". Under **Sync between phones**, each phone can choose **Only when I'm on night duty**: while someone else has the shift, that phone stays quiet.

### Early arrivals, hospital stays and the doctor's report

- **Corrected age:** in the twin setup, enter the week of pregnancy each twin was born at (for example 35 + 4). For a twin born before 37 + 0, Today and Growth show both the actual age and the age corrected for prematurity. Growth also shows the change since the birth weight in grams and percent, without any judgement.
- **In hospital:** the house/hospital button on a twin's card on Today marks where the twin is. A twin in hospital is dimmed on Today, and Today shows when milk was last pumped, with one tap to log pumping or a visit. Routines can be marked **Only when the twin is at home** (a bath, for example), and they then leave out a twin in hospital.
- **Report for the doctor** (More → Report, or from Notes for the doctor): pick a twin or both and the last 7, 14 or 30 days. It shows a daily table per twin (feeds, ml, breast minutes, wet/dirty diapers, sleep hours, medicines) with averages, the growth measurements and the open questions for the doctor. **Print / Save as PDF** prints it on A4; **Share** sends it as text where the phone supports it.

### At night

- **Night appearance:** **Settings → Appearance → Night** is a very dim, warm palette with little blue light for feeds in the dark. **Auto night (22–06)** switches to it in the evening and back in the morning.
- **Screen stays on** while a sleep or breastfeeding timer runs (where the phone allows it), and turns off normally again when the timer stops or the app goes to the background.
- **Vibration** confirms each entry with a short buzz (Android; can be turned off per phone in Settings).
- **Stop both:** when both twins have a sleep (or breastfeeding) timer running, one button stops both.
- **Home-screen shortcuts:** long-press the app icon (Android) for **Feed**, **Diaper** and **Sleep**, which open Today with the right sheet.
- **Backup reminder:** with sync off, Settings and More show a gentle note when this phone has not made a backup for over a week.

It is local-first. All data lives in the browser on the phone (IndexedDB), and the app works fully without internet. With **sync between phones** turned on, both parents' phones share the same data and see each other's changes within seconds. There are no accounts, no analytics and no tracking. It installs to the home screen and works fully offline. The interface is in Macedonian (default) and English.

> **Not medical advice.** Twins Organizer is an organiser. Checklist quantities, deadlines and any routines are editable suggestions, not recommendations. Follow your doctor, midwife or paediatrician.

## Install on your phone

**App:** https://darkonaumovski.github.io/twins-mk/

**Android (Chrome)**

1. Open the link in Chrome.
2. Tap **Поставки → Инсталирање → Инсталирај ја апликацијата** (Settings → Install), or use the Chrome menu **⋮ → Install app**.
3. Open Twins Organizer from the home screen.

**iPhone (Safari)**

1. Open the link in **Safari**.
2. Tap **Share** (the square with an arrow) → **Add to Home Screen** → **Add**.
3. Open Twins Organizer from the home screen. Reminders on iPhone only work from here (iOS 16.4 or newer).

**Already installed under the old name (Twins.MK)?** Android updates the home-screen name by itself within a day or so. On iPhone the home-screen label is fixed when the app is added. To change it, first make sure sync is on and up to date (removing the icon on iPhone also removes that copy of the data), then remove the icon and add the app again from Safari.

**Opening the app** asks for the family password. It asks again after the app has been in the background for 5 minutes. **Поставки → Лозинка → Заклучи сега** (Settings → Password → Lock now) locks it right away.

**First time on each phone**

1. **Поставки → Овој телефон го користи** (Settings → This phone is used by): choose which parent uses this phone.
2. Optionally turn on **Потсетници** (Reminders).

**Sync the two phones (once)**

1. On the first phone: **Поставки → Синхронизација меѓу телефони → Вклучи синхронизација на овој телефон** (Settings → Sync between phones → Start sync on this phone). A family code like `ABCD-EFGH-JKMN` appears.
2. Send the code to the other parent (**Испрати го кодот** / Send code), or read it out.
3. On the second phone: **Поставки → Синхронизација меѓу телефони → Имам код** (I have a code), enter the code and tap **Поврзи** (Join).

From then on, anything either parent adds, edits or deletes shows up on the other phone within a few seconds. Whatever the second phone already had is merged in, not lost. Without internet, both phones keep working. Changes wait on the phone and are sent when it is back online. Keep the code private, because anyone who has it can see the family's data.

Once installed, the app works without internet. Installing also makes it much less likely that the browser clears the data when the phone runs low on storage; **Поставки → Складирање** (Settings → Storage) shows whether the data is protected.

---

## Quick start

Requirements: **Node.js 22.12 or newer** and npm.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command             | What it does                                                          |
| ------------------- | --------------------------------------------------------------------- |
| `npm run dev`       | Development server with hot reload (no service worker)                |
| `npm test`          | Unit tests (Vitest)                                                   |
| `npm run typecheck` | TypeScript checks for the app, the service worker and the config      |
| `npm run build`     | Type-check and build the production site into `dist/`                 |
| `npm run preview`   | Serve `dist/` locally (http://localhost:4173), including offline mode |
| `npm run format`    | Format the code with Prettier                                         |
| `npm run icons`     | Regenerate the app icons from `public/icon.svg`                       |

To try the app on your phone during development, run `npm run dev -- --host` and open the printed network address on a phone on the same Wi-Fi. Installing and offline mode need HTTPS, so test those on the deployed site.

## Deploying (static hosting)

`npm run build` produces a fully static site in `dist/`. The app uses hash URLs (`/#/today`), so no server rewrite rules are needed.

The `BASE_PATH` environment variable sets the folder the app is served from:

- At a domain root (Netlify, Cloudflare Pages, Vercel, your own domain): build with the default `BASE_PATH=/`.
- On GitHub Pages project sites (`https://<user>.github.io/<repo>/`): `BASE_PATH=/<repo>/`.

### GitHub Pages (set up in this repository)

1. Push the repository to GitHub.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` installs, runs the tests, builds with `BASE_PATH=/<repo>/` and publishes. The site appears at `https://<user>.github.io/<repo>/`.

### Other hosts

Build command `npm run build`, publish directory `dist`. For a manual upload:

```bash
npm run build
# then drag the dist/ folder onto Netlify Drop or Cloudflare Pages
```

Updates: the app checks for a new version when it opens and every hour. When one is ready it shows **"A new version is ready / Reload"**. It never reloads by itself, so nobody loses a half-filled form.

## Sync between phones

Sync uses a free [Supabase](https://supabase.com) project as the server. The app does all the work on the phone, and the server only stores records and applies the access rules.

- **How it works.** Every change is saved on the phone first, then queued and uploaded. The server keeps the newest version of each record: newest `updatedAt` wins, ties are broken by device id, and deletes are tombstones, all exactly as in the backup merge. Each phone subscribes to its family's changes over a WebSocket (Supabase Realtime) and pulls them as soon as they happen. It also catches up when the app opens, comes back to the foreground or regains internet.
- **Offline.** Both phones always work offline. The header shows a small cloud icon while changes are waiting to be sent.
- **Access.** Each phone signs in anonymously, and that sign-in is remembered on the phone. Only phones that joined the family with its code can read or write its records (row-level security in `supabase/schema.sql`). If a phone loses its sign-in, it rejoins with the stored code automatically.
- **Per-phone settings** (language, theme, who uses the phone, reminders, when the app was last opened) are not synced.
- **What the other parent changed.** When sync brings in changes from the other phone, the app says what they were, for example "Марија: Шишенце · Ема · 90 ml Формула" or "Нова задача: Купи марамчиња". While the app is on screen this is a message at the bottom. While it is in the background (or the screen is off), it is a phone notification, once notifications are allowed. Several changes at once become one notification. You can turn this off per phone in **Sync between phones → Tell me what the other parent changes**. Nothing arrives while the app is fully closed, because that would need a push server. The first merge after joining is not announced.

### Setting up the sync server (once)

1. Create a free account and a new project at https://supabase.com (any region close to you, for example Frankfurt).
2. **Authentication → Sign In / Providers → Anonymous sign-ins**: turn it **on** and save.
3. **SQL Editor → New query**: paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
4. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key. Put them in `.env.production` (copy `.env.example`):

   ```bash
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon or publishable key>
   ```

   The anon key is public by design: it ships inside the app, and the database rules decide who can see what. Never use the `service_role` / secret key here.

5. Commit and push. GitHub Actions rebuilds the site, and the **Sync between phones** section appears in Settings.

Without these two values the app builds exactly as before, local only with backups.

### Updating an existing sync server

Some app versions sync new kinds of records, and the server has to be told about them once. **Run each new file in [`supabase/migrations/`](supabase/migrations) once before the phones get that app version:** Supabase dashboard → **SQL Editor → New query** → paste the file → **Run**. Running one twice, or in a different order, does no harm: they only ever add to the list of collections the server accepts. A brand-new project only needs `supabase/schema.sql`, which already includes all of them.

| File                             | Needed for                           |
| -------------------------------- | ------------------------------------ |
| `002_pumping_stash_supplies.sql` | pumping, the milk stash and supplies |
| `003_caregivers.sql`             | helpers (grandparents, a nanny…)     |

If a migration was missed, the updated phone shows "The sync server needs an update" under **Sync between phones**. Its changes wait on the phone and go up as soon as the migration has run. The older phone keeps working; it simply ignores records it does not know.

Free Supabase projects are paused after a week with no activity at all. Daily use keeps the project awake. If it is paused, the phones keep working offline. Restore the project from the Supabase dashboard and they catch up.

To try the sync screens locally without a server, run `VITE_SUPABASE_URL=memory npm run dev` (in-memory server, one browser tab, development only).

## Backups

Backups are still worth making: sync copies mistakes too, and the server is not a backup. **Settings → Backup**:

- **Download backup** saves a `.json` file with everything (checklist, logs, plans, notes, settings shared by both parents).
- **Send backup** opens the phone's share sheet, so you can send the file to the other parent in a chat app.
- **Import a backup** _merges_ the file into this phone. For each record, the most recently changed version wins. Records deleted on the other phone are deleted here too. Nothing else is removed, so importing an old backup cannot undo newer changes.

Without sync, you can bring two phones in line by hand: send a backup from phone A to phone B and import it, then do the same from B to A.

**Make a backup regularly.** If a phone is lost or reset, the backup is the only copy. Preferences that belong to one phone (language, theme, which parent uses it, reminders) are not part of the backup.

## Family password

The app asks for a password when it opens and after 5 minutes in the background. A reload within those 5 minutes, for example to install an update, does not ask again. Half-filled forms stay as they were under the lock screen.

The code only contains a salted PBKDF2 hash of the password (`src/features/lock/password.ts`), never the password itself, because the repository is public. To change the password, generate a new salt and hash and paste them into that file:

```bash
node -e "const c=require('crypto'),s=c.randomBytes(16).toString('hex');console.log(s,c.pbkdf2Sync(process.argv[1],Buffer.from(s,'hex'),210000,32,'sha256').toString('hex'))" "NewPassword"
```

The password is a privacy screen against someone picking up an unlocked phone. It does not encrypt the data stored on the phone, and the synced data on the server is protected by the family code, not by this password.

## Reminders: what to expect

With **Settings → Reminders** on, the app shows an in-app message and, if allowed, a system notification when a routine is due and an hour before an appointment.

Without a push server, a web app cannot wake itself up. Reminders only arrive while the app is open or was used recently. On iPhone they also require the app on the Home Screen. **Do not rely on them for medicines.** The **Today → Coming up** list always shows what is due.

## How it is built

- React 19, TypeScript and Vite 8, styled with Tailwind CSS 4. System fonts only, so no web-font requests.
- Dexie (IndexedDB) for storage. i18next for translations. date-fns for dates. A Workbox service worker (vite-plugin-pwa) for offline use.
- Charts are small hand-written SVG components with a legend, tooltips (mouse, touch and keyboard) and a table view.

```
src/
  data/            types, repository interfaces, Dexie implementation, merge, backup
  features/
    checklist/     preparation checklist, starter list (seed), quantity logic
    budget/        budget totals and shopping mode
    twins/         twin setup, colours, badges
    log/           quick logging, entry editor, timers
    today/         Today screen
    history/       day summary, timeline, weekly charts, growth
    plan/          calendar, routines, tasks, upcoming items, reminders
    notes/         notes for the doctor
    settings/      settings, backup, install
  components/      shared UI (sheet, toast, confirm, charts, …)
  i18n/            Macedonian and English texts (incl. the starter list)
  sw/              service worker
```

### Data model and sync

Every synced record carries `id`, `createdAt`, `updatedAt`, `deletedAt` (deletes are soft "tombstones", which also powers Undo) and `deviceId`. The UI only talks to the interfaces in `src/data/repository.ts`. `src/data/dexieStore.ts` is the only code that knows about IndexedDB.

Merging is a pure function (`src/data/merge.ts`): newest `updatedAt` wins, with ties broken by `deviceId`.

Sync (`src/data/sync/`) keeps Dexie as the local database. Every local write also adds an entry to an outbox table in the same transaction. The `SyncEngine` pushes the outbox and then pulls server changes after the last change number (`seq`) it has seen. It merges what it pulls through the same rule. `push_records` in `supabase/schema.sql` applies that rule on the server too, and it takes a per-family lock so change numbers follow commit order. The screens do not know about sync, because Dexie's live queries re-render them when pulled records arrive.

Records that both phones create on their own use fixed ids, so they never duplicate when merged: the starter checklist (`seed-…`) and the two babies (`baby-A`, `baby-B`).

The starter checklist is versioned (`SEED_VERSION` in `src/features/checklist/seed.ts`). Each version stamps its changes with its own fixed, very old timestamp (v1 `2000-01-01`, v2 `2000-01-02`). An upgrade only rewrites seed records nobody has touched, and both phones produce identical records, so a parent's edit or delete always wins and nothing duplicates.

**Newer and older phones together.** A phone skips synced collections and log entry types it does not know (they come from a newer version on the other phone): they stay stored and synced, but are not shown. If a screen still crashes, its **Reload** button switches to a waiting app update first.

### Tests

`npm test` runs the unit tests for:

- the data layer (CRUD, soft delete and restore, live queries, merge, backup round trips between two simulated phones)
- sync between two simulated phones (joining with existing data, real-time updates, offline catch-up, conflicts, deletes, leaving, data from a newer version) against an in-memory server
- the "what the other parent changed" messages, end to end from one phone's edit to the other phone's on-screen message (including helpers and "the other phone")
- night duty (shifts past midnight, quiet alerts while someone else is on duty), the "since you last opened" handover and the caregiver list
- the family password check
- the server schema (`supabase/schema.sql`) in an in-process Postgres (PGlite): join codes, access rules, newest-wins upserts, every synced collection accepted, and the migrations upgrading an older project
- checklist quantities, filters and price parsing
- the starter list and its v1 → v2 upgrade (edited or deleted items stay untouched, both phones end up identical)
- the pregnancy countdown (due date, planned delivery date, pregnancy week)
- budget and shopping totals
- logging helpers and log queries (tandem entries, last side, top-up ml, next feed, the "feed the other twin" check)
- daily summaries (including sleep across midnight, spit-ups, baths and tummy time)
- pumping totals and the milk stash (oldest first, partly used containers, age against the parents' own limit)
- supplies (use since the count, days left at the recent pace, restocking without losing the other phone's use)
- routine scheduling and upcoming items, daily care per twin, the medicine interval check (warns only with an interval the parents set), and routines that skip a twin in hospital
- actual and corrected age, weight change since birth, and the doctor's report (daily rows, totals, open notes)
- chart scales and colour-pair rules
- the night appearance switch, "stop both" timers and the backup reminder
- translation completeness (same keys, plural forms and placeholders in both languages)

## Privacy

Without sync, no data leaves the device unless you export a backup yourself. With sync turned on, the family's records are stored in your own Supabase project and only phones that joined with the family code can read them. The app makes no other network requests: no analytics, no fonts, no CDNs.
