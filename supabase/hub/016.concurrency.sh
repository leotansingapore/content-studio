#!/bin/bash
# Concurrency checks for 016: the 10-device cap holds when saves arrive in
# parallel, and a sent-log item is claimed, or an abandoned email claim taken
# again, by exactly one of many parallel runs (so nothing goes out twice).
#
# THROWAWAY DATABASES ONLY. It commits rows and needs superuser to seed. Run it
# on a fresh local cluster with 016 applied:
#
#   CS_THROWAWAY_DB=1 PSQL="psql -h /tmp/csnf -U postgres -d postgres" \
#     supabase/hub/016.concurrency.sh
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

A=7e57c0de-0000-4000-8000-0000000000c1
q "insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
   values ('00000000-0000-0000-0000-000000000000', '$A', 'authenticated', 'authenticated',
           'cs-conc-c1@example.test', '', now(), '{}', '{}', now(), now())
   on conflict (id) do nothing;" >/dev/null

# 1. 30 devices saved in parallel, 20 at a time: exactly 10 stay.
AS_A="set role authenticated; set request.jwt.claims = '{\"sub\":\"$A\",\"role\":\"authenticated\"}';"
seq 30 | xargs -P 20 -I{} "${P[@]}" -qtA -c "$AS_A select public.cs_save_push_subscription(
  'https://fcm.googleapis.com/fcm/send/conc-{}', 'B' || repeat('a', 86), repeat('k', 22));" >/dev/null 2>&1
check "1 device cap holds under parallel saves" 10 \
  "$(q "select count(*) from public.cs_push_subscriptions where user_id = '$A';")"

# 2. 20 parallel claims of one item: one row, and exactly one claimer got it back.
claimers() { # sql -> how many parallel callers got 'email:conc' back
  seq 20 | xargs -P 20 -I{} "${P[@]}" -qtA -c "set role service_role; $1" 2>/dev/null | grep -c '^email:conc$'
}
check "2 one parallel claimer wins the item" 1 \
  "$(claimers "select public.cs_notify_claim('$A', array['email:conc'], interval '30 minutes');")"
check "2b the item is stored once" 1 \
  "$(q "select count(*) from public.cs_notify_sent where user_id = '$A' and item = 'email:conc';")"

# 3. The run that claimed it died 31 minutes ago: 20 parallel runs retake it, one wins.
q "update public.cs_notify_sent set claimed_at = now() - interval '31 minutes' where user_id = '$A';" >/dev/null
check "3 one parallel run retakes an abandoned email claim" 1 \
  "$(claimers "select public.cs_notify_claim('$A', array['email:conc'], interval '30 minutes');")"

q "delete from auth.users where id = '$A';" >/dev/null
[ "$fails" -eq 0 ] && echo "concurrency checks: all passed" || { echo "concurrency checks: $fails failed"; exit 1; }
