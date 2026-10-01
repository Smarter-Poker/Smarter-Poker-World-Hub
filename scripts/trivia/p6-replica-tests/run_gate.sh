#!/bin/bash
# Phase 6 replica gate: each suite in its own fresh copy of p6_base (replica +
# Phase 2/3/5 migrations + prod question data), engine migration + fixtures applied.
set -u
export PGHOST=$T/db PGPORT=55432 PGUSER=postgres
P=$T/tmp/p6; OUT=$T/evidence/p6-tournament/gate; mkdir -p $OUT
cat $P/sql/0*.sql > $P/engine.sql
SUITES=${SUITES:-"10_schedule_dst 20_lease 30_population 40_event_140 50_event_256_failures 60_cancel_cap 70_acl_fence 80_canary_512"}
run_suite() {
  s=$1; db="p6_g${s%%_*}"
  dropdb --if-exists $db >/dev/null 2>&1; createdb -T p6_base $db
  { psql -d $db -X -q -1 -v ON_ERROR_STOP=1 -f $P/engine.sql 2>&1 | grep -v -E "NOTICE|^ *$|^-+$|ensure_horse_personas|^\(1 row\)| 0$"
    psql -d $db -X -q -v ON_ERROR_STOP=1 -f $P/tests/00_fixtures.sql 2>&1 | grep -E "ERROR|FAIL" 
    start=$(date +%s)
    psql -d $db -X -At -v ON_ERROR_STOP=1 -f $P/tests/$s.sql 2>&1 | grep -v NOTICE
    rc=${PIPESTATUS[0]}
    if [ "$s" = "20_lease" ]; then bash $P/tests/21_lease_concurrency.sh $db 2>&1; rc=$((rc + $?)); fi
    if [ "$s" = "40_event_140" ]; then bash $P/tests/41_concurrency.sh $db 2>&1; rc=$((rc + $?)); fi
    echo "SUITE $s rc=$rc seconds=$(( $(date +%s) - start ))"
  } > $OUT/$s.log 2>&1
}
for s in $SUITES; do run_suite $s & done
wait
for s in $SUITES; do tail -1 $OUT/$s.log; grep -E '"suite"' $OUT/$s.log | tail -1 | cut -c1-400; grep -m3 -E "ERROR|FAIL" $OUT/$s.log; done
