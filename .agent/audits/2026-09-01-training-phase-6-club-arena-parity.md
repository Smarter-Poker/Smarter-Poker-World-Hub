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
river, heads-up, three-player Spins, nine-player MTT, and push/fold families on
390x844 and 1440x1000. It asserts the approved header, footer ownership, scroll
origin, 605x1000 Club Arena table aspect, seat/player agreement, hero cards,
dealer, pot, all-in availability, loaded images, horizontal containment, and
persistent manual feedback, while saving the pixel captures and a JSON ledger.
The protected preview and exact production descendant still need to run this
ledger before Phase 6 can close.

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

## Remaining Phase 6 Work

Build and verify the state-by-state geometry and pixel ledger for idle,
preflop, flop, turn, river, action, verdict, all-in, and completion across
mobile and desktop. Compare seats, avatars, hero-card fan, dealer/blind markers,
chip positions, pot, board, HUD, action rail, and feedback layers to the current
Club Arena authority. Close every defect, publish through a protected PR, and
certify the exact production lineage before marking Phase 6 complete.
