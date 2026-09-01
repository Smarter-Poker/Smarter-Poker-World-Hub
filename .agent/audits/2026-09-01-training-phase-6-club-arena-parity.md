# Training Phase 6: Club Arena One-To-One Gameplay Parity

Date: 2026-09-01  
Status: In Progress  
Protected Baseline: `d8d3b1468ebc21b85eeb11f7ae6bf54c3f3d86a1`

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
that end state measurable without changing its design. The protected preview
and exact production descendant still need to run this ledger before Phase 6
can close.

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

## Local Release-Candidate Evidence

The rebuilt release candidate passed 56/56 focused contracts and a clean Next
production build. The final local browser ledger passed all 16 combinations:
eight representative gameplay families on 390x844 and 1440x1000. It recorded
zero page errors, console errors, broken visible images, horizontal overflow,
seat/player mismatches, table-aspect drift, board/street mismatches, or grading
write failures. Both `cash-001` runs completed all twenty hands through explicit
manual Next and reached the measurable Session Review state.

## Remaining Phase 6 Work

Rebase the release candidate onto exact protected main, rerun focused and broad
checks, publish through the protected PR, verify the migration and exact healthy
deployment lineage, then rerun this same authenticated ledger against
production. Phase 6 remains in progress until that evidence passes.
