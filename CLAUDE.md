# Twins Organizer: rules for Claude Code

Phone-first, local-first PWA for parents of twins (React 19, TypeScript, Vite, Tailwind 4, Dexie, i18next). The README describes the app; the roadmap spec is `docs/roadmap/ROADMAP.md`, progress is in `docs/roadmap/PROGRESS.md`.

## Commands

- `npm test` (Vitest), `npm run typecheck`, `npm run build`, `npm run format:check` (`npm run format` fixes). All four must pass before a commit.
- `npm run dev -- --host` (phone on the same Wi-Fi), or `npm run build && npm run preview -- --host`.
- `npm run build:functions` rebuilds `supabase/functions/_shared/reminders.js` from `src/server`; `src/server/bundle.test.ts` fails if it is stale.

## Never break

1. **Local-first, offline.** No accounts, analytics, third-party SDKs, CDNs, web fonts or new network calls. Network only through the existing Supabase sync (and Storage for photos), only when sync is on.
2. **No medical judgement.** No doses, intervals, targets, "normal" ranges or verdicts. Insights are descriptive, never prescriptive. Reference data is optional, off by default, labelled as a reference.
3. **Twins first.** Twin A, B or both; twin colours (`twinStyle`, `tintFor`, `TwinBadge`), `WhoPicker`, a shared `groupId` for "both" records; name the twin on save buttons.
4. **Two languages.** Every string in `src/i18n/locales/mk.ts` (default, natural Macedonian) and `en.ts`, with plurals; `locales.test.ts` stays green.
5. **Phone-first, night-friendly.** Shared components (`Sheet`, `Stepper`, `Choice`, `Toast`, `Confirm`, `ProgressBar`, `components/charts/*`), 44 px tap targets, Night palette, `TimerWakeLock` while timers run.
6. **Privacy.** Data stays on the phone or in the family's own Supabase project.

## Code patterns

- Records extend `Entity` (`src/data/types.ts`). Screens use only the repository interfaces (`src/data/repository.ts`); only `src/data/dexieStore.ts` knows IndexedDB.
- **New synced collection**, all 7: type in `types.ts`; `SyncedCollections` + `COLLECTIONS` in `repository.ts`; a new Dexie `version(n)` with indexes, the table field on `TwinsDb` and `name: repo(db.name)` in `openDexieStore` (the outbox hook is automatic through `DexieRepository`); a backup round-trip test; the name in `supabase/schema.sql` and a migration (005 already lists the roadmap ones); a `changeLine` case in `src/features/sync/changes.ts`; the schema test accepts it.
- **New log type**: `LogType`, `LogEntry`, `KNOWN_LOG_TYPES`, `LOG_ICONS`, `describe.tsx`. Prefer optional fields on existing types or a new collection: older phones hide unknown log types.
- **Optional fields** on existing records are `?:`. An older phone that edits the record may drop them; say so in the README ("Newer and older phones together").
- **Fixed ids** for records both phones may create on their own (`seed-…`, `baby-A`, `milestone-<key>-<babyId>`).
- **Logic** in a pure module (`logic.ts` or a clear name) next to the feature, with a Vitest file beside it. Components stay thin.
- Routes lazy-loaded in `src/App.tsx`; less-used pages from `MorePage.tsx`, less-used log forms from `MoreLogSheet.tsx`.
- Per-phone preferences in `DevicePrefs` (never synced); shared ones in `SharedSettings` with a default in `src/data/defaults.ts` (older records get the default).
- Push reminders: `src/server/reminders.ts` is bundled for the Edge Function; rebuild after changing `src/server` or what it imports.

## Quality gates (every feature)

- Tests for new logic, including midnight crossing, both twins, a twin in hospital, a twin born early, older records without new fields, two phones merging.
- mk + en strings, no hard-coded text. Light, Dark and Night at 360 px.
- README: user-facing description, migrations table, test list.
- PROGRESS.md: status, decisions, deviations, a 3–8 step phone test checklist.
- One commit per feature: `feat(<area>): <what> (F<nn>)`, with the test / typecheck / build / format results in the body.

## Git

- Work on the `roadmap` branch. **Never push, merge to `main` or deploy**: a push to `main` publishes to both parents' phones.
- Never commit secrets (`supabase/functions/.env.local`, an edited `push-cron.sql`).
- If the spec and the code disagree on a detail, the code wins; note it in PROGRESS.md. **ASK** before adding any npm dependency.
