-- Tests for 026_telegram.sql. Run AFTER 026 is applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/026_telegram.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises "FAIL <n> ..." and aborts.
-- A clean run ends with NOTICE "telegram tests: all passed".

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

grant execute on function public.cs_test_assert(boolean, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_expect_error(text, text, text) to anon, authenticated, service_role;

-- A ...d1 connects chats for two brands. B ...d2 is another adviser.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['d1', 'd2']) s;

-- ---------------------------------------------------------------------------
-- 0. Catalog, grants and anon
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  bool_and(
    not has_table_privilege('anon', t, 'select,insert,update,delete,truncate,references,trigger')
    and not has_table_privilege('authenticated', t, 'insert,update,delete,truncate,references,trigger')
    and has_table_privilege('authenticated', t, 'select')
    and has_table_privilege('service_role', t, 'select,insert,update,delete')),
  '0.1 anon holds nothing; authenticated may only select; service_role writes')
from unnest(array['public.cs_telegram_chats', 'public.cs_telegram_posts']) t;

select public.cs_test_assert(
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.cs_telegram_chats'::regclass, 'public.cs_telegram_posts'::regclass))
  and (select count(*) = 2 and bool_and(cmd = 'SELECT' and roles = array['authenticated']::name[])
       from pg_policies where schemaname = 'public' and tablename in ('cs_telegram_chats', 'cs_telegram_posts')),
  '0.2 RLS on, and the only policies are one SELECT for authenticated per table');

select public.cs_test_assert(
  not has_function_privilege('anon', 'public.cs_telegram_claim_due(integer, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_telegram_claim_due(integer, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.cs_telegram_claim_due(integer, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.cs_telegram_tick_due(timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_telegram_tick_due(timestamptz)', 'execute'),
  '0.3 only the service role may claim posts or ask whether a tick is due');

select public.cs_test_assert(
  (select count(*) = 1 from storage.buckets
   where id = 'cs-telegram-media' and public = false and file_size_limit = 20971520
     and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
     and cardinality(allowed_mime_types) = 4),
  '0.4 the media bucket is private, 20 MB, pictures and MP4 only');

select public.cs_test_assert(
  (select count(*) = 1 from cron.job where jobname = 'telegram-send' and schedule = '* * * * *'
     and command like '%cs_telegram_tick_due()%' and command like '%x-telegram-cron-secret%'
     and command not like '%Bearer%'),
  '0.5 one telegram-send job, every minute, only when a tick is due, with the cron secret from Vault');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_expect_error($$select count(*) from public.cs_telegram_chats$$, '%permission denied%', '0.6 anon cannot read chats');
select public.cs_test_expect_error($$select count(*) from public.cs_telegram_posts$$, '%permission denied%', '0.7 anon cannot read posts');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', repeat('a', 64), now())$$,
  '%permission denied%', '0.8 anon cannot insert');
select public.cs_test_expect_error($$select public.cs_telegram_claim_due(20, now())$$, '%permission denied%', '0.9 anon cannot claim');
reset role;

-- ---------------------------------------------------------------------------
-- 1. The edge functions (service_role) write connects and posts
-- ---------------------------------------------------------------------------

set local role service_role;
insert into public.cs_telegram_chats (id, owner_id, profile_id, code_hash, code_expires_at, tg_user_id, chat_id, chat_type, title, status, connected_at, confirmed_at, tg_user_name, login_hash) values
  ('00000000-0000-4000-8000-0000000000c1', '7e57c0de-0000-4000-8000-0000000000d1', 'me',          repeat('1', 64), now() + interval '15 minutes', 111, -1001000000001, 'supergroup', 'Test group', 'connected', now(), now(), '@leo_test', repeat('c', 63) || '1'),
  ('00000000-0000-4000-8000-0000000000c2', '7e57c0de-0000-4000-8000-0000000000d1', 'pmg1x2y3z',   repeat('2', 64), now() + interval '15 minutes', 111, -1001000000002, 'channel',    'Test channel', 'connected', now(), now(), 'Leo', repeat('c', 63) || '2'),
  ('00000000-0000-4000-8000-0000000000c3', '7e57c0de-0000-4000-8000-0000000000d1', 'me',          repeat('3', 64), now() + interval '15 minutes', null, null, null, null, 'pending', null, null, null, null),
  ('00000000-0000-4000-8000-0000000000c4', '7e57c0de-0000-4000-8000-0000000000d2', 'me',          repeat('4', 64), now() + interval '15 minutes', 222, -1001000000004, 'supergroup', 'Other group', 'connected', now(), now(), null, repeat('c', 63) || '4'),
  ('00000000-0000-4000-8000-0000000000c5', '7e57c0de-0000-4000-8000-0000000000d1', 'me',          repeat('5', 64), now() + interval '15 minutes', 111, -1001000000005, 'supergroup', 'Gone group', 'removed', now(), now(), null, repeat('c', 63) || '5');

