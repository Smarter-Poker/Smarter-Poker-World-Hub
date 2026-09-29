# Poker Near Me: Club Arena Console restoration and completion closeout

Date: 2026-09-29. Component: World Hub (non-engine client work).
Branch: `agent/claude-pnm-20260920/pnm-club-arena-console`.
Worktree: `/Volumes/SmarterWork/agent-work/claude-pnm-console-20260929/world-hub`.

## Policy receipt

`node /Users/smarter.poker/Documents/agent-policy.mjs read`, emitted 2026-09-21T22:16:05.248Z
and re-read at takeover on 2026-09-20T14:11:20.926Z. Policy version 2.9, manifest
`7663cc909626f7e9966931d27166ad8774addc801f7ad1898a2d7564bc13c378`; OWNER-POLICY
`76228d75677eb76ca9dcfbf65fd68ddb7aac3941f61154acc456ae8230a9a4fa`, OPERATING-LAW
`a8bc3c04dce3354ebdd51a89c0b7d715af3344edcc794d33f6b3ad64506961d5`, HARDENING
`d5fc451ce5caf6d6b5e64597a13883e1246581678fe53c962339d0a66136993e`, REFERENCE-INDEX
`adce89c3f838f2f373cd504a00329d53906404d1dd42a647f672af6c16f95555`. The emitted bytes were
identical on both reads. Repository `AGENTS.md`, `AGENT-PLAYBOOK.md`, `PUBLISHING.md` and the
Club Arena Console skill were read at takeover and before final validation.

## Custody and recovery

The candidate existed only as uncommitted files in
`Documents/.agent-trees/Smarter-Poker-World-Hub/codex-pnm-club-console`, and that worktree's
registration had been pruned from the shared clone, so `git` in it answered
"not a git repository". Nothing protected the work: no commit, no ref, no `refs/wip` snapshot.

Recovered without touching the dirty tree: a new linked worktree on the owned branch at its
original base `6d955dd8`, the intended 103 paths copied in, then verified before committing.

- 38 modified tracked files, 65 new files, `38 files changed, 1149 insertions(+), 1929 deletions(-)`.
- Untracked manifest sha256 `4546a942665600a0e65be29c150a54bf95cd7c6d4e40dbaf71fae5ae56c8cf8b` and
  20,728,937 untracked bytes: both match the handoff's recorded fingerprints exactly.
- 98 of the 103 files are byte-identical to their PR #1808 versions; exactly the five the handoff
  named differ.
- The handoff's tracked-diff fingerprint `708e6106…` did not reproduce; the diff of the same bytes
  is `4a176b79…` under every diff option tried (myers/minimal/patience/histogram, prefix and rename
  variants). The original worktree's index was destroyed with its registration, so a staged-state
  diff cannot be reproduced. Content identity is established by the other three checks above.

Recovery commit `3a402295` (normal hooks, configured identity) pushed to
`origin/agent/codex/pnm-club-arena-console`; GitHub reports 103 files and all 49 artwork blobs
identical to local. The Agent Open PR workflow opened PR #1937 for that stale-base backup and the
autopilot enabled squash auto-merge; auto-merge was disabled and the PR closed with an explanation
within three minutes. A second remote copy sits on `backup/claude-pnm-20260920/pnm-club-arena-console`.

## Integration with current main

Rebuilt on current main through the repository's own `scripts/agent-workspace.sh` route. 93 of the
103 paths were unchanged on main and came across byte for byte; 10 overlapping paths were merged
three ways and reviewed hunk by hunk (only `pages/_app.js` and `PokerTourCard.jsx` conflicted).
Main's expanded `next/font` import, its crawlable tour `Link`, its marketplace/prebuild/dependency
changes, the lobby CLS reservation, the AEO metadata and `HubPageSummary` blocks and the map asset
optimization all survive; every line main added since the base is present and no line main removed
was resurrected. A later `origin/main` merge (75 commits) resolved one conflict in
`RoadTripPlanner.jsx`, where main had reformatted the inline stylesheet this work removes.

## What this candidate changes

