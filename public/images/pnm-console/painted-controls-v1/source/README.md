# Poker Near Me painted controls v1

The control icons are purpose-built raster objects generated with the built-in
OpenAI image-generation tool. The transparent source sheet is 1448 x 1086,
arranged in twelve exact 362 x 362 cells, with SHA-256
`3486670cd82502e59ec48c79c084bee2a29767bbac012df0cb088e0128547d32`.

Reference inputs:

- Club Arena `club-utility-shell.png`, 1105 x 1133.
- Poker Near Me `painted-chassis-v1/source/crest-locator.png`, 1254 x 1254.

Final generation prompt: create a strict four-column by three-row sheet of
twelve complete front-facing icon controls matching the reference materials.
Every pictogram is a dimensional chrome inlay with restrained blue bounce and
its own unique, intact machined holder. Cell order is search, location,
fullscreen, back, close, saved, share, phone, globe, directions, calendar,
home. No text, flat vector treatment, generic rounded app buttons, broken
rails, cropped corners, detached ornament, or sheet-wide frame. Genuine alpha
transparency is required.

The first generation baked a checkerboard into the PNG and was rejected. The
final image-edit prompt preserved the twelve objects and exact grid while
replacing all checkerboard/background pixels with real alpha transparency.
`sips` confirms `hasAlpha: yes`.

Each final icon is cropped losslessly from its exact cell with ImageMagick,
then transparent margins are trimmed. The checked-in icon files are the only
runtime objects; `icon-sheet.png` is retained here as the immutable source.

The blank painted action plates and search/utility wells were vendored from
the same local Club Arena art library as reference-derived controls. They
contain no dynamic text; all labels remain DOM content. Their checksums are
covered by `__tests__/poker-near-me-console-contract.test.mjs`.

## Poker Near Me command-drawer extension

`icon-sheet-command.png` is a second built-in OpenAI image-generation master,
1448 x 1086 with twelve exact 362 x 362 cells and SHA-256
`3b7f2e34a8f018188a9c4fa3c7c12933c65309b829c7b43bb20a9b53644be59e`.
It was generated from `icon-sheet.png` as the material-and-lighting reference.

Generation prompt:

> Using the attached Smarter Poker painted control sprite only as the exact material-and-lighting reference, create a SECOND production UI sprite sheet for the Poker Near Me command drawer. Strict 4 columns by 3 rows, TWELVE equal square cells, every object centered at identical scale with generous true-transparent gutters. Each cell must contain one complete standalone photoreal machined casino-console icon holder: thin polished chrome and dark gunmetal, black quilted or brushed-metal face, subtle electric-blue reflected edge energy, sharp intact bevels, realistic reflections, ambient occlusion and depth. Unique integrated holder silhouette per pictogram, but one coherent family. Cell order left-to-right, top-to-bottom: 1 hamburger menu with three horizontal bars, 2 edit/pin pencil, 3 events ticket, 4 live poker game chips; 5 route/road-trip signpost, 6 tournament trophy, 7 alert bell, 8 filter sliders; 9 community players, 10 information letter i symbol, 11 review star, 12 more-tools ellipsis. No words other than the single lowercase information i pictogram, no labels, no numbers, no UI screenshot, no frame around the sheet, no disconnected corner fragments, no cropped objects, no broken rails, no flat/vector/cartoon symbols, no generic app-button look, no CSS-like gradients, no glow fog, and no checkerboard pattern. Preserve true alpha transparency outside each complete control. Front-facing orthographic presentation. PNG with genuine transparent background, designed to remain crisp at 44-64 CSS pixels.

The first output baked a checkerboard into the sheet and was rejected. Final
image-edit prompt:

> Edit this exact 4 by 3 Poker Near Me premium icon-control sprite sheet. Preserve all twelve metal icon holders, their pictograms, exact order, full intact edges, materials, lighting, proportions, scale, and grid positions. Remove the gray-and-white checkerboard completely and replace every checkerboard or sheet-background pixel with genuine alpha transparency. Do not repaint, crop, rearrange, add, remove, relabel, or alter any control. Output PNG with a truly transparent background, no checkerboard baked into the image, no sheet-wide frame, and no text beyond the existing information i pictogram.

The final master has real alpha pixels and is split without resampling by
`scripts/art/crop-pnm-console-sheet.py` into menu, edit, event-ticket,
live-games, roadtrip, trophy, alert, filter, community, info, review, and more
painted controls. Runtime labels and menu state remain live DOM content.
