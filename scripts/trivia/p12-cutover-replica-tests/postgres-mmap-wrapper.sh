#!/usr/bin/env bash
set -Eeuo pipefail

real_postgres="$(printenv P12_REAL_POSTGRES)"
if [[ "$#" -eq 1 && ( "$1" == "-V" || "$1" == "--version" ) ]]; then
  exec "$real_postgres" "$@"
fi
# initdb invokes PostgreSQL's special `--boot` mode as its first argument.
# Preserve that position, then append ordinary GUC overrides.
exec "$real_postgres" "$@" \
  -c shared_memory_type=mmap \
  -c dynamic_shared_memory_type=mmap
