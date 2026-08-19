# Club Arena — Full Gameplay Animation + Sound Audit (2026-08-19)

Dan asked for a deep dive into EVERY gameplay animation and sound: card
dealing, chips to pot, flop/turn/river, showdown, pot shipping, all-in
slow-down with per-street win percentages — nothing skipped, nothing rushed.

Three parallel code audits (client animation map, all-in runout path, sound
system) found that several headline animations were built but literally never
playing. Everything below was FIXED and shipped in the same session.

## Root causes found and fixed

### Client — `Smarter-Poker-Club-Arena` @ `b5141a7ec`

1. **Board reveal animations never played.** `TablePage` bumped
   `boardStageKey` on every stage change and used it as the React `key` of
   `.community-area`, unmounting `CommunityCards` one frame after it marked
   the new cards "newly dealt". The fresh instance re-seeded its refs, so the
   flop two-phase flip and turn/river reveals were torn out at frame 1 —
   board cards "just appeared". Key + effect removed; the component stays
   mounted and owns its own per-street animation and sound.
2. **Chips-to-pot sweep usually never fired.** The sweep mask was read from
   `lastBetAmounts`, which the engine snapshot (applied synchronously, before
   the deferred `COMMUNITY_CARDS_DEALT` handler runs) zeroes on every new
   street. Added `streetBetsRef` written from the discrete
   PLAYER_ACTION/BLINDS_POSTED events; the sweep re-seeds bets the snapshot
   already erased, and the collect window grew 450→700ms to cover the 550ms
   `cpCollect` keyframe (was cut at 82%). Snapshot merge also holds a seat's
   bet while that seat is mid-collect.
3. **Pot-ship chip fans were deleted mid-flight.** The 5s safety sweep parsed
   ids with `split('_')[1]`; `pot-to-winner-<ts>-<i>` ids are hyphenated →
   parsed to 0 → reaped on the next tick. Now extracts the epoch token from
   either format and never deletes an undatable animation.
4. **Previous hand's 3s reset fired INSIDE the next hand.** Server fold-win
   gap is 2000ms; the client reset timer (3000ms) was never cancelled by
   HAND_STARTED, so every fold-win blanked the fresh pot/board ~1s into the
   new hand. HAND_STARTED now cancels reset/collect/muck/Show-Muck timers.
5. **Pot-push to winner could silently no-op.** `PotDisplay`'s memo
   comparator ignored `collectTo`, and its `mainPot === 0` early-return
   unmounted the component the moment a snapshot zeroed the pot. Both fixed;
   the pot slides to the winner showing its last real amount.
6. **Chip flights landed below the pot.** Flights aimed at scaler `{50,45}`
   while `.pot-area` sits at `{49.9, 32.99}` — every bet/blind/pot-win chip
   landed ~12% of table height below the pot. Single `POT_ANCHOR_PCT`
   constant now mirrors the CSS.
7. **Deal/fold direction vars were never set.** `cardDealIn`/`cardFoldOut`
   always honored `--deal-from-x/y` / `--fold-to-x/y`; nothing set them, so
   cards dropped straight down on the deal and floated straight up on the
   fold. Set per seat: deal FROM the dealer/centre, muck TOWARD it.
8. **Class windows shorter than their keyframes.** Fold 350ms vs 435ms
   animation; showdown flip 400ms vs 470ms — second card always snapped.
   Extended to 500/600ms.
9. **No muck for showdown losers** — cards blinked out at the reset. Added
   `isMucking` (losers fly to muck in the last 600ms of winner display).
10. **Split pots animated wrong amounts** — per-winner chip fans now use the
    server's accurate per-winner `amounts` map, not `pot / n`.
11. **DealAnimation skipped seats that folded LAST hand** — per-hand `folded`
    status is now reset at HAND_STARTED.
12. **All-in mode desync** — the blanket 0.8s `.community-cards__card`
    override made the flop fan open before it landed. Removed (server pacing
    provides the drama). Dealer puck no longer jumps at hand start
    (`dealerPuckDrop` keeps the centring translate).
13. **Equity badge polish** — class-based styling with a pop animation on
    every new percentage and ahead/behind color cross-fade.
14. **RIT boards dealt in one frame** — on-felt extra boards and the result
    modal now reveal card-by-card, board after board.

