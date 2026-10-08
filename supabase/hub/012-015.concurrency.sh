#!/bin/bash
# Concurrency checks for 012-015: every cap must hold when calls arrive in
# parallel, and a released link-in-bio slug must never be grabbed in the
# moment it is released.
#
# THROWAWAY DATABASES ONLY. It commits rows (review rows are append-only and
# cannot be cleaned up) and needs superuser to seed. Run it on a fresh local
# cluster with 011-015 applied:
#
#   CS_THROWAWAY_DB=1 PSQL="psql -h /tmp/csgt -U postgres -d postgres" \
#     supabase/hub/012-015.concurrency.sh
#
# Prints one PASS/FAIL line per check and exits non-zero on any FAIL.
set -u
if [ "${CS_THROWAWAY_DB:-}" != "1" ]; then
  echo "Refusing to run: set CS_THROWAWAY_DB=1 and point PSQL at a throwaway database." >&2
  exit 2
fi
P=(${PSQL:?set PSQL})
q() { "${P[@]}" -qtA -v ON_ERROR_STOP=1 -c "$1"; }
fails=0
check() { # label expected actual
  if [ "$2" = "$3" ]; then echo "PASS $1 ($3)"; else echo "FAIL $1: expected $2, got $3"; fails=$((fails + 1)); fi
}
# Runs SQL $2 as user $1 (a uuid, or "service") $3 times, 20 at a time.
parallel() {
  local who=$1 sql=$2 n=$3 prefix
  if [ "$who" = service ]; then
    prefix="set role service_role;"
  else
    prefix="set role authenticated; set request.jwt.claims = '{\"sub\":\"$who\",\"role\":\"authenticated\"}';"
  fi
  seq "$n" | xargs -P 20 -I{} "${P[@]}" -qtA -c "$prefix $sql" >/dev/null 2>&1
  return 0
}

A=7e57c0de-0000-4000-8000-0000000000f1   # adviser / team leader
M=7e57c0de-0000-4000-8000-0000000000f2   # team member
B=7e57c0de-0000-4000-8000-0000000000f3   # another adviser

q "insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
   select '00000000-0000-0000-0000-000000000000', u::uuid, 'authenticated', 'authenticated',
          'cs-conc-' || right(u, 2) || '@example.test', '', now(), '{}', '{}', now(), now()
   from unnest(array['$A', '$M', '$B']) u on conflict (id) do nothing;" >/dev/null

as_user() { # uuid sql
  q "set role authenticated; set request.jwt.claims = '{\"sub\":\"$1\",\"role\":\"authenticated\"}'; $2" | tail -n 1
}

# 1. Preview link: reviewer comment cap (50 per 24 h) under 30 parallel posts.
TOKEN=$(as_user "$A" "select public.cs_create_preview_link('conc-1', 't', 'linkedin', 'text-post', 'x') ->> 'token';")
LINK=$(q "select id from public.cs_preview_links where token_hash = public.cs_preview_token_hash('$TOKEN');")
q "insert into public.cs_preview_comments (link_id, author_name, body) select '$LINK', 'Seed', 's' || g from generate_series(1, 45) g;"
parallel service "select public.cs_preview_link_comment('$TOKEN', 'Bot', 'parallel');" 30
check "1 reviewer comment cap holds under parallel posts" 50 \
  "$(q "select count(*) from public.cs_preview_comments where link_id = '$LINK' and not from_owner;")"

# 2. Preview link: 50 links per adviser per 24 h under 30 parallel creates.
parallel "$A" "select public.cs_create_preview_link('conc-cap', 't', 'linkedin', 'text-post', 'x');" 60
check "2 daily link cap holds under parallel creates" 50 \
  "$(q "select count(*) from public.cs_preview_links where owner_id = '$A';")"

# 3. Team comments: 60 per person per hour under parallel posts.
as_user "$A" "select public.cs_create_team('Conc team', 'Lead');" >/dev/null
CODE=$(q "select i.code from public.cs_team_invites i join public.cs_teams t on t.id = i.team_id where t.owner_id = '$A';")
as_user "$M" "select public.cs_join_team('$CODE', 'Member');" >/dev/null
SUB=$(as_user "$M" "select (public.cs_submit_for_review('conc-d', 'linkedin', 'text-post', 'post', '[]')).id;")
q "insert into public.cs_review_comments (submission_id, author_id, author_name, body)
   select '$SUB', '$M', 'Member', 'seed ' || g from generate_series(1, 55) g;"
parallel "$M" "select public.cs_add_review_comment('$SUB', 'parallel');" 30
check "3 hourly comment cap holds under parallel posts" 60 \
  "$(q "select count(*) from public.cs_review_comments where author_id = '$M';")"

# 4. Approval rule: 20 parallel 'on' calls log exactly one change.
parallel "$A" "select public.cs_set_approval_required('$M', true);" 20
check "4 parallel rule changes log once" 1 \
  "$(q "select count(*) from public.cs_review_events where kind = 'approval_rule_set';")"

# 5. Link-in-bio click cap (5,000 per link per day) under parallel clicks.
LINKID=$(as_user "$A" "select links -> 0 ->> 'id' from public.cs_save_bio_page('me', 'conc-page', 'A', '', null, '[{\"label\":\"x\",\"url\":\"https://example.com\"}]');")
PAGE=$(q "select id from public.cs_bio_pages where slug = 'conc-page';")
q "insert into public.cs_bio_clicks (page_id, link_id, day, count) values ('$PAGE', '$LINKID', (now() at time zone 'Asia/Singapore')::date, 4990);"
parallel service "select public.cs_bio_click('conc-page', '$LINKID');" 40
check "5 click cap holds under parallel clicks" 5000 \
  "$(q "select count from public.cs_bio_clicks where page_id = '$PAGE';")"

# 6. A released slug is never grabbed by someone else, even mid-release.
for i in 1 2 3 4 5; do
  as_user "$A" "select public.cs_save_bio_page('p$i', 'race-$i', 'A', '', null, '[]');" >/dev/null
  ( as_user "$A" "select public.cs_save_bio_page('p$i', 'race-$i-new', 'A', '', null, '[]');" >/dev/null 2>&1 ) &
  parallel "$B" "select public.cs_save_bio_page('me', 'race-$i', 'B', '', null, '[]');" 10
  wait
done
check "6 no released slug was taken by someone else" 0 \
  "$(q "select count(*) from public.cs_bio_pages where owner_id = '$B' and slug like 'race-%';")"

[ "$fails" -eq 0 ] && echo "concurrency checks: all passed" || { echo "concurrency checks: $fails failed"; exit 1; }
