#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "$BASH_SOURCE")/../../.." && pwd)"
pg_bin="$(printenv PHASE9_SOLO_POSTGRES_BIN 2>/dev/null || true)"
if [[ -z "$pg_bin" ]]; then pg_bin="$(printenv PHASE6_POSTGRES_BIN 2>/dev/null || true)"; fi
if [[ -z "$pg_bin" ]]; then
  for candidate in /usr/lib/postgresql/17/bin /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin /usr/local/pgsql/bin; do
    if [[ -x "$candidate/postgres" ]]; then pg_bin="$candidate"; break; fi
  done
fi
for binary in postgres initdb pg_ctl psql createdb pg_config; do
  [[ -x "$pg_bin/$binary" ]] || { echo "Phase9 solo authority requires PostgreSQL 17 binary: $binary" >&2; exit 2; }
done
[[ "$("$pg_bin/postgres" --version)" == *" 17."* ]] || { echo "Phase9 solo authority requires exact PostgreSQL 17" >&2; exit 2; }

tmp_parent="$(printenv PHASE9_SOLO_TMP_PARENT 2>/dev/null || true)"
if [[ -z "$tmp_parent" ]]; then tmp_parent="$(printenv RUNNER_TEMP 2>/dev/null || true)"; fi
if [[ -z "$tmp_parent" ]]; then echo "Set PHASE9_SOLO_TMP_PARENT to an existing scratch parent" >&2; exit 2; fi
if [[ "$(uname -s)" == "Darwin" && "$tmp_parent" != /Volumes/SmarterWork/agent-work && "$tmp_parent" != /Volumes/SmarterWork/agent-work/* ]]; then
  echo "macOS replica scratch must live under /Volumes/SmarterWork/agent-work" >&2; exit 2
fi
[[ -d "$tmp_parent" ]] || { echo "Replica scratch parent does not exist: $tmp_parent" >&2; exit 2; }

work_root="$(mktemp -d "$tmp_parent/phase9-solo-pg17.XXXXXX")"
data_dir="$work_root/data"
socket_dir="$work_root/socket"
mkdir -p "$socket_dir"
port="$((57232 + ($$ % 600)))"
started=0
cleanup() {
  rc=$?
  trap - EXIT INT TERM
  if [[ "$started" -eq 1 ]]; then "$pg_bin/pg_ctl" -D "$data_dir" -m immediate -w stop >/dev/null 2>&1 || true; fi
  case "$work_root" in "$tmp_parent"/phase9-solo-pg17.*) rm -rf -- "$work_root" ;; *) rc=3 ;; esac
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
"$pg_bin/createdb" -h "$socket_dir" -p "$port" -U postgres phase9_solo_authority
psql=("$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$socket_dir" -p "$port" -U postgres -d phase9_solo_authority)
"${psql[@]}" -f "$repo_root/scripts/trivia/phase9-solo-authority-replica-tests/00_fixture.sql"
node_bin="$(command -v node 2>/dev/null || true)"
[[ -n "$node_bin" && -x "$node_bin" ]] || { echo "Phase9 predecessor extraction requires Node.js" >&2; exit 2; }
"$node_bin" "$repo_root/scripts/trivia/phase9-solo-authority-replica-tests/extract-predecessors.mjs" \
  "$repo_root/supabase/migrations/20260930043426_trivia_p2_solo_paths_switch.sql" \
  "$repo_root/supabase/migrations/20261005182000_trivia_p8_solo_integrity.sql" \
  "$work_root/predecessors.sql"
"${psql[@]}" -f "$work_root/predecessors.sql"
"${psql[@]}" -f "$repo_root/supabase/migrations/20261006061400_trivia_phase9_retire_generic_lifeline_spend.sql"
"${psql[@]}" -f "$repo_root/scripts/trivia/phase9-solo-authority-replica-tests/05_cutover_assertions.sql"
"${psql[@]}" -f "$repo_root/supabase/migrations/20261006061500_trivia_phase9_paid_skip_and_endless_score_authority.sql"
"${psql[@]}" -f "$repo_root/supabase/migrations/20261006143500_trivia_phase9_fk_advisor_hardening.sql"
"${psql[@]}" -f "$repo_root/scripts/trivia/phase9-solo-authority-replica-tests/10_assertions.sql"

role_sql="SELECT pg_catalog.set_config('request.jwt.claim.role','service_role',false);"
# Seed two receipts; concurrent calls race to be the single third receipt.
"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000012',NULL); SELECT public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000013',NULL);" >/dev/null
"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000014',NULL);" >"$work_root/cap-a.out" & p1=$!
"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000015',NULL);" >"$work_root/cap-b.out" & p2=$!
wait "$p1"; wait "$p2"

# The same concurrent question can charge and bind only once.
"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000016',NULL);" >"$work_root/same-a.out" & p3=$!
"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_paid_skip_v1('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000016',NULL);" >"$work_root/same-b.out" & p4=$!
wait "$p3"; wait "$p4"

# Different submitted sessions for one player serialize through GREATEST.
"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_endless_high_score_project_v1('40000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000009');" >"$work_root/score-a.out" & p5=$!
"${psql[@]}" -Atqc "$role_sql SELECT public.trivia_endless_high_score_project_v1('40000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000009');" >"$work_root/score-b.out" & p6=$!
wait "$p5"; wait "$p6"

"${psql[@]}" -f "$repo_root/scripts/trivia/phase9-solo-authority-replica-tests/20_concurrency.sql"
echo "phase9-solo-authority-pg17 PASS postgres=$("$pg_bin/postgres" --version)"
