# Twins Organizer: feature roadmap

This is the build spec for the next 15 features of Twins Organizer. It is written for Claude Code and is meant to be followed across several sessions. Progress is tracked in `docs/roadmap/PROGRESS.md`, and the prompts for starting and resuming are in `docs/roadmap/PROMPTS.md`.

Where this spec and the code disagree on a detail (a name, a signature), **the code wins**: adapt the spec, and note the difference in PROGRESS.md. Where this spec leaves a choice open, pick the option that best fits the existing code and note it.

---

## Part A: rules for every feature

### A1. The app's character (never break these)

1. **Local-first and offline.** Every feature works fully offline. No accounts, analytics, third-party SDKs, CDNs, web fonts or new network calls. The only network use is the existing Supabase sync (and, for photos, Supabase Storage), and only when sync is on.
2. **No medical judgement.** The app ships no doses, intervals, targets, "normal" ranges or verdicts. Insights are descriptive ("longest stretch 4 h 10 min"), never prescriptive ("too short"). Reference data (the WHO curves in F09) is optional, off by default and labelled as a reference.
3. **Twins first.** Everything works for Twin A, Twin B or both. Use the twin colours (`twinStyle`, `tintFor`, `TwinBadge`), the `WhoPicker`, and link "both twins" records with a shared `groupId` like tandem feeds. Name the twin on save buttons ("Save for Ema").
4. **Two languages.** Every string goes into `src/i18n/locales/mk.ts` (default) and `en.ts`, with plural forms where counts appear. Macedonian must read naturally, not as a literal translation. `locales.test.ts` stays green.
5. **Phone-first and night-friendly.** Use the shared components (`Sheet`, `Stepper`, `Choice`, `Toast`, `Confirm`, `ProgressBar`, `components/charts/*`). Tap targets at least 44 px, one-handed use, the Night palette works, and timers keep the screen on (`TimerWakeLock`).
6. **Privacy.** New data stays on the phone, or in the family's own Supabase project when sync is on. Nothing else.

### A2. How the code is organised (follow the existing patterns)

- **Records** extend `Entity` (`src/data/types.ts`). Screens only use the repository interfaces (`src/data/repository.ts`); only `src/data/dexieStore.ts` knows IndexedDB.
- **A new synced collection** needs all of this:
  1. its type in `types.ts`,
  2. a `Repository<T>` entry in `SyncedCollections` and in `COLLECTIONS` (`repository.ts`),
  3. a new Dexie `version(n)` with its indexes, and the outbox hook (see how `milestones` was added in version 5),
  4. backup export and import (automatic through `COLLECTIONS`; add a round-trip test),
  5. its name in `supabase/schema.sql` (the `sync_collections` insert) **and** in migration `005_roadmap_collections.sql` (see F00),
  6. a line in `src/features/sync/changes.ts` (`changeLine`) so the "what the other parent changed" message describes it in both languages,
  7. the schema test (`src/data/sync/schema.test.ts`) updated so the new collection is accepted.
- **A new log type** goes in `LogType`, the `LogEntry` union, `KNOWN_LOG_TYPES` (`src/data/logTypes.ts`), `LOG_ICONS` and `describe.tsx`. Prefer **optional fields on existing types**, or **a new collection**, over new log types. Older phones hide unknown log types, which can confuse a family where only one phone has updated.
- **Optional fields on existing records** (`headCm`, `rash`…) must be optional (`?:`) so older records and older phones still work. An older phone that edits such a record may drop the new field. That is accepted, but say so in the README's "Newer and older phones together" section.
- **Fixed ids** for records both phones may create independently (as with `seed-…`, `baby-A`, `milestone-<key>-<babyId>`), so they never duplicate.
- **Logic** lives in a pure `logic.ts` (or a clearly named module) next to its feature, with a Vitest test file beside it. Components stay thin.
- **Routes** are lazy-loaded in `src/App.tsx`. Less-used pages are reached from `MorePage.tsx`; less-used log forms from `MoreLogSheet.tsx`.
- **Per-phone preferences** go in `DevicePrefs` (never synced). **Shared preferences** go in `SharedSettings` with a default in `src/data/defaults.ts`. Older records must get the default when the field is missing.
- **Push reminders**: the scheduling in `src/server/reminders.ts` is bundled into `supabase/functions/_shared/reminders.js` by `npm run build:functions`. If you change `src/server` or anything it imports, rebuild the bundle (`server/bundle.test.ts` checks that it matches).