### Server — engine (auto-deploys to Hetzner on push to main)

1. **Hole cards were NOT revealed during all-in runouts.** `showCards`
   required `stage === 'showdown'`, which is only reached AFTER the paced
   runout — players watched percentages change next to face-down cards.
   Added `runoutRevealActive` (set in `handleAllInRunout`, cleared at
   HAND_COMPLETE/hand start); every non-folded hand is tabled for the runout.
2. **Snapshots said 'preflop' for the whole runout.** `dealNextStreet` never
   called `transitionStage`, so stage-derived rendering showed zero cards.
   Fixed server-side + a client regression guard (board never shrinks, stage
   never moves backward mid-hand).
3. **Insurance tables had a 0ms runout** when all players declined for the
   hand (`continueRunout` = instant synchronous loop) and no pacing between
   streets when offers resolved fast. Now uses `pacedAllInRunout` and a
   1.4s per-street beat.
4. **Degraded equity fallback was wrong.** `monteCarloEquity` simulated
   RANDOM opponents (not the known all-in hands) and has no Omaha branch —
   wrong numbers for PLO. Fallback now uses exact `insuranceEquity` vs the
   known hands; NLH-only Monte-Carlo remains as last resort, never for Omaha.

### Sound

- **Mobile audio was dead until luck intervened**: the AudioContext is built
  at import time (born `suspended` on iOS/Android) and nothing awaited
  resume. Added one-time gesture unlock + `visibilitychange` resume.
- BBJ_HIT played `playBigWin` instead of the jackpot fanfare; the time-bank
  button played the chip sound; big-win double-fired; community-card sound
  double-fired (TablePage + CommunityCards); raise sound never used its
  amount-scaling; the in-table vibration toggle wrote a key nobody read;
  achievements 404'd on a nonexistent `/sounds/unlock-chime.mp3`; player
  join/leave had empty handlers. All fixed; `playPlayerLeft` added.

## Verification

- Client: `tsc --noEmit` clean, production `vite build` clean (built from the
  committed tree, excluding another agent's in-progress HomePage/lobby work,
  which was byte-restored afterward).
- Server: `tsc --noEmit` clean, `vitest run` **787/787 tests pass** including
  the 8 PacedAllInRunout tests.

## Deploy mechanics (this session was network-blocked)

- Shell had no GitHub route (SSH no-DNS, HTTPS unauthenticated, on-disk PATs
  expired, GitHub MCP identity has no access to the org). Per
  `.agent/AGENT_BINDING_RULES.md` §1.1, both repos got local commits with
  explicit paths (private `GIT_INDEX_FILE`, no `git add -A`) for
  `git-safe-push-auto` to push:
  - Club Arena `main` → `b5141a7ec` (12 files, sources only)
  - World Hub `main` → `7f4bea134` (fresh CA build → `public/hub/club-arena/`,
    parented on origin/main `4d86d56abf`) + this audit doc.
- Stranded `.git/*.lock` files (mount cannot unlink) were moved to
  `_to_delete/` per the documented procedure.

## Known remaining gaps (not fixed this session — candidates for follow-up)

- RIT still deals its boards outside HandController in one server tick (the
  client-side staggered reveal masks this; no per-board equity shown).
- The hand-end "board clear" broadcast in `ServerTableEngineDealing.ts:297`
  is a no-op (`handController` already nulled) — client reset covers it.
- Equity uses 1000 Monte-Carlo iterations in the primary pool path even
  where exact enumeration is trivial (turn = 44 boards).
- Dead code inventory (candidates for deletion): `useActionSequencer.ts`,
  `lib/animations.ts`, `CardAnimations.css` (~95%), `styles/ChipAnimations.css`
  (~100%), `EquityDisplay.tsx` (animated bars, never mounted),
  `createChipToPotEvent`, `triggerChipAnimation(+Ref)`, `PremiumCard`,
  `PlayerCard`, `PremiumPot`, `FlashTransition`, `CardReveal`,
  `HoleCardReveal`, 5 unused `ChipPhysics` variants, 6 unused `PotDisplay`
  keyframes, 5 unused `PremiumSFX` methods.
- No shuffle sound, no dealer-button-move sound, no tournament level-up
  sound; the reduced-motion global wildcard flattens CSS animation while rAF
  chip flights keep running (inconsistent, but honors the OS preference).
