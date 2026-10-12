# Roadmap progress

Claude Code updates this file after every feature. Spec: `docs/roadmap/ROADMAP.md`.

Status: ⬜ not started · 🟨 in progress · ✅ done · ⏸ blocked (see notes)

## Before you start (Darko)

- [ ] Read the decisions table (ROADMAP.md, A5) and change anything you disagree with.
- [ ] After F00 is done: run `supabase/migrations/005_roadmap_collections.sql` once in the Supabase SQL Editor.
- [ ] Before F12 (photos) reaches your phones: run `006_photos_storage.sql`.

## Foundation

| ID  | Feature                                             | Status | Commit        | Notes                                         |
| --- | --------------------------------------------------- | ------ | ------------- | --------------------------------------------- |
| F00 | Branch, CLAUDE.md, migration 005, CSV + ZIP helpers | ✅     | (see git log) | Migration 005 lists all 8 roadmap collections |

## Phase 1: quick wins

| ID  | Feature                  | Status | Commit | Notes |
| --- | ------------------------ | ------ | ------ | ----- |
| F01 | Twin rhythm chart        | ⬜     |        |       |
| F02 | Pumping timer            | ⬜     |        |       |
| F03 | Contraction timer        | ⬜     |        |       |
| F04 | Plan before the birth    | ⬜     |        |       |
| F05 | Spreadsheet export (CSV) | ⬜     |        |       |
| F06 | Descriptive insights     | ⬜     |        |       |

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

## Phone test checklists

<!-- Per feature: 3–8 steps Darko can follow on his phone. -->

### F00 (foundation)

1. In the Supabase dashboard → SQL Editor, run `supabase/migrations/005_roadmap_collections.sql` once. It should say "Success. No rows returned".
2. Run it a second time: it must succeed again and change nothing.
3. On both phones (the current app from `main`), log a feed and check that it still shows on the other phone within a few seconds.

## Follow-ups

<!-- Things noticed along the way that are out of scope. -->