### A3. Quality gates (after every feature)

- [ ] `npm test`, `npm run typecheck`, `npm run build` and `npm run format:check` pass.
- [ ] New logic has unit tests, including edge cases: midnight crossing, "both twins", a twin in hospital, a twin born early, older records without the new fields, and two phones merging.
- [ ] mk and en strings complete. No hard-coded user-facing text.
- [ ] Works in Light, Dark and Night themes at 360 px width.
- [ ] README updated: the feature description in the user-facing section, the migrations table if one was added, and the test list.
- [ ] `docs/roadmap/PROGRESS.md` updated: status, decisions taken, deviations from this spec, and a **manual phone test checklist** (3–8 steps).
- [ ] One commit for the feature, message `feat(<area>): <what> (F<nn>)`. The test, typecheck, build and format results are part of the commit message body.

### A4. Git and deployment

- Work on the branch `roadmap` (create it from `main` if it does not exist). **Never push, merge to `main` or deploy.** Every push to `main` publishes to both parents' phones through GitHub Actions. Darko merges himself after testing.
- To let Darko test on his phone before merging: `npm run build && npm run preview -- --host`, or `npm run dev -- --host` on the same Wi-Fi.
- Never commit secrets (`supabase/functions/.env.local`, edited `push-cron.sql`).

### A5. Decisions already made (defaults)

Darko can change these before you start. Anything marked **ASK** means: stop and ask before building that part.

| #   | Decision                                   | Default                                                                                                                                                    |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | WHO growth reference curves                | Include, **off by default**, per-phone toggle                                                                                                              |
| D2  | Contraction timer data                     | Synced, so the other parent can follow from elsewhere                                                                                                      |
| D3  | Mother's data                              | New collection `motherLogs`. Mother's medicine routines are routines with `babies: 'none'` and `med` set                                                   |
| D4  | Photos                                     | Stored on the phone. Synced through a private Supabase Storage bucket only when sync is on. Not in the JSON backup; there is a separate photo zip          |
| D5  | Voice input for quick logging              | Include, **off by default**, with a privacy note                                                                                                           |
| D6  | "Snooze" on push reminders                 | Server-side, through a small synced `reminderSnoozes` collection. If that grows beyond about a day of work, ship "Done" only and log Snooze as a follow-up |
| D7  | Night hours for insights                   | Shared setting, default 19:00–07:00                                                                                                                        |
| D8  | "Fed together" window for the rhythm chart | Shared setting, default 20 minutes                                                                                                                         |
| D9  | New npm dependencies                       | Avoid. CSV and ZIP are written by hand (small, tested). **ASK** before adding any dependency                                                               |

---

## Part B: the features

Build in this order. Each phase ends with a stop for Darko to test (see PROMPTS.md).

### F00. Foundation (do first, in one commit)

1. Create the `roadmap` branch.
2. Create `CLAUDE.md` at the repo root: a short summary (at most about 80 lines) of Part A plus the key commands from the README, so every future session starts with the rules. Do not duplicate the README.
3. Add **all new collection names at once** to the server, so Darko runs one migration instead of many:
   - `supabase/migrations/005_roadmap_collections.sql` inserts `contractions`, `vaccines`, `motherLogs`, `journal`, `photos`, `foods`, `foodTries`, `reminderSnoozes` into `public.sync_collections` (idempotent, `on conflict do nothing`, same header comment style as 004).
   - Add the same names to `supabase/schema.sql`.
   - Add the migration to the README's migrations table, marked "needed for the roadmap features (run once, before installing a version that has any of them)".
   - Extend the schema test so the migration is applied on top of an older schema and every new name is accepted.
4. Add `src/lib/csv.ts` (RFC 4180 escaping, UTF-8 BOM, `\r\n`) and `src/lib/zip.ts` (store-only ZIP writer with CRC-32 and UTF-8 file names, returns a `Blob`), with tests. Check the ZIP by unzipping it in the test with Node's `zlib`/manual parsing, or by comparing against a known-good fixture.
5. Copy the Phase 1–3 checklist into `docs/roadmap/PROGRESS.md` if it is not already there, and delete `docs/next-features-prompt.md` (superseded by this file).

