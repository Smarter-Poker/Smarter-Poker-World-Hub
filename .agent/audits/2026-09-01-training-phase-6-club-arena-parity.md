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
contains 379 manifest-authoritative JS/CSS chunks totaling 7.981 MB, inside the
unchanged 9 MB ratchet. Another 185 compatibility chunks total 4.161 MB. The old
gate added them together and reported 12.143 MB as current code.

The corrected gate measures:

- initial load against 1.5 MB;
- current manifest generation against the unchanged 9 MB code ratchet;
- retained compatibility code against a 6 MB and 400-chunk bound;
- the complete deployed payload against 110 MB.

The gate also fails if the runtime manifest is absent, malformed, or references
a missing current JS/CSS asset. The shipped evidence is 1.22 MB initial, 7.98 MB
current code, 4.16 MB retained code, 58.77 MB payload, and zero exceeded budgets.

### Gameplay Launched Under The Setup Scroll Position And Library Footer

The first matched live capture found the table root starting 156 pixels above
the viewport and the fixed Training library artwork covering the complete lower
action area. Club Arena's table routes are immersive and do not mount their
library footer. Training now scrolls to its visual origin when the playing phase
mounts and suppresses only the world footer on `/hub/training/arena/*`. Browse,
setup, progress, review, and every other Training route retain their footer.
The approved global header is unchanged and remains present during gameplay.

## Remaining Phase 6 Work

Build and verify the state-by-state geometry and pixel ledger for idle,
preflop, flop, turn, river, action, verdict, all-in, and completion across
mobile and desktop. Compare seats, avatars, hero-card fan, dealer/blind markers,
chip positions, pot, board, HUD, action rail, and feedback layers to the current
Club Arena authority. Close every defect, publish through a protected PR, and
certify the exact production lineage before marking Phase 6 complete.
