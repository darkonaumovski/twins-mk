-- Twins Organizer: allow the collections added by the roadmap features (contraction timer, vaccinations,
-- the mother's recovery, journal, photos, first foods, and snoozed push reminders), all at once.
-- Run once on an existing project: Supabase dashboard → SQL Editor → New query → paste this file → Run.
-- Run it BEFORE the phones get an app version with any of these features; until then the server refuses those
-- records and the updated phone shows "The sync server needs an update".
-- Safe to run more than once, in any order. (A new project only needs supabase/schema.sql, which includes this.)

-- The collections the app syncs, one row each. A record of any other collection is refused
-- (foreign key below). Newer app versions add theirs with a file in supabase/migrations/;
-- names are only ever added, so running an older file again never takes one away.
create table if not exists public.sync_collections (name text primary key);
insert into public.sync_collections (name) values
  ('settings'),
  ('categories'),
  ('prepItems'),
  ('babies'),
  ('logs'),
  ('appointments'),
  ('routines'),
  ('routineDone'),
  ('tasks'),
  ('doctorNotes'),
  ('pumps'),
  ('milkStash'),
  ('supplies'),
  ('caregivers'),
  ('milestones'),
  ('contractions'),
  ('vaccines'),
  ('motherLogs'),
  ('journal'),
  ('photos'),
  ('foods'),
  ('foodTries'),
  ('reminderSnoozes')
on conflict (name) do nothing;
alter table public.sync_collections enable row level security;
revoke all on public.sync_collections from anon, authenticated;

-- Projects set up with the first version of schema.sql had a fixed list here instead.
alter table public.records drop constraint if exists records_collection_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'records_collection_fkey') then
    alter table public.records
      add constraint records_collection_fkey foreign key (collection) references public.sync_collections (name);
  end if;
end;
$$;
