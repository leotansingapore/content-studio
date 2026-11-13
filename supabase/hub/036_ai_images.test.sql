begin;

create function public.cs_test_assert(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAIL %', p_label;
  end if;
end $$;

select public.cs_test_assert((select not public and file_size_limit = 10485760 and allowed_mime_types = array['image/jpeg'] from storage.buckets where id = 'cs-ai-images'), '1 private jpeg bucket, 10 MB');
select public.cs_test_assert(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%cs-ai-images%'), '2 no storage policy for cs-ai-images');

do $$ begin raise notice 'ai images tests: all passed'; end $$;
rollback;
