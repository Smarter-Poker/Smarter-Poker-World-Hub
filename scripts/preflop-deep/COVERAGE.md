# Solver coverage roadmap — every game type the trainer serves

## Core principle
PioSOLVER is a **2-player, chip-EV, postflop** solver. By the flop every trained
spot is heads-up (one raiser, one caller), so table size / format do NOT change
the engine — they change the **inputs**. Five knobs cover everything:

| Knob | Set by | How |
|------|--------|-----|
| Table size (HU/3/6/9-max) | preflop **ranges** | which seats + opening/defending ranges |
| Blind/stack depth (10–200bb) | `set_eff_stack` + depth-specific ranges | tighter ranges + shallower SPR |
| Rake | `set_rake` | cash = rake model; MTT/SNG/Spin = 0 |
| Antes | `set_pot` (larger) | tournaments/SNG/Spin inflate the starting pot |
| **Payoff model** | chip-EV (native) vs **ICM** (NOT native to Pio Pro) | ICM = risk-averse near pay jumps |

Everything except ICM is "same engine, different inputs." ICM is the one real fork.

## Two tracks

### Track A — chip-EV (runs on the current machines now; buildout = ranges + config)
Same pipeline we proved (2-player, rake/ante per family). Just needs the range
library per (table size × depth) + stack/rake/ante config per family.

| Family | Table | Rake | Ante | Status |
|--------|-------|------|------|--------|
| hu_cash | HU | yes | no | ranges TODO |
| 6max_cash | 6-max | yes | no | **Phase 1 live (100bb flop)**; extend depths/turn/river |
| 9max_cash | 9-max | yes | no | ranges TODO |
| cash (generic 6-max) | 6-max | yes | no | ranges TODO |
| mtt_hu_chipev | HU | no | yes | ranges TODO |
| mtt_3max_chipev | 3-max | no | yes | ranges TODO |
| mtt_6max_chipev | 6-max | no | yes | ranges TODO |
| mtt_9max_chipev | 9-max | no | yes | ranges TODO |
| mtt_chipev (full-ring) | 8/9-max | no | yes | ranges TODO |
| sng_6max_chipev | 6-max | no | yes | ranges TODO |
| sng_9max_chipev | 9-max | no | yes | ranges TODO |
| spin_3max_chipev | 3-max | no | yes | ranges TODO |
| spin_hu_chipev | HU | no | yes | ranges TODO |
| river_mtt_chipev | (river-only) | no | yes | harvested from flop/turn solves |
| turn_spin | (turn-only) | no | yes | harvested from flop solves |
| postflop_complete / spin / sng_hu | classify first | — | — | probe table size + payoff |

### Track B — ICM (needs ICM-aware solving; GATED)
`mtt_*_icm`, `sng_*_icm`, `spin_*_icm`, `river_mtt_icm`, `turn_mtt_icm`.
ICM changes strategy (risk aversion), so a chip-EV solve mislabeled as ICM =
corruption. Requires: (a) PioSOLVER **Edge** ICM inputs (payout structure + all
players' stacks) OR a dedicated ICM solver (HRC/MonkerSolver); (b) the payout /
stack model per spot. Blocked until we confirm the machines can do ICM (probe)
and have the payout parameters.

## Build order
1. Turn/river harvest from the flop solves (unlocks the ~130K bulk on the chip-EV
   flop solves already running).
2. Extend chip-EV across depths (parameterize the tree by `eff_stack`) and formats
   (cash → MTT/SNG/Spin chip-EV, HU→9-max), committing phases as ranges land.
3. ICM track: run the capability probe; if Pro can't do ICM, decide Edge vs an
   ICM solver, then build the ICM phases with payout models.

## The real labor
Not the solver config — the **range library**: correct opening/defending ranges
for every (table size × depth × format). A wrong range permanently mislabels the
data, so ranges are validated per family before their phase goes in the manifest.
