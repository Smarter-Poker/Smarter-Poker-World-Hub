# Phase 2 — PokerBros Parity UX Roadmap

**Status:** DRAFT
**Depends on:** Phase 1.1 + 1.2 shipped (authoritative server state,
deadline-based timers). Phase 1.3 can run in parallel.
**Source spec:** `POKERBROS_CLONE_SPEC.md` (1687 lines) in the World
Hub root. All line refs below are from that document.
**Rules:** `.memory/WORKING-RULES.md`.

---

## 1. What "parity" means here

PokerBros has ~150 distinct visual + interactive elements across the
table, lobby, tournament, and profile surfaces. We've already
implemented most of the structural ones in Phase 1. Phase 2 is the
long tail of **signature PokerBros micro-UX** — small things that
collectively make the table feel "right" to anyone who's played a lot
of online poker.

Phase 2 is NOT:
- Engine changes (all covered by Phase 1)
- New variants (Phase 3)
- Tournament polish (Phase 4)

Phase 2 IS the UX layer between "functional" and "shippable to real
players as a PokerBros alternative."

---

## 2. Items by priority

### Tier 1 — missing-feel items (ship first)

| id | item | spec ref | effort |
|----|------|----------|--------|
| T1-01 | Net-profit "+N" floating text in yellow above hero on win | §6, line 535-547 | 0.5 day |
| T1-02 | Bet slider vertical on right side of screen (current: horizontal bottom) | §5.2, line 312-317 | 2 days |
| T1-03 | Tappable bet amount → numeric keyboard manual entry | §5.2, line 319-324 | 1 day |
| T1-04 | Hand strength label displayed at pot center for 1s post-hand | §6, line 548 | 0.5 day |
| T1-05 | Chip ship animation curved arc pot → winner avatar | §5, line 531-534 | 1 day |
| T1-06 | Community card deal: 3D flip + stagger 100ms between each | §spec deal | 0.5 day |
| T1-07 | Preflop cards hidden state transition to revealed on flop | §5.5 | 0.5 day |
| T1-08 | Pre-action toggles (Check-fold/Check-any/Call-any/Fold) | §5.4 line 427-440 | 2 days |

### Tier 2 — polish items (ship after Tier 1)

| id | item | spec ref | effort |
|----|------|----------|--------|
| T2-01 | Action timer ring around active seat avatar (conic gradient shrinking) | §2.3 | 1 day |
| T2-02 | Dealer button animated slide on dealer change | §4 | 0.5 day |
| T2-03 | All-in shake animation on seat (already partially done, needs tuning) | §5.1 | 0.25 day |
| T2-04 | Stack change floating text "+$X" / "-$X" | §2.3 | 0.5 day |
| T2-05 | Emoji throw interactions (gestures toggle in settings) | §7.1 | 2 days |
| T2-06 | Rabbit Hunt UI after hand | §11.9 | 1 day |
| T2-07 | Hand history replay panel (already has skeleton) | §9.5 | 2 days |
| T2-08 | VIP badge animation on seat | §11.1 | 0.5 day |

### Tier 3 — new features (ship after Tier 2 soak)

| id | item | spec ref | effort |
|----|------|----------|--------|
| T3-01 | Run It Twice 2-phase flow (already partial in server) | §4.20 | 2 days |
| T3-02 | Insurance offer UI with slider | §4.19 | 2 days |
| T3-03 | Straddle toggle at table | §4.4 | 0.5 day |
| T3-04 | Multi-table view (active / inactive / add-table tabs) | §8 line 822-831 | 3 days |

---

## 3. Rollout cadence

Ship Tier 1 items as individual PRs, one per item, verified in prod
before moving to the next. Each item is small enough to land in a single
focused session.

Tier 2 starts only after all Tier 1 items have 48h soak. Tier 3 starts
only after all Tier 2 items have 48h soak.

The full Phase 2 timeline at this pace:
- Tier 1: 8 items × ~0.75 day avg = 6 working days
- Tier 2: 8 items × ~0.75 day avg = 6 working days
- Tier 3: 4 items × ~1.9 day avg = 7.5 working days
- Plus soak windows (48h × 3 tiers) = ~6 working days
- **Total: ~25 working days for full Phase 2.**

---

## 4. Deliverable structure per item

Each Tier-N item gets a named PR: `Phase 2 Tx-nn: <title>`.
Each PR contains:
- Source code change
- CSS change if applicable
- Unit test OR playwright test if applicable
- Rebuild bundle + commit to World Hub
- Deploy via hub-vanguard deploy hook
- Verification note added to `.memory/context/phase-2-progress.md`

No single PR merges two items — atomic, revertable.

---

## 5. What's explicitly out of scope for Phase 2

- Engine internals (covered by Phase 1)
- Database schema changes (unless a UX feature requires it)
- Tournament-specific flows (Phase 4)
- Variant-specific UIs (Phase 3 — OFC Pineapple, short deck)
- Mobile app (Phase 5)

---

## 6. Entry criteria

Before starting Phase 2 work:
- Phase 1.1 PR-5 deleted legacy Supabase game-state code
- Phase 1.2 PR-G deleted legacy duration fields
- Load test (A6 + B2) passing

---

## 7. Exit criteria

Phase 2 is "done" when:
- All Tier 1 items merged + verified in prod
- All Tier 2 items merged + verified in prod
- All Tier 3 items merged + verified in prod
- `.memory/context/phase-2-progress.md` shows every id as ✅
- Dan signs off on a live session comparing the live table UX side-by-
  side with a PokerBros reference video

---

## 8. Next action

Start T1-01 (net-profit +N floating text) as the first concrete PR —
short, high-signal, proves the tier system works.
