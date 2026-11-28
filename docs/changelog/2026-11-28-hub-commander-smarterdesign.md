# 2026-11-28 Club Commander player pages #SMARTERDESIGN

Owner order (Dan, 2026-11-27): "CLUB COMMANDER NEEDS THE SAME #SMARTERDESIGN UPGRADE TO EVERY SINGLE PAGE, SUBPAGE, BUTTON AND EVERYTHING ELSE, EXACTLY LIKE WE'VE DONE FOR EVERY OTHER WORLD HUB PAGE." The Commander staff app shipped in smarter-poker-commander #166. This change covers the 37 player pages under `pages/hub/commander/`.

## Global header on every page
- `CommanderPageShell` now mounts the approved Smarter.Poker global header (`UniversalHeader`): the approved hamburger, the live profile photo and the same row every other World Hub page shows. Before this, no `/hub/commander` subpage showed the global header at all; the shell drew its own floating hamburger, which also sat on top of the painted "?" in the image header's upper-right corner.
- `/hub/commander` (Live Poker) is on the shell too. Its command-grid menu button, which the hamburger law rejects on Commander pages, is gone, and the route left the app-root header fallback list (it now owns the header through the shell).

## Image headers
- `src/styles/commander-futuristic.css` gains a #SMARTERDESIGN layer: rivets, corner lights, glow strips and pipes never render; `.cmd-header-full` and any page `<header class="cmd-header-bar">` are page image headers (steel rim, masked scene from the shell's `--sd-scene`, chrome seal, white italic title); panels get the steel rim, primary actions the cobalt bevel, secondary actions the chrome row, inputs ink.
- `CommanderPageShell` maps each route to a scene from the World Hub header library and portals the one painted "?" into the page header (opens the Commander FAQ, named "Help For <page title>").
- Pages that drew their own top bar now render the image header: Rate Table (was an all-white light page, rebuilt on Commander classes), Digital Player Card, Tournament My Status, Tournament Register (was a `<div>`, so the "?" never found it), Host A Home Game (was a viewport-fixed bar plus an 80px spacer) and the venue Waiting List board.
- Return links sit directly above the image header, left aligned, never inside it (`.cmd-back-row` / `.cmd-back-link`, a 44px chrome-row control with a visible "Back" label), on all 21 pages that had one.
- Static description sentences under titles were removed (contextual descriptions belong behind the "?"); data lines such as city or member counts stay. Labels are Title Case.
- FAQ: the search box wraps under the title on phones instead of pushing the page wider than the screen.

## Colour
- Every colour moved to the #SMARTERDESIGN tokens by `scripts/smarterdesign-palette.mjs` (the script Commander and commander-shared use).
- The script works from a fixed map, so five prohibited hues it did not know survived and were fixed by hand: the Player Card gold, bronze and diamond tiers (#FCD34D, #92400E, #4C1D95), the league third-place badge (#CD7F32) and the waiting-list column bar (#C5962E, #8B6508). The waiting-list board's black-and-grey palette moved to the ink/steel neutrals.

## Tests
- New `__tests__/hub-commander-smarterdesign.law.test.mjs` (Build Safety Gate CHECK 8): no prohibited hue by actual hue (not a list) in the pages, components or stylesheet; palette `--check` clean; the stylesheet layer; the shell's global header, scene map (art files exist) and single "?"; every page renders an image header (except the transient home-game join card and the TV tournament clock); no description sentence under a title; return links above the header.
- `__tests__/hamburger-never-regresses.test.mjs` and `__tests__/poker-near-me-casino-realism.test.mjs` now pin that the shell mounts the approved header rather than its own trigger; the dead `.commander-page-shell__menu-trigger` theme in `poker-near-me-machined.css` was removed.
- `docs/business-hub-guide-review.json`: refreshed hash for `pages/hub/commander/index.js` (header, menu and colours changed; the guide's claims are unaffected).

## Found in the preview render (393px and 1280px)
- The corner reservation (`padding-right: 52px` on the header's children) also padded the painted "?", which is a child of the header too, squeezing its icon out of its 44px box: no "?" was visible on any page. The rule now skips `.sd-header-help`.
- Forced capitals ("CHECK IN", "VENUES WITH LIVE GAMES", button and badge labels) read in Title Case: the layer sets `text-transform: capitalize` on `.uppercase` inside Commander pages and on `.cmd-btn`, `.cmd-badge`, `.cmd-stat-label`, `.cmd-header-bar-text`.
- Rate Table's five rating buttons overflowed a phone screen (the button class's 32px side padding); they now size to the row.
- Twelve hand-styled tab bars (cyan outline when selected) use one shared `.cmd-tab` / `.cmd-tab--active`: the chrome row, cobalt bevel when selected.