Done when the gates pass and Darko knows to run `005_roadmap_collections.sql` once.

---

### Phase 1: quick wins

#### F01. Twin rhythm chart (History)

**Why:** Keeping twins on the same rhythm is the main goal of most twin parents. No competitor shows it.

**What:**

- On History, below the day view, a "Rhythm" card with a 7 / 14 day switch.
- One horizontal 00:00–24:00 bar per day per twin, with A and B rows interleaved (A above B for each day, newest day on top). Sleep is filled blocks in the twin's colour, feeds are ticks (tandem or "both" feeds clearly visible on both rows), and a running sleep extends to "now".
- Hour gridlines at 0, 6, 12 and 18, and the night hours (D7) lightly shaded.
- Per day, a descriptive "in step" line: **minutes both twins slept at the same time**, and **feeds started together** (A and B feed starts within the D8 window, matched one to one). No scores and no colours that judge.
- Tap a day to open that day in the History day view. The chart has a table view for accessibility (like the existing charts), and Night-theme colours.

**Data and logic:** `src/features/history/rhythm.ts`:

- `rhythmDay(entries, babyId, day, now)` returns sleep segments clipped to the local day (a sleep across midnight is split) and feed start times.
- `inStep(a, b, windowMin)` returns `{ sharedSleepMin, feedsTogether, feedsA, feedsB }`.

Add `rhythmTogetherMin` (default 20) and `nightHours: { from: 'HH:mm', to: 'HH:mm' }` (default 19:00–07:00) to `SharedSettings`, editable in Settings.

**Tests:** midnight crossing, running sleep, overlapping sleeps, greedy one-to-one feed matching (three A feeds against one B feed counts 1), a twin in hospital (still shown, no special casing), empty days, a DST-change day.

**Done when:** a week of real-looking data renders in under 100 ms on a mid-range phone, the in-step numbers match the tests, and screen readers get the table.

#### F02. Pumping timer

**What:**

- A "Start pumping" action (in `MoreLogSheet` and on the Pump sheet) starts a timer: left, right or both, with a big elapsed time.
- The running timer shows on Today like the other timers, with Stop. Stop opens the existing Pump sheet with minutes filled in (rounded up), so the ml can be entered and optionally added to the milk stash.
- The screen stays on while it runs. Only one pumping timer can run per family.

**Data:** add `end?: ISODateTime | null` to `Pump`. `undefined` means an older manual entry, `null` means running. While it runs, `minutes` is null and `totalMl` is 0.

- Running pumps are excluded from totals, the History "Pumped ml" chart, supplies, the stash and push reminders.
- The timeline shows "Pumping… 12 min" while running.
- The other phone sees it running (sync) and can stop it.

**Tests:** start, stop and minutes; running pumps excluded from totals; two phones stopping at once (newest wins, no duplicate stash item); an older record without `end`.

#### F03. Contraction timer (preparation phase)

**What:**

- On the checklist screen under the countdown, and in Plan during the preparation phase: a "Contractions" card that opens a full-screen timer.
- One big Start / Stop button. A list with start time, duration and the time since the previous start. Summary for the last 60 minutes: count, average duration, average interval.
- A fixed note: "Follow the instructions of your hospital or midwife." No thresholds, alerts or "go to hospital" advice.
- "Clear all" (with `Confirm`) soft-deletes all entries. Screen stays on while the timer screen is open.

**Data:** synced collection `contractions`: `{ start: ISODateTime; end: ISODateTime | null }`. In `changes.ts`, announce only the first contraction after a gap of more than 2 hours ("Marija started timing contractions"), so the other parent hears about it without one notification per contraction.

**Tests:** durations and intervals, last-60-minutes summary, a running contraction, deleted ones excluded, the first-after-gap announcement rule.

#### F04. Plan before the birth

**What:**

- In the preparation phase the bottom navigation gets Plan. Keep at most 5 tabs. Suggested: Checklist, Plan, Budget (Shopping reachable from Budget as a toggle or link), Notifications, Settings. Choose what fits the code and note it.
- In the preparation phase, Plan shows **appointments** (scans, check-ups, classes), **parent tasks** and **contractions** (F03). It hides routines and daily care, which are about the babies.
- Appointments with `babies: 'none'` are labelled "Pregnancy / mother" in both phases.
- Doctor's notes support `babies: 'none'` ("For the mother") everywhere: editor, list, filters and the doctor's report. Mother notes are left out of the twins' report unless the report's new "Include notes for the mother" switch is on.
- Push reminders for appointments already work for any scope. Verify `babies: 'none'` texts read well ("Ultrasound at 10:30") in `server/reminders.ts`, and rebuild the function bundle if you change it.

