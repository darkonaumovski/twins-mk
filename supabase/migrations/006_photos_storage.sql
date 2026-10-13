-- Twins Organizer: photos (milestones, journal, the monthly photo, bump photos) in a private Storage bucket.
-- Run once on an existing project: Supabase dashboard → SQL Editor → New query → paste this file → Run.
-- Run it BEFORE the phones get an app version with photos; until then photos stay on the phone that took them
-- (their details still sync, and the images go up as soon as this has run).
-- Safe to run more than once. (A new project only needs supabase/schema.sql, which includes this.)

-- The bucket: private, at most 3 MB per image, WebP or JPEG only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 3145728, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Images are stored as <family_id>/<photo id>.webp and <photo id>.thumb.webp: the first folder is the family.
create or replace function public.photo_family(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
  end;
$$;

grant execute on function public.photo_family(text) to authenticated;

-- Only members of a family can read, add, replace or delete the images in its folder.
drop policy if exists "family members read photos" on storage.objects;
create policy "family members read photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_family_member(public.photo_family(name)));

drop policy if exists "family members add photos" on storage.objects;
create policy "family members add photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.is_family_member(public.photo_family(name)));

drop policy if exists "family members replace photos" on storage.objects;
create policy "family members replace photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.is_family_member(public.photo_family(name)))
  with check (bucket_id = 'photos' and public.is_family_member(public.photo_family(name)));

drop policy if exists "family members delete photos" on storage.objects;
create policy "family members delete photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.is_family_member(public.photo_family(name)));
