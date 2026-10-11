-- Twins Organizer: milestones, and push reminders (also when the app is closed).
-- Run once on an existing project: Supabase dashboard → SQL Editor → New query → paste this file → Run.
-- Run it BEFORE the phones get the app version with milestones; until then the server refuses those
-- records and the updated phone shows "The sync server needs an update".
-- Safe to run more than once, in any order. (A new project only needs supabase/schema.sql, which includes this.)
-- Sending the reminders also needs the function and the schedule: see "Push reminders" in the README.

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
  ('milestones')
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

-- ---------- Push reminders ----------

-- One row per phone that turned on "reminders also when the app is closed".
create table if not exists public.push_subscriptions (
  endpoint text primary key check (length(endpoint) between 10 and 1000),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null check (length(p256dh) < 200),
  auth text not null check (length(auth) < 100),
  -- Who uses the phone (p1, p2 or a helper): night reminders go to whoever is on duty.
  caregiver_id text not null default 'p1' check (length(caregiver_id) <= 100),
  kinds jsonb not null default '["routines", "medicines", "appointments", "feedDue"]',
  lang text not null default 'mk' check (lang in ('mk', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_family on public.push_subscriptions (family_id);

-- Which reminders were already sent, so each goes out once. Only the reminder function writes here.
create table if not exists public.push_sent (
  family_id uuid not null references public.families (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (family_id, key)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_sent enable row level security;
drop policy if exists "users read their push subscriptions" on public.push_subscriptions;
create policy "users read their push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
revoke all on public.push_subscriptions, public.push_sent from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

create or replace function public.leave_family(f uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where family_id = f and user_id = auth.uid();
  delete from public.family_members where family_id = f and user_id = auth.uid();
$$;

-- sub: { "endpoint": …, "p256dh": …, "auth": …, "caregiverId": …, "kinds": [...], "lang": "mk" }
create or replace function public.save_push_subscription(f uuid, sub jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_family_member(f) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  insert into public.push_subscriptions as cur (endpoint, family_id, user_id, p256dh, auth, caregiver_id, kinds, lang)
  values (
    sub ->> 'endpoint', f, auth.uid(), sub ->> 'p256dh', sub ->> 'auth',
    coalesce(sub ->> 'caregiverId', 'p1'),
    coalesce(sub -> 'kinds', '["routines", "medicines", "appointments", "feedDue"]'::jsonb),
    coalesce(sub ->> 'lang', 'mk')
  )
  on conflict (endpoint) do update
    set family_id = excluded.family_id, user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        caregiver_id = excluded.caregiver_id, kinds = excluded.kinds, lang = excluded.lang, updated_at = now();
end;
$$;

create or replace function public.delete_push_subscription(endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions s where s.endpoint = delete_push_subscription.endpoint and s.user_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(uuid, jsonb), public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(uuid, jsonb), public.delete_push_subscription(text) to authenticated;
