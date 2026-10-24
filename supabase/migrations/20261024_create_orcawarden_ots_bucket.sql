-- The bytes stored in this private bucket are encrypted by the Render server with AES-GCM.
-- Run this once in Supabase Dashboard > SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'orcawarden-ots',
  'orcawarden-ots',
  false,
  1048576,
  array['application/octet-stream', 'application/vnd.opentimestamps.ots']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No anonymous Storage policies are created. The Render service uses the Supabase service-role key.

-- Reserve document numbers centrally so concurrent browsers cannot generate duplicates.
create sequence if not exists public.orcawarden_document_number_seq
  as bigint
  minvalue 1000000000
  maxvalue 9999999999
  start with 1000000000
  increment by 1
  no cycle;

create or replace function public.reserve_orcawarden_document_number()
returns text
language sql
security definer
set search_path = public
as $$
  select lpad(nextval('public.orcawarden_document_number_seq')::text, 10, '0');
$$;

revoke all on function public.reserve_orcawarden_document_number() from public;
grant execute on function public.reserve_orcawarden_document_number() to anon, authenticated;
revoke all on sequence public.orcawarden_document_number_seq from public;