-- 10:00 Singapore time on a fixed day, so the hours never depend on when this runs
create temporary table t_clock as select timestamptz '2026-11-02 10:00:00+08' as at;
grant select on t_clock to service_role, authenticated;

insert into public.cs_telegram_posts (id, owner_id, profile_id, chat_row, client_key, text, media, send_at) values
  ('00000000-0000-4000-8000-0000000000a1', '7e57c0de-0000-4000-8000-0000000000d1', 'me',        '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'First',  '{}', (select at from t_clock) - interval '5 minutes'),
  ('00000000-0000-4000-8000-0000000000a2', '7e57c0de-0000-4000-8000-0000000000d1', 'me',        '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000b', 'Second', '{}', (select at from t_clock) - interval '1 minute'),
  ('00000000-0000-4000-8000-0000000000a3', '7e57c0de-0000-4000-8000-0000000000d1', 'pmg1x2y3z', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000000a', '',       array['7e57c0de-0000-4000-8000-0000000000d1/pmg1x2y3z/00000000-0000-4000-8000-000000000001.jpg'], (select at from t_clock) - interval '2 minutes'),
  ('00000000-0000-4000-8000-0000000000a4', '7e57c0de-0000-4000-8000-0000000000d1', 'me',        '00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-00000000000c', 'To a removed chat', '{}', (select at from t_clock) - interval '9 minutes'),
  ('00000000-0000-4000-8000-0000000000a5', '7e57c0de-0000-4000-8000-0000000000d2', 'me',        '00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-00000000000a', 'Later',  '{}', (select at from t_clock) + interval '1 hour');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Constraints
-- ---------------------------------------------------------------------------

set local role service_role;
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', 'ABC123', now())$$,
  '%cs_telegram_chats_code_hash_check%', '2.1 the code is stored only as a sha256 hex digest');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at)
    values ('7e57c0de-0000-4000-8000-0000000000d2', 'me', repeat('1', 64), now())$$,
  '%duplicate key%', '2.2 a code hash is used once');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at, tg_user_id, chat_id, chat_type, title, status, confirmed_at, login_hash)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', repeat('6', 64), now(), 111, -1001000000001, 'supergroup', 'Test group', 'connected', now(), repeat('d', 64))$$,
  '%duplicate key%', '2.3 one brand has one live row per chat');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at, status)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', repeat('7', 64), now(), 'connected')$$,
  '%cs_telegram_chats_check%', '2.4 a connected row names its chat');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_posts (owner_id, profile_id, chat_row, client_key, text, send_at)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'Again', now())$$,
  '%duplicate key%', '2.5 the same client key to the same chat makes one post');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_posts (owner_id, profile_id, chat_row, client_key, text, send_at)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', '00000000-0000-4000-8000-0000000000c1', gen_random_uuid(), repeat('x', 4097), now())$$,
  '%cs_telegram_posts_text_check%', '2.6 text is 4,096 characters at most');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_posts (owner_id, profile_id, chat_row, client_key, text, media, send_at)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', '00000000-0000-4000-8000-0000000000c1', gen_random_uuid(), '', array_fill('x'::text, array[11]), now())$$,
  '%cs_telegram_posts_media_check%', '2.7 ten files at most');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_posts (owner_id, profile_id, chat_row, client_key, text, send_at)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', '00000000-0000-4000-8000-0000000000c1', gen_random_uuid(), '', now())$$,
  '%cs_telegram_posts_check%', '2.8 a post has text or a file');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at, tg_user_id, chat_id, chat_type, title, status)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', repeat('8', 64), now(), 111, -1001000000009, 'supergroup', 'Unasked', 'connected')$$,
  '%cs_telegram_chats_confirmed%', '2.9 a chat is live only after a Telegram login was verified for the code''s account');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at, confirmed_at)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', repeat('9', 64), now(), now())$$,
  '%cs_telegram_chats_confirmed%', '2.10 a verified login names its Telegram user');
