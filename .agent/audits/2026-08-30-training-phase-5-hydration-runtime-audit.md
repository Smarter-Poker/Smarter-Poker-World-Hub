# Training Phase 5 — Hydration, Question Semantics, And Runtime Surface Audit

Date: 2026-08-30  
Baseline: `309dfb7967a007de16da4fbd353ab5cd3c06ccd9`  
Scope: authentication entry, all 107 canonical game campaigns, all 107 arena flows, shared Club Arena gameplay, psychology gameplay, question legality, feedback persistence, mobile and desktop.  
Global header: frozen and unchanged.

## Outcome

Phase 5 closes a login hydration failure, removes the final two poker-game bypasses around the universal Club Arena table, strengthens the four-answer and action-legality contract, and introduces a complete browser matrix for every canonical game at both supported viewport classes.

The browser matrix and the live production-source question audit are separate gates:

- the browser matrix uses deterministic API fixtures so rendering, navigation, game identity, answer count, feedback, responsive layout, images, and JavaScript wiring can be reproduced for all 428 surfaces;
- the live catalog audit reads the configured production database in a read-only transaction and validates every compatible cached question plus real deterministic-engine fallbacks for every one of the 1,284 game-level cells.

Neither result is inferred from the other.

## Defects Found And Corrected

### Login Hydration Replaced The Server Document

The login page placed a long CSS template literal directly inside a React `style` child. Apostrophes and comparison symbols inside CSS comments were HTML-entity encoded by the server but remained literal on the client. React reported minified errors `#425`, `#418`, and `#423`, discarded the server tree, and rebuilt the page.

The stylesheet is now supplied as static trusted style content. A local browser inspection after the repair recorded zero console errors and zero hydration warnings. The auth regression suite now fails on hydration mismatch, text mismatch, server-HTML replacement, and the three observed React error codes.

The accepted-login setup wait was also raised from 20 to 60 seconds because cold profile and MFA bootstrap services can legitimately exceed the old limit. The authenticated setup rerun passed.

### Two Poker Games Bypassed Club Arena

`adv-011` and `quiz-gauntlet` returned standalone, flat game interfaces from `GodModeArena`. Those exceptions are removed. Every non-psychology poker game now passes through `GameUIRouter` and `UniversalDynamicTable`, using the shared Club Arena table, HUD, seats, cards, controls, question panel, and feedback path. Psychology games retain their purpose-built scenario surface.

Static wiring guards prevent either exception from returning.

### Question Choices Could Be Legal In Isolation But Wrong For The Action

The question contract now derives the street and decision node before accepting or synthesizing choices.

- A checked-to postflop node permits Check, Bet, or All-In—not Fold, Call, or Raise.
- A faced-bet postflop node permits Fold, Call, Raise, or All-In—not Check or Bet.
- A preflop response advances its aggression depth: open to 3-bet, 3-bet to 4-bet, and 4-bet to 5-bet.
- A synthesized distractor can never become the correct answer.
- Generic option IDs such as `c` no longer override the action written in the label; this had incorrectly classified a legitimate `Bet 75% Pot` option as Call.
- Correct answers that contradict the declared node are retained as invalid evidence so validation fails closed instead of silently rewriting the key.

The established answer-count rule remains intact: ordinary poker decisions expose exactly four meaningful choices; only literal Yes/No and Push/Fold decisions may expose two. Choice labels cannot reveal grading.

### Runtime Audits Could Be Blocked By The Auth Gateway

The new Supabase secret-key gateway intermittently produced `JWT issued at future` before the first database row was returned. The audit now prefers a parameterized PostgreSQL reader when the configured DB credential is present and retains the Supabase REST fallback.

The PostgreSQL path is constrained to `training_question_cache`, `solved_spots_gold`, and `memory_charts_gold`, uses allowlisted identifiers, exposes only SELECT-shaped query methods, and sets `default_transaction_read_only=on`. It cannot mutate production data.

The browser matrix also no longer replays an expired one-time refresh token into the live authentication service. Its disposable contexts mock only the test-user refresh and user reads, while Training endpoints retain their explicit deterministic fixtures. This prevents a 428-surface wiring audit from generating production authentication traffic or reporting a false application failure after the shared saved session expires. Production password sign-in remains a separate, mandatory release check.

The concurrent batch runner now claims each queued game synchronously before awaiting browser-page creation. Previously two workers could both observe the final queued item, one could dequeue `undefined`, and the entire otherwise-valid batch would be replayed. An explicit regression contract locks the dequeue-before-await ordering.

### Mobile Session Launch Was Covered By Global Overlays

The mobile arena launch bar was fixed 10 pixels above the viewport bottom at z-index 30 while the approved global footer occupied the bottom 56 pixels at z-index 90. The visible Start Training button therefore sat underneath the footer, which intercepted the tap. If the browser kept retrying, the delayed first-run notification modal could then cover the same control.

The launch bar now sits above the footer plus the device safe area, and the lobby reserves matching scroll clearance. First-run notification prompts are suppressed on Training Arena and Club Arena gameplay routes so they cannot interrupt a session launch or a live decision. The global header and footer components themselves remain unchanged.

## Verification Results

### Live Production-Source Question Matrix

- 107 games.
- 12 levels per game.
- 1,284 game-level cells.
- 1,030 cache-backed cells.
- 254 deterministic-engine-backed cells.
- 25,958 compatible cached questions validated.
- 1,016 live engine-generated questions validated.
- 1,179 incompatible cache rows rejected before use.
- Zero content, answer-count, action-legality, or engine failures.

### Deterministic Browser Runtime Matrix

- 107 campaign routes at mobile and desktop: 214 checks.
- 107 arena routes at mobile and desktop: 214 checks.
- Total rendered surfaces: 428.
- Club Arena gameplay surfaces: 174.
- Purpose-built psychology surfaces: 40.
- Every campaign exposed all 12 levels and the matching canonical game.
- Every arena started through its real lobby control and preserved the matching game ID.
- Every tested question exposed the contractually correct answer count.
- No horizontal overflow, broken visible application images, error states, page errors, or application-owned console errors.
- Cash and psychology feedback both displayed an explicit Correct/Incorrect verdict, Your Answer, Correct Answer, and rationale; the result remained visible until the manual Next control was selected.

### Regression And Build Gates

- 41 focused auth, question-integrity, and runtime-wiring tests passed.
- All authored Training questions passed the static question contract.
- Manual Next feedback invariants passed.
- The authenticated login setup regression passed after the cold-service timeout correction.
- The production Next.js build completed successfully across all 403 generated pages.
- Whitespace validation passed.

The repository-wide GitHub E2E job reached its 30-minute job ceiling while retrying unrelated MLB Analytics failures. That cancellation is not represented as a Training pass or failure. The complete Training-specific browser matrix above is the release evidence for this phase.

## Release Verification

Production verification is intentionally pending until the protected branch merges and the exact release SHA appears at `/api/health`. The release is not considered complete merely because the branch tests pass.
