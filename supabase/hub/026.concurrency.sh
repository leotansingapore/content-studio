#!/bin/bash
# Concurrency checks for 026: under parallel send ticks, no Telegram post is claimed twice, a chat never has two posts
# sending at once, and a claim takes 5 at most. It fails if cs_telegram_claim_due loses `for update of p skip locked`:
# each tick holds its claim open for a moment, so without the lock the waiting ticks claim the same rows again.
#
# THROWAWAY DATABASES ONLY. It commits rows (a new test user, 13 chats, 31 posts per run) and needs superuser to seed;
# it removes nothing. Run it on a fresh local cluster with 026 applied:
#
#   CS_THROWAWAY_DB=1 PSQL="psql -h /tmp/cstg -U postgres -d postgres" supabase/hub/026.concurrency.sh
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

# Every run seeds its own user, so a second run needs no clean-up. 10:00 Singapore time, inside the sending hours.
OWNER=$(q "select gen_random_uuid();")
AT="timestamptz '2026-11-02 10:00:00+08'"
q "insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
   values ('00000000-0000-0000-0000-000000000000', '$OWNER', 'authenticated', 'authenticated',
           'cs-conc-$OWNER@example.test', '', now(), '{}', '{}', now(), now());" >/dev/null
q "insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at, tg_user_id, chat_id, chat_type,
     title, status, connected_at, confirmed_at, login_hash, nonce_hash)
   select '$OWNER', 'me', encode(sha256(convert_to('code $OWNER ' || n, 'UTF8')), 'hex'), now(), 1000 + n, -1008000000000 - n,
          'supergroup', 'Chat ' || n, 'connected', now(), now(),
          encode(sha256(convert_to('login $OWNER ' || n, 'UTF8')), 'hex'), encode(sha256(convert_to('nonce $OWNER ' || n, 'UTF8')), 'hex')
   from generate_series(1, 6) n;" >/dev/null
q "insert into public.cs_telegram_posts (owner_id, profile_id, chat_row, client_key, text, send_at)
   select '$OWNER', 'me', c.id, gen_random_uuid(), 'Post ' || k, $AT - (k || ' minutes')::interval
   from public.cs_telegram_chats c, generate_series(1, 4) k
   where c.owner_id = '$OWNER';" >/dev/null

# One tick: claim, hold the transaction 0.3 s (the rows stay locked), then commit. Prints the ids it claimed.
TICK="begin; set local role service_role; select id from public.cs_telegram_claim_due(5, $AT); select pg_sleep(0.3); commit;"
CLAIMED=$(mktemp)
for round in 1 2 3 4 5 6; do
  # 12 ticks at once
  seq 12 | xargs -P 12 -I{} "${P[@]}" -qtA -c "$TICK" 2>/dev/null | grep -E '^[0-9a-f-]{36}$' >> "$CLAIMED"
  # never two of this run's posts sending in one chat
  two=$(q "select count(*) from (select chat_row from public.cs_telegram_posts where owner_id = '$OWNER' and status = 'sending'
           group by chat_row having count(*) > 1) x;")
  [ "$two" = "0" ] || echo "FAIL round $round: $two chats with two posts sending"
  [ "$two" = "0" ] || fails=$((fails + 1))
  # the round's sends went out: the chats are free for the next round
  q "update public.cs_telegram_posts set status = 'posted', finished_at = now() where owner_id = '$OWNER' and status = 'sending';" >/dev/null
done

check "1 no post is claimed by two ticks" 0 "$(sort "$CLAIMED" | uniq -d | wc -l | tr -d ' ')"
check "2 every post was claimed, once" 24 "$(q "select count(*) from public.cs_telegram_posts where owner_id = '$OWNER' and status = 'posted' and attempts = 1;")"
check "2b and no post was claimed twice in the table either" 0 "$(q "select count(*) from public.cs_telegram_posts where owner_id = '$OWNER' and attempts > 1;")"
# 7 more chats with a post due each: one claim asking for 20 takes 5
q "insert into public.cs_telegram_chats (owner_id, profile_id, code_hash, code_expires_at, tg_user_id, chat_id, chat_type,
     title, status, connected_at, confirmed_at, login_hash, nonce_hash)
   select '$OWNER', 'me', encode(sha256(convert_to('code2 $OWNER ' || n, 'UTF8')), 'hex'), now(), 2000 + n, -1008000000100 - n,
          'supergroup', 'More ' || n, 'connected', now(), now(),
          encode(sha256(convert_to('login2 $OWNER ' || n, 'UTF8')), 'hex'), encode(sha256(convert_to('nonce2 $OWNER ' || n, 'UTF8')), 'hex')
   from generate_series(1, 7) n;
   insert into public.cs_telegram_posts (owner_id, profile_id, chat_row, client_key, text, send_at)
   select '$OWNER', 'me', c.id, gen_random_uuid(), 'More', $AT - interval '1 minute'
   from public.cs_telegram_chats c where c.owner_id = '$OWNER' and c.title like 'More %';" >/dev/null
check "3 a claim takes 5 at most" 5 "$(q "set role service_role; select count(*) from public.cs_telegram_claim_due(20, $AT);")"
q "update public.cs_telegram_posts set status = 'posted', finished_at = now() where owner_id = '$OWNER' and status in ('scheduled', 'sending');" >/dev/null
rm -f "$CLAIMED"
[ "$fails" -eq 0 ] && echo "concurrency checks: all passed" || { echo "concurrency checks: $fails failed"; exit 1; }
