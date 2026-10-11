-- Twins Organizer sync schema for Supabase.
-- Run once: Supabase dashboard → SQL Editor → New query → paste this file → Run.
-- Safe to run again (it only creates what is missing and replaces the functions).
--
-- Model: phones sign in anonymously. One phone creates a "family" and gets a
-- join code; the other phone joins with that code. Every app record is stored
-- as JSON in `records`, one row per (family, collection, id). Writes go through
-- push_records(), which keeps the newest version (same rule as the app's merge:
-- newest updatedAt wins, ties broken by deviceId). Every applied write gets a
-- new `seq`, so a phone pulls "everything after the last seq I saw".

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index if not exists family_members_user on public.family_members (user_id);

create sequence if not exists public.record_seq;

create table if not exists public.records (
  family_id uuid not null references public.families (id) on delete cascade,
  collection text not null,
  id text not null check (length(id) between 1 and 100),
  -- ISO timestamps and device ids compare byte-wise, exactly like the app does.
  updated_at text collate "C" not null,
  device_id text collate "C" not null,
  seq bigint not null,
  data jsonb not null check (pg_column_size(data) < 65536),
  primary key (family_id, collection, id)
);
create index if not exists records_family_seq on public.records (family_id, seq);

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

-- ---------- Access rules ----------

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.records enable row level security;

create or replace function public.is_family_member(f uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.family_members m where m.family_id = f and m.user_id = auth.uid());
$$;

drop policy if exists "members read their family" on public.families;
create policy "members read their family" on public.families
  for select to authenticated using (public.is_family_member(id));

drop policy if exists "users read their memberships" on public.family_members;
create policy "users read their memberships" on public.family_members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "members read family records" on public.records;
create policy "members read family records" on public.records
  for select to authenticated using (public.is_family_member(family_id));

-- Reads go through the policies above; every write goes through the functions below.
revoke all on public.families, public.family_members, public.records from anon, authenticated;
grant select on public.families, public.family_members, public.records to authenticated;

-- ---------- Functions the app calls ----------

-- 12 characters from a 31-character alphabet without look-alikes (no 0/O, 1/I/L): about 59 random bits.
create or replace function public.new_join_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  code text := '';
begin
  -- Bytes 6 and 8 of a UUID hold fixed version bits, so the second half reads bytes 10–15.
  -- byte % 31 is slightly uneven, which does not matter for a code that only needs to be unguessable.
  for i in 0..11 loop
    code := code || substr(alphabet, (get_byte(bytes, i + (case when i >= 6 then 4 else 0 end)) % 31) + 1, 1);
  end loop;
  return code;
end;
$$;

create or replace function public.create_family()
returns table (family_id uuid, join_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  fid uuid;
  code text;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  loop
    code := public.new_join_code();
    begin
      insert into public.families (join_code) values (code) returning id into fid;
      exit;
    exception when unique_violation then
      -- Astronomically unlikely; just draw another code.
    end;
  end loop;
  insert into public.family_members (family_id, user_id) values (fid, uid);
  return query select fid, code;
end;
$$;

create or replace function public.join_family(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  fid uuid;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  select f.id into fid from public.families f
    where f.join_code = upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'));
  if fid is null then
    raise exception 'family_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = uid) then
    -- Two parents, plus room for a lost or replaced phone.
    if (select count(*) from public.family_members m where m.family_id = fid) >= 8 then
      raise exception 'family_full' using errcode = 'P0001';
    end if;
    insert into public.family_members (family_id, user_id) values (fid, uid);
  end if;
  return fid;
end;
$$;

create or replace function public.leave_family(f uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where family_id = f and user_id = auth.uid();
  delete from public.family_members where family_id = f and user_id = auth.uid();
$$;

-- rows: [{ "collection": "logs", "data": { "id": …, "updatedAt": …, "deviceId": …, … } }, …]
-- Returns how many rows were new or newer than what the server had.
create or replace function public.push_records(f uuid, rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  applied integer;
begin
  if not public.is_family_member(f) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then
    raise exception 'bad_batch' using errcode = '22023';
  end if;

  -- One writer per family at a time, so `seq` grows in commit order and a
  -- phone that pulls "after seq N" can never miss a row committed later.
  perform pg_advisory_xact_lock(hashtextextended(f::text, 0));

  with incoming as (
    select distinct on (r ->> 'collection', r -> 'data' ->> 'id')
      r ->> 'collection' as collection,
      r -> 'data' ->> 'id' as id,
      r -> 'data' ->> 'updatedAt' as updated_at,
      r -> 'data' ->> 'deviceId' as device_id,
      r -> 'data' as data
    from jsonb_array_elements(rows) r
    order by r ->> 'collection', r -> 'data' ->> 'id', r -> 'data' ->> 'updatedAt' collate "C" desc
  ),
  upserted as (
    insert into public.records as cur (family_id, collection, id, updated_at, device_id, seq, data)
    select f, collection, id, updated_at, device_id, nextval('public.record_seq'), data
    from incoming
    on conflict (family_id, collection, id) do update
      set updated_at = excluded.updated_at, device_id = excluded.device_id, seq = excluded.seq, data = excluded.data
      where excluded.updated_at > cur.updated_at
         or (excluded.updated_at = cur.updated_at and excluded.device_id > cur.device_id)
    returning 1
  )
  select count(*) into applied from upserted;
  return applied;
end;
$$;

revoke execute on function public.is_family_member(uuid), public.new_join_code(), public.create_family(), public.join_family(text),
  public.leave_family(uuid), public.push_records(uuid, jsonb) from public, anon;
grant execute on function public.is_family_member(uuid), public.create_family(), public.join_family(text),
  public.leave_family(uuid), public.push_records(uuid, jsonb) to authenticated;

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

-- ---------- Real-time ----------

-- Phones listen for new rows of their family and then pull them.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end;
$$;