-- tapping Start puts the Telegram user on the code before any login is verified
insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at, tg_user_id)
  values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', repeat('a', 64), now() + interval '15 minutes', 111);
insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at, tg_user_id, confirmed_at, login_hash)
  values ('7e57c0de-0000-4000-8000-0000000000d2', 'me', repeat('b', 64), now() + interval '15 minutes', 222, now(), repeat('e', 64));
select public.cs_test_expect_error(
  $$update public.cs_telegram_chats set confirmed_at = now(), login_hash = repeat('e', 64) where code_hash = repeat('a', 64)$$,
  '%duplicate key%', '2.11 a signed Telegram login is used once, on one code');
select public.cs_test_expect_error(
  $$update public.cs_telegram_chats set login_hash = 'not-a-hash' where code_hash = repeat('a', 64)$$,
  '%cs_telegram_chats_login_hash_check%', '2.12 a login is kept as Telegram''s hex hash only');
delete from public.cs_telegram_chats where code_hash in (repeat('a', 64), repeat('b', 64));
reset role;

-- ---------------------------------------------------------------------------
-- 3. An owner reads only their own rows and writes nothing
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_assert((select count(*) from public.cs_telegram_chats) = 4, '3.1 A reads their four chat rows');
select public.cs_test_assert(
  (select tg_user_name = '@leo_test' from public.cs_telegram_chats where id = '00000000-0000-4000-8000-0000000000c1'),
  '3.1b A reads who connected each chat');
select public.cs_test_assert((select count(*) from public.cs_telegram_posts) = 4, '3.2 A reads their four posts');
select public.cs_test_expect_error(
  $$update public.cs_telegram_chats set status = 'connected' where id = '00000000-0000-4000-8000-0000000000c5'$$,
  '%permission denied%', '3.3 an owner cannot change a chat row');
select public.cs_test_expect_error(
  $$update public.cs_telegram_posts set status = 'scheduled'$$, '%permission denied%', '3.4 an owner cannot change a post');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_posts (owner_id, profile_id, chat_row, client_key, text, send_at)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', '00000000-0000-4000-8000-0000000000c1', gen_random_uuid(), 'Hi', now())$$,
  '%permission denied%', '3.5 an owner cannot queue a post directly');
select public.cs_test_expect_error($$delete from public.cs_telegram_chats$$, '%permission denied%', '3.6 an owner cannot delete');
select public.cs_test_expect_error($$select public.cs_telegram_claim_due(20, now())$$, '%permission denied%', '3.7 an owner cannot claim');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d2","role":"authenticated"}';
select public.cs_test_assert(
  (select count(*) = 1 and bool_and(title = 'Other group') from public.cs_telegram_chats)
  and (select count(*) = 1 and bool_and(text = 'Later') from public.cs_telegram_posts),
  '3.8 B reads only their own chat and post');

set local request.jwt.claims = '{"role":"authenticated"}';
select public.cs_test_assert((select count(*) from public.cs_telegram_chats) + (select count(*) from public.cs_telegram_posts) = 0,
  '3.9 a token with no sub reads nothing');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The send tick claims due posts: 09:00 to 21:00 Singapore time, one per chat, connected chats only
-- ---------------------------------------------------------------------------

