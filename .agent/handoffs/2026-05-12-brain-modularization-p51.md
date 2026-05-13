# P51: HorsePokerBrain Modularization Handoff

**Created:** 2026-05-12
**Requires:** Local Mac execution (HorsePokerBrain.js is NOT on GitHub — intentional IP protection)
**Priority:** HIGH — Plan approved, unblocked
**Receiving agent:** Any agent with access to `~/Documents/club-arena/`

---

## Context

`HorsePokerBrain.js` is the AI decision engine (horse player logic). It is a
local-only file — GitHub holds a 2,644-byte stub. The real file lives at:

```
~/Documents/club-arena/src/lib/poker-engine/HorsePokerBrain.js
```

**LINE COUNT DISCREPANCY — verify first:**
- The plan says 20,200 lines
- The stub comment says 8,148 lines
- Run `wc -l ~/Documents/club-arena/src/lib/poker-engine/HorsePokerBrain.js`
  and record the actual count before proceeding

The full plan (approved 2026-04-08) is at:
```
~/Documents/Smarter-Poker-World-Hub/.agent/plans/BRAIN_MODULARIZATION_PLAN.md
```

Read it in full before starting. This handoff is a summary — the plan is the authority.

---

## What to Do

### Step 0: Verify environment

```bash
wc -l ~/Documents/club-arena/src/lib/poker-engine/HorsePokerBrain.js
ls ~/Documents/club-arena/src/lib/poker-engine/brain/ 2>/dev/null || echo "brain/ dir does not exist yet"
node ~/Documents/club-arena/test-brain-audit.js 2>&1 | tail -5
```

Record baseline test results. If `brain/` already exists with partial work, assess
state before continuing — do not overwrite existing progress.

---

### Step 1: Read the full plan

```bash
cat ~/Documents/Smarter-Poker-World-Hub/.agent/plans/BRAIN_MODULARIZATION_PLAN.md
```

The plan defines 8 waves. Follow them in order. Do not skip or reorder.

---

### Step 2: Execute the 8 waves

Target directory structure:
```
src/lib/poker-engine/brain/
├── index.js              # Barrel — backward compatible with require('./HorsePokerBrain')
├── core.js               # ~400 lines: cards, position, hash, Supabase
├── anti-exploit.js       # ~2,600 lines: Modules 1-32, threat intel
├── holdem-brain.js       # ~7,500 lines: fallback + heuristics
├── plo-core.js           # ~4,800 lines: all shared PLO functions
├── plo4-brain.js         # thin wrapper over plo-core
├── plo5-brain.js         # ~50 lines: 5-card combo + plo-core
├── plo6-brain.js         # ~50 lines: 6-card combo + plo-core
├── plo8-brain.js         # ~250 lines: Hi-Lo evaluator + overrides
├── tournament.js         # ~300 lines: ICM, bubble, chip accum
├── cash.js               # ~400 lines: session mgmt, rebuy, stake
├── session-analytics.js  # ~600 lines: perf tracking, journals
└── router.js             # ~500 lines: getDecision master router
```

**Wave order:**
- **Wave 0** — Create `brain/` directory scaffold (empty files + barrel stub)
- **Wave 1** — Extract pure utils into `core.js`
- **Wave 2** — Extract game-type logic into `holdem-brain.js` + `tournament.js` + `cash.js`
- **Wave 3** — Extract PLO shared functions into `plo-core.js`
- **Wave 4** — Create thin PLO variant wrappers (`plo4`, `plo5`, `plo6`, `plo8`)
- **Wave 5** — Extract master router into `router.js`
- **Wave 6** — Extract anti-exploit modules into `anti-exploit.js`; complete `session-analytics.js`
- **Wave 7** — Wire up `index.js` barrel; update `HorsePokerBrain.js` to re-export from `brain/index.js`
- **Wave 8** — Run full test suite; verify backward compatibility

**Key constraint on Wave 7:**
`HorsePokerBrain.js` must remain a valid module that exports the same API.
It becomes a thin redirect:
```javascript
// src/lib/poker-engine/HorsePokerBrain.js (after modularization)
module.exports = require('./brain/index.js');
```
All callers of `require('./HorsePokerBrain')` continue to work unchanged.

**Key constraint on file sizes:**
No individual file in `brain/` should exceed 5,000 lines. If the actual file
is significantly larger than the stub's 8,148-line estimate, rebalance
accordingly — the exact line splits in the plan are targets, not rigid
boundaries. Use judgment to keep cohesion and stay under 5,000.

---

### Step 3: Run tests after each wave

```bash
cd ~/Documents/club-arena
node test-brain-audit.js
```

1,734+ tests must pass. If any test fails after a wave, do NOT proceed to the
next wave. Fix the regression before continuing.

---

### Step 4: Deploy when all tests pass

Only deploy after **Wave 8** confirms 1,734+ tests pass and backward
compatibility is verified.

```bash
cd ~/Documents/Smarter-Poker-World-Hub
bash scripts/sync-club-arena.sh "feat(brain): modularize HorsePokerBrain into 13 brain/ modules (P51)"
```

The sync script builds club-arena, copies dist to `public/hub/club-arena/`, and
pushes to World Hub. Monitor the Vercel build in the hub-vanguard project.

---

### Step 5: Verify

After push:
1. Confirm Vercel build is READY (not ERROR)
2. Confirm `https://smarter.poker/hub/club-arena/` loads without JS errors
3. Record final test count in `.agent/audits/2026-05-12-p51-brain-modularization.md`

---

## Important Notes

- This is the **AI decision engine** (which horse player to behave like). It is
  SEPARATE from the game-engine server-authoritative migration (HandController, etc.).
  MIGRATION-LAW.md governs the game engine migration — not this task.
- Do NOT touch `src/engine/` or any HandController files during this work.
- The brain/ modules do NOT go on GitHub directly — only the stub + the compiled
  club-arena dist (via sync-club-arena.sh) is committed.
- Read `~/Documents/club-arena/CLAUDE.md` before starting for any club-arena rules.

---

## Files to NOT touch

- `src/engine/` (active server-authoritative migration)
- `public/hub/club-arena/` (output only — write via sync-club-arena.sh)
- `HorsePokerBrain.js` until Wave 7 (it becomes the redirect at that point)

---

## Success Criteria

- [ ] `wc -l brain/index.js` confirms barrel exists
- [ ] All 13 `brain/*.js` files exist with content
- [ ] `HorsePokerBrain.js` re-exports from `./brain/index.js`
- [ ] `node test-brain-audit.js` shows 1,734+ tests passing (0 failures)
- [ ] `bash scripts/sync-club-arena.sh` exits 0, Vercel build READY
- [ ] `https://smarter.poker/hub/club-arena/` loads without errors
- [ ] Audit written to `.agent/audits/2026-05-12-p51-brain-modularization.md`
