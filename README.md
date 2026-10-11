# Twins.MK

A calm, phone-first app for parents expecting twins.

- **Before birth:** a preparation checklist with a starter list for twins, a budget and a shopping mode.
- **After birth:** a daily planner and tracker for feeds, diapers, sleep, medicines, growth, appointments, routines and parent tasks, always for Twin A, Twin B or both.

It is local-first. All data stays in the browser on the phone (IndexedDB). There is no account, no server, no analytics and no tracking. It installs to the home screen and works fully offline. The interface is in Macedonian (default) and English.

> **Not medical advice.** Twins.MK is an organiser. Checklist quantities, deadlines and any routines are editable suggestions, not recommendations. Follow your doctor, midwife or paediatrician.

## Install on your phone

**App:** https://darkonaumovski.github.io/twins-mk/

**Android (Chrome)**

1. Open the link in Chrome.
2. Tap **Поставки → Инсталирање → Инсталирај ја апликацијата** (Settings → Install), or use the Chrome menu **⋮ → Install app**.
3. Open Twins.MK from the home screen.

**iPhone (Safari)**

1. Open the link in **Safari**.
2. Tap **Share** (the square with an arrow) → **Add to Home Screen** → **Add**.
3. Open Twins.MK from the home screen. Reminders on iPhone only work from here (iOS 16.4 or newer).

**First time on each phone**

1. **Поставки → Овој телефон го користи** (Settings → This phone is used by): choose which parent uses this phone.
2. Optionally turn on **Потсетници** (Reminders).
3. Set up the data on one phone first. Then use **Резервна копија → Испрати** (Backup → Send) to send it to the other phone, and **Внеси** (Import) it there.

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

## Backups and using two phones

There is no sync server yet, so each phone has its own copy of the data. **Settings → Backup**:

- **Download backup** saves a `.json` file with everything (checklist, logs, plans, notes, settings shared by both parents).
- **Send backup** opens the phone's share sheet, so you can send the file to the other parent in a chat app.
- **Import a backup** _merges_ the file into this phone. For each record, the most recently changed version wins. Records deleted on the other phone are deleted here too. Nothing else is removed, so importing an old backup cannot undo newer changes.

To bring two phones in line, send a backup from phone A to phone B and import it, then do the same from B to A. Both phones then have the same data.

**Make a backup regularly.** If a phone is lost or reset, the backup is the only copy. Preferences that belong to one phone (language, theme, which parent uses it, reminders) are not part of the backup.

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

### Data model and the path to sync

Every synced record carries `id`, `createdAt`, `updatedAt`, `deletedAt` (deletes are soft "tombstones", which also powers Undo) and `deviceId`. The UI only talks to the interfaces in `src/data/repository.ts`. `src/data/dexieStore.ts` is the only code that knows about IndexedDB.

Merging is a pure function (`src/data/merge.ts`): newest `updatedAt` wins, with ties broken by `deviceId`. A sync backend such as Supabase can be added later in two ways:

- implement the same `DataStore` interface against the backend, or
- keep Dexie as the local cache and push and pull changed records (`updatedAt` greater than the last sync) through the same merge.

In both cases the screens do not change.

Records that both phones create on their own use fixed ids, so they never duplicate when merged: the starter checklist (`seed-…`) and the two babies (`baby-A`, `baby-B`).

### Tests

`npm test` runs the unit tests for:

- the data layer (CRUD, soft delete and restore, live queries, merge, backup round trips between two simulated phones)
- checklist quantities, filters and price parsing
- budget and shopping totals
- logging helpers and log queries
- daily summaries (including sleep across midnight)
- routine scheduling and upcoming items
- chart scales and colour-pair rules
- translation completeness (same keys, plural forms and placeholders in both languages)

## Privacy

No data leaves the device unless you export a backup yourself. The app makes no network requests at runtime: no analytics, no fonts, no CDNs.
