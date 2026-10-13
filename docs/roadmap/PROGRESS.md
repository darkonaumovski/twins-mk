# Roadmap progress

Claude Code updates this file after every feature. Spec: `docs/roadmap/ROADMAP.md`.

Status: ⬜ not started · 🟨 in progress · ✅ done · ⏸ blocked (see notes)

## Before you start (Darko)

- [ ] Read the decisions table (ROADMAP.md, A5) and change anything you disagree with.
- [ ] After F00 is done: run `supabase/migrations/005_roadmap_collections.sql` once in the Supabase SQL Editor.
- [ ] Before F12 (photos) reaches your phones: run `006_photos_storage.sql`.

## Foundation

| ID  | Feature                                             | Status | Commit  | Notes                                         |
| --- | --------------------------------------------------- | ------ | ------- | --------------------------------------------- |
| F00 | Branch, CLAUDE.md, migration 005, CSV + ZIP helpers | ✅     | 79cd3a0 | Migration 005 lists all 8 roadmap collections |

## Phase 1: quick wins

| ID  | Feature                  | Status | Commit                 | Notes                                                       |
| --- | ------------------------ | ------ | ---------------------- | ----------------------------------------------------------- |
| F01 | Twin rhythm chart        | ✅     | 512227f                | History → "Twin rhythm"; settings in Settings → Twins       |
| F02 | Pumping timer            | ✅     | fc9493c                | More → Start pumping; running card on Today                 |
| F03 | Contraction timer        | ✅     | d9fe6a5                | Checklist → Contractions (prep phase); Plan in F04          |
| F04 | Plan before the birth    | ✅     | 0c8f7f6                | Prep tabs: Checklist, Plan, Budget, Notifications, Settings |
| F05 | Spreadsheet export (CSV) | ✅     | cc83510                | Settings → Backup → Export as spreadsheet (CSV)             |
| F06 | Descriptive insights     | ✅     | 7ca7417, (next commit) | History → "This week"                                       |

## Phase 2: health records and the mother

| ID  | Feature                           | Status | Commit  | Notes                                                  |
| --- | --------------------------------- | ------ | ------- | ------------------------------------------------------ |
| F07 | Vaccination record                | ✅     | 2274b16 | More → Vaccinations; report section; vaccines.csv      |
| F08 | Diaper details                    | ✅     | 44ec3ca | Entry editor → Details; report rash column and colours |
| F09 | Head circumference and WHO curves | ✅     | 827dd2b | Growth → head chart; "Show WHO reference curves"       |
| F10 | Mother's recovery                 | ✅     | 3c747ab | More → Mother; Today card; redeploy the push function  |
| F11 | Action buttons on push reminders  | ✅     |         | Done + Snooze 15 min (Android); redeploy the function  |

## Phase 3: memories and later months

| ID  | Feature                        | Status | Commit | Notes                                             |
| --- | ------------------------------ | ------ | ------ | ------------------------------------------------- |
| F12 | Photos                         | ✅     |        | More → Photos; milestone sheet; run migration 006 |
| F13 | Journal and keepsake book      | ⬜     |        |                                                   |
| F14 | Solids and first foods         | ⬜     |        |                                                   |
| F15 | Quick text logging (and voice) | ⬜     |        |                                                   |

## Decisions and deviations

<!-- One line each: date · feature · what was decided or changed, and why. -->

