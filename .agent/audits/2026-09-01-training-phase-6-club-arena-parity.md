# Training Phase 6: Club Arena One-To-One Gameplay Parity

Date: 2026-09-01
Status: Complete
Protected Baseline: `d8d3b1468ebc21b85eeb11f7ae6bf54c3f3d86a1`
Protected Release: `10c62c39df7bbc2847ae5ac5139cafba56240557`
Production Hardening: `ccf12df91247483fe7e46d049ddd3be083a9fbca`

## Entry Certification

Phase 5 implementation PR 1164 and closeout PR 1166 merged normally. A fresh
production login and authenticated bearer probe passed. The final mobile and
desktop certification loaded 107/107 Hub images with zero scanlines, overflow,
console errors, or page errors; rendered twelve levels for each representative
campaign; mounted Club Arena gameplay for every representative poker family;
mounted the psychology surface for `psy-001`; exposed four answers; and kept
Correct/Incorrect, Your Answer, Correct Answer, and manual Next visible.

## Defects Closed At Phase Entry

### Cold Visible Images Were Classified Before Decode

The gameplay root can mount before the six visible villain card backs finish
decoding on a cold browser. The image is a valid 500 by 750 WebP and production
returns HTTP 200. Certification now waits until every visible image is complete
with nonzero natural width. A real missing or undecodable image still reaches
the same timeout and fails the unchanged broken-image assertion.

### Persistent Feedback Used A Fragile Leaf-Node Scrape

The first verdict assertion used Playwright's semantic text locator, while the
one-second persistence assertion rebuilt the query by scanning only leaf DOM
nodes. Animated or nested verdict markup could pass the first check and fail
the second without disappearing. Both observations now use the same visible
semantic locators for verdict, Your Answer, Correct Answer, and Next Question.

### The Bundle Gate Counted Two Generations As One

Club Arena intentionally retains the immediately previous hashed generation so
a client holding stale HTML can complete a lazy navigation. The current sync
contains 379 manifest-authoritative JS/CSS chunks totaling 7.99 MB, inside the
unchanged 9 MB ratchet. The latest protected-main sync retains 187 compatibility
chunks totaling 4.52 MB. The old gate added both generations together and
misreported compatibility code as current code.

The corrected gate measures:

- initial load against 1.5 MB;
- current manifest generation against the unchanged 9 MB code ratchet;
- retained compatibility code against a 6 MB and 400-chunk bound;
- the complete deployed payload against 110 MB.

The gate also fails if the runtime manifest is absent, malformed, or references
a missing current JS/CSS asset. The current protected-branch evidence is 1.22 MB
initial, 7.99 MB current code, 4.52 MB retained code, 59.13 MB payload, and zero
exceeded budgets.

### Gameplay Launched Under The Setup Scroll Position And Library Footer

The first matched live capture found the table root starting 156 pixels above
the viewport and the fixed Training library artwork covering the complete lower
action area. Club Arena's table routes are immersive and do not mount their
library footer. Training now scrolls to its visual origin when the playing phase
mounts and suppresses the world footer for the complete immersive
`/hub/training/arena/*` route, including its in-route launch lobby. Browse,
campaign, progress, review, and every other Training route retain their footer.
The approved global header is unchanged and remains present during gameplay.

### State And Geometry Evidence Is Machine Addressable

The Club Arena table now exposes stable, non-visual measurement anchors for the
active action/verdict state, street, player count, board count, table, every
seat, hero cards, dealer button, committed-chip stacks, pot, and feedback layer.
These attributes do not style or alter gameplay. They let the Phase 6 browser
ledger measure the pixels the player actually receives instead of inferring
geometry from source text.