set local role service_role;
select public.cs_test_assert(public.cs_telegram_tick_due((select at from t_clock)), '4.1 a tick is due at 10:00 with posts waiting');
select public.cs_test_assert(
  not public.cs_telegram_tick_due(timestamptz '2026-11-02 08:59:00+08')
  and not public.cs_telegram_tick_due(timestamptz '2026-11-02 21:00:00+08'),
  '4.2 no tick at 08:59 or 21:00');
select public.cs_test_assert(
  (select count(*) from public.cs_telegram_claim_due(20, timestamptz '2026-11-02 21:00:00+08')) = 0
  and (select count(*) from public.cs_telegram_claim_due(20, timestamptz '2026-11-02 08:59:59+08')) = 0,
  '4.3 nothing is claimed outside 09:00 to 21:00');

create temporary table t_claimed as select * from public.cs_telegram_claim_due(20, (select at from t_clock));
select public.cs_test_assert(
  (select array_agg(id order by id) from t_claimed) = array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3']::uuid[],
  '4.4 the earliest post of each connected chat is claimed; a removed chat and a later post are not');
select public.cs_test_assert(
  (select bool_and(status = 'sending' and attempts = 1 and sending_at = (select at from t_clock)) from public.cs_telegram_posts
   where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3')),
  '4.5 a claimed post is marked sending once');
select public.cs_test_assert(
  (select count(*) from public.cs_telegram_claim_due(20, (select at from t_clock) + interval '1 minute')) = 0,
  '4.6 a chat with a post still sending gets no second post');
select public.cs_test_assert(
  (select count(*) from public.cs_telegram_claim_due(0, (select at from t_clock))) = 0,
  '4.7 a limit of 0 claims nothing');

-- the first post went out: the second one in that chat is next
update public.cs_telegram_posts set status = 'posted', finished_at = (select at from t_clock) where id = '00000000-0000-4000-8000-0000000000a1';
select public.cs_test_assert(
  (select array_agg(id) from public.cs_telegram_claim_due(20, (select at from t_clock) + interval '1 minute')) = array['00000000-0000-4000-8000-0000000000a2']::uuid[],
  '4.8 once a chat is free its next post is claimed');

-- a stale send keeps the tick due; finished posts with files keep it due for the cleanup after 7 days
update public.cs_telegram_posts set status = 'posted', finished_at = (select at from t_clock) where status = 'sending' and id <> '00000000-0000-4000-8000-0000000000a3';
update public.cs_telegram_posts set status = 'sending', sending_at = (select at from t_clock) - interval '11 minutes' where id = '00000000-0000-4000-8000-0000000000a3';
update public.cs_telegram_posts set status = 'cancelled', finished_at = (select at from t_clock) where id = '00000000-0000-4000-8000-0000000000a4';
select public.cs_test_assert(public.cs_telegram_tick_due((select at from t_clock)), '4.9 a send stuck for 10 minutes makes a tick due');
update public.cs_telegram_posts set status = 'posted', finished_at = (select at from t_clock) - interval '8 days' where id = '00000000-0000-4000-8000-0000000000a3';
select public.cs_test_assert(public.cs_telegram_tick_due((select at from t_clock)), '4.10 files of a post finished 8 days ago make a tick due');
update public.cs_telegram_posts set media = '{}' where id = '00000000-0000-4000-8000-0000000000a3';
select public.cs_test_assert(not public.cs_telegram_tick_due((select at from t_clock)), '4.11 with nothing due, no tick');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Deleting a user deletes their rows only
-- ---------------------------------------------------------------------------

delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000d1';
select public.cs_test_assert(
  (select count(*) from public.cs_telegram_chats where owner_id = '7e57c0de-0000-4000-8000-0000000000d1') = 0
  and (select count(*) from public.cs_telegram_posts where owner_id = '7e57c0de-0000-4000-8000-0000000000d1') = 0
  and (select count(*) from public.cs_telegram_chats where owner_id = '7e57c0de-0000-4000-8000-0000000000d2') = 1
  and (select count(*) from public.cs_telegram_posts where owner_id = '7e57c0de-0000-4000-8000-0000000000d2') = 1,
  '5.1 deleting a user cascades to their chats and posts and leaves the other adviser''s');

-- ---------------------------------------------------------------------------

do $$ begin raise notice 'telegram tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
