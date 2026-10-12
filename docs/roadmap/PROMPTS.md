# Prompts for Claude Code

Open Claude Code in the project folder (`E:\twins-mk`). Run **one phase per session** and type `/clear` between phases: each phase is large, and a fresh session reads the progress file instead of carrying old context.

---

## 1. Start (first session: foundation + Phase 1)

```
You are building the next features of Twins Organizer. The full spec is docs/roadmap/ROADMAP.md and progress is tracked in docs/roadmap/PROGRESS.md.

1. Read docs/roadmap/ROADMAP.md completely, then README.md, src/data/types.ts, src/data/repository.ts, src/data/dexieStore.ts, src/data/sync/types.ts, src/features/sync/changes.ts and supabase/schema.sql.
2. Run npm install (if needed), npm test and npm run typecheck, so you know the starting state is green. If it is not, stop and tell me.
3. Do F00 (foundation), then F01–F06 in order.

For each feature:
- Before writing code, post a short plan: files to change, new types and fields, tests to add, risks. Then continue without waiting, unless the spec says ASK or you find a conflict between the spec and the code that changes behaviour for the user.
- Follow Part A of the spec (rules, patterns and quality gates) exactly.
- Finish the quality gates, update PROGRESS.md (status, decisions, the phone test checklist) and commit on the roadmap branch.
- Use a subagent to review the feature's diff against Part A before committing, and fix what it finds.

Never push, never merge to main and never deploy. When Phase 1 is done, stop and give me:
(a) what was built,
(b) anything I must do (for example run migration 005 in Supabase),
(c) the combined phone test checklist,
(d) how to try it on my phone from this computer.
```

## 2. Continue (every later session)

```
Continue the Twins Organizer roadmap. Read CLAUDE.md, docs/roadmap/PROGRESS.md and docs/roadmap/ROADMAP.md (Part A fully, and the features of the next phase).

Check git status and that you are on the roadmap branch. Run npm test so you know the state is green.

Then build the next phase that is not done yet (finish any 🟨 feature first), feature by feature, exactly as in Part A: plan, build, gates, subagent review, PROGRESS.md, commit.

Stop at the end of the phase with the same summary as before:
(a) what was built,
(b) what I must do,
(c) the phone test checklist,
(d) how to try it.
```

## 3. Fix something I found while testing

```
While testing <feature ID> on my phone I found: <what happened, and what I expected>.
Read CLAUDE.md and the feature's section in docs/roadmap/ROADMAP.md. Reproduce it with a failing test first, then fix it, run the gates, add a line under "Decisions and deviations" in PROGRESS.md, and commit as fix(<area>): … (<feature ID>).
```

## 4. Final review before I merge

```
Review the whole roadmap branch against main before I merge.
Read CLAUDE.md and docs/roadmap/ROADMAP.md Part A.
Check:
- every new synced collection is in all 7 places listed in A2;
- older records without the new fields still work;
- mk and en strings are complete;
- no new network calls or dependencies beyond the spec;
- nothing in the UI gives medical advice or judges a value;
- README is up to date.
Also check that the function bundle is rebuilt and that migrations 005 and 006 are idempotent.
List the problems by severity, fix the ones that are clearly bugs, and tell me the exact order to deploy: migrations first, then the edge function, then merge to main.
```
