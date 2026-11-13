begin;
set local lock_timeout = '3s';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cs-ai-images', 'cs-ai-images', false, 10485760, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