`scripts/training-phase6-parity-audit.mjs` exercises the setup-to-gameplay
boundary and action/verdict states for 6-max preflop, 6-max postflop, declared
river, heads-up, three-player Spins, nine-player postflop MTT, and an actually
selected all-in/push decision on
390x844 and 1440x1000. It asserts the approved header, footer ownership, scroll
origin, 605x1000 Club Arena table aspect, seat/player agreement, hero cards,
dealer, pot, all-in availability, loaded images, horizontal containment, and
persistent manual feedback, while saving the pixel captures and a JSON ledger.
The postflop MTT case requests Turn explicitly. The batch reader applies that
target to warm cache rows as well as generation, so a cached mixed-street pool
cannot silently defeat a selected street and the ledger always proves the
four-card Turn geometry.
For `cash-001`, it also advances the complete canonical 20-hand level through
every real manual-Next transition on both viewports, then verifies and captures
the real Session Review surface. A stable nonvisual completion anchor makes
that end state measurable without changing its design. The final immutable
production deployment ran this ledger before Phase 6 closed.

### Production Pixel Audit Found An Incomplete Seat Ring

The first exact-production ledger run reached a real `cash-001` action state
and found only the hero plus opponents named by the action history. The root
correctly declared a six-player table, but between three and four seats mounted
depending on the sampled line. Club Arena keeps the complete occupied ring on
the felt, including players who have not acted. Training now does the same:
every 2-, 3-, 6-, or 9-player seat remains visible, while named actors retain
their real action bubbles and stacks and the other seats use the solver's honest
table depth. The responsive geometry ledger rejects any future seat/player
count drift.

The same mobile capture showed the study-mode toolbar taking height from the
active decision even though Range and Strategy are unavailable before an
answer. On phones it is now hidden during the action state and returns for the
verdict, freeing vertical space for the 605x1000 Club Arena table without
removing post-answer study tools.

### Authored Postflop Questions Lost Their Board On The Felt

A fresh authenticated production probe of `mtt-021` found valid curated Turn
and River questions rendering zero community cards. The question contract
correctly carried `boardCards`, but the table only read the legacy
`scenario.board` shape. The renderer now consumes canonical question-level
cards first, then the two legacy scenario shapes. The runtime ledger waits for
the exact zero/three/four/five-card street contract and fails if a postflop
question ever reaches the player with an incomplete board.

### Served Questions And Server Grading Could Disagree

The batch endpoint sanitized cached and generated questions in memory but did
not always persist the exact post-contract envelope returned to the player.
`record-question` then reread an older canonical row and correctly rejected the
answer with HTTP 409. Both question endpoints now persist the exact served
envelope. The grader performs a bounded reread of only that server-owned row to
cover immediate PostgREST visibility delay; it never accepts a browser answer
key.

Cold generation also mixed broad scenario-map stacks into games with an exact
stack contract and could repeat identities already supplied by cache. The
curated fallback now honors the exact game stack and excludes both previously
seen and already-batched identities. A cold `spins-001` proof returned 25/25
unique questions at exactly 20 BB and recorded 25/25 answers successfully.

### Historical Push/Fold Rows Carried A False Flop Stamp

Ten of twenty sampled `mtt-001` chart rows were valid two-action Push/Fold
distributions stored under a generic engine label but stamped as Flop. The
shared chart normalizer now keys from the payload type, verifies the lossless
two-frequency distribution, and canonicalizes these decisions to Preflop with
no board before persistence or delivery. The exact runtime probe now returns
20/20 unique canonical chart rows and records 20/20 answers successfully.

### Uncertified Multi-Street State Could Leak Into The Next Hand

The current Training cache has independent Flop, Turn, and River questions but
no certified `nextStreetContinuationAction` for `mtt-021`. The old client could
leave a continuation flag active after a completed independent hand, causing a
later River label to render against a stale three-card board. Training now
starts or continues a hand only when the exported question contains the exact
continuation action. Otherwise it clears the hand state and advances to the
next canonical question. Phase 6 therefore certifies all street geometries
without pretending independent solver rows are one continuous solve.

### Mastery Levels Eleven And Twelve Were Blocked By Database Constraints

