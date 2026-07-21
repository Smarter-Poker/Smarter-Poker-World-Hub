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

## Division of labor
- **Short-stack (<=25bb, all-in preflop):** fully solved in-house by the Nash
  push/fold engine (`scripts/nash-pushfold/`) — no postflop tree needed. Already
  live in `memory_charts_gold` (240 rows).
- **Deep-stack (100bb etc.):** preflop ranges are **solved by PioSOLVER** on the
  machines (true GTO, consistent with the postflop solves), NOT hand-approximated
  — an approximation would get baked permanently into the "real GTO" river data.
  This module supplies the verified combo map + `set_range` conversion + the
  validation harness for those ranges.

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

## Regenerating the equity matrix
```
pip install eval7 numpy --break-system-packages
python eqmatrix.py     # writes eq169.npy, w169.npy, classes.json
python combomap.py     # self-check
python set_range_export.py   # validates conversion on trusted charts
```
