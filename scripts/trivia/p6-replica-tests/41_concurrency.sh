#!/bin/bash
# Gate: players and the scheduler act on one live event from separate processes
# (like API requests racing worker ticks): no deadlock, no duplicate, zero variance.
set -u
DB=$1
q() { psql -d "$DB" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }
q "SELECT p6test.set_clock(date_trunc('minute', clock_timestamp()) + interval '1 minute')" >/dev/null
TID=$(q "SELECT public.trivia_tournament_create_test_instance('test', 'conc', public.trivia_tournament_clock() + interval '70 minutes', 90, false)->>'tournament_id'")
q "INSERT INTO public.trivia_tournament_canary_access (tournament_id, user_id, approved_by) SELECT '$TID', p6test.human(g), 'p6' FROM generate_series(1, 60) g" >/dev/null
q "SELECT count(*) FROM generate_series(1, 60) g WHERE (public.trivia_tournament_enter('$TID', p6test.human(g), 'conc-nonce-' || g)->>'success')::boolean" >/dev/null
q "DO \$\$ BEGIN FOR i IN 1..70 LOOP PERFORM p6test.advance('1 minute'); PERFORM p6test.tick(); END LOOP; END \$\$" >/dev/null
echo "state after start: $(q "SELECT lifecycle_state FROM public.trivia_tournaments WHERE id = '$TID'")"
ERR=$T/tmp/p6/conc_err.log; : > $ERR
# Players: every request is its own transaction (one API call = one seat).
( for sweep in $(seq 1 12); do for u in $(seq 1 30); do q "SELECT p6test.play_user('$TID', p6test.human($u), 2)" >/dev/null 2>>$ERR; done; done ) &
( for sweep in $(seq 1 12); do for u in $(seq 31 60); do q "SELECT p6test.play_user('$TID', p6test.human($u), 3)" >/dev/null 2>>$ERR; done; done ) &
( for i in $(seq 1 120); do q "SELECT p6test.tick()" >/dev/null 2>>$ERR; q "SELECT p6test.advance('2 seconds')" >/dev/null 2>>$ERR; done ) &
( for i in $(seq 1 120); do q "SELECT p6test.tick(true, 2000, 'standby-dispatcher')" >/dev/null 2>>$ERR; done ) &
wait
DEAD=$(grep -c "deadlock" $ERR); ERRS=$(grep -c "ERROR" $ERR)
echo "parallel phase: deadlocks=$DEAD errors=$ERRS"; grep -m3 "ERROR" $ERR
for i in $(seq 1 1400); do
  S=$(q "SELECT p6test.tick() IS NOT NULL; SELECT p6test.advance('3 seconds'); SELECT lifecycle_state FROM public.trivia_tournaments WHERE id = '$TID'" | tail -1)
  [ "$S" = "settled" ] && break
  [ $((i % 20)) -eq 0 ] && q "SELECT p6test.play_humans('$TID', 0)" >/dev/null 2>>$ERR
done
RES=$(q "SELECT json_build_object('state', t.lifecycle_state, 'results', (SELECT count(*) FROM public.trivia_tournament_results r WHERE r.tournament_id = t.id),
  'entrants', (SELECT count(*) FROM public.trivia_tournament_entrants e WHERE e.tournament_id = t.id AND in_field),
  'paid', s.paid_total, 'gross', s.gross_pool, 'rake', s.rake_amount,
  'escrow', COALESCE((SELECT balance FROM public.trivia_ledger_accounts WHERE account_code = s.escrow_account_code), 0),
  'unresolved', (SELECT count(*) FROM public.trivia_tournament_matchups m WHERE m.tournament_id = t.id AND m.status <> 'resolved'))
  FROM public.trivia_tournaments t JOIN public.trivia_settlements s ON s.subject_type = 'tournament' AND s.subject_id = t.id WHERE t.id = '$TID'")
echo "$RES"
echo "$RES" | grep -q '"state" : "settled"' && echo "$RES" | grep -q '"escrow" : 0' && [ "$DEAD" = "0" ] && [ "$ERRS" = "0" ] \
  && echo '{"suite":"concurrency","pass":true}' || { echo '{"suite":"concurrency","pass":false}'; exit 1; }