Painted icon set: all 24 pictograms re-cut from the two approved master sheets as whole objects
(the previous fixed-cell crop left 20 sliced at an edge and 10 carrying a neighbour's pixels);
`scripts/art/crop-pnm-console-sheet.py` now finds each holder, copies its pixels verbatim, and
refuses a sheet whose sha256 is not the approved one. The contract test decodes each PNG and checks
transparent edges, a single object, coverage and painted detail instead of a byte-count proxy; it
fails against all 24 old icons.

Search and lobby: the overlay is painted in every state and gained an error state; the focus trap
no longer counts hidden controls; the search surface is no longer left hidden from screen readers
after the nested detail closes; the submit control no longer sits off-screen on phones; the lobby's
Voice and GPS controls are painted; the duplicated Discovery Deck eyebrow is gone; unknown counts
say Unknown instead of printing 0, and estimated tables are labelled estimated.

Cards and dialogs: the venue check-in popup and the reviews sheet are painted console dialogs with
the full dialog contract; the injected `VC3_CARD_STYLES` sheet is gone; logos keep their own ratio;
only observed counts get a live signal; Report Game and Venue Game Alerts are painted; the dialog
scrim is opaque and dialog fields are 16px so iOS does not zoom.

Command drawer and header: every Poker Near Me menu item has a semantic painted holder or a
deliberate text treatment, no rails cross the rows, no frame is clipped, and the Poker Near Me
header controls have 44px hit areas. Other worlds are pixel-identical before and after.

Discovery tabs: the flat filters, day tabs, selects and call-to-action buttons across venues, live
games, tours, series, daily tournaments, the events calendar, saved, alerts and more are re-seated
on the master plates and wells; loading, empty, error and signed-out states are painted panels; the
family nav balances its tenth plate at phone width; the deck no longer pins over a phone viewport.

Maps: the search-result map frames its results instead of opening on the whole country; the
fullscreen header keeps every control on a painted face at every width; the road trip planner's
markers, popups and controls are painted; the venue profile map uses the painted marker and popup.

Deep routes: the duplicated description is gone; an unknown tour code returns a real not-found
instead of a fabricated tour page; a logo is never enlarged into a photograph's place; long
directories print their tail as console rows (Texas: 48,304px to 14,099px on a phone) with every
link still server-rendered; the 1.65 MB crest master is replaced at runtime by a 288 KB copy made
from it.

Home Games: a private game shared by invite link is no longer indexable; a failed lookup no longer
claims the game does not exist; every state carries one main landmark and a heading; the near-me
route is painted; the favourite control meets the 44px floor. Commander keeps its own approved
dress, and only defects were fixed there.

## Verification on the exact candidate

- `npm run lint`: ESLint passed for 4,559 files.
- `npm run test:pnm`: pretest 5/5, main suite 372/372 (was 279 with two failures at takeover).
  The two known failures are fixed at their cause: the pictogram contract now decodes the art, and
  the mobile command frame regression tests the external cascade it moved to.
- `npm run test:pnm:scrapers`: 9 of 10 suites pass (271 tests). `test_pokeratlas_atomic_ingest.py`
  cannot start its temporary PostgreSQL on this Mac (`pg_ctl: could not start server`) and reports
  0 tests run. No scraper, API or library code is in this candidate's diff; the only Python it
  touches is the art tooling.
- `npm run prebuild`: green (317/317 and 4/4 in its embedded suites).
- Exact production build (`copy-reader-assets`, `prune-platform-bins`, `patch-next`,
  `test:marketplace` 608/608, `test:training:phase6-authority` 818/818, `next build --webpack`):
  exit 0, 501 prerendered HTML pages.
- Playwright against the built candidate served by `next start`: all 15 Poker Near Me specs on
  chromium and mobile-chrome: 101 passed, 6 skipped, 2 did not run, exit 0. The two WebKit projects
  cannot navigate on this Mac at all (`page.goto` times out at 150s against localhost, before any
  assertion); the same specs pass on Chromium, and the hosted E2E workflow remains the WebKit proof.
- Visual certification on the built candidate: 23 routes x 3 viewports (1440x900, 390x844, 844x390)
  = 69 renders with machine-readable metrics. Every render: HTTP 200, exactly one `<main>`,
  `scrollWidth === clientWidth` (no horizontal overflow), no broken images, no page errors. The
  remaining sub-44px targets are the approved global header buttons (documented exemption in
  `src/index.css`, and given 44px hit areas on Poker Near Me routes by this change), the shared
  footer links and Leaflet's attribution links. Failed requests are client aborts on unmount and
  401s from authenticated endpoints while signed out.

## Live route counts (2026-09-29, from the production sitemap)

1,318 URLs total, 1,144 Poker Near Me: lobby 1, public discovery tabs 9, geography 390 (1 national,
40 states, 349 cities), venue profiles 478, tours 29 (1 directory, 28 details), series 226 (1
directory, 225 details), daily tournaments and events calendar 2, public Home Games 9. 174 non-Poker
Near Me.

## Data truth

No scraper, API or model code changed. Provenance labelling is unchanged in contract and was
tightened in presentation: observed activity keeps "Live Now", modelled activity reads "Approx." or
"Estimated", mixed reads "Live + Estimated", and unknown or catalog-only now says so instead of
printing 0 or a green live signal. The data-truth, emergency-truth, platform-counts and
catalog-monitoring suites are part of the green `test:pnm` run.

## Known limitations

- WebKit cannot be exercised locally on this Mac; hosted CI is the proof for that engine.
- The PokerAtlas atomic-ingest suite needs a local PostgreSQL that will not start here.
- Local Supabase credentials are rejected ("Unregistered API key"), so signed-in and server-rendered
  data states were verified from source and from production-proxied client data, not locally logged in.
- Reported and not taken in this pass: the two painted button plates carry an opaque backdrop
  outside their chamfer; the approved phone header art places its icons closer than 44px apart, so
  two of the eight controls cannot take a full 44px width without new art; the lobby pod panel and
  the tour detail body remain generic; no venue in the bundled directory has a cover photograph.
