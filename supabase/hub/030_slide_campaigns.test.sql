-- Tests for 030_slide_campaigns.sql. Run AFTER 030 is applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/030_slide_campaigns.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises "FAIL <n> ..." and aborts. A clean
-- run ends with NOTICE "slide campaign tests: all passed".

begin;

create function public.cs_test_assert(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAIL %', p_label;
  end if;
end $$;

create function public.cs_test_expect_error(p_sql text, p_like text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_like then
      raise exception 'FAIL %: expected an error like "%", got "%" (%)', p_label, p_like, sqlerrm, sqlstate;
    end if;
    return;
  end;
  raise exception 'FAIL %: expected an error like "%", but the statement succeeded', p_label, p_like;
end $$;

-- two owners
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000a001'), ('00000000-0000-0000-0000-00000000b002');

insert into public.cs_image_libraries (id, owner_id, profile_id, name) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'me', 'Golf courses'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000b002', 'me', 'Theirs');
insert into public.cs_library_images (library_id, owner_id, src) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&w=1080'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a001/lib/11111111-2222-3333-4444-555555555555.jpg');
insert into public.cs_slide_campaigns (id, owner_id, profile_id, name) values
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000a001', 'me', 'Golf hacks'),
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000b002', 'me', 'Theirs');
insert into public.cs_slide_campaign_runs (campaign_id, owner_id, kind, status) values
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000a001', 'preview', 'made');

-- 1-4: checks on what a row may hold
select public.cs_test_expect_error(
  $$insert into public.cs_library_images (library_id, owner_id, src) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'https://evil.example/x.jpg')$$,
  '%cs_library_images_src_check%', '1 a picture from anywhere but Pexels or the owner''s folder');
select public.cs_test_expect_error(
  $$insert into public.cs_library_images (library_id, owner_id, src) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000b002/lib/theirs.jpg')$$,
  '%cs_library_images_src_check%', '2 an upload in another owner''s folder');
select public.cs_test_expect_error(
  $$insert into public.cs_library_images (library_id, owner_id, src) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a001/lib/../../00000000-0000-0000-0000-00000000b002/runs/x/1.png')$$,
  '%cs_library_images_src_check%', '2b a path that climbs out of the owner''s folder');
select public.cs_test_expect_error(
  $$update public.cs_slide_campaigns set status = 'live' where id = '30000000-0000-0000-0000-000000000003'$$,
  '%cs_slide_campaigns_live_check%', '3 live with no account or next time');
select public.cs_test_expect_error(
  $$update public.cs_slide_campaigns set account_id = 'not-an-id' where id = '30000000-0000-0000-0000-000000000003'$$,
  '%cs_slide_campaigns_account_id_check%', '4 an account id that is not Zernio''s shape');
update public.cs_slide_campaigns set account_id = '0123456789abcdef01234567', next_run_at = now() + interval '1 hour', status = 'live'
  where id = '30000000-0000-0000-0000-000000000003';

-- 5-9: as owner A, signed in
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000a001", "role": "authenticated"}';
select public.cs_test_assert((select count(*) from public.cs_image_libraries) = 1, '5 A sees only A''s library');
select public.cs_test_assert((select count(*) from public.cs_library_images) = 2, '6 A sees A''s pictures');
select public.cs_test_assert((select count(*) from public.cs_slide_campaigns) = 1 and (select name from public.cs_slide_campaigns) = 'Golf hacks', '7 A sees only A''s campaign');
select public.cs_test_assert((select count(*) from public.cs_slide_campaign_runs) = 1, '8 A sees A''s run');
select public.cs_test_expect_error(
  $$update public.cs_slide_campaigns set status = 'paused'$$, '%permission denied%', '9 a client cannot change a campaign');
select public.cs_test_expect_error(
  $$insert into public.cs_image_libraries (owner_id, profile_id, name) values ('00000000-0000-0000-0000-00000000a001', 'me', 'x')$$,
  '%permission denied%', '10 a client cannot add a library');
reset role;

-- 11: signed out sees nothing
set local role anon;
select public.cs_test_expect_error($$select count(*) from public.cs_slide_campaigns$$, '%permission denied%', '11 anon reads nothing');
reset role;

-- 12: deleting an owner removes their rows
delete from auth.users where id = '00000000-0000-0000-0000-00000000a001';
select public.cs_test_assert(
  (select count(*) from public.cs_slide_campaigns where owner_id = '00000000-0000-0000-0000-00000000a001') = 0
  and (select count(*) from public.cs_library_images where owner_id = '00000000-0000-0000-0000-00000000a001') = 0
  and (select count(*) from public.cs_slide_campaign_runs where owner_id = '00000000-0000-0000-0000-00000000a001') = 0,
  '12 rows go with their owner');

-- 13: the bucket is private
select public.cs_test_assert((select not public and file_size_limit = 10485760 from storage.buckets where id = 'cs-slide-campaigns'), '13 private bucket, 10 MB');

do $$ begin raise notice 'slide campaign tests: all passed'; end $$;
rollback;
