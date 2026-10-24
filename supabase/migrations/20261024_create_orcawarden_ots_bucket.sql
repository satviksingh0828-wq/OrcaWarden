-- OpenTimestamps proofs contain only document hashes and are safe to serve publicly.
-- Run this once in Supabase Dashboard > SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'orcawarden-ots',
  'orcawarden-ots',
  true,
  1048576,
  array['application/vnd.opentimestamps.ots', 'application/octet-stream']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "OrcaWarden can upload timestamp proofs" on storage.objects;
create policy "OrcaWarden can upload timestamp proofs"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'orcawarden-ots'
    and name ~ '^[0-9]{10}\\.ots$'
  );

drop policy if exists "Anyone can read timestamp proofs" on storage.objects;
create policy "Anyone can read timestamp proofs"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'orcawarden-ots');

drop policy if exists "OrcaWarden can replace timestamp proofs" on storage.objects;
create policy "OrcaWarden can replace timestamp proofs"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'orcawarden-ots')
  with check (
    bucket_id = 'orcawarden-ots'
    and name ~ '^[0-9]{10}\\.ots$'
  );
