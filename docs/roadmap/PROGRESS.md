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

| ID  | Feature                  | Status | Commit        | Notes                                                       |
| --- | ------------------------ | ------ | ------------- | ----------------------------------------------------------- |
| F01 | Twin rhythm chart        | ✅     | 512227f       | History → "Twin rhythm"; settings in Settings → Twins       |
| F02 | Pumping timer            | ✅     | fc9493c       | More → Start pumping; running card on Today                 |
| F03 | Contraction timer        | ✅     | d9fe6a5       | Checklist → Contractions (prep phase); Plan in F04          |
| F04 | Plan before the birth    | ✅     | 0c8f7f6       | Prep tabs: Checklist, Plan, Budget, Notifications, Settings |
| F05 | Spreadsheet export (CSV) | ✅     | cc83510       | Settings → Backup → Export as spreadsheet (CSV)             |
| F06 | Descriptive insights     | 🟨     | (next commit) | History → "This week"                                       |

## Phase 2: health records and the mother

| ID  | Feature                           | Status | Commit | Notes |
| --- | --------------------------------- | ------ | ------ | ----- |
| F07 | Vaccination record                | ⬜     |        |       |
| F08 | Diaper details                    | ⬜     |        |       |
| F09 | Head circumference and WHO curves | ⬜     |        |       |
| F10 | Mother's recovery                 | ⬜     |        |       |
| F11 | Action buttons on push reminders  | ⬜     |        |       |

## Phase 3: memories and later months

| ID  | Feature                        | Status | Commit | Notes |
| --- | ------------------------------ | ------ | ------ | ----- |
| F12 | Photos                         | ⬜     |        |       |
| F13 | Journal and keepsake book      | ⬜     |        |       |
| F14 | Solids and first foods         | ⬜     |        |       |
| F15 | Quick text logging (and voice) | ⬜     |        |       |

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

## Phone test checklists

<!-- Per feature: 3–8 steps Darko can follow on his phone. -->

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

## Follow-ups

<!-- Things noticed along the way that are out of scope. -->

- F06 review findings still to fix (next session, before Phase 2): (1) a twin with no sleep or no feeds logged in the week shows "0 min" / "0" instead of "–"; (2) today, a partial day, counts as a full day in the averages, so they dip every morning; (3) a day counts as active only if an entry starts in it (sleep spilling into an empty morning is dropped); (4) simplify the skipped-day gap rule and consider leaving out gaps of 24 h or more; (5) "night" for the longest sleep is decided by its start only; (6) tests for DST, a 00:00–06:00 night, from = to, a sleep starting before the week; (7) format ml with summary.ml; (8) useMemo for the weekly computation; (9) aria-describedby from each value to its label; (10) wording: "Доење на ден", "Врз основа на", one-sentence explanations, "7 дена до …" when a past day is selected; (11) a combined Phase 1 phone checklist in this file.