- 2026-10-12 · F00 · The Phase 1–3 checklist was already in this file (the tables above), so nothing was copied.
- 2026-10-12 · F00 · `.prettierignore` now skips `supabase/.temp` and `.claude/settings.local.json` (written by the Supabase CLI and Claude Code). `format:check` failed on `main` because of them, so the gate could not pass otherwise.
- 2026-10-12 · F00 · Review notes for F05: Excel reads a cell starting with `=`, `+`, `-` or `@` as a formula, so text cells are prefixed with `'` there. On a PC set to Macedonian regional format, Excel expects `;`; the spec says comma CSV, so F05 keeps it and the README explains "Data → From Text/CSV".
- 2026-10-12 · F00 · The outbox hook needs no code per collection: `DexieRepository` queues every write, and the sync engine walks `COLLECTIONS`. CLAUDE.md says so.
- 2026-10-12 · F01 · The rhythm chart ends on the day selected in History (like the weekly charts), so tapping a day re-anchors it. The selected day has a thin outline.
- 2026-10-12 · F01 · "Linked" feeds (drawn through both rows) are those with a shared `groupId` (tandem breastfeeds, "both" bottles), and only while both halves exist on that day. "Feeds started together" counts every A/B pair within the window, linked or not.
- 2026-10-12 · F01 · Feed starts are placed on whole minutes (as the clock shows them), so 09:00:10 and 09:20:40 are 20 minutes apart. A sleep never reaches past now.
- 2026-10-12 · F01 · `vite.config.ts` sets `pool: 'forks'` explicitly: the rhythm test switches the time zone to Europe/Skopje to test daylight-saving days, which only works (and stays contained) in a forked process.
- 2026-10-12 · F01 · The hour labels above the chart use a 24-hour scale; on a 25-hour day the 06 label is a few pixels off its gridline. Accepted.
- 2026-10-12 · F01 · Overlapping sleeps of one twin (two timers by mistake) are joined before counting, so no minute counts twice.
- 2026-10-12 · F01 · `ChartFrame` got optional `controls` and `note` slots (used for the 7/14 switch and the legend line).
- 2026-10-12 · F01 · `src/server/reminders.ts` imports both locale files, so every new string changes the function bundle: `npm run build:functions` after every feature with strings. CLAUDE.md says so.
- 2026-10-12 · F01 · Performance: building 14 days of rows from 476 entries takes about 3 ms on the dev PC (well under the 100 ms budget on a phone).
- 2026-10-12 · F02 · Added an optional `Pump.side` ('left' | 'right' | 'both') besides the spec's `end`: the stop sheet uses it to ask for the right sides (one side starts the other at 0 ml).
- 2026-10-12 · F02 · **Stop writes the end time and minutes at once**, then opens the pumping sheet. If the sheet is cancelled, the session stays as "N min, 0 ml" and can be edited later (the sheet asks for the amounts again while it is 0 ml). So the time is right, and both phones see the timer stop immediately.
- 2026-10-12 · F02 · No duplicate stash: a session's stash container has the fixed id `stash-<pumpId>` (also for sessions entered by hand), and saving updates it if the other phone already added it. Two phones that both stop: newest `updatedAt` wins on the pump and on the container.
- 2026-10-12 · F02 · "One per family" is checked in a transaction on the phone. Two phones offline could still each start one; Today then shows the newest, and tapping the other in the timeline opens the timer for that one.
- 2026-10-12 · F02 · Push reminders never read pumps (checked `src/server/reminders.ts`), so nothing to exclude there. The hospital strip's "last pumped" skips a running timer.
- 2026-10-12 · F02 · Change alerts: "Started pumping" when a timer starts and "Finished pumping (14 min)" when it stops, instead of "Pumped 0 ml".
- 2026-10-12 · F02 · Known limit of newest-wins on whole records: if phone A stops and saves the amounts and phone B (not synced yet) taps Stop a moment later, B's stop wins and the session shows 0 ml again. The milk stash keeps A's container, and the "How much did you pump?" sheet starts from it ("The other phone already saved 110 ml…"), so nothing is lost. Tested.
- 2026-10-12 · F02 · Saving a session that the other phone deleted meanwhile is refused with a message, and no milk goes into the stash. A stash container that bottles already used is never overwritten.
- 2026-10-12 · F02 · If the timer sheet is open and the other phone stops or deletes the timer, the sheet closes with "Pumping was stopped on the other phone" instead of turning into "Start" under the parent's thumb.
- 2026-10-12 · F02 · A running timer opens the timer sheet (big elapsed time, Stop, "Discard (started by mistake)" with undo) from Today, the timeline and More.
- 2026-10-12 · F03 · New synced collection `contractions` (Dexie version 7, index on `start`), in all 7 places of A2. Migration 005 (F00) already has the name.
- 2026-10-12 · F03 · The timer is a route (`/contractions`), reached from a card under the countdown in the preparation phase (F04 adds it to Plan). The bottom navigation stays visible, so it is "full screen" within the app.
- 2026-10-12 · F03 · Single contractions can be deleted from the list (with undo), besides "Clear all"; a mis-tap is common.
- 2026-10-12 · F03 · Change alerts: only an added contraction with no other live one in the 2 hours before it is announced ("Started timing contractions (from 14:05)"). The notification history still records every contraction from the other phone, but marks the others as seen, so the unread badge does not count up for each one.
- 2026-10-12 · F03 · The big button acts on what the screen showed, decided inside a transaction: Stop ends every running contraction (two phones may each have started one), and if the other phone (or a double tap) was faster nothing changes and a short message says so. No accidental second contraction.
- 2026-10-12 · F03 · The history line is neutral ("Contraction started (14:05)"); only the announcement says "Started timing contractions". An undo after "Clear all" (a restore) is never announced.
- 2026-10-12 · F03 · Lengths and intervals of an hour or more show as h:mm:ss; rows from another day show their date.
- 2026-10-12 · F03 · The last-60-minutes window is by start time and includes a contraction that started exactly 60 minutes ago; a running contraction counts but has no length yet.
- 2026-10-12 · F04 · Prep navigation as suggested: Checklist, Plan, Budget, Notifications, Settings. Shopping moved from a tab to a link at the top of Budget (it is still at `#/shopping`). The tab layout is a pure `navTabs(phase)` with tests.
- 2026-10-12 · F04 · Plan in the preparation phase has the Calendar and Tasks tabs and the Contractions card; the Routines tab is hidden (a `?tab=routines` link falls back to the calendar). Daily care was already only on Today.
- 2026-10-12 · F04 · `babies: 'none'` is now named by the kind of record (`scopeLabelKey`): "Pregnancy / mother" on appointments (in both phases, as the spec asks; this replaces "Family" there), "For the mother" on doctor's notes, and still "Family" on routines (F10 will add the mother's medicine routines). Appointments and notes show the label as a small chip; routines show nothing, as before.
- 2026-10-12 · F04 · New appointments and notes default to the mother ('none') before the birth and to both twins after it (`usePhaseScope`).
- 2026-10-12 · F04 · The "Notes for the doctor" link on the calendar is now always shown (before, only with open notes), so the notes page is reachable before the birth, when there is no More tab.
- 2026-10-12 · F04 · Report: notes for the mother are left out by default (before this they were always in, as "family" notes). The switch only appears when there are open notes for the mother.
- 2026-10-12 · F04 · The notification history names 'none' the same way ("Pregnancy / mother" on appointments, "For the mother" on notes). The twins' report marks an included mother's note ("For the mother: …").
- 2026-10-12 · F04 · Tapping an appointment's push reminder now opens the start page (`./#/`), which picks the screen for the phase (the checklist before the birth, Today after); other reminders still open Today. Function bundle rebuilt.
- 2026-10-12 · F04 · The notes filter only shows while there are notes for the mother; without them the list shows all. Adding a note resets the filter to All, so the new note is visible. Shopping has a link back to Budget.
- 2026-10-12 · F04 · Push text for a 'none' appointment already read well ("Ultrasound at 10:30", body: the place); no change to `src/server`, only a test.
- 2026-10-12 · F05 · `buildCsvFiles` (pure, tested) builds the files; the button zips them with `src/lib/zip.ts` and shares or downloads the zip like "Send backup". It does not count as a backup (no "last backup" update).
- 2026-10-12 · F05 · Comma separator, as the spec says. Excel on a PC with Macedonian regional settings expects `;`; the hint under the button and the README say to use "Data → From Text/CSV" then. A `sep=,` line was not added: it makes Excel ignore the byte order mark and garble Cyrillic.
- 2026-10-12 · F05 · Text cells (notes, titles, names) that start with `=`, `+`, `-` or `@` get a leading `'`, so Excel never runs them as formulas. In a CSV the apostrophe stays visible ("'- ate well"); numbers are left alone.
- 2026-10-12 · F05 · Android Chrome does not share `.zip` files through the share sheet, so on Android the zip downloads (then share it from Downloads); iPhone shows the share sheet. A running breastfeed or sleep says "running" in its minutes cell; a damaged timestamp gives empty date/time cells instead of failing the export.
- 2026-10-12 · F05 · logs.csv has every spec column. "Rash", "Stool colour" and "Head (cm)" are filled from F08/F09's optional fields when present, so those features need no CSV change for logs. Added two columns the spec did not list: "Minutes" also carries breastfeeding length, and "Size" holds the spit-up size (otherwise lost). Bath rows have only date, time, twin and type.
- 2026-10-12 · F05 · Milestones: age and corrected age as whole days on the milestone's date (numbers sort and calculate in a spreadsheet); corrected age only for twins born before 37+0, negative before term. Milestones without a date are left out.
- 2026-10-12 · F05 · checklist.csv: the price column is the estimated price per piece (as entered); tasks in the checklist have no scope/quantity, and their status column says Yes/No for done.
- 2026-10-12 · F05 · contractions.csv is already there (F03). Later features add theirs (vaccines, mother, foods).
- 2026-10-12 · F06 · "Days" for the insights run from the end of the night hours to the same time the next morning (07:00–07:00 by default), so a sleep across midnight always counts toward its night, and the day/night split uses D7. `summarize()` is reused over these windows for feeds, ml and breastfeeding minutes. The explanation under each value says so.
- 2026-10-12 · F06 · "Days with no entries" are per twin: a day counts if that twin has any entry starting in it. Averages divide by those days; the card says "Based on N days with entries".
- 2026-10-12 · F06 · Longest sleep: the longest single sleep entry that started in the week (a running one up to now), labelled "the night of …" when it started in the night hours, otherwise "in the day, …".
- 2026-10-12 · F06 · Feed gaps are taken between feed starts inside the week only; a gap whose days in between include one with no feeds for that twin is left out. A tandem feed is one entry per twin, so it counts once per twin naturally.
- 2026-10-12 · F06 · The change from the week before is shown as an arrow and the absolute difference in muted text (screen readers hear "more/less than the week before"). No change, or nothing to compare, shows nothing. ml and breastfeeding rows appear only when there is something to show.
- 2026-10-12 · F06 · The night-hours hint in Settings now also mentions the day/night split.
- 2026-10-13 · F06 review · Today is left out of the per-day averages until it is over (it would pull them down every morning); the card says so. It still counts for the longest sleep and the feed gaps.
- 2026-10-13 · F06 review · Missing data shows as "–", not 0: no sleep logged means no sleep figure, no feeds logged means no feed figures.
- 2026-10-13 · F06 review · A day counts as "with entries" if an entry starts in it or a sleep or breastfeed from before runs into it (last night's sleep into an empty morning).
- 2026-10-13 · F06 review · A gap between feeds is left out when the two starts are more than one day apart or the gap is 24 hours or more (missing data). The longest sleep is "the night of …" when most of it fell in the night hours.
- 2026-10-13 · F06 review · The title says "This week" for the week ending today and "7 days to …" for an earlier one. A daylight-saving test (`insights.dst.test.ts`, Europe/Skopje) checks the 25-hour night of 25 Oct.
- 2026-10-13 · F07 · New synced collection `vaccines` (Dexie version 8, indexes `babyId`, `date`) in all 7 places of A2; migration 005 already had the name. The backup round-trip test is in `vaccines/logic.test.ts`.
- 2026-10-13 · F07 · **Plan next dose** opens a new, prefilled appointment (title, same twins) instead of saving one first: the parent picks the date and saves, and Cancel leaves no empty appointment behind. It saves the vaccination's form first, so a corrected dose is kept and counted on. `AppointmentEditor` got an optional `defaultBabies`.
- 2026-10-13 · F07 · Without a dose number the next appointment is "<vaccine> – next dose". The dose must be a whole number from 1 (empty means not noted); anything else is asked again, never rounded.
- 2026-10-13 · F07 · "Same twins" for the next dose means both when the linked record of the other twin still exists, otherwise only this twin.
- 2026-10-13 · F07 · The report lists date, twin, vaccine, dose and place for the period (both ends included); lot and notes are in the CSV only, to keep the printed table narrow. The shared text has one line per vaccination.
- 2026-10-13 · F07 · Deleting a vaccination deletes only that twin's record (with undo), like editing. Names and places are suggested from earlier entries, most recent first, once each ignoring case.
- 2026-10-13 · F07 · Change alerts: "Vaccination: Hexa · Ema · 14 Oct", one line per twin (like log entries).

- 2026-10-13 · F08 · `rash` is stored only as `true` (absent = not noted), as the spec's "yes or not set". Colour and texture are kept only for a dirty or wet + dirty diaper; switching the entry to wet drops them. No details stores exactly what a quick tap stores.
- 2026-10-13 · F08 · Quick log stays one tap; details are added through **Adjust** on the toast or by tapping the entry. A "both twins" entry gets the same details for both, and each twin's entry can be edited alone afterwards.
- 2026-10-13 · F08 · The chips are buttons (`aria-pressed`) where a second tap clears the choice, since every detail is optional; the shared `Choice` (radios) cannot be unset. The section opens by itself when the entry already has details.
- 2026-10-13 · F08 · Timeline and change messages show the details as plain lower-case words after the kind ("Dirty · rash · green · soft").
- 2026-10-13 · F08 · Report: the rash column appears only for a twin with a rash in the period (keeps the table narrow otherwise); colours and textures are one line under the twin's table, in a fixed order with counts. The shared text adds "Rash N" to a day with a rash, and the same colour/texture line. Counted by the day the diaper was logged, as the other columns.
- 2026-10-13 · F08 · CSV: a "Stool texture" column after "Stool colour" (F05 already had rash and colour). A value from a newer version without a word here is written as stored.

- 2026-10-13 · F09 · WHO data: the six monthly percentile tables (`tab_wfa_*_p_0_5`, `tab_lhfa_*_p_0_2`, `tab_hcfa_*_p_0_5`) from https://www.who.int/tools/child-growth-standards/standards (cdn.who.int), downloaded 2026-10-13; the CDC copy refused automated downloads. Months 0–24, L/M/S columns, converted by a script (source and date in `growth/who/tables.ts`). The test checks 36 published P3/P50/P97 values (both sexes, all three measures, 0 and 12 months): every one matches after rounding to 0.1 as WHO prints them.
- 2026-10-13 · F09 · Monthly rows (not the daily expanded tables): one point per month is smooth enough on a 340 px chart and keeps the chunk at 3.5 kB. It is a separate chunk, loaded through `tablesIfWanted()` only with the switch on and girl/boy set (tested with a spy loader).
- 2026-10-13 · F09 · With the curves on, Growth shows one twin at a time (**Curves for**, A or B): the two twins can differ in sex and gestation, so they cannot share one age axis or one set of curves. With the curves off, the date charts for both twins are unchanged (plus the new head chart).
- 2026-10-13 · F09 · The x-axis is days of age (corrected for a twin born before 37+0, so a premature twin's early points sit left of 0); the curves start at 0. Ticks are weeks for up to 3 months, then months. The tooltip and table show the age, never a percentile. All five lines look the same (thin, dashed, the muted grey at 55 % opacity), so no line stands out as a target and nothing is coloured as good or bad. The value axis also fits the curves where they cross the chart edges. With the curves on, the page shows "Loading the reference curves…" until the chunk is there (if it fails, the date charts stay), and a twin without measurements gets "No measurements for … yet."
- 2026-10-13 · F09 · `LineChart` got optional `reference`, `domain`, `day` and `formatTick`; existing charts pass none of them and render as before.
- 2026-10-13 · F09 · "Girl or boy" is a three-way choice in the twin setup (girl, boy, not set). Head size is optional in the measurement editor; an empty one is left out of the entry, as on older entries. The birth measurement from the setup has no head size.
- 2026-10-13 · F09 · The per-phone switch lives on the Growth page (next to the charts), not in Settings → Appearance.

- 2026-10-13 · F10 · New synced collection `motherLogs` (Dexie version 9, indexes `start`, `type`) in all 7 places; migration 005 already had the name. Check-ins have the fixed id `checkin-YYYY-MM-DD` and the time noon of that day; saving again replaces (and revives a deleted one).
- 2026-10-13 · F10 · `medCheck` takes a subject (`TwinSlot | 'mother'`); the mother's doses are `MedLog`s with the id `mother`. `medOccurrenceGiven` counts her doses for routines with `babies: 'none'` and `med` set, so "Coming up" and push reminders treat them like the twins' medicines. Before this, such a routine never counted as given and showed an empty row in the twins' Daily care; it is now left out there (twins' behaviour otherwise unchanged, with regression tests).
- 2026-10-13 · F10 · `motherCard` (default on) and `announceMother` (default off) are shared settings with defaults in `defaults.ts`. The card shows while `motherCard` is on and she has an active daily medicine routine ("default on once she has one"). Both switches are on the Mother page. The card, like the twins' Daily care, lists her **daily** medicines; a routine every 2+ days for her still appears in Coming up and gets push reminders. A check-in's day cannot be changed after saving (the day is its id); a new check-in for a day that already has one opens with that day's values.
- 2026-10-13 · F10 · Privacy: changes to `motherLogs` from another phone are not announced (in-app or notification) unless `announceMother`; they are still in the notification history, marked seen. A check-in's fields (mood, sleep, note) are never shown in the history details, and change lines never include them ("Mother's check-in (13 Oct)"). The CSV includes her mood and sleep, since the parents export it for themselves.
- 2026-10-13 · F10 · The report's "Mother's medicines" section is off by default; its switch only appears when she has doses in the period. It lists time, medicine and dose only.
- 2026-10-13 · F10 · Push: `FamilyData.motherLogs` is optional; the edge function (`supabase/functions/send-reminders/index.ts`) now also loads `motherLogs`, so it must be **redeployed**. An older deployed function still sends her reminders but cannot see her doses, so it reminds even after a dose (until the routine occurrence is marked done).
- 2026-10-13 · F10 · The mood is five lucide faces (angry to laughing) with only "Mood 3 of 5" as their accessible names, no words such as "bad". The interval check names her "Mother" ("Мајката веќе доби …").

- 2026-10-13 · F11 · Snooze shipped with Done (D6): the server side was small. New synced collection `reminderSnoozes` (Dexie version 10, index `until`) in all 7 places; the fixed id `snooze-<reminderKey>` means a second snooze moves the time. The server parses the key (`routine:<id>:<babies>:<occurrence>`), sends the reminder again once at `until` (claim key `snooze:<key>:<until>`, same notification tag as the first), and skips it when that occurrence has a `RoutineDone`, the dose was given meanwhile, or the routine is gone or paused.
- 2026-10-13 · F11 · Buttons only on reminders with a set time (routines and medicines "every N days at …"). "Every few hours after the last one" routines, appointments and "feed due" have no single occurrence to mark, so they come without buttons.
- 2026-10-13 · F11 · Done = the `RoutineDone` that "Coming up" writes (fixed id `done-<routineId>-<occurrence>` instead of a random one) plus, for a medicine, the dose records Daily care's one tap writes (a `med` entry per twin in the reminder's scope, linked by one groupId when both; a `motherLogs` dose for the mother), with fixed ids `dose-<routine>-<occurrence>-<subject>`, so it is idempotent across presses and phones. "Coming up" in the app itself still only marks done (unchanged).
- 2026-10-13 · F11 · With an app window open, the service worker posts the action and the page writes it (`ReminderActionListener`, with a short message). Otherwise the service worker opens the same Dexie store and writes through it, so the outbox entry exists and the next sync uploads it. Background Sync is registered where available; when it fires, the service worker can only ask open windows to `syncNow` (uploading from the service worker itself would need the Supabase client and sign-in there), so without an open window the upload waits for the next app open. Noted as a follow-up.
- 2026-10-13 · F11 · Service worker size: 19,933 bytes before, 129,200 bytes after (about 42 KB gzipped), almost all of it Dexie and the store code. `todayISO` moved to `src/lib/dates.ts` (re-exported from `format.ts`) so the service worker does not pull in i18n. `tsconfig.sw.json` got the `@/` path alias.
- 2026-10-13 · F11 review · Done adds nothing the app already logged: no second mark when "Coming up" marked that time (random id), and a dose only for the twins (or the mother) who did not get it yet for that time (`medOccurrenceGiven` over that day's entries), so a notification still showing after a dose was logged in the app does not double it. Lookups by fixed id use the new `Repository.getAny(id)` (also finds a deleted record), not a whole-table read.
- 2026-10-13 · F11 review · The service worker posts the action to an open window over a `MessageChannel` and waits up to 2 s for "saved"; a window that is still loading, stuck or failed does not answer "ok", and the service worker then saves it itself (fixed ids make a double write harmless). A failed store open is not cached. A snoozed reminder sent again uses the first one's tag with `renotify`, so it still sounds on the phone that did not snooze.
- 2026-10-13 · F11 · The edge function also loads `reminderSnoozes`: redeploy `send-reminders` (once for F10 and F11 together).

- 2026-10-13 · F12 · New synced collection `photos` (metadata only) in all 7 places (Dexie version 11; migration 005 already had the name), plus two local-only tables: `photoBlobs` (`{ id, full, thumb }`) and `photoPurged` (which deleted photos this phone already removed from Storage). Added an optional `mime` ('image/webp' | 'image/jpeg') to the record, since the JPEG fallback needs its own file extension in Storage and in the zip.
- 2026-10-13 · F12 · Compression is `compress.ts` with an injectable image environment (`createImageBitmap` with `imageOrientation: 'from-image'` and a canvas in the browser; a fake in tests). Re-encoding already drops metadata; `metadata.ts` also strips APP1–APP15/COM from JPEG and EXIF/XMP chunks (and the VP8X flags) from WebP at byte level, so nothing slips through even if an encoder copies it. Tested on crafted files with a GPS tag.
- 2026-10-13 · F12 · Sync: the engine runs a photo step after push and pull: upload the thumbnail and the full image of photos marked `uploaded: false` that have images on this phone, then set `uploaded: true` (a normal edit); remove the Storage objects of deleted photos. Failures in this step (e.g. migration 006 not run) are logged and retried next time, and never stop record sync. Undo after a delete sets `uploaded: false`, so the images go up again if they were already removed. Images of deleted photos stay on the phone that has them (for undo).
- 2026-10-13 · F12 · "Uploaded" turning true is bookkeeping: it is not announced to the other phone. The photo's width, height, size, format and upload flag are hidden in the notification history.
- 2026-10-13 · F12 · Migration 006 identifies the family by the first folder of the object name with its own `public.photo_family(name)` (instead of `storage.foldername`), so the policies are tested in PGlite with a small stub of `storage.buckets` and `storage.objects`: members read, add, replace and delete in their folder; a stranger can do none of that. `schema.sql` includes the same.
- 2026-10-13 · F12 · Two buttons, **Take photo** (`capture="environment"`) and **Choose photo** (gallery, several at once), because `capture` alone hides the gallery on Android. The bump photo is offered on the Photos page before the birth (week from the due date) and linked from the countdown; after the birth the page offers the monthly photo. Journal photos come with F13.
- 2026-10-13 · F12 review · Only a phone with the full image uploads (a phone with just a cached thumbnail never marks a photo uploaded). Creating or joining a family (sync `reset`) marks this phone's own photos for upload again and forgets the purge marks, so a new family gets the images. Each photo is uploaded or purged on its own: one refused image never blocks the others; offline still stops the step to retry.
- 2026-10-13 · F12 review · The viewer is its own modal `<dialog>`: it sits above an open sheet, keeps and returns focus, and Escape or Android back closes only the viewer. Inside a sheet (the milestone), the undo for a deleted photo is shown in the sheet itself, since a toast would sit behind the sheet. Thumbnails load when they scroll into view. Images of photos deleted more than 7 days ago are removed from the phone (when the Photos page or Settings opens), and Settings → Storage counts only live photos. The raw owner id is hidden in the notification history.
- 2026-10-13 · F12 · The photo zip is a download (not the share sheet: Android does not share zips, and it can be large). A photo whose full image is on neither this phone nor Storage goes in as its thumbnail; one with no image at all is counted in a message. The zip is built in memory, which is fine for a few hundred photos; streaming it is a follow-up if a family has many more.

## Phone test checklists

<!-- Per feature: 3–8 steps Darko can follow on his phone. -->

### Phase 2, combined (one session, both phones)

Before: migration 005 must have run (it did for Phase 1). Redeploy the push function once (`npx supabase functions deploy send-reminders --no-verify-jwt --use-api --project-ref ikswfxyhpyuqwcpslovx`). Install the `roadmap` build on both phones.

1. **Vaccinations** (More → Vaccinations): **+ Add**, "Hexa", dose 1, for **both**: one card per twin. Edit one twin's card: the other is unchanged. **Plan next dose** opens an appointment "Hexa – 2. доза" for both twins (Cancel adds nothing). Phone B shows the cards and a short message.
2. **Diaper details:** tap **Dirty** on Today (one tap, as before), then **Adjust** → **Details**: rash, green, soft. The timeline says "Dirty · rash · green · soft". Switch the entry to wet: colour and texture go.
3. **Report** (More → Report): vaccinations of the period, a rash column for that twin and the colour/texture line; growth with the head column; **Include the mother's medicines** (after step 6).
4. **Head circumference:** Growth → Add measurement with a head size: a third chart. Twin setup: **Girl or boy**.
5. **WHO curves:** Growth → **Show WHO reference curves** (this phone only): pick a twin; with girl/boy set, three charts against age (corrected for a twin born before 37 weeks) with thin grey lines and the caption. Turn it off: the date charts are back.
6. **Mother:** Plan → Routines → a medicine **For the mother** (e.g. Ibuprofen 08:00 and 20:00). Today shows the **Mother** card; one tap logs her dose ("last given just now"). More → Mother: **How are you today?** (a face, sleep hours), saving again replaces it. Phone B gets no message about her entries until **Tell the other phones about her entries** is on, and never sees her mood outside the Mother page.
7. **Push buttons (Android):** with push reminders on and the app closed, a medicine reminder has **Done** and **Snooze 15 min**. Done logs the dose (both twins, or the mother) without opening the app; open the app once so it syncs. Snooze: the reminder comes back once 15 minutes later, unless the dose was logged meanwhile. iPhone: reminders without buttons, as before.
8. **Spreadsheets:** Settings → Backup → Export as spreadsheet: 10 files, now with `vaccines.csv` and `mother.csv`, and the stool texture and head columns in `logs.csv`.
9. **Night appearance** and a narrow phone: the vaccination columns, the Details chips, the Mother page and the curves stay readable.

### Phase 1, combined (one session, both phones)

Before: run `005_roadmap_collections.sql` once in Supabase (a second run must also succeed). Install the `roadmap` build on both phones (see "Try it" below).

1. **Sync still works:** log a bottle on phone A; it shows on phone B within seconds.
2. **Preparation phase** (Settings → Twins → Daily planner off): the tabs are Checklist, Plan, Budget, Notifications, Settings; Budget links to Shopping and back.
3. **Plan before the birth:** Plan has Calendar and Tasks plus the Contractions card. A new appointment defaults to "Pregnancy / mother"; a new note for the doctor defaults to "For the mother", and the notes filter appears.
4. **Contractions:** Checklist (or Plan) → Contractions. Start/Stop three times: lengths, intervals and "Last 60 minutes" add up; the screen stays on. Phone B gets one "Started timing contractions" message, not one per contraction. Delete one (undo), then Clear all (undo).
5. **Daily planner** (switch it back on). History → **Twin rhythm**: A above B per day, a "both twins" feed draws one line through both rows, night hours shaded, 7/14 days, the table view, and tapping a day opens it.
6. **Pumping timer:** + → More → Start pumping (both sides). Today shows it; phone B too. Stop on either phone: the sheet asks for the ml with the minutes filled in; save with the stash on: one stash container, even if both phones saved.
7. **This week** (History): per twin, longest sleep, sleep per day (day/night), between feeds, feeds and ml per day, arrows against the week before, "Based on N days", and "Today counts once it is over". Tap a value for the explanation.
8. **Report:** More → Report. The mother's notes are left out until "Include notes for the mother" is on, and then marked "For the mother".
9. **Spreadsheets:** Settings → Backup → Export as spreadsheet (CSV): a zip with 8 files (on Android it downloads). `logs.csv` opens in Excel with Cyrillic intact.
10. **Settings → Twins:** change night hours and "together" minutes; the rhythm chart and This week follow on both phones.
11. **Night appearance** and a narrow phone: the rhythm chart, the contraction timer and This week stay readable.

### Try it on a phone from this computer

On the same Wi-Fi: `git checkout roadmap`, then `npm run dev -- --host`, and open the printed Network address on the phone (for example `http://192.168.x.x:5173`). Or `npm run build && npm run preview -- --host` for the production build. Installing and offline mode need HTTPS, so those are tested on the deployed site after merging.

### F00 (foundation)

1. In the Supabase dashboard → SQL Editor, run `supabase/migrations/005_roadmap_collections.sql` once. It should say "Success. No rows returned".
2. Run it a second time: it must succeed again and change nothing.
3. On both phones (the current app from `main`), log a feed and check that it still shows on the other phone within a few seconds.

### F01 (twin rhythm)

1. History → scroll below the timeline to **Twin rhythm**. Each day has two bars (A above B), newest day on top; sleep is filled in each twin's colour.
2. Log a bottle for **both twins**: its line runs through both rows. Log a feed for one twin only: the line stays in that row.
3. Start a sleep timer: today's bar grows up to now. A sleep from last night is split at midnight between the two days.
4. Check the line above each day, e.g. "Asleep at the same time: 3 h 20 min · Feeds started together: 4 (Ema 7, Ana 6)".
5. Switch 7 / 14 days, open the table view (top-right icon), then tap a day: History jumps to that day.
6. Settings → Twins: change night hours to 20:00–06:00 and "together" to 30 min; the shading and the numbers follow (also on the other phone).
7. Try Night appearance and a narrow phone: the bars stay readable.

### F02 (pumping timer)

1. **+ → More → Start pumping**, choose **Both sides**, tap **Start pumping**: a big timer runs, and the screen does not dim.
2. Close the sheet: Today shows "Pumping · Both sides" with the minutes and **Stop**. On the other phone, Today shows it too.
3. Tap **Stop** (on either phone): the sheet "How much did you pump?" opens with the minutes filled in. Enter ml, keep **Add to the milk stash** on, save.
4. Check the milk stash: one new container. If both phones stopped and saved, still only one.
5. Start a timer and tap **Delete – started by mistake**: it disappears; **Undo** brings it back.
6. While a timer runs, History's "Pumped ml per day" and the timeline total do not change; the timeline shows "running · 5 min".
7. On the phone that did not start it, check the message: "Started pumping", then "Finished pumping (… min)".
8. With the timer sheet open on one phone, stop the timer on the other: the sheet closes and says it was stopped on the other phone.

### F03 (contraction timer) — run migration 005 first

1. In the preparation phase, open the checklist: under the countdown there is a **Contractions** card. Tap it.
2. Tap the big **Start** button, wait a few seconds, tap **Stop**. Do it three or four times: the list shows each start time, its length and the time since the previous one; "Last 60 minutes" shows the count and averages.
3. Leave the page open for a few minutes: the screen does not turn off.
4. On the other phone: one message "Started timing contractions (from …)" when the first one starts, and no message for the ones after it. The list there shows the same contractions.
5. Delete one contraction with the bin icon, then **Undo**. Then **Clear all** → confirm: the list is empty on both phones (**Undo** brings it back).
6. Check the fixed note "Follow the instructions of your hospital or midwife." and that nothing else gives advice.

### F04 (plan before the birth)

1. In the preparation phase, the bottom bar shows **Checklist, Plan, Budget, Notifications, Settings**. Budget has a **Shopping** link at the top.
2. Plan shows **Calendar** and **Tasks** (no Routines) and the Contractions card.
3. Add an appointment "Ultrasound": **For** is preset to **Pregnancy / mother**; the calendar row shows that label.
4. Open **Notes for the doctor** from the calendar, add a question: it is preset to **For the mother**. The filter **All / Twins / Mother** appears.
5. Switch to the daily planner (Settings → Twins), open **Report**: the mother's question is not there until **Include notes for the mother** is switched on.
6. With push reminders on, an appointment for the mother arrives as "Ultrasound at 10:30" with the place underneath.

### F05 (spreadsheet export)

1. Settings → Backup → **Export as spreadsheet (CSV)**. The share sheet opens with `twins-organizer-<today>.zip` (or it downloads).
2. Send it to yourself and open it on a computer: 8 CSV files.
3. Open `logs.csv` in Excel or LibreOffice: Cyrillic names read correctly, one row per entry, date and time in separate columns, twin names (not ids).
4. Write a note with a comma and quotes ("ate, "well"") and export again: the note stays in one cell.
5. If Excel shows everything in one column, use **Data → From Text/CSV**: the columns separate.
6. Delete an entry and export again: it is gone from the file. With a pumping timer running, it is not in `pumping.csv`.

### F06 (descriptive insights)

1. History → **This week**: a card per twin with longest sleep, sleep per day (day / night), time between feeds, feeds per day, and ml or breastfeeding minutes when there are any.
2. Tap a value: one sentence explains how it is worked out. Tap again to close it.
3. A sleep from 22:00 to 04:00 shows as the longest sleep "the night of <the evening's date>", not split at midnight.
4. Pick a day last week with the date arrows: the card shows that week, with arrows and differences against the week before it (grey, no red/green).
5. A twin with entries on only some days says "Based on N days with entries".
6. Change the night hours in Settings → Twins: the day/night split follows.

### F07 (vaccinations) — run migration 005 first

1. More → **Vaccinations**: two columns, one per twin, each with "None yet."
2. **+ Add**: the twin picker is on **Both**. Enter "Hexa", dose 1, today, a place, save: one card in each column.
3. Add another one for one twin only, with an older date: it goes below the newer one, in that twin's column only. The name field suggests "Hexa".
4. Open Twin A's card, change the notes and save: Twin B's card is unchanged.
5. Open a card, change the dose to 2 and tap **Plan next dose**: a new appointment "Hexa – 3. доза" for both twins opens; pick a date and save. Cancel instead: no appointment is added.
6. Type 2,5 as the dose: the form asks for a whole number.
7. More → **Report**: the "Vaccinations" section lists them for the period; Settings → Backup → Export as spreadsheet has `vaccines.csv`.
8. On the other phone: "Vaccination: Hexa · <twin> · <date>" arrives and both cards show up.

### F08 (diaper details)

1. On Today, tap **Dirty** once: it logs at once, as before.
2. Tap **Adjust** on the message (or the entry in the timeline): under the diaper kind there is a folded **Details** row.
3. Open it: **Rash – Yes**, colours and textures as chips. Pick green and soft, tap green again: it clears. Pick it again and save.
4. The timeline shows "Dirty · rash · green · soft" (or the Macedonian words).
5. Edit the entry, switch it to **Wet**: colour and texture disappear from the form and from the saved entry; the rash stays.
6. More → **Report**: a **Rash** column for that twin and a line "Dirty diapers · Colour: green 1 · Texture: soft 1". The other twin has no rash column.
7. Export as spreadsheet: `logs.csv` has the rash, stool colour and stool texture columns filled.
8. An older entry (logged before the update) opens with Details folded and empty.

### F09 (head circumference and reference curves)

1. Growth → **Add measurement**: there is a **Head circumference (cm)** field. Save one with only the head size: Growth shows a third chart.
2. Settings → Twins (twin setup): each twin has **Girl or boy** (girl, boy, not set) with "Only used for the optional reference curves."
3. Growth: **Show WHO reference curves** is off. Turn it on: a **Curves for** picker appears.
4. For a twin with girl/boy not set: a note asks to set it, with a link to the setup. Set it.
5. The weight, length and head charts show that twin against age, with thin grey lines behind the points and the caption "Reference curves (WHO). Not a verdict: ask your paediatrician." Tap a point: the tooltip shows the age and value only.
6. For a twin born before 37 weeks (e.g. 35 + 4), the chart says the axis is the corrected age, and the birth point sits left of 0.
7. On the other phone the curves stay off (per phone). Turn them off again: the usual date charts for both twins come back.
8. More → Report: the growth table has a head column.

### F10 (mother's recovery) — run migration 005 first; redeploy the push function

1. Plan → Routines → **Add routine**: name "Ibuprofen", turn on **This is a medicine**: the **For** choice now reads **For the mother**. Pick it, times 08:00 and 20:00, save.
2. Today: a **Mother** card with Ibuprofen "not logged yet" and –. "Coming up" shows it labelled "For the mother". Tap the card row: a message "Logged for the mother", the row shows "last given just now", and the 08:00 item leaves Coming up.
3. Tap it again within 6 hours (if you set a minimum time): "Mother already had Ibuprofen …". The twins' Daily care is unchanged.
4. More → **Mother**: **How are you today?** — pick a face, 5,5 hours, save. Save again with another face: still one check-in for today.
5. On the other phone: no message about her dose or check-in (and no unread badge). Turn on **Tell the other phones about her entries**, log another dose: now "Mother: Ibuprofen (…)" arrives, without any mood.
6. With push reminders: at 20:00 "Ibuprofen · for the mother"; after logging the dose, no reminder.
7. More → Report: **Include the mother's medicines** appears; switched on, her doses are listed (no check-ins). Export as spreadsheet: `mother.csv`.
8. Mother page settings: turn off **Show her medicines on Today**: the card disappears on both phones.

### F11 (Done and Snooze on push reminders, Android) — redeploy the push function

1. Make a test routine for both twins at a time 2–3 minutes ahead (a medicine, e.g. Vitamin D), with push reminders on (Settings → Reminders).
2. Close the app completely. When the reminder arrives, it has **Done** and **Snooze 15 min**.
3. Tap **Done**: the notification goes away and the app does not open. Open the app: the routine is gone from Coming up, and both twins have a Vitamin D entry (linked); the other phone gets them after this phone syncs.
4. Next day (or another test routine): tap **Snooze 15 min** with the app closed, then open the app once so it syncs. 15 minutes later the reminder comes again, once.
5. Snooze again, then log the dose in the app before the 15 minutes are up: the snoozed reminder does not come.
6. With the app open in the background, tap **Done** on a reminder: a short "Done: …" message appears in the app.
7. A medicine for the mother: **Done** logs her dose (Mother page), not a twin's.
8. On iPhone: the reminders arrive as before, without buttons.

### F12 (photos) — run migration 006 first

1. Supabase → SQL Editor: run `supabase/migrations/006_photos_storage.sql` (twice is fine). Storage shows a private bucket `photos`.
2. More → **Photos** (or, before the birth, **Bump photos** on the countdown): **Take photo** opens the camera, **Choose photo** the gallery. The photo appears under this month.
3. Open a milestone (e.g. first smile for one twin, with a date): the sheet has **Photos**; add one. It shows in the sheet and on the Photos page with that twin's badge.
4. Tap a photo: full screen; swipe to the next; delete, then **Undo**.
5. On the other phone (sync on): the photos appear, thumbnails first, the full image on opening. With the first phone offline, a photo from it shows "not on this phone yet" until it syncs.
6. Filter by twin: a twin shows its own photos and those of both; **Together** only those of both.
7. Settings → Storage shows the photos and their size; Settings → Backup → **Download photos (zip)** saves a zip with names like `2026-10-13_Ема_Важен-момент.webp`.
8. Take a photo with location on, download the zip on a computer and check the file's properties: no GPS.

## Follow-ups

- F12 · Build the photo zip in parts (or stream it) for families with many hundreds of photos.

- F11 · Upload from the service worker itself on Background Sync (needs the Supabase client and sign-in in the service worker), so a Done/Snooze pressed with the app closed reaches the other phone without opening the app.

<!-- Things noticed along the way that are out of scope. -->
