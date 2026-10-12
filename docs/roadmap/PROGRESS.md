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

| ID  | Feature                  | Status | Commit        | Notes                                                 |
| --- | ------------------------ | ------ | ------------- | ----------------------------------------------------- |
| F01 | Twin rhythm chart        | ✅     | (next commit) | History → "Twin rhythm"; settings in Settings → Twins |
| F02 | Pumping timer            | ⬜     |               |                                                       |
| F03 | Contraction timer        | ⬜     |               |                                                       |
| F04 | Plan before the birth    | ⬜     |               |                                                       |
| F05 | Spreadsheet export (CSV) | ⬜     |               |                                                       |
| F06 | Descriptive insights     | ⬜     |               |                                                       |

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

## Follow-ups

<!-- Things noticed along the way that are out of scope. -->
