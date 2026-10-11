-- Twins Organizer: allow the collections added for pumping, the milk stash and supplies.
-- Run once on an existing project: Supabase dashboard → SQL Editor → New query → paste this file → Run.
-- Run it BEFORE the phones get the app version with pumping; until then the server refuses
-- those records and sync on the updated phone shows "The sync server needs an update".
-- Safe to run more than once. (A new project only needs supabase/schema.sql, which already includes this.)

alter table public.records drop constraint if exists records_collection_check;
alter table public.records add constraint records_collection_check check (
  collection in (
    'settings', 'categories', 'prepItems', 'babies', 'logs', 'appointments', 'routines', 'routineDone', 'tasks', 'doctorNotes',
    'pumps', 'milkStash', 'supplies'
  )
);
