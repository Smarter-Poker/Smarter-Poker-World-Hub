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
    echo "Expired horse replica gate requires PostgreSQL 17 binary: $binary" >&2
    exit 2
  }
done
[[ "$("$pg_bin/postgres" --version)" == *" 17."* ]] || {
  echo "Expired horse replica gate requires exact PostgreSQL 17" >&2
  exit 2
}

tmp_parent="$(printenv TRIVIA_EXPIRED_HORSE_TMP_PARENT 2>/dev/null || printenv P12_CUTOVER_TMP_PARENT 2>/dev/null || true)"
if [[ -z "$tmp_parent" ]]; then
  tmp_parent="$(printenv RUNNER_TEMP 2>/dev/null || true)"
fi
if [[ -z "$tmp_parent" ]]; then
  echo "Set TRIVIA_EXPIRED_HORSE_TMP_PARENT to an existing scratch parent" >&2
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
echo "expired-horse-pg17 space_before_kb=$before_kb"
if (( before_kb < 524288 )); then
  echo "Expired horse replica gate requires at least 524288 KiB free scratch space" >&2
  exit 2
fi
work_root="$(mktemp -d "$tmp_parent/eh.XXXXXX")"
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
    "$tmp_parent"/eh.*) rm -rf -- "$work_root" ;;
    *) echo "Refusing unsafe replica cleanup target: $work_root" >&2; rc=3 ;;
  esac
  after_kb="$(space_kb)"
  echo "expired-horse-pg17 space_after_kb=$after_kb"
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
"$pg_bin/createdb" -h "$socket_dir" -p "$port" -U postgres expired_horse

run_psql() {
  "$pg_bin/psql" -X -v ON_ERROR_STOP=1 \
    -h "$socket_dir" -p "$port" -U postgres -d expired_horse "$@"
}

migration="$repo_root/supabase/migrations/20261008193857_trivia_expired_horse_seat_recovery.sql"
node "$repo_root/scripts/trivia/expired-horse-seat-replica-tests/extract.mjs" "$repo_root" "$work_root" "$migration"
run_psql -f "$repo_root/scripts/trivia/expired-horse-seat-replica-tests/fixture.sql"
run_psql -f "$work_root/prepare_horse_seat.sql" -f "$work_root/resolve_matchup.sql"
run_psql -f "$repo_root/scripts/trivia/expired-horse-seat-replica-tests/before.sql"
run_psql -f "$migration"
run_psql -f "$repo_root/scripts/trivia/expired-horse-seat-replica-tests/boundaries.sql"
run_psql -f "$repo_root/scripts/trivia/expired-horse-seat-replica-tests/assertions.sql"
run_psql -f "$work_root/rollback-refusal.sql"
{ cat "$work_root/rollback.sql"; cat "$repo_root/scripts/trivia/expired-horse-seat-replica-tests/before.sql"; echo ROLLBACK\;; } | run_psql
# Fresh fixture state only: verify guarded reapplication after the exact rollback.
{ cat "$work_root/rollback.sql"; echo COMMIT\;; } | run_psql
run_psql -f "$migration"
run_psql -f "$repo_root/scripts/trivia/expired-horse-seat-replica-tests/assertions.sql"
echo "expired-horse-pg17 PASS postgres=$("$pg_bin/postgres" --version)"
