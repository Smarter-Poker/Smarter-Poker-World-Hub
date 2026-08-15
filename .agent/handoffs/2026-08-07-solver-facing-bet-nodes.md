# Handoff — solver machines: harvest facing-bet nodes and record the pot

**Date:** 2026-08-07
**Why this is a handoff:** the two solver machines are Windows boxes running
PioSOLVER. No agent in this session has a network route to them, and the work
is a change to a solve/harvest pipeline that only runs there. This is the
"requires a different platform" exception in RULE 0 — not a deploy, not a
build, not a push. Everything on the web side is already shipped and live.

**Delivery:** the two prompts below are pasted into chat verbatim, per Dan's
standing preference ("send me two specific copy and paste texts to each
computer to avoid user error"). This file is the durable backup.

---

## What the World Hub needs, and why

GTO-Wizard parity item #14 is "a chip stack in front of every seat with money
committed." The web side is finished and verified live:

- `potMath.committedFor` reads a numeric amount off a recorded action, and
  credits posted blinds by seat name.
- `DeterministicGTOEngine._villainBetBB` reads a facing-bet node off
  `strategy_matrix.node`, rebases the solver's chip amount onto the displayed
  pot using `strategy_matrix.pot`, and **returns 0 rather than fabricating a
  number** when either is absent.
- Screen-verified 2026-08-07: the badge renders correctly on preflop spots,
  where the blinds supply real committed money.

Postflop it stays dark, and the reason is in the data, not the code. Measured
against `solved_spots_gold` on 2026-08-07:

```sql
-- every node whose path ENDS in a bet, i.e. "hero faces a bet"
select count(*) from solved_spots_gold
where strategy_matrix->>'node' ~ 'b[0-9]+$';
-- 0, across ~3000 node-carrying rows

-- rows carrying the pot at the node
select count(*) from solved_spots_gold where strategy_matrix ? 'pot';
-- 0
```

A representative sample of what IS stored:

| street | node |
|--------|------|
| flop   | `r:0` |
| flop   | `r:0:c` |
| turn   | `r:0:c:b412:c:4h` |
| turn   | `r:0:c:b412:c:Qs:c` |

Note `b412` appears MID-path but never as the last token. Every harvested node
is one where hero is **first to act into an unbet pot**. The sibling nodes —
the ones where villain has just bet and hero must respond — are never written.

That is half the postflop decision space missing, and it is the more
interesting half: facing a bet is where fold/call/raise actually gets decided.
It is also why the chip badge has never rendered on a postflop spot in the
product's history.

Two additions are needed. Neither changes the solve itself.

### 1. Harvest the facing-bet siblings

For every node currently harvested, also harvest the nodes reached by villain
BETTING at that decision point — the paths ending in `b<amount>`. Concretely,
where the DFS today emits `r:0` and `r:0:c`, it should also emit `r:0:b<size>`
and `r:0:c:b<size>` for each bet size in the tree, and likewise on later
streets.

These nodes already exist in the solved tree. This is a harvest-coverage
change, not a re-solve — the strategy at those nodes is already computed.

### 2. Record the pot at the node

Add a `pot` key to the `strategy_matrix` JSON: the chips in the middle **at
that node, before hero acts**, in the same chip unit the node path uses (so
`b412` and `pot` are directly comparable).

Current `strategy_matrix` keys are:
`__sanitized, actions, board, ev_ip, ev_oop, exploitability, frequencies,
hand_evs, node, source, street`. Add `pot` alongside them. Nothing existing
changes.

Without `pot`, a node reading `b412` is uninterpretable — 412 chips is a small
bet into a huge pot or an overbet into a tiny one, and the felt cannot tell
which. The engine deliberately refuses to guess.

### 3. The range-template correction (already established, still outstanding)

Computer 1 confirmed rivers are solved in isolation against ONE hardcoded
generic template, `C:\PioSOLVER\TreeBuilding\25bbHU-full+airiver.txt`, used for
every spot regardless of `scenario_hash` or position. The math is right and the
range is wrong, which is the root cause of the `solved_spots_gold` corruption.
Ranges must be propagated from the parent street's solve rather than reset to a
generic template. Any re-solve done for that fix should include additions 1 and
2 above in the same pass, so the data is walked once rather than twice.

---

---

## UPDATE 2026-08-15 — two attempts have now landed, and BOTH did the same half

Seven rechecks over thirteen hours, against both schema columns. The finding
that matters is not "nothing happened" — it is that **the pot has now been
delivered twice and the sibling nodes never once.**

### The two columns, measured

`solved_spots_gold` has TWO matrix columns, and every recheck before this one
looked only at the first:

| column | written | shape | has pot? | facing-bet nodes? |
|---|---|---|---|---|
| `strategy_matrix` | current bulk run, continuously | `nodes[]` array, each `{node_path, node_type, pot, ...}` | YES, per node | **NO** — 100% `hero_first` at `r:0`, one entry per row |
| `strategy_matrix_v2` | 2026-08-06 11:50–12:17 | singular `node` + `pot_bb` + per-combo arrays | YES, `pot_bb` on 3000/3000 | **NO** — 0 of 3000 paths end in a bet |

So the v2 rebuild added `pot_bb`. The current run added a per-node `pot`. Both
implemented **addition 2** of this document. Neither implemented **addition 1**,
which is the one that actually unblocks the item.

Read against addition 1's own words: *"where the DFS today emits `r:0` and
`r:0:c`, it should ALSO emit `r:0:b<size>`"*. The word doing the work is ALSO.
Both attempts changed what is RECORDED at each harvested node; neither changed
WHICH nodes get harvested. The DFS still walks only the line where hero is first
to act into an unbet pot.

`b488` appears mid-path in v2 (`r:0:c:b488:c:7c:c`) exactly as it did in the
original measurement — proof the bet nodes EXIST in the solved tree and are
simply not being emitted as their own rows.

### The v2 unit scale, measured (needed if v2 is ever the delivery vehicle)

`pot_bb` is in big blinds; the node path's bet token is in solver chips. Across
3000 v2 rows carrying a bet token there are exactly two pairs:

| pot_bb | chips | chips / (pot_bb x 100) |
|---|---|---|
| 7.0 | 525 | **75.0%** |
| 6.5 | 488 | **75.1%** |

Two different pot sizes both resolving to the canonical 75%-pot sizing pins the
scale at **100 chips per big blind**. `src/utils/v2Matrix.js` now carries this
as `V2_CHIPS_PER_BB` and converts `pot_bb` into chips so the two are comparable.

Second hazard, also handled: `pot_bb` is the pot at the **root** of the solve,
not at an arbitrary node. `r:0:c:b488:c:7c:c` is a turn node whose real pot is
far larger. The bridge therefore sets `pot_is_root: true`, and `_villainBetBB`
rebases against it ONLY when the bet is the first action after the root
(`r:0:b<n>`), declining otherwise rather than dividing by the wrong number.

### Web-side changes made in the same pass

- `v2Matrix.js` previously **dropped `pot_bb` entirely**, so a v2 row could not
  have lit the badge even with a facing-bet node present. It now carries `pot`
  (chips), `pot_bb`, and `pot_is_root`.
- `_villainBetBB` used to fall through to `return chips` RAW when no pot was
  available — which would have painted `488` on the felt **as big blinds**.
  It now returns 0. A blank badge is a missing feature; a wrong badge is a
  number the player will act on. Both branches fixed, six assertions added to
  `scripts/preflop-pot-check.js` (now PASS 58).

### What to ask for now

Not a re-solve. Not more fields. One thing:

> For every node you already harvest, ALSO harvest the sibling nodes reached by
> villain BETTING at that decision point — the ones whose path ENDS in
> `b<amount>` — and write each as its own row.

The acceptance query below is unchanged and still the single source of truth.

### Measurement notes for whoever checks next

- `solved_spots_gold` is 62GB / 8.1M rows with **no index on `created_at`**, and
  `created_at` correlation is 0.476, so a BRIN index would be marginal.
  `where created_at > X limit N` cannot short-circuit reliably — even `N=40`
  times out at the 60s MCP cap under write load.
- `id` is a **UUID**, so `order by id desc` gives no recency. Verified, do not
  retry it.
- `where created_at > X limit N` with **no ORDER BY** returns the EARLIEST
  matching rows in heap order. Tighten the window to the last ~20 minutes or
  you will measure hours-old rows and believe they are fresh.
- The only read shape that reliably survives write load is
  `jsonb_array_elements(sm->'nodes')` over a small limit. Aggregates over the
  whole `strategy_matrix` blob (`jsonb_array_length`, `range_source` group-by)
  time out consistently.
- Query `strategy_matrix_v2` via `where strategy_matrix_v2 is not null limit N`
  — that one returns instantly.

---

## Acceptance check

After a batch lands, this should return a non-zero count and a sane pot:

```sql
select street,
       count(*) as facing_bet_nodes,
       count(*) filter (where strategy_matrix ? 'pot') as with_pot,
       min(strategy_matrix->>'node') as sample
from solved_spots_gold
where strategy_matrix->>'node' ~ 'b[0-9]+$'
group by street order by street;
```

Both counts must be non-zero and equal. When they are, the chip badge lights up
on postflop spots with no further web-side change — `_villainBetBB` is already
deployed and already reading these two fields.
