#!/bin/bash
# Concurrency check for 033: two workers claiming at the same moment never get the same job, and the second never
# waits on the first. The first claim holds its row for two seconds; check 5 fails if cs_claim_ai_job loses
# `skip locked` (proved 4 Nov: the second claim then sat out those two seconds).
#
# THROWAWAY DATABASES ONLY. It commits rows (a new test user and three jobs per run) and needs superuser to seed;
# it removes nothing. Run it on a fresh local cluster with 033 applied:
#
#   CS_THROWAWAY_DB=1 PSQL="psql -h /tmp/cspg -U postgres -d postgres" supabase/hub/033.concurrency.sh
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

OWNER=$(q "select gen_random_uuid();")
q "insert into auth.users (id) values ('$OWNER');" >/dev/null
q "insert into public.cs_ai_jobs (owner_id, kind, request, created_at)
   select '$OWNER', 'write', jsonb_build_object('n', n), now() - (n || ' seconds')::interval from generate_series(1, 2) n;" >/dev/null
CLAIM="select id from public.cs_claim_ai_job('w', array['$OWNER']::uuid[], 120)"

# 1: A claims and holds its transaction open; B claims while A still holds the row
OUT_A=$(mktemp)
"${P[@]}" -qtA -v ON_ERROR_STOP=1 -c "begin; $CLAIM; select pg_sleep(2); commit;" >"$OUT_A" &
sleep 0.5
B=$(q "$CLAIM")
wait
A=$(head -1 "$OUT_A")
rm -f "$OUT_A"
check "1 both workers got a job" "2" "$( [ -n "$A" ] && [ -n "$B" ] && echo 2 || echo "A=$A B=$B")"
check "2 never the same job" "different" "$( [ "$A" != "$B" ] && echo different || echo "same $A")"
check "3 both are claimed once" "2" "$(q "select count(*) from public.cs_ai_jobs where owner_id = '$OWNER' and status = 'claimed'")"

# 4: one job left and A holding it: B gets nothing rather than waiting for it
q "insert into public.cs_ai_jobs (owner_id, kind, request) values ('$OWNER', 'hooks', '{}');" >/dev/null
OUT_A=$(mktemp)
"${P[@]}" -qtA -v ON_ERROR_STOP=1 -c "begin; $CLAIM; select pg_sleep(2); commit;" >"$OUT_A" &
sleep 0.5
START=$(date +%s)
B=$(q "$CLAIM")
WAITED=$(( $(date +%s) - START ))
wait
rm -f "$OUT_A"
check "4 the second worker gets nothing" "" "$B"
check "5 without waiting for the first" "0" "$( [ "$WAITED" -lt 1 ] && echo 0 || echo "${WAITED}s")"

[ "$fails" -eq 0 ] && echo "033 concurrency: all passed" || exit 1
