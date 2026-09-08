#!/usr/bin/env python3
"""Retired tombstone for the unsafe direct solver-database ingest path.

Solver hosts are permitted to publish only through the scoped, signed gateway
implemented by ``scripts/preflop-deep/run_machine.py``.  This module therefore
terminates before importing a database client, reading credentials, opening a
network connection, scanning exports, or writing a solver artifact.
"""

raise SystemExit(
    "RETIRED_UNSAFE_SOLVER_INGEST: scripts/ingest_god_mode.py can no longer "
    "read or write solver data. Use scripts/preflop-deep/run_machine.py with "
    "the approved per-host HMAC gateway configuration; never place a Supabase "
    "credential on M1 or M2."
)
