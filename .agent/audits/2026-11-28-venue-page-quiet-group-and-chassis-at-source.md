# 2026-11-28 - Venue page: tidy breadcrumb, one "Not Yet Available" group, chassis rim at source

## 1. Breadcrumb inside the venue hero (DeepRouteSignalDeck)

Defect at 393px: "Hub / Poker Near Me / TX / Austin / Lodge Poker Club" wrapped as a row
of inline-flex items 7px apart in 0.14em tracked type, each carrying its "/" as an
`::after`. Reproduced in a static harness with the full `_app.js` stylesheet stack: "Austin"
and "Lodge Poker Club" wrapped to later lines and the separators printed on the line below
the words (old rects: Austin at y+51, Lodge Poker Club at y+67, 12px tall).

Root cause: the separator belonged to the item it FOLLOWED, so any wrap left it stranded,
and the tracking widened every item. Fix at source in `src/styles/worlds/poker-near-me.css`:
the separator is `li + li::before` (it leads the item it introduces), letter-spacing 0, no
transform, silver #bdd0e2 links / #e6eef6 current page, every crumb a 44px line box with an
ellipsis if one item is longer than the line. Result at 393px: two clean lines,
"Hub / Poker Near Me / TX / Austin" then "/ Lodge Poker Club", all 44px tall; one line at 1280.

## 2. Empty sections fold into one group (pages/hub/venues/[id].js)

Before (section list for a room with no player data, in page order): hero deck, recent rail,
venue header, map, unlock gate + CTA, Contact & Quick Facts, FAQ, [Best Time To Go empty
panel], [Daily Tournament Schedule "being collected" panel], Live Games empty panel,
Check-Ins empty panel, Popular Times panel (heatmap "not yet available" or VIP lock over
nothing), Player Reviews (header, a full rating-summary panel reading "No Reviews Yet", five
empty distribution bars and an empty card), Activity Feed empty panel, contributions.

After: Live Games, Check-Ins, Best Time To Go, Popular Times, Player Reviews and Activity
Feed each hand ONE Title Case line to a single steel-rimmed "Not Yet Available" group
(376px tall at 393px with all six rows) placed where Live Games was. A section with data,
an open form, an alert or a check-in of your own renders its full UI exactly as before.
Rows that accept input keep their action (Report A Game, Check In, Write A Review, Post
Update), which opens that section's own form and scrolls to it. `#checkins-section` and
`#reviews-section` move onto the row while the section is folded, so `?action=` links and
the rating-row anchor still land. The three self-fetching widgets report availability
(`onAvailabilityChange`); only a finished read with nothing in it is ever listed, and a
gated (non-VIP) heatmap read is never reported. The VIP lock emoji became an SVG.

Height: the six folded panels were roughly 1,300-1,500px with their 32px gaps (estimated
from their markup; the live page could not be loaded from this sandbox, smarter.poker is
refused by the egress proxy) and are now one 376px group.

Deliberately left alone: the Daily Tournament Schedule "being collected" fallback and the
`.last-scraped-badge` (another agent owns that copy today).

## 3. The console chassis is one steel rim at source

`.pnc[data-pnm-console='painted-chassis-v1']` in `poker-near-me-console.css` painted a
raster head per crest, a mid rail, a foot and a plate strip, and the #SMARTERDESIGN layer
overrode every slice. The raster declarations are deleted; the layer's chassis rules moved
unchanged to the end of console.css (still after every other chassis rule) and were removed
from the layer. Computed styles and boxes of 55 chassis elements (deck, notice, a plated
dialog, a plain console) were compared old vs new at 393 and 1280: identical apart from the
origin in absolute URLs and the page offset. The only cascade tie, `cursor` on a disabled
dialog plate, now resolves to the dialog's own `not-allowed`. Pictograms (.pnc-icon), map
markers, wells and the hero crest remain artwork.
