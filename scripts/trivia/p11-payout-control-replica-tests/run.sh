#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "$BASH_SOURCE")/../../.." && pwd)"
pg_bin="$(printenv P11_PAYOUT_POSTGRES_BIN 2>/dev/null || true)"
if [[ -z "$pg_bin" ]]; then pg_bin="$(printenv PHASE6_POSTGRES_BIN 2>/dev/null || true)"; fi
if [[ -z "$pg_bin" ]]; then
  for candidate in /usr/lib/postgresql/17/bin /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin /usr/local/pgsql/bin; do
    if [[ -x "$candidate/postgres" ]]; then pg_bin="$candidate"; break; fi
  done
fi
for binary in postgres initdb pg_ctl psql createdb pg_config; do
  [[ -x "$pg_bin/$binary" ]] || { echo "Phase 11 payout control gate requires PostgreSQL 17 binary: $binary" >&2; exit 2; }
done
[[ "$("$pg_bin/postgres" --version)" == *" 17."* ]] || { echo "Phase 11 payout control gate requires exact PostgreSQL 17" >&2; exit 2; }

tmp_parent="$(printenv P11_PAYOUT_TMP_PARENT 2>/dev/null || true)"
if [[ -z "$tmp_parent" ]]; then tmp_parent="$(printenv RUNNER_TEMP 2>/dev/null || true)"; fi
if [[ -z "$tmp_parent" ]]; then echo "Set P11_PAYOUT_TMP_PARENT to an existing scratch parent" >&2; exit 2; fi
if [[ "$(uname -s)" == "Darwin" && "$tmp_parent" != /Volumes/SmarterWork/agent-work && "$tmp_parent" != /Volumes/SmarterWork/agent-work/* ]]; then
  echo "macOS replica scratch must live under /Volumes/SmarterWork/agent-work" >&2; exit 2
fi
[[ -d "$tmp_parent" ]] || { echo "Replica scratch parent does not exist: $tmp_parent" >&2; exit 2; }

work_root="$(mktemp -d "$tmp_parent/p11-payout-control-pg17.XXXXXX")"
data_dir="$work_root/data"
socket_dir="$work_root/socket"
mkdir -p "$socket_dir"
port="$((56432 + ($$ % 800)))"
started=0
cleanup() {
  rc=$?
  trap - EXIT INT TERM
  if [[ "$started" -eq 1 ]]; then "$pg_bin/pg_ctl" -D "$data_dir" -m immediate -w stop >/dev/null 2>&1 || true; fi
  case "$work_root" in "$tmp_parent"/p11-payout-control-pg17.*) rm -rf -- "$work_root" ;; *) rc=3 ;; esac
  exit "$rc"
}
trap cleanup EXIT INT TERM

pg_share="$("$pg_bin/pg_config" --sharedir)"
"$pg_bin/initdb" -L "$pg_share" --no-sync -D "$data_dir" -U postgres --auth=trust -c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap >/dev/null
if ! "$pg_bin/pg_ctl" -D "$data_dir" -l "$work_root/postgres.log" -o "-F -k $socket_dir -p $port -c listen_addresses=''" -w start >/dev/null; then
  cat "$work_root/postgres.log" >&2
  exit 1
fi
started=1
"$pg_bin/createdb" -h "$socket_dir" -p "$port" -U postgres p11_payout_control

psql=("$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -U postgres -d p11_payout_control)
"${psql[@]}" -f "$repo_root/scripts/trivia/p11-payout-control-replica-tests/00_fixture.sql"
p11_migration="$repo_root/supabase/migrations/20261006053300_trivia_p11_payout_control_authority.sql"
predecessors_sql="$work_root/predecessors.sql"
rollback_sql="$work_root/rollback.sql"
node "$repo_root/scripts/trivia/p11-payout-control-replica-tests/extract-sql.mjs" predecessors \
  "$repo_root/supabase/migrations/20260930043221_trivia_p2_ledger_foundation.sql" \
  "$repo_root/supabase/migrations/20261005234000_trivia_p11_operations_authority.sql" \
  "$predecessors_sql"
"${psql[@]}" -f "$predecessors_sql"
"${psql[@]}" -f "$p11_migration"
"$pg_bin/createdb" -h "$socket_dir" -p "$port" -U postgres \
  --template=p11_payout_control p11_payout_control_rollback
rollback_psql=("$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -U postgres -d p11_payout_control_rollback)
node "$repo_root/scripts/trivia/p11-payout-control-replica-tests/extract-sql.mjs" rollback \
  "$p11_migration" "$rollback_sql"
"${rollback_psql[@]}" -f "$rollback_sql"
"${psql[@]}" -f "$repo_root/scripts/trivia/p11-payout-control-replica-tests/10_assertions.sql"

role_sql="SELECT pg_catalog.set_config('request.jwt.claim.role','service_role',false);"
operator="11111111-1111-4111-8111-111111111111"
d_target="dddddddd-dddd-4ddd-8ddd-ddddddddddd4"
e_target="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5"

"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_operator_execute_v1('$operator','race-hold-key-01','payout_hold','Concurrent hold request one for settlement serialization.','$d_target','{}'::jsonb);" >"$work_root/race-d1.out" & p1=$!
"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_operator_execute_v1('$operator','race-hold-key-02','payout_hold','Concurrent hold request two for settlement serialization.','$d_target','{}'::jsonb);" >"$work_root/race-d2.out" & p2=$!
wait "$p1"; wait "$p2"

"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_operator_execute_v1('$operator','race-same-key-01','payout_hold','Concurrent identical retry for exact once settlement hold.','$e_target','{}'::jsonb);" >"$work_root/race-e1.out" & p3=$!
"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_operator_execute_v1('$operator','race-same-key-01','payout_hold','Concurrent identical retry for exact once settlement hold.','$e_target','{}'::jsonb);" >"$work_root/race-e2.out" & p4=$!
wait "$p3"; wait "$p4"

"${psql[@]}" -f "$repo_root/scripts/trivia/p11-payout-control-replica-tests/20_concurrency.sql"
"${rollback_psql[@]}" -f "$repo_root/scripts/trivia/p11-payout-control-replica-tests/30_rollback_acl.sql"
echo "p11-payout-control-pg17 PASS postgres=$("$pg_bin/postgres" --version)"
