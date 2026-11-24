#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "$BASH_SOURCE")/../../.." && pwd)"
pg_bin="$(printenv P11_ALERT_POSTGRES_BIN 2>/dev/null || true)"
if [[ -z "$pg_bin" ]]; then pg_bin="$(printenv PHASE6_POSTGRES_BIN 2>/dev/null || true)"; fi
if [[ -z "$pg_bin" ]]; then
  for candidate in /usr/lib/postgresql/17/bin /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin /usr/local/pgsql/bin; do
    if [[ -x "$candidate/postgres" ]]; then pg_bin="$candidate"; break; fi
  done
fi
for binary in postgres initdb pg_ctl psql createdb pg_config; do
  [[ -x "$pg_bin/$binary" ]] || { echo "Phase 11 alert/kill-switch gate requires PostgreSQL 17 binary: $binary" >&2; exit 2; }
done
[[ "$("$pg_bin/postgres" --version)" == *" 17."* ]] || { echo "Phase 11 alert/kill-switch gate requires exact PostgreSQL 17" >&2; exit 2; }

tmp_parent="$(printenv P11_ALERT_TMP_PARENT 2>/dev/null || true)"
if [[ -z "$tmp_parent" ]]; then tmp_parent="$(printenv RUNNER_TEMP 2>/dev/null || true)"; fi
if [[ -z "$tmp_parent" ]]; then echo "Set P11_ALERT_TMP_PARENT or RUNNER_TEMP to an existing scratch parent" >&2; exit 2; fi
if [[ "$(uname -s)" == "Darwin" && "$tmp_parent" != /Volumes/SmarterWork/agent-work && "$tmp_parent" != /Volumes/SmarterWork/agent-work/* ]]; then
  echo "macOS replica scratch must live under /Volumes/SmarterWork/agent-work" >&2; exit 2
fi
[[ -d "$tmp_parent" ]] || { echo "Replica scratch parent does not exist: $tmp_parent" >&2; exit 2; }

work_root="$(mktemp -d "$tmp_parent/p11ad.XXXXXX")"
data_dir="$work_root/d"
socket_dir="$work_root/s"
mkdir -p "$socket_dir"
port="$((58100 + ($$ % 400)))"
started=0
cleanup() {
  rc=$?
  trap - EXIT INT TERM
  if [[ "$started" -eq 1 ]]; then "$pg_bin/pg_ctl" -D "$data_dir" -m immediate -w stop >/dev/null 2>&1 || true; fi
  case "$work_root" in "$tmp_parent"/p11ad.*) rm -rf -- "$work_root" ;; *) rc=3 ;; esac
  exit "$rc"
}
trap cleanup EXIT INT TERM

pg_share="$("$pg_bin/pg_config" --sharedir)"
"$pg_bin/initdb" -L "$pg_share" --no-sync -D "$data_dir" -U postgres --auth=trust -c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap >/dev/null
if ! "$pg_bin/pg_ctl" -D "$data_dir" -l "$work_root/pg.log" -o "-F -k $socket_dir -p $port -c listen_addresses=''" -w start >/dev/null; then
  cat "$work_root/pg.log" >&2
  exit 1
fi
started=1
"$pg_bin/createdb" -h "$socket_dir" -p "$port" -U postgres p11_alert_drills

psql=("$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -U postgres -d p11_alert_drills)
drill_dir="$repo_root/scripts/trivia/p11-alert-killswitch-replica-tests"
"${psql[@]}" -q -f "$drill_dir/00_fixture.sql"
"${psql[@]}" -q -f "$repo_root/supabase/migrations/20261005234000_trivia_p11_operations_authority.sql"
"${psql[@]}" -f "$drill_dir/10_drills.sql"
echo "p11-alert-killswitch-drills-pg17 PASS postgres=$("$pg_bin/postgres" --version)"
