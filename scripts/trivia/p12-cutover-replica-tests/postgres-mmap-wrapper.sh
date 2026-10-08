#!/usr/bin/env bash
set -Eeuo pipefail

real_postgres="$(printenv P12_REAL_POSTGRES)"
if [[ "$#" -eq 1 && ( "$1" == "-V" || "$1" == "--version" ) ]]; then
  exec "$real_postgres" "$@"
fi
# initdb supplies its own bootstrap and single-user settings. Single-user
# mode ends with a database name, so appending -c after it is invalid.
# Only normal server probes need the additional shared-memory settings.
if [[ "${1:-}" == "--boot" || "${1:-}" == "--single" ]]; then
  exec "$real_postgres" "$@"
fi
exec "$real_postgres" "$@" \
  -c shared_memory_type=mmap \
  -c dynamic_shared_memory_type=mmap
