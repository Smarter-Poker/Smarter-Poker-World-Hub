#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "$BASH_SOURCE")/../../.." && pwd)"
pg_bin="$(printenv P12_CUTOVER_POSTGRES_BIN 2>/dev/null || true)"
if [[ -z "$pg_bin" ]]; then
  pg_bin="$(printenv PHASE6_POSTGRES_BIN 2>/dev/null || true)"
fi
if [[ -z "$pg_bin" ]]; then
  for candidate in \
    /usr/lib/postgresql/17/bin \
    /opt/homebrew/opt/postgresql@17/bin \
    /usr/local/opt/postgresql@17/bin \
    /usr/local/pgsql/bin
  do
    if [[ -x "$candidate/postgres" ]]; then
      pg_bin="$candidate"
      break
    fi
  done
fi

for binary in postgres initdb pg_ctl psql createdb pg_config; do
  [[ -x "$pg_bin/$binary" ]] || {
    echo "Phase 12 cutover replica gate requires PostgreSQL 17 binary: $binary" >&2
    exit 2
  }
done
[[ "$("$pg_bin/postgres" --version)" == *" 17."* ]] || {
  echo "Phase 12 cutover replica gate requires exact PostgreSQL 17" >&2
  exit 2
}

tmp_parent="$(printenv P12_CUTOVER_TMP_PARENT 2>/dev/null || true)"
if [[ -z "$tmp_parent" ]]; then
  tmp_parent="$(printenv RUNNER_TEMP 2>/dev/null || true)"
fi
if [[ -z "$tmp_parent" ]]; then
  echo "Set P12_CUTOVER_TMP_PARENT to an existing scratch parent" >&2
  exit 2
fi
if [[ "$(uname -s)" == "Darwin"
      && "$tmp_parent" != /Volumes/SmarterWork/agent-work
      && "$tmp_parent" != /Volumes/SmarterWork/agent-work/* ]]; then
  echo "macOS replica scratch must live under /Volumes/SmarterWork/agent-work" >&2
  exit 2
fi
[[ -d "$tmp_parent" ]] || {
  echo "Replica scratch parent does not exist: $tmp_parent" >&2
  exit 2
}

space_kb() {
  df -Pk "$tmp_parent" | awk 'NR == 2 { print $4 }'
}

before_kb="$(space_kb)"
echo "p12-cutover-pg17 space_before_kb=$before_kb"
if (( before_kb < 524288 )); then
  echo "Phase 12 cutover replica gate requires at least 524288 KiB free scratch space" >&2
  exit 2
fi
work_root="$(mktemp -d "$tmp_parent/p12pg.XXXXXX")"
data_dir="$work_root/data"
socket_dir="$work_root"
# Unix sockets have a short platform path limit; do not add a nested directory.
mkdir -p "$socket_dir"
port="$((55432 + ($$ % 1000)))"
started=0

cleanup() {
  rc=$?
  trap - EXIT INT TERM
  if [[ "$started" -eq 1 ]]; then
    "$pg_bin/pg_ctl" -D "$data_dir" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  case "$work_root" in
    "$tmp_parent"/p12pg.*) rm -rf -- "$work_root" ;;
    *) echo "Refusing unsafe replica cleanup target: $work_root" >&2; rc=3 ;;
  esac
  after_kb="$(space_kb)"
  echo "p12-cutover-pg17 space_after_kb=$after_kb"
  exit "$rc"
}
trap cleanup EXIT INT TERM

bootstrap_bin="$work_root/bootstrap-bin"
mkdir -p "$bootstrap_bin"
cp "$pg_bin/initdb" "$bootstrap_bin/initdb"
cp "$repo_root/scripts/trivia/p12-cutover-replica-tests/postgres-mmap-wrapper.sh" \
  "$bootstrap_bin/postgres"
chmod 700 "$bootstrap_bin/initdb" "$bootstrap_bin/postgres"
export P12_REAL_POSTGRES="$pg_bin/postgres"
pg_share="$("$pg_bin/pg_config" --sharedir)"

"$bootstrap_bin/initdb" -L "$pg_share" --no-sync \
  -D "$data_dir" -U postgres --auth=trust \
  -c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap >/dev/null
"$pg_bin/pg_ctl" -D "$data_dir" \
  -o "-F -k $socket_dir -p $port -c listen_addresses=''" \
  -l "$work_root/postgres.log" -w start >/dev/null || {
    cat "$work_root/postgres.log" >&2
    exit 1
  }
started=1
"$pg_bin/createdb" -h "$socket_dir" -p "$port" -U postgres p12_cutover

run_psql() {
  "$pg_bin/psql" -X -v ON_ERROR_STOP=1 \
    -h "$socket_dir" -p "$port" -U postgres -d p12_cutover "$@"
}

run_psql -f "$repo_root/scripts/trivia/p12-cutover-replica-tests/00_fixture.sql"
run_psql -f "$repo_root/supabase/migrations/20261006014200_trivia_p12_competitive_cutover_authority.sql"
run_psql -f "$repo_root/supabase/migrations/20261008181229_trivia_zero_canary_funding_validation.sql"
run_psql -f "$repo_root/scripts/trivia/p12-cutover-replica-tests/10_assertions.sql"
run_psql -f "$repo_root/scripts/trivia/p12-cutover-replica-tests/20_metrics_before.sql"
run_psql -f "$repo_root/supabase/migrations/20261008153740_trivia_metrics_use_builtin_wall_clock.sql"
run_psql -f "$repo_root/scripts/trivia/p12-cutover-replica-tests/30_metrics_after.sql"

run_psql -f "$repo_root/scripts/trivia/p12-cutover-replica-tests/40_canary_funding.sql"

# Exercise the exact documented forward rollback, then reapply the guarded
# correction in this disposable database. Production history is never replayed.
sed -n '/^\/\*$/,/^\*\/$/{ /^\/\*$/d; /^\*\/$/d; p; }' \
  "$repo_root/supabase/migrations/20261008181229_trivia_zero_canary_funding_validation.sql" | run_psql
run_psql -c "DO \$rollback\$ BEGIN IF md5(pg_get_functiondef('public.trivia_competitive_tournament_canary_ready_v1(uuid,integer,boolean)'::regprocedure)) <> '8735454d414ecd263951bb6b867a9a48' THEN RAISE EXCEPTION 'forward rollback did not restore predecessor'; END IF; END \$rollback\$;"
run_psql -f "$repo_root/supabase/migrations/20261008181229_trivia_zero_canary_funding_validation.sql"
run_psql -f "$repo_root/scripts/trivia/p12-cutover-replica-tests/40_canary_funding.sql"

peak_kb="$(space_kb)"
echo "p12-cutover-pg17 space_peak_free_kb=$peak_kb"
echo "p12-cutover-pg17 PASS postgres=$("$pg_bin/postgres" --version)"
