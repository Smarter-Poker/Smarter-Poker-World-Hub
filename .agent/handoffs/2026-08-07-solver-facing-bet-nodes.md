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
