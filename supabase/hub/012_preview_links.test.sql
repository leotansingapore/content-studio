-- Tests for 012_preview_links.sql. Run AFTER 011 and 012 are applied, as the
-- migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/012_preview_links.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "preview link tests: all passed".

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

-- A ...b1 shares links. B ...b2 is another adviser.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '7e57c0de-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated',
   'cs-test-adviser@example.test', '', now(), '{}', '{"full_name":"Ada Adviser"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '7e57c0de-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated',
   'cs-test-other@example.test', '', now(), '{}', '{}', now(), now());

-- ---------------------------------------------------------------------------
-- 0. Catalog: exactly the privileges the header describes
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not has_table_privilege('anon', 'public.cs_preview_links', 'select,insert,update,delete,truncate,references,trigger')
  and not has_table_privilege('anon', 'public.cs_preview_comments', 'select,insert,update,delete,truncate,references,trigger'),
  '0.1 anon holds no table privilege');
select public.cs_test_assert(
  has_table_privilege('authenticated', 'public.cs_preview_links', 'select')
  and not has_table_privilege('authenticated', 'public.cs_preview_links', 'insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.cs_preview_comments', 'insert,update,delete,truncate'),
  '0.2 authenticated may only select');
select public.cs_test_assert(
  not has_sequence_privilege('anon', 'public.cs_preview_comments_id_seq', 'usage,select,update')
  and not has_sequence_privilege('authenticated', 'public.cs_preview_comments_id_seq', 'usage,select,update'),
  '0.3 nobody client-side can use the comment sequence');
select public.cs_test_assert(
  not has_function_privilege('anon', 'public.cs_create_preview_link(text, text, text, text, text, text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.cs_revoke_preview_link(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cs_reply_preview_link(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.cs_preview_link_view(text)', 'execute')
  and not has_function_privilege('anon', 'public.cs_preview_link_comment(text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.cs_preview_token_hash(text)', 'execute'),
  '0.4 anon can execute none of the functions');
select public.cs_test_assert(
  not has_function_privilege('authenticated', 'public.cs_preview_link_view(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_preview_link_comment(text, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.cs_preview_link_view(text)', 'execute')
  and has_function_privilege('service_role', 'public.cs_preview_link_comment(text, text, text)', 'execute'),
  '0.5 the public-page functions are service_role only');
select public.cs_test_assert(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=public'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('cs_create_preview_link', 'cs_revoke_preview_link', 'cs_reply_preview_link',
                       'cs_preview_link_view', 'cs_preview_link_comment')),
  '0.6 every writer is SECURITY DEFINER with search_path pinned');

-- ---------------------------------------------------------------------------
-- 1. anon can do nothing
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select public.cs_test_expect_error($$select count(*) from public.cs_preview_links$$,
  '%permission denied%', '1.1 anon cannot read links');
select public.cs_test_expect_error($$select count(*) from public.cs_preview_comments$$,
  '%permission denied%', '1.2 anon cannot read comments');
select public.cs_test_expect_error($$select public.cs_create_preview_link('d', 't', 'linkedin', 'text-post', 'x')$$,
  '%permission denied%', '1.3 anon cannot create a link');
select public.cs_test_expect_error($$select public.cs_preview_link_view(repeat('a', 43))$$,
  '%permission denied%', '1.4 anon cannot call the page reader');
select public.cs_test_expect_error($$select public.cs_preview_link_comment(repeat('a', 43), 'n', 'b')$$,
  '%permission denied%', '1.5 anon cannot call the comment writer');
select public.cs_test_expect_error(
  $$insert into public.cs_preview_comments (link_id, author_name, body) values (gen_random_uuid(), 'x', 'y')$$,
  '%permission denied%', '1.6 anon cannot insert a comment');

reset role;

-- ---------------------------------------------------------------------------
-- 2. Adviser A shares a draft
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';

select set_config('cs_test.link_1', public.cs_create_preview_link(
  'draft-1', '  3 money habits  ', 'linkedin', 'text-post', E'\r\n  First version of the post.  \n'
)::text, true);

select set_config('cs_test.token_1', current_setting('cs_test.link_1')::jsonb ->> 'token', true);
select set_config('cs_test.link_1_id', current_setting('cs_test.link_1')::jsonb ->> 'id', true);

select public.cs_test_assert(current_setting('cs_test.token_1') ~ '^[A-Za-z0-9_-]{43}$',
  '2.1 the token is 43 base64url characters');