The product exposes twelve levels while several Training tables retained legacy
one-through-ten checks. Migration
`20260901130000_training_levels_one_through_twelve.sql` expands the guarded
Training, history, daily-challenge, and arena constraints to the product's exact
1-12 contract. A read-only live-schema preflight caught that current
`training_progress` uses `level`, while an archived schema used
`current_level/highest_level_completed`; the migration now guards both shapes
by real column presence. All existing rows passed the 1-12 precondition, the
transactional migration was recorded as `20260901130000`, and the five live
constraints now report 1-12. Authenticated Level 11 and Level 12 batch and
record probes both returned HTTP 200, with canonical cache rows persisted at
each exact level.

### Desktop Feedback Collapsed The Club Arena Canvas

The first complete desktop matrix found the verdict state's flex column
shrinking the 605:1000 table surface to zero height while avatars and cards
continued painting outside it. Verdict is now a scrollable review state that
preserves the same complete table geometry as action state on desktop and
mobile, with feedback below it and manual Next still required.

The final mobile Turn capture also exposed long four-option concept answers
overflowing fixed-height controls. Mobile actions now use a taller metallic
2x2 rail with responsive wrapped labels. The browser ledger rejects any action
whose rendered content exceeds its button height, so meaningful answers remain
fully readable instead of overlapping the next row.

### Worker Activation Reloaded A Live Decision

The first production closeout repeatedly lost the page while a verdict was
being held for the manual-Next persistence proof. A fresh immutable-preview
probe showed that the PWA worker legitimately changed controller during a live
Training hand. The app-wide updater previously reloaded every route on that
event, destroying the decision or feedback state. It now promotes the worker
but defers reload on `/hub/training/arena/*` and `/hub/training/play/*`; the new
worker owns the next navigation while the current hand finishes on its loaded
assets. A fresh mobile probe observed the controller change, zero post-start
navigations, and zero page errors.

The same audit found that the footerless mobile launch lobby still reserved a
phantom 56-pixel footer row. Its fixed Start rail now anchors ten pixels above
the device safe area and the content reserves only the actual rail clearance.
Both independent geometry contracts enforce the footerless value.

### The Ledger Consumed A Response Body The Client Does Not Consume

The final browser trace reached the visible verdict in 5.5 seconds and Vercel
recorded `record-question` HTTP 200, but Playwright waited on the intercepted
success body until its page disappeared. The real client contract checks
`response.ok` and intentionally never reads that success body. The permanent
ledger now verifies the same authoritative HTTP status, targets only the
visible manual-Next button, and records stage plus page lifecycle diagnostics.
The corrected complete `cash-001` campaign reached Session Review in 18.5
seconds instead of hanging on test-only response consumption.

## Local Release-Candidate Evidence

The rebuilt release candidate passed 56/56 focused contracts and a clean Next
production build. The final local browser ledger passed all 16 combinations:
eight representative gameplay families on 390x844 and 1440x1000. It recorded
zero page errors, console errors, broken visible images, horizontal overflow,
seat/player mismatches, table-aspect drift, board/street mismatches, or grading
write failures. Both `cash-001` runs completed all twenty hands through explicit
manual Next and reached the measurable Session Review state.

## Protected Publication And Production Evidence

- Phase 6 implementation PR 1177 merged through the protected pipeline as
  `10c62c39df7bbc2847ae5ac5139cafba56240557`.
- Production-hardening PR 1202 merged through protected auto-merge as
  `ccf12df91247483fe7e46d049ddd3be083a9fbca`. Build Safety, Supabase
  invariants, Chromium/WebKit footer geometry, audit-marker, conflict,
  silent-write, undefined-identifier, and Vercel gates passed.
- Closeout PR 1208 merged through protected auto-merge as
  `c70dda95fd5744de6e0045b72175b4b56e220135`. Its broad E2E workflow passed,
  and the exact cancelled-at-merge Global Footer workflow was rerun and passed
  both Chromium and WebKit projects.
