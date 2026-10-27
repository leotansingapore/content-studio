-- Tests for 027_telegram_bots.sql. Run AFTER 026 and 027 are applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/027_telegram_bots.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists (the Vault secrets it makes go with it). A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE "telegram bots tests: all passed".

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

-- A ...d1 runs two brands; B ...d2 is another adviser.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['d1', 'd2']) s;

create temporary table t_tokens as
select '7000000002:' || repeat('A', 35) as mb, '7000000003:' || repeat('B', 35) as fin, '7000000004:' || repeat('C', 35) as other;
grant select on t_tokens to service_role, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 0. Catalog, grants and anon
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not has_table_privilege('anon', 'public.cs_telegram_bots', 'select,insert,update,delete,truncate,references,trigger')
  and not has_table_privilege('authenticated', 'public.cs_telegram_bots', 'select,insert,update,delete,truncate,references,trigger')
  and has_table_privilege('service_role', 'public.cs_telegram_bots', 'select,insert,update,delete'),
  '0.1 anon holds nothing; authenticated holds no table-wide right; service_role reads and writes');

select public.cs_test_assert(
  bool_and(has_column_privilege('authenticated', 'public.cs_telegram_bots', c, 'select') = (c in ('id', 'owner_id', 'profile_id', 'bot_id', 'username', 'display_name', 'status', 'created_at', 'updated_at')))
  and bool_and(not has_column_privilege('anon', 'public.cs_telegram_bots', c, 'select')),
  '0.2 authenticated may select the non-secret columns only: never the token''s Vault id or the webhook hash')
from (select attname::text c from pg_attribute where attrelid = 'public.cs_telegram_bots'::regclass and attnum > 0 and not attisdropped) cols;

select public.cs_test_assert(
  (select relrowsecurity from pg_class where oid = 'public.cs_telegram_bots'::regclass)
  and (select count(*) = 1 and bool_and(cmd = 'SELECT' and roles = array['authenticated']::name[])
       from pg_policies where schemaname = 'public' and tablename = 'cs_telegram_bots'),
  '0.3 RLS on, and the only policy is SELECT for authenticated');

select public.cs_test_assert(
  bool_and(not has_function_privilege('anon', f, 'execute') and not has_function_privilege('authenticated', f, 'execute'))
  and has_function_privilege('service_role', 'public.cs_telegram_bot_save(uuid, text, bigint, text, text, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.cs_telegram_bot_token(bigint)', 'execute'),
  '0.4 only the service role may save a bot or read its token; nobody calls the clean-up trigger directly')
from unnest(array['public.cs_telegram_bot_save(uuid, text, bigint, text, text, text, text)', 'public.cs_telegram_bot_token(bigint)', 'public.cs_telegram_bots_forget_token()']) f;