select public.cs_test_assert(
  (select token_hash = encode(sha256(convert_to(current_setting('cs_test.token_1'), 'UTF8')), 'hex')
   from public.cs_preview_links where id = current_setting('cs_test.link_1_id')::uuid),
  '2.2 only the sha256 of the token is stored');
select public.cs_test_assert(
  (select count(*) from public.cs_preview_links l
   where position(current_setting('cs_test.token_1') in l::text) > 0) = 0,
  '2.3 the raw token appears in no column');
select public.cs_test_assert(
  (select content = 'First version of the post.' and title = '3 money habits' and sender_name = 'Ada Adviser'
     and expires_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 minute'
   from public.cs_preview_links where id = current_setting('cs_test.link_1_id')::uuid),
  '2.4 snapshot is normalised, named from the account and expires in 14 days');

select public.cs_test_expect_error($$select public.cs_preview_link_view('x')$$,
  '%permission denied%', '2.5 a signed-in user cannot call the page reader');
select public.cs_test_expect_error($$select public.cs_preview_link_comment('x', 'n', 'b')$$,
  '%permission denied%', '2.6 a signed-in user cannot call the comment writer');
select public.cs_test_expect_error(
  format('update public.cs_preview_links set revoked_at = null where id = %L', current_setting('cs_test.link_1_id')),
  '%permission denied%', '2.7 the owner cannot update a link directly');
select public.cs_test_expect_error(
  format('insert into public.cs_preview_comments (link_id, author_name, body) values (%L, %L, %L)',
    current_setting('cs_test.link_1_id'), 'Fake', 'Approved'),
  '%permission denied%', '2.8 the owner cannot insert a reviewer comment directly');
select public.cs_test_expect_error(
  format('delete from public.cs_preview_links where id = %L', current_setting('cs_test.link_1_id')),
  '%permission denied%', '2.9 the owner cannot delete a link directly');

select public.cs_test_expect_error($$select public.cs_create_preview_link('d', 't', 'linkedin', 'text-post', 'x', null, 0)$$,
  '%1 to 30 days%', '2.10 zero days refused');
select public.cs_test_expect_error($$select public.cs_create_preview_link('d', 't', 'linkedin', 'text-post', 'x', null, 31)$$,
  '%1 to 30 days%', '2.11 more than 30 days refused');
select public.cs_test_expect_error($$select public.cs_create_preview_link('d', 't', 'LinkedIn!', 'text-post', 'x')$$,
  '%no valid platform%', '2.12 platform shape checked');
select public.cs_test_expect_error($$select public.cs_create_preview_link('d', 't', 'linkedin', 'text-post', E' \n ')$$,
  '%no post text%', '2.13 empty post refused');
select public.cs_test_expect_error(format('select public.cs_create_preview_link(%L, %L, %L, %L, %L)',
    'd', 't', 'linkedin', 'text-post', repeat('x', 20001)),
  '%too long%', '2.14 post over 20,000 characters refused');

reset role;

-- ---------------------------------------------------------------------------
-- 3. The public page (service_role, as the edge function calls it)
-- ---------------------------------------------------------------------------

set local role service_role;

select public.cs_test_assert(
  (select v ->> 'content' = 'First version of the post.'
     and v ->> 'sender_name' = 'Ada Adviser'
     and v ->> 'title' = '3 money habits'
     and (v ->> 'superseded')::boolean = false
     and jsonb_array_length(v -> 'comments') = 0
     and not (v ? 'id') and not (v ? 'owner_id') and not (v ? 'draft_id') and not (v ? 'token_hash')
   from (select public.cs_preview_link_view(current_setting('cs_test.token_1')) v) x),
  '3.1 a live token shows the snapshot and nothing that identifies the account');
select public.cs_test_assert(public.cs_preview_link_view(repeat('A', 43)) is null,
  '3.2 an unknown token shows nothing');
select public.cs_test_assert(public.cs_preview_link_view(current_setting('cs_test.token_1') || 'x') is null,
  '3.3 a malformed token shows nothing');
select public.cs_test_assert(public.cs_preview_link_view(null) is null,
  '3.4 a null token shows nothing');

select public.cs_test_assert(
  (public.cs_preview_link_comment(current_setting('cs_test.token_1'), E'  Carol\tCompliance ', E'Please add the\r\nrisk disclaimer.') ->> 'ok')::boolean,
  '3.5 a reviewer comments with a typed name');