- Exact immutable production deployment
  `dpl_9MxEg12t87P5egh9zbFwrcNXzvdd` reached READY and serves a descendant of
  both protected Phase 6 commits.
- The authenticated production ledger passed 16/16 representative cases:
  eight gameplay families on 390x844 and 1440x1000. It saved 50 captures and
  recorded zero page errors, console errors, broken visible images,
  horizontal overflow, action-label overflow, seat/player mismatches, or
  board/street mismatches.
- Both mobile and desktop `cash-001` sessions completed all twenty hands by
  explicit manual Next and reached the real Session Review state. River,
  heads-up, Spins, nine-player MTT, four-card Turn, and selected Push/Fold
  contracts all passed with HTTP 200 answer persistence.
- Authenticated Level 11 and Level 12 probes each returned two canonical
  four-option questions at the requested level and recorded an answer with
  HTTP 200 and `success: true`.
- Direct production `/auth/login` returned HTTP 200, rendered the visible Sign
  In control, and recorded zero hydration or page errors.
- The approved global header has no Phase 6 implementation or closeout diff.

### Broad-Suite Closeout

The first broad workflow on production-hardening PR 1202 reported 664 passed,
5 flaky, 24 skipped, and 20 failed. The failure evidence showed that the broad
suite's live-only infrastructure spec ignored the configured localhost target.
After sustained parallel traffic, `smarter.poker` returned Vercel's security
checkpoint (HTTP 403) to the mobile project; health, manifest, seven unrelated
core pages, Video Library, and Poker Near Me then failed together. That was an
audit-harness routing defect, not a Training runtime failure. The spec now uses
`NEXT_PUBLIC_BASE_URL` when CI provides it and retains the live production
default for explicit production watchdog runs.

The same closeout found two independent false-negative selectors without
weakening their behavioral contracts. Video Library expected `0 playlists`
while the accessible control correctly exposed `0 Playlists`. News keyboard
navigation compared animated article text, which can be temporarily empty; it
now proves movement by comparing the actual focused card's structural index.
The corrected affected slice passed 102/102, the signed-out return path passed
on both viewports, and the keyboard contract passed ten consecutive
desktop/mobile repetitions. The final complete local Chromium/mobile matrix
passed 689 with 24 intentional environment skips, zero failures, and zero
flaky tests across all 713 scheduled entries.

The final production smoke exposed one remaining harness-only mismatch: its
mobile arena check still waited for the global footer that Phase 6 deliberately
removed. The smoke now enforces the real contract—zero arena footers, a visible
launch rail and Start control fully inside the viewport, containment of the
button within its rail, and an 8–48 px safe-area bottom gap. The renewed
authenticated production run passed the 107-card Hub, both login viewports,
three 12-level campaigns and four representative arenas on mobile and desktop,
with zero page errors, console errors, broken images, scanlines, or horizontal
overflow. Follow-up PR 1218 publishes the corrected permanent smoke and its
regression contract through the protected pipeline.

The full workflow attached to PR 1218 then exposed six unrelated permanent
failures after 678 passes and five recovered retries. Focused reproduction
proved two stale E2E contracts: the Poker Near Me recovery test raced the live
999-row refresh, and the Wallet check navigated to a nonexistent
`/hub/wallet` route even though the canonical Wallet is a header-owned modal.
PR 1231 controls the successful directory seed before the synthetic outage and
opens the real Diamond Wallet control. The exact affected Chromium/mobile
slice passed 17/17 without changing application or global-header code.

The renewed broad run then proved a second suite-wide isolation defect: the
account-scoped first-run notification sheet appeared on its 20-second timer and
intercepted unrelated long-running clicks. PR 1234 records that prompt as
handled only in the shared authenticated E2E fixture; notification-specific
coverage remains independent. The affected Phase 13/14 Chromium/mobile slice
passed 15/15, and no product or global-header code changed.

## Remaining Phase 6 Work

None. Phase 7 begins from the published Phase 6 production baseline.