**Tests:** navigation per phase; the label for 'none'; report filtering of mother notes; reminder text for a 'none' appointment.

#### F05. Spreadsheet export (CSV)

**What:** Settings → Backup → "Export as spreadsheet (CSV)" downloads `twins-organizer-YYYY-MM-DD.zip` (via the share sheet where available, like "Send backup"). It contains one CSV per area:

- `logs.csv`: one row per entry. Columns: date, time, twin name, type, then per-type columns (method, side, ml, milk, top-up ml, diaper kind, rash, stool colour, sleep minutes, medicine, dose, temperature, weight g, length cm, head cm, minutes, note), logged by.
- `pumping.csv`, `milk-stash.csv`, `appointments.csv`, `tasks.csv`, `milestones.csv` (with age and corrected age), `checklist.csv` (category, item, per-baby or shared, quantity, acquired, status, estimated and actual price, store), and later the new collections as they arrive (`vaccines.csv`, `mother.csv`, `foods.csv`, `contractions.csv`).

Formatting rules:

- Twin and caregiver names, not ids. Local date and time in separate columns.
- Numbers without thousands separators, decimal point as `.`.
- Headers in the phone's language.
- Deleted records left out.
- UTF-8 with BOM, so Excel shows Cyrillic.

**Logic:** `src/features/settings/csvExport.ts` builds `{ fileName, rows }[]`. It is pure, with tests (escaping commas, quotes and new lines in notes, Cyrillic, an empty collection gives a header-only file).

Each later feature that adds a collection adds its CSV here.

#### F06. Descriptive insights (History)

**What:** an "This week" card per twin, side by side, for the week ending on the selected day, with the change against the week before (arrow and number, neutral colour):

- longest sleep stretch, and the night it happened,
- total sleep per day (average), split into day and night (D7),
- average time between feed starts, measured from the logs,
- feeds and ml per day (average), breastfeeding minutes per day.

No targets, ranges, praise or warnings. A tap on a value explains in one sentence how it is computed.

**Logic:** `src/features/history/insights.ts`, reusing `summarize()` from `summary.ts` where it can. Rules:

- A sleep across midnight counts toward the night it belongs to.
- Feed gaps are measured between consecutive feed starts of the same twin. A linked tandem feed counts once per twin, and a gap that spans a day with no feeds logged at all is left out (missing data, not a long gap).
- Days with no entries at all are left out of averages, and the card says "based on 5 days".

**Tests:** all the rules above, a week with missing days, "both" entries, a running sleep.

**Phase 1 stop.** Update PROGRESS.md and give Darko the combined phone test checklist.

---

### Phase 2: health records and the mother

#### F07. Vaccination record

**What:**

- More → "Vaccinations": a list per twin side by side (name, dose, date, place), newest first, and a "+ Add" button.
- The editor has vaccine name (free text, with suggestions from names already used in this family), dose number (optional), date, place, batch / lot (optional), reactions or notes, and the WhoPicker with **"both twins" as the default**. "Both" creates two records with one `groupId`.
- "Plan next dose" creates an appointment (title "<vaccine> – dose n+1", the same twins) and opens it for the date.
- Included in the doctor's report (a section listing vaccinations in the chosen period) and in CSV.
- No built-in schedule, names or ages.

**Data:** synced collection `vaccines`: `{ babyId; name; dose: number | null; date: ISODate; place: string; lot: string; notes: string; groupId: string | null }`.

**Tests:** both twins creates linked records; editing one twin's record does not change the other; report filtering by period; CSV.

#### F08. Diaper details

**What:** optional chips on the diaper entry editor:

- **Rash** (yes or not set).
- For dirty diapers: **colour** (yellow, green, brown, black, red, pale, other) and **texture** (watery, soft, formed, hard).

All neutral, with no colour marked or explained as good or bad. Collapsed under "Details" so quick logging stays one tap.

- The timeline shows small markers.
- The doctor's report adds per-day rash count and a colour/texture breakdown for the period.
- CSV columns are added.