select public.cs_test_assert(
  (public.cs_preview_link_comment(current_setting('cs_test.token_1'), '   ', 'Looks fine') ->> 'error') = 'invalid',
  '3.6 a blank name is refused');
select public.cs_test_assert(
  (public.cs_preview_link_comment(current_setting('cs_test.token_1'), repeat('n', 81), 'Looks fine') ->> 'error') = 'invalid',
  '3.7 a name over 80 characters is refused');
select public.cs_test_assert(
  (public.cs_preview_link_comment(current_setting('cs_test.token_1'), 'Carol', repeat('b', 2001)) ->> 'error') = 'invalid',
  '3.8 a comment over 2,000 characters is refused');
select public.cs_test_assert(
  (public.cs_preview_link_comment(current_setting('cs_test.token_1'), 'Carol', E' \n ') ->> 'error') = 'invalid',
  '3.9 an empty comment is refused');
select public.cs_test_assert(
  (public.cs_preview_link_comment(repeat('A', 43), 'Carol', 'Hi') ->> 'error') = 'not_found',
  '3.10 an unknown token cannot be commented on');

reset role;

select public.cs_test_assert(
  (select author_name = 'Carol Compliance' and body = E'Please add the\nrisk disclaimer.' and not from_owner
   from public.cs_preview_comments where link_id = current_setting('cs_test.link_1_id')::uuid),
  '3.11 name cleaned to one line, comment normalised');

-- ---------------------------------------------------------------------------
-- 4. Owner reads and replies; another adviser sees and does nothing
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b2","role":"authenticated"}';

select public.cs_test_assert((select count(*) from public.cs_preview_links) = 0,
  '4.1 another adviser reads none of A''s links');
select public.cs_test_assert((select count(*) from public.cs_preview_comments) = 0,
  '4.2 another adviser reads none of A''s comments');
select public.cs_test_expect_error(format('select public.cs_reply_preview_link(%L, %L)', current_setting('cs_test.link_1_id'), 'hi'),
  '%wasn''t found%', '4.3 another adviser cannot reply');
select public.cs_test_expect_error(format('select public.cs_revoke_preview_link(%L)', current_setting('cs_test.link_1_id')),
  '%wasn''t found%', '4.4 another adviser cannot revoke');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';

select public.cs_test_assert((select count(*) from public.cs_preview_comments) = 1,
  '4.5 the owner reads the reviewer''s comment');
select public.cs_test_assert(
  (select from_owner and author_name = 'Ada Adviser' and body = 'Added, thanks.'
   from public.cs_reply_preview_link(current_setting('cs_test.link_1_id')::uuid, '  Added, thanks.  ')),
  '4.6 the owner replies under the link''s sender name');
select public.cs_test_expect_error(format('select public.cs_reply_preview_link(%L, %L)', current_setting('cs_test.link_1_id'), ' '),
  '%up to 2,000%', '4.7 an empty reply is refused');

-- Share a new version of the same draft. now() is fixed inside this
-- transaction, so age the first link a minute to give the two an order.
reset role;
update public.cs_preview_links set created_at = created_at - interval '1 minute'
where id = current_setting('cs_test.link_1_id')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';

select set_config('cs_test.token_2', public.cs_create_preview_link(
  'draft-1', '3 money habits', 'linkedin', 'text-post', 'Second version, with the disclaimer.', 'Ada A.', 7
) ->> 'token', true);

reset role;
set local role service_role;

select public.cs_test_assert(
  (select (v ->> 'superseded')::boolean and jsonb_array_length(v -> 'comments') = 2
     and (v -> 'comments' -> 0 ->> 'from_owner')::boolean = false
     and (v -> 'comments' -> 1 ->> 'from_owner')::boolean = true
   from (select public.cs_preview_link_view(current_setting('cs_test.token_1')) v) x),
  '4.8 the old link says a newer version exists and shows both sides in order');
select public.cs_test_assert(
  (select (v ->> 'superseded')::boolean = false and v ->> 'sender_name' = 'Ada A.'
     and jsonb_array_length(v -> 'comments') = 0
   from (select public.cs_preview_link_view(current_setting('cs_test.token_2')) v) x),
  '4.9 the new link is current, uses the typed name and starts with no comments');

reset role;

-- ---------------------------------------------------------------------------
-- 5. Revoked and expired links go dark
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';

select public.cs_revoke_preview_link(current_setting('cs_test.link_1_id')::uuid);
select public.cs_revoke_preview_link(current_setting('cs_test.link_1_id')::uuid);
select public.cs_test_expect_error(format('select public.cs_reply_preview_link(%L, %L)', current_setting('cs_test.link_1_id'), 'hi'),
  '%expired or been turned off%', '5.1 no replies on a revoked link');