select public.cs_test_assert(
  (select count(*) = 3 and bool_and(p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public, pg_temp'])
   from pg_proc p
   where p.oid in ('public.cs_telegram_bot_save(uuid, text, bigint, text, text, text, text)'::regprocedure,
                   'public.cs_telegram_bot_token(bigint)'::regprocedure, 'public.cs_telegram_bots_forget_token()'::regprocedure)),
  '0.5 all three are SECURITY DEFINER with search_path pinned to pg_catalog, public, pg_temp');

select public.cs_test_assert(
  (select data_type = 'bigint' from information_schema.columns where table_schema = 'public' and table_name = 'cs_telegram_chats' and column_name = 'bot_id')
  and has_column_privilege('authenticated', 'public.cs_telegram_chats', 'bot_id', 'select'),
  '0.6 a chat row names the bot it goes through (null: the shared bot), and its owner can read which');

select public.cs_test_assert(
  not exists (select 1 from storage.buckets where id like '%bot%')
  and not exists (select 1 from pg_policies where schemaname = 'storage' and (coalesce(qual, '') || coalesce(with_check, '')) like '%bot%'),
  '0.7 storage untouched');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_expect_error($$select username from public.cs_telegram_bots$$, '%permission denied%', '0.8 anon cannot read');
select public.cs_test_expect_error($$select public.cs_telegram_bot_token(7000000002)$$, '%permission denied%', '0.9 anon cannot read a token');
reset role;

-- ---------------------------------------------------------------------------
-- 1. The telegram function (service_role) saves a bot: the token goes to Vault, the row keeps its id
-- ---------------------------------------------------------------------------

set local role service_role;
create temporary table t_saved as
select public.cs_telegram_bot_save('7e57c0de-0000-4000-8000-0000000000d1', 'me', 7000000002, 'mb_test_bot', 'MoneyBees', (select mb from t_tokens), repeat('a', 64)) as id;
reset role;

select public.cs_test_assert(
  (select count(*) = 1 from public.cs_telegram_bots b join vault.decrypted_secrets s on s.id = b.token_secret_id
   where b.id = (select id from t_saved) and b.bot_id = 7000000002 and b.status = 'active'
     and s.name = 'cs_telegram_bot_7000000002' and s.decrypted_secret = (select mb from t_tokens)),
  '1.1 the token is in Vault, named for its bot, and the row points at it');

set local role service_role;
select public.cs_test_assert(public.cs_telegram_bot_token(7000000002) = (select mb from t_tokens), '1.2 the service role reads the token back for a send');
select public.cs_test_assert(public.cs_telegram_bot_token(7000009999) is null, '1.3 an unknown bot has no token');

select public.cs_test_expect_error(
  $$select public.cs_telegram_bot_save('7e57c0de-0000-4000-8000-0000000000d2', 'me', 7000000002, 'mb_test_bot', 'Copy', (select mb from t_tokens), repeat('b', 64))$$,
  '%duplicate key%', '1.4 a bot belongs to one brand of one account');
select public.cs_test_expect_error(
  $$select public.cs_telegram_bot_save('7e57c0de-0000-4000-8000-0000000000d1', 'me', 7000000003, 'fin_test_bot', 'FIN', (select fin from t_tokens), repeat('c', 64))$$,
  '%duplicate key%', '1.5 one own bot per brand');
select public.cs_test_expect_error(
  $$select public.cs_telegram_bot_save('7e57c0de-0000-4000-8000-0000000000d1', 'pfin', 7000000005, 'fin_test_bot', 'FIN', (select fin from t_tokens), repeat('c', 64))$$,
  '%token%', '1.6 a token for another bot id is refused');
select public.cs_test_expect_error(
  $$select public.cs_telegram_bot_save('7e57c0de-0000-4000-8000-0000000000d1', 'pfin', 7000000005, 'fin_test_bot', 'FIN', 'not a token', repeat('c', 64))$$,
  '%token%', '1.7 a malformed token is refused');
select public.cs_test_expect_error(
  $$select public.cs_telegram_bot_save('7e57c0de-0000-4000-8000-0000000000d1', 'pfin', 7000000003, 'fin_test_bot', 'FIN', (select fin from t_tokens), 'plain secret')$$,
  '%cs_telegram_bots_webhook_secret_hash_check%', '1.8 only the hash of the webhook secret is kept');
reset role;
select public.cs_test_assert(
  (select count(*) from vault.secrets where name like 'cs_telegram_bot_%') = 1,
  '1.9 a refused save leaves no Vault secret behind');

set local role service_role;
select public.cs_telegram_bot_save('7e57c0de-0000-4000-8000-0000000000d1', 'pfin', 7000000003, 'fin_test_bot', 'FIN', (select fin from t_tokens), repeat('c', 64));
select public.cs_telegram_bot_save('7e57c0de-0000-4000-8000-0000000000d2', 'me', 7000000004, 'other_test_bot', 'Other', (select other from t_tokens), repeat('d', 64));
update public.cs_telegram_bots set status = 'revoked' where bot_id = 7000000003;
select public.cs_test_assert(public.cs_telegram_bot_token(7000000003) is null, '1.10 a revoked bot hands out no token');
update public.cs_telegram_bots set status = 'active' where bot_id = 7000000003;
reset role;

-- ---------------------------------------------------------------------------
-- 2. An owner reads only the non-secret columns of their own bots, and writes nothing
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_assert(
  (select count(*) = 2 and bool_and(owner_id = '7e57c0de-0000-4000-8000-0000000000d1')
   from (select id, owner_id, profile_id, bot_id, username, display_name, status, created_at, updated_at from public.cs_telegram_bots) x),
  '2.1 A reads their two bots');
select public.cs_test_expect_error($$select token_secret_id from public.cs_telegram_bots$$, '%permission denied%', '2.2 never the token''s Vault id');
select public.cs_test_expect_error($$select webhook_secret_hash from public.cs_telegram_bots$$, '%permission denied%', '2.3 never the webhook hash');
select public.cs_test_expect_error($$select * from public.cs_telegram_bots$$, '%permission denied%', '2.4 select * is refused');
select public.cs_test_expect_error($$select public.cs_telegram_bot_token(7000000002)$$, '%permission denied%', '2.5 an owner cannot read their token');
select public.cs_test_expect_error($$update public.cs_telegram_bots set username = 'x'$$, '%permission denied%', '2.6 an owner cannot change a bot');
select public.cs_test_expect_error($$delete from public.cs_telegram_bots$$, '%permission denied%', '2.7 an owner cannot delete a bot');
select public.cs_test_expect_error(
  $$insert into public.cs_telegram_bots (owner_id, profile_id, bot_id, username, display_name, token_secret_id, webhook_secret_hash)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'p2', 7000000006, 'x_bot', 'x', gen_random_uuid(), repeat('e', 64))$$,
  '%permission denied%', '2.8 an owner cannot add a bot directly');
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d2","role":"authenticated"}';
select public.cs_test_assert(
  (select count(*) = 1 and bool_and(username = 'other_test_bot') from (select username from public.cs_telegram_bots) x),
  '2.9 B reads only their own bot');
set local request.jwt.claims = '{"role":"authenticated"}';
select public.cs_test_assert((select count(*) from (select id from public.cs_telegram_bots) x) = 0, '2.10 a token with no sub reads nothing');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Removing a bot removes its token from Vault; deleting a user removes theirs
-- ---------------------------------------------------------------------------

set local role service_role;
delete from public.cs_telegram_bots where bot_id = 7000000002;
reset role;
select public.cs_test_assert(
  not exists (select 1 from vault.secrets where name = 'cs_telegram_bot_7000000002')
  and exists (select 1 from vault.secrets where name = 'cs_telegram_bot_7000000003')
  and exists (select 1 from vault.secrets where name = 'cs_telegram_bot_7000000004'),
  '3.1 deleting a bot deletes its Vault secret, and only its own');

delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000d1';
select public.cs_test_assert(
  not exists (select 1 from public.cs_telegram_bots where owner_id = '7e57c0de-0000-4000-8000-0000000000d1')
  and not exists (select 1 from vault.secrets where name = 'cs_telegram_bot_7000000003')
  and exists (select 1 from vault.secrets where name = 'cs_telegram_bot_7000000004'),
  '3.2 deleting a user deletes their bots and those tokens, and leaves the other adviser''s');

select public.cs_test_assert(
  (select count(*) from vault.secrets where name = 'cs_telegram_cron_secret') = 1,
  '3.3 026''s cron secret is untouched');

-- ---------------------------------------------------------------------------

do $$ begin raise notice 'telegram bots tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
