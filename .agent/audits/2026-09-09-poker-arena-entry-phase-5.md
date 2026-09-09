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

Publication and authenticated live acceptance remain pending. This change does
not enable funded Diamond games or modify production accounting.
