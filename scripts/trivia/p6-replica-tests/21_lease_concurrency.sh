#!/bin/bash
# Gate: two scheduler processes racing (active/passive failover). Real parallel sessions.
set -euo pipefail
DB=$1
q() { psql -d "$DB" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
q "SELECT p6test.set_clock(NULL)" >/dev/null   # real clock for real concurrency
# 1) Simultaneous acquire: exactly one owner.
( q "BEGIN; SELECT public.trivia_tournament_scheduler_acquire('proc-1', 60)->>'owner'; SELECT pg_sleep(2); COMMIT;" > /tmp/p6_lc1 ) &
sleep 0.4
( q "SELECT public.trivia_tournament_scheduler_acquire('proc-2', 60)->>'owner'" > /tmp/p6_lc2 ) &
wait
o1=$(grep -E 'true|false' /tmp/p6_lc1 | head -1); o2=$(grep -E 'true|false' /tmp/p6_lc2 | head -1)
echo "race: proc-1 owner=$o1 proc-2 owner=$o2"
[ "$o1" = "true" ] && [ "$o2" = "false" ] || { echo "FAIL: not exactly one owner"; exit 1; }
# 2) Fence under load: owner proc-1 holds a fenced transaction while its lease expires;
#    proc-2's takeover waits for it, then proc-1's next call is refused.
TOK=$(q "SELECT fencing_token FROM public.trivia_tournament_scheduler_leases")
( q "BEGIN; SELECT public.trivia_tournament_assert_fence($TOK); SELECT public.trivia_tournament_reconcile_schedule($TOK, NULL, 8)->>'created'; SELECT pg_sleep(3); COMMIT;" > /tmp/p6_lc3 ) &
sleep 0.5
q "SELECT p6test.set_clock(clock_timestamp() + interval '120 seconds')" >/dev/null   # lease is now logically expired
START=$(date +%s)
NEW=$(q "SELECT public.trivia_tournament_scheduler_acquire('proc-2', 60)->>'fencing_token'")
WAITED=$(( $(date +%s) - START ))
wait
echo "takeover token=$NEW after waiting ${WAITED}s for the in-flight owner transaction"
[ "$NEW" = "$((TOK + 1))" ] || { echo "FAIL: takeover token"; exit 1; }
[ "$WAITED" -ge 2 ] || { echo "FAIL: takeover did not wait for the in-flight owner transaction"; exit 1; }
STALE=$(q "DO \$\$ BEGIN PERFORM public.trivia_tournament_scheduler_tick(gen_random_uuid(), $TOK, true, 10); RAISE EXCEPTION 'not fenced'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'stale_fencing_token' THEN RAISE; END IF; END \$\$; SELECT 'fenced'")
echo "old owner after takeover: $STALE"
[ "$STALE" = "fenced" ] || { echo "FAIL: stale owner not fenced"; exit 1; }
q "SELECT public.trivia_tournament_scheduler_release(NULL, $NEW)" >/dev/null
q "SELECT p6test.set_clock(NULL)" >/dev/null
echo '{"suite":"lease_concurrency","pass":true}'
