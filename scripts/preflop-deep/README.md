# Deep-stack preflop range pipeline (2026-07-21)

Produces the **correct, solver-consistent preflop ranges** that (a) fill the
trainer's deep-stack scenarios (`rfi`, `vs3bet`, `4bet`, `bb_defense`,
`cold_call`, `squeeze` in `pages/api/training/preflop-ranges.js`) and (b) become
the `set_range` inputs for the Windows PioSOLVER machines' full-tree postflop
solves.

## Why this exists
The `solved_spots_gold` river data was solved with a single hardcoded generic
range template (`25bbHU-full+airiver.txt`) applied to every spot regardless of
position/stack/format — mathematically valid but the wrong range, so it does not
match its scenario labels. Fix: every solve must start from the range that
actually matches its (format, position, stack, action) label.

## Phase 4 certification hold

Neither Windows host may generate or export Training solves from this directory
until `phases.json.release_gate.solver_ready` is true in a protected commit, the
operator supplies that exact manifest checksum, and every range artifact passes
its per-phase SHA-256 check. The current gate is intentionally closed.

PioSOLVER's postflop objective is chip EV. A family name containing `icm` does
not make the output ICM-aware, so the worker rejects ICM-labelled phases until
an approved objective engine with explicit payout and stack inputs exists.

The supervised launcher also requires `APPROVED_PIO_BINARY_CHECKSUM` and
hashes the executable before it starts. Before importing any downloaded Python,
it verifies the approved manifest bytes, verifies the manifest-pinned checksum
of the complete pipeline bundle, and installs the files atomically in the
launcher's own directory. Every accepted export records that
checksum, the protected pipeline commit, manifest version/checksum, source
artifact checksum bound to both the scenario hash and matrix, canonical machine
ID, solver version, and audit timestamp.
The harvester writes the phase's actual pot, effective stack, rake, street,
family, and stack; no 100 BB/flop constants may leak into another contract.
Flop, turn, and river target paths are supported, while the closed manifest
prevents their use until the exact approved inputs exist.

The writer treats release identity as exact, not merely well-formed. A row is
complete only when its solver version, binary checksum, pipeline commit,
manifest version, and manifest checksum match the active supervised run. It
patches one database row by both immutable row ID and scenario hash, requires
PostgREST to return exactly that row, and refuses duplicate scenario hashes.
Board discovery is stable and paged, range weights must be finite, solver
vectors must contain exactly 1,326 combos, and missing exploitability can no
longer be replaced by a plausible zero. Local artifacts are written through an
fsync-and-rename checkpoint before any database certification is attempted.

## Division of labor
- **Short-stack (<=25bb, all-in preflop):** fully solved in-house by the Nash
  push/fold engine (`scripts/nash-pushfold/`) — no postflop tree needed. Already
  live in `memory_charts_gold` (240 rows).
- **Deep-stack (100bb etc.):** PioSOLVER consumes an approved preflop range; it
  does not derive that range from the postflop tree. Every range must therefore
  come from an independently reviewed preflop solve/export, carry its exact
  1326-combo checksum, and match the phase's format, positions, stack, action,
  rake, and objective. The Windows hosts may not substitute a hand-authored
  approximation or infer a missing range from legacy postflop output.

## Files
- `combomap.py` — SINGLE source of truth for card/combo indexing shared with the
  machines. `card = rank*4 + suit` (c,d,h,s = 0,1,2,3); `combo = b*(b-1)/2 + a`
  for card indices a<b (2c2d=0 ... AhAs=1325). Matches eval7 native encoding.
- `set_range_export.py` — converts any class-weight range into a length-1326
  `set_range` vector and validates the round-trip (percent match, exact combo
  indices, no orphan combos). Verified on the trusted push/fold Nash charts:
  SB 10bb jam -> 58.32% (chart 58.3%), AhAs at index 1325, 2c2d at index 0.
- `eqmatrix.py` — regenerates the 169x169 preflop all-in equity matrix via eval7
  Monte Carlo (`pip install eval7 --break-system-packages`; ~4 min). Outputs
  `eq169.npy`, `w169.npy` (gitignored — binary, regenerable).
- `classes.json` — the 169 canonical hand classes in solver order.
- `make_ranges.py` — legacy research-only approximation generator. The
  certified worker neither fetches nor executes it, and its output cannot
  authorize a Training solve.

## Regenerating the equity matrix
```
pip install eval7 numpy --break-system-packages
python eqmatrix.py     # writes eq169.npy, w169.npy, classes.json
python combomap.py     # self-check
python set_range_export.py   # validates conversion on trusted charts
```
