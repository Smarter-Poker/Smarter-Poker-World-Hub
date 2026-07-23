# PioSOLVER tree-construction standard (LOCKED 2026-07-23)

The two Windows solver machines must build **byte-identical trees** or their
solved EVs diverge (a mixed-strategy hand differed 56% vs 22%, and root EVs
differed up to ~1bb, purely from different tree construction). This document is
the locked standard. Every spot's tree is generated ONCE by a single shared
generator and both machines run that identical `add_line` file.

## Hard engine constraints (confirmed on both machines)
- `set_bet_sizes` does NOT build a tree via UPI — it is a GUI-only config. The
  engine requires explicit `add_line` geometry (`build_tree` errors otherwise).
- Pot and stacks must be < 65535, so **x100 is the finest usable scale**
  (100bb = 10000 chips). x1000 is impossible.

## The standard
- Scale **x100**: `pot 550` (5.5bb), `eff_stack 9750` (97.5bb) for SRP spots.
- `set_rake 0 0 0 0` (clean chip-EV GTO baseline).
- `set_isomorphism 1 0`.
- Bet sizes expressed as % of the pot AT EACH NODE (not fixed amounts). The
  generator emits cumulative-per-player invested chips per `add_line`.
- Solve to 0.5% of pot.
- ONE shared generator emits the `add_line` list; BOTH machines run that exact
  file. Machines never run their own independently-generated geometry.

## Verified reference: spot001 bet-only 75% geometry (x100)
Engine-confirmed 75% at every node; identical EVs on both machines
(BB game value 2.398 / QcJc 8.413 / 2d2h 15.382 bb). Cumulative levels:
412 = 75% of 550 (flop) · 1442 = 412 + 75% of 1374 (turn) · 4018 = 1442 + 75%
of 3434 (river).

```
pot 0 0 550
eff_stack 9750
set_board Qh7s2c
set_rake 0 0 0 0
set_isomorphism 1 0
clear_lines
add_line 0 0 0 0 0 0
add_line 0 0 0 0 0 412
add_line 0 0 0 0 412
add_line 0 0 0 412 412 412
add_line 0 0 0 412 412 1442
add_line 0 0 0 412 1442
add_line 0 0 412 412 412
add_line 0 0 412 412 1442
add_line 0 0 412 1442
add_line 0 412 412 412 412 412
add_line 0 412 412 412 412 1442
add_line 0 412 412 412 1442
add_line 0 412 412 1442 1442 1442
add_line 0 412 412 1442 1442 4018
add_line 0 412 412 1442 4018
add_line 0 412 1442 1442 1442
add_line 0 412 1442 1442 4018
add_line 0 412 1442 4018
add_line 412 412 412 412 412
add_line 412 412 412 412 1442
add_line 412 412 412 1442
add_line 412 412 1442 1442 1442
add_line 412 412 1442 1442 4018
add_line 412 412 1442 4018
add_line 412 1442 1442 1442
add_line 412 1442 1442 4018
add_line 412 1442 4018
build_tree
go
wait_for_solver
```

## Production trees
Same standard, richer bet structure (multiple bet sizes + raises + all-in) so the
data covers the full action tree the trainer teaches. The shared generator emits
the production `add_line` list; both machines run it verbatim; a production-gate
(identical EVs + engine show_children on raise/all-in nodes) precedes any bulk
write. rake stays 0 for the v1 dataset (clean chip EV); raked variants later.