**Data:** extend `DiaperData` with optional `rash?: boolean`, `color?: StoolColor`, `texture?: StoolTexture`.

**Tests:** summaries with and without details; older entries; the report counts.

#### F09. Head circumference and growth reference curves

**What:**

1. Add optional `headCm?: number | null` to `MeasureData`: in the measurement editor, Growth (its own chart), the doctor's report, CSV and `growthPoints()`.
2. Add optional `sex?: 'female' | 'male' | null` to `Baby` in the twin setup, with the explanation "Only used for the optional reference curves."
3. Per-phone toggle (DevicePrefs `whoCurves?: boolean`, default off), in Settings → Appearance or on Growth: "Show WHO reference curves".

When the toggle is on and the twin's sex is set, the weight, length and head charts draw the WHO Child Growth Standards 3rd, 15th, 50th, 85th and 97th percentile lines (0–24 months) as thin neutral lines behind the twin's points. For a twin born before 37+0 (see `twins/age.ts`), the x-axis is **corrected age**, and the chart says so. The caption reads: "Reference curves (WHO). Not a verdict: ask your paediatrician." Tooltips do **not** say which percentile a point is at.

**Data:**

- Bundle the WHO LMS tables (weight-for-age, length-for-age, head-circumference-for-age; boys and girls; 0–24 months) as static TypeScript data in `src/features/growth/who/`, lazy-loaded only when the toggle is on.
- Source: the WHO Child Growth Standards (https://www.who.int/tools/child-growth-standards/standards) or the CDC's copy of the WHO data files (https://www.cdc.gov/growthcharts/who-data-files.htm). Put the source URL and download date in a comment.
- **If you cannot download them, stop and ask Darko.** Never type the values from memory.
- Compute the curve values with the LMS formula `X = M · (1 + L·S·Z)^(1/L)`.

**Tests:**

- The LMS function against at least 6 published table values (both sexes, all three measures, 0 and 12 months).
- The corrected-age x-axis for a twin born at 35+4.
- Toggle off means no data is loaded (check the lazy import is not hit).
- Twin with no sex set means no curves and a hint to set it.

#### F10. Mother's recovery

**What:**

- **Medicines for the mother:** in the routine editor, a "For the mother" option (stored as `babies: 'none'` with `med` set). Logged doses go to `motherLogs`.
  - Today shows an optional "Mother" card (shared setting `motherCard`, default on once she has an active medicine routine) with today's medicines, a ✓ / – each, one-tap logging, and "last given 3 h ago".
  - The same minimum-interval check as the twins' medicines applies (reuse `medCheck` logic; generalise it to take a subject instead of a `TwinSlot`).
- **Daily check-in:** mood (5 neutral faces, no labels like "bad"), optional sleep hours, optional note. One per day; editing replaces it.
- **Mother page** (More → "Mother"): her medicines (last 7 days), check-ins as a simple list, and her pumping summary (existing pumps).
- **Push reminders:** mother medicine routines are reminded like the twins' ones ("Ibuprofen · for the mother"). Update `server/reminders.ts` and the bundle, and make sure due-ness for 'none' med routines uses the mother's med logs.
- **Privacy:** `changes.ts` does **not** announce `motherLogs` changes unless the shared setting `announceMother` is on (default off). Mood is shown only on the Mother page, never on Today or in the report. The doctor's report gets an optional "Mother" section (her medicines in the period), off by default.

**Data:** synced collection `motherLogs`: `{ start: ISODateTime; type: 'med' | 'checkin' | 'note'; data: { name; dose } | { mood: 1|2|3|4|5; sleepHours: number | null; note: string } | { text } ; loggedBy }`. Use a fixed id per day for check-ins (`checkin-YYYY-MM-DD`) so two phones never create two.

**Before building, check** how `dailyCareStatus`, `upcomingItems`, `medCheck`, `effectiveScope` and `server/reminders.ts` treat `babies: 'none'` today, and keep twins' behaviour unchanged. Add regression tests for the twins' medicine flow.

**Tests:** mother medicine due and done; interval check; the check-in id per day; reminders text and recipients; change alerts muted by default; twins' daily care unchanged.

#### F11. Action buttons on push reminders (Android)

**What:** push reminders for routines and medicines get two buttons: **"Done"** and **"Snooze 15 min"**. iPhone ignores the buttons and keeps working as today.

- **Done** marks that occurrence done: a `RoutineDone`, plus for a medicine routine the med log entry (twins: a `med` log per twin in scope; mother: a `motherLogs` med), stamped `loggedBy` with the phone's user.
  - If an app window is open, the service worker posts a message and the page does the write through the normal store.
  - Otherwise the service worker opens the same Dexie database and writes through the same store code, so the outbox entry is created and sync uploads it when the app next opens.
  - Where Background Sync is available, register a sync so it can upload sooner.
- **Snooze** writes a `reminderSnoozes` record `{ reminderKey; until }` the same way. The server function then sends that reminder again at `until` (once). It needs the record to have reached the server, so if the phone is offline the snooze takes effect when it next syncs. Say so in the README.

**Payload:** extend the push message from `server/reminders.ts` with `actions` and data `{ kind, routineId, occurrence, babies, med }`. Rebuild the function bundle.

**Service worker:** keep `sw.ts` small. Put the action handling in a module that is unit-tested with a fake `self`, fake-indexeddb and the in-memory store. Check the bundle size of the service worker before and after, and note it in PROGRESS.md.

**Tests:**

- The payload contains the right data.
- Done writes the same records the Today one-tap does (compare).
- Done twice is idempotent (fixed id `done-<routineId>-<occurrence>` or the existing equivalent).
- A snooze is re-sent once at `until` and not before.
- The server ignores snoozes for occurrences already done.

**Phase 2 stop.** Update PROGRESS.md and give the combined phone test checklist.

---

### Phase 3: memories and later months

#### F12. Photos

**What:**

- Add photos (camera or gallery, `<input type="file" accept="image/*" capture>`) to milestones, journal entries (F13), a monthly "twins together" photo, and weekly bump photos in the preparation phase.
- Photos are compressed on the phone with canvas or `createImageBitmap`: WebP (JPEG fallback), longest side 1600 px, quality about 0.8, plus a 320 px thumbnail. EXIF orientation applied, and **metadata stripped**, so no GPS leaves the phone.
- A photo grid page (More → Photos) shows thumbnails by month, filterable by twin; tap for full screen with swipe.
- Settings → Storage shows the space used by photos.

**Data:**

- Synced collection `photos` (metadata only; records are capped at 64 KB on the server): `{ takenAt; owner: { kind: 'milestone' | 'journal' | 'monthly' | 'bump'; id: string | null }; babies: BabyScope; width; height; bytes; uploaded: boolean }`.
- Local-only Dexie table `photoBlobs` `{ id, full: Blob | null, thumb: Blob }`. It is not a synced collection, not in COLLECTIONS and not in the JSON backup.

**Sync:**

- New migration `006_photos_storage.sql` creates a private Storage bucket `photos` (file size limit 3 MB, `image/webp` and `image/jpeg` only).
- Policies on `storage.objects` let a user read, insert and delete only under the folder `<family_id>/` where `public.is_family_member(family_id)`.
- Paths: `<family_id>/<photo id>.webp` and `<photo id>.thumb.webp`.
- Upload queue: after a sync push, upload blobs whose metadata says `uploaded: false`, then set it to true.
- Downloads are lazy: thumbnails when a grid is shown, full images on open, then cached in `photoBlobs`.
- Deleting a photo record (tombstone) deletes the storage objects when a member phone next syncs.
- Without sync, photos simply stay on this phone.
- README: setup steps and the migrations table.

**Backup:** Settings → Backup → "Download photos (zip)" uses `src/lib/zip.ts` with file names `YYYY-MM-DD_<twin or both>_<owner>.webp`.

**Tests:** compression sizing (mock canvas); EXIF strip; metadata under 64 KB; upload queue logic with the in-memory remote (extend `memoryRemote.ts` with a fake storage); delete propagation; zip naming; the storage policies in PGlite if feasible, otherwise documented manual checks.

#### F13. Journal and keepsake book

**Journal:**

- More → "Journal": short entries (date, text, optional photos, scope A / B / both). A list grouped by month, and "+ Add" from Today's menu.
- Synced collection `journal`: `{ date: ISODate; babies: BabyScope; text: string }`. Photos are linked through `photos.owner`.

**Keepsake book** (More → "Keepsake book"):

- A printable A4 page built from the data (reuse the doctor's report print styles, "Print / Save as PDF"):
  1. a cover with the twins' names and birth date,
  2. birth details side by side (time, weight, length, week of pregnancy),
  3. milestones side by side with dates, age and corrected age, and their photos,
  4. one page per month with the monthly photo and selected journal entries (a "Put in the book" toggle on journal entries, `inBook?: boolean`),
  5. first foods tried (after F14).
- Options: date range, include photos yes/no.
- It must print well in black and white, with no page breaks inside a milestone row.

**Tests:** the book model builder (pure): ordering, corrected age, months with no data skipped, entries not in the book left out.

#### F14. Solids and first foods

**What:**

- Off until the parents turn it on (shared setting `solidsEnabled`, in Settings or on the Foods page). There is no age prompt.
- More → "First foods": a grid of foods × twins with a cell per twin: not tried, liked, neutral, refused. Tap a cell to log a try (date, reaction, note). "Both twins" is the default.
- A food list the parents manage. "Add example foods" creates about 20 common first foods with fixed ids (`food-<key>`, names via i18n `seedKey` like the checklist seed), so two phones never duplicate them. Parents can rename, delete or add their own.
- A "Reaction" note field, free text. No allergen warnings or advice.
- A quick "Solids" log from `MoreLogSheet` once enabled.
- Shown in the doctor's report (foods tried in the period, with notes) and in CSV.

**Data:** synced collections `foods` `{ name; seedKey: string | null; order }` and `foodTries` `{ foodId; babyId; date: ISODate; reaction: 'liked' | 'neutral' | 'refused'; note; groupId }`. The grid shows the latest reaction per food and twin, and the history of tries on tap.

**Tests:** example foods idempotent across two phones; latest-reaction logic; both-twins linking; report period filter.

#### F15. Quick text logging (and optional voice)

**What:**

- A text field on Today (a small keyboard icon next to Quick Log opens it) that turns short phrases into entries, offline and rule-based, in Macedonian and English.
- It shows a **preview** of the entries it understood ("Ema · bottle 90 ml formula · now"), with Save and Edit (Edit opens the normal editor prefilled). Anything it did not understand is shown and never guessed.

**Must understand at least:**

- **Twins:** names (from the babies, any case, Cyrillic or Latin transliteration), "A", "B", "both", "двете", "двајцата", "и двете".
- **Feeds:** "A 90 B 70 formula", "Ема 90 мл адаптирано", "both 80 breast milk", "двете 80 мајчино", "left breast Ana", "Ана лева дојка 15 мин".
- **Diapers:** "wet", "dirty", "both" / "мокра", "полна", "двете".
- **Sleep:** "sleep" / "спие" starts a timer, "awake" / "буден", "будна" stops it, "slept 2h" / "спиеше 2ч" gives a finished entry ending now.
- **Medicines:** "<twin> vitamin D", "Ана витамин Д". It matches against the medicine routines' names; an unknown name still creates a med entry with that name, shown in the preview.
- **Temperature:** "Ема 37.8" / "37,8".
- **Time:** "at 14:30", "во 14:30", "20 min ago", "пред 20 мин"; the default is now.

**Logic:** `src/features/log/parse.ts`, `parseQuickLog(text, { babies, routines, lang, now }) → { drafts: LogDraft[]; unknown: string[] }`. It uses `buildEntries` for "both".

**Tests:** at least 60 phrases across both languages, including mixed scripts, typos in names (match by prefix of 3+ letters), commas versus dots, and things it must refuse.

**Voice (D5):**

- A microphone button appears only if `SpeechRecognition` / `webkitSpeechRecognition` exists **and** the per-phone setting `voiceInput` is on (default off).
- The setting text: "Your phone's speech service may process the audio (on many Android phones this is Google)."
- The recognised text goes into the same field and preview; it never saves directly. Language is mk-MK or en-US by app language, with a note that Macedonian recognition quality depends on the phone.

**Phase 3 stop.** Final PROGRESS.md update, full phone test checklist, and a list of follow-ups.

---

## Part C: what is deliberately not included

- Sleep or feed **predictions** (like Huckleberry's SweetSpot) and AI chat: they go against "no medical judgement".
- Home-screen widgets and Apple Watch: not possible for a web app. The Android app shortcuts and F11's notification buttons cover the most common "log without opening" need.
- Social sharing, ads, accounts.
