# Poker Arena Entry: Diamond Phase 5 Of 12

The World Hub now advertises one Poker Arena card at the existing
`/hub/club-arena` rewrite. Its sibling `public/cards/poker-arena.png` updates the
original Club Arena heading using the built-in image editing tool. Prompt:
change only the top heading to POKER ARENA, preserving the original composition,
club labels, lion crest, blue lighting, table, frame and bottom caption.
The original Club and Diamond artwork files are retained.

Six standalone Diamond pages and their iframe/simulated content are removed,
with their exclusive client state and style import. Desktop/mobile registries,
menus, footer routes, sitemap, quick actions and help destinations use the shared
entry. Cached standalone selection is retired. Unknown dynamic world IDs now
return HTTP 404; supported worlds and aliases remain reachable.

The six removed physical routes reduce current footer coverage from 203 to 197
and six-command families from 14 to 13 (84 to 78 commands). The historical audit
record remains unchanged; its test explicitly verifies the six retired sources
are absent. All other menu/artwork assertions remain enforced.

Focused checks: initial run 40 passed, four old route-count contracts failed;
all 18 assertions in the affected suites passed after the retirement updates.
The new shared-entry/404 test runs in the normal prebuild gate.

## Publication And Live Evidence

Implementation PR #1701 merged as `606a789e16944b8a7bdc63789a46072a01bd4dc2`.
At September 9 23:29:29 UTC, production /api/health reported that exact commit,
status ok, deployment `dpl_Fwf91tWqAFGSAE6PSJwe16DRQAgW`. The authenticated
World Hub menu contained one Poker Arena link to /hub/club-arena, no standalone
Diamond link, and that link opened the published shared Poker Arena selector.
The new /cards/poker-arena.png returned 200 image/png and was visually inspected.

At 23:31:28 UTC all six retired Diamond URLs returned HTTP 404: the root,
history, leaderboard, schedule, stats and table-settings. Root/history were
also checked in the authenticated browser and displayed the 404 surface,
with no legacy iframe or simulated page.

The build safety gate passed all 1,613 tests and TypeScript after exact
retirement counts and generated source inventory were updated. The original
footer browser run passed 14 cases and failed two solely because its probe
still looked for the old Club Arena accessible name. PR #1702 changes that
expectation to Poker Arena; it does not relax assertions or retry limits.
Follow that run's final result rather than counting the old failure as passed.

The managed browser has WebGL disabled. Its World Hub 3D canvas cannot render;
that same capability error was observed before and after this release. The
registry, deployed artwork and working menu entry are verified; a rendered 3D
carousel visual check is not claimed.

The shared in-tab footer repair and the final phase gate are recorded in Club
Arena PR #4054 and docs/changelog/2026-09-09-poker-arena-shell-phase-5.md.
No funded Diamond games or production accounting changes are enabled here.