reset role;
set local role service_role;

select public.cs_test_assert(public.cs_preview_link_view(current_setting('cs_test.token_1')) is null,
  '5.2 a revoked link shows nothing');
select public.cs_test_assert(
  (public.cs_preview_link_comment(current_setting('cs_test.token_1'), 'Carol', 'Hello?') ->> 'error') = 'not_found',
  '5.3 a revoked link takes no comments');

reset role;

update public.cs_preview_links
set created_at = now() - interval '8 days', expires_at = now() - interval '1 minute'
where token_hash = public.cs_preview_token_hash(current_setting('cs_test.token_2'));

set local role service_role;
select public.cs_test_assert(public.cs_preview_link_view(current_setting('cs_test.token_2')) is null,
  '5.4 an expired link shows nothing');
select public.cs_test_assert(
  (public.cs_preview_link_comment(current_setting('cs_test.token_2'), 'Carol', 'Hello?') ->> 'error') = 'not_found',
  '5.5 an expired link takes no comments');
reset role;

select public.cs_test_expect_error(
  format('update public.cs_preview_links set expires_at = created_at + interval %L where id = %L', '31 days', current_setting('cs_test.link_1_id')),
  '%cs_preview_links_expiry_window%', '5.6 the 30-day ceiling holds for the table owner too');

-- ---------------------------------------------------------------------------
-- 6. Caps
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
select set_config('cs_test.token_3', public.cs_create_preview_link(
  'draft-2', 'Cap test', 'instagram', 'carousel', 'Cap test post') ->> 'token', true);
reset role;
select set_config('cs_test.link_3_id', (select id::text from public.cs_preview_links
  where token_hash = public.cs_preview_token_hash(current_setting('cs_test.token_3'))), true);

set local role service_role;
do $$
begin
  for i in 1..50 loop
    if not (public.cs_preview_link_comment(current_setting('cs_test.token_3'), 'Bot', 'spam ' || i) ->> 'ok')::boolean then
      raise exception 'FAIL 6.1 comment % of 50 was refused', i;
    end if;
  end loop;
end $$;
select public.cs_test_assert(
  (public.cs_preview_link_comment(current_setting('cs_test.token_3'), 'Bot', 'one too many') ->> 'error') = 'rate_limited',
  '6.2 the 51st comment in 24 hours is refused');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.cs_test_expect_error(
  format('select public.cs_reply_preview_link(%L, %L)', current_setting('cs_test.link_3_id'), 'hi'),
  '%comment limit%', '6.3 owner replies count towards the same cap');
reset role;

-- Age those 50 out of the 24-hour window and fill the link to 300 in total.
update public.cs_preview_comments set created_at = now() - interval '2 days'
where link_id = current_setting('cs_test.link_3_id')::uuid;
insert into public.cs_preview_comments (link_id, author_name, body, created_at)
select current_setting('cs_test.link_3_id')::uuid,
       'Old', 'old ' || g, now() - interval '2 days'
from generate_series(1, 250) g;

set local role service_role;
select public.cs_test_assert(
  (public.cs_preview_link_comment(current_setting('cs_test.token_3'), 'Bot', 'over the total') ->> 'error') = 'rate_limited',
  '6.4 a link with 300 comments takes no more, however old they are');
reset role;

-- Daily link cap: fill A's last 24 hours to exactly 50 links.
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
do $$
begin
  for i in 1..(50 - (select count(*) from public.cs_preview_links where created_at > now() - interval '1 day')) loop
    perform public.cs_create_preview_link('draft-cap-' || i, 't', 'linkedin', 'text-post', 'x');
  end loop;
end $$;
select public.cs_test_expect_error($$select public.cs_create_preview_link('draft-51', 't', 'linkedin', 'text-post', 'x')$$,
  '%50 preview links%', '6.5 the 51st link in 24 hours is refused');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b2","role":"authenticated"}';
select public.cs_test_assert(
  (public.cs_create_preview_link('b-draft', 't', 'linkedin', 'text-post', 'x') ->> 'token') is not null,
  '6.6 the cap is per adviser');
select public.cs_test_assert(
  (select sender_name from public.cs_preview_links) = 'Your adviser',
  '6.7 with no name anywhere the page says "Your adviser", never the email');

-- ---------------------------------------------------------------------------

reset role;
do $$ begin raise notice 'preview link tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
