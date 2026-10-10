# Poker Near Me painted controls v1

The control icons are purpose-built raster objects generated with the built-in
OpenAI image-generation tool. The transparent source sheet is 1448 x 1086,
laid out as a nominal 4 x 3 grid of 362 x 362 cells (the painted holders do not
sit inside those cells; see the 2026-09-21 re-crop below), with SHA-256
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

Until 2026-09-21 each icon was cut from its nominal cell and trimmed to its
alpha bounds. That clipped most holders and is superseded by the object
re-crop described below. The checked-in icon files are the only runtime
objects; `icon-sheet.png` is retained here as the immutable source.

The blank painted action plates and search/utility wells were vendored from
the same local Club Arena art library as reference-derived controls. They
contain no dynamic text; all labels remain DOM content. Their checksums are
covered by `__tests__/poker-near-me-console-contract.test.mjs`.

## 2026-10-08 button silhouette alpha repair

The approved 348 x 114 primary and secondary button plates shipped with the
finished chamfered steel holder over an opaque rectangular black matte. The
matte made the four outside corners read as broken boxes wherever the plate
was seated on a non-identical surface. `scripts/art/clean-pnm-button-alpha.py`
removes only that export matte. It refuses any input other than the two
approved source hashes, preserves every RGB pixel and every alpha pixel at or
inside the existing steel silhouette, and changes alpha only in the four
corner triangles outside the master's own 23 px chamfer. The four-pixel edge
transition retains the master's antialias. Dimensions and native ratio do not
change; labels and state remain live DOM content.

Approved pre-repair sources:

- `button-primary.png`: SHA-256 `6b2cdb78bd430ebb5f7b5bade442829ae4f3b7865d9545168c8992ed3e6f1162`
- `button-secondary.png`: SHA-256 `67d0f61e1a15288b0eafc32e13ff2b3094881a4307d01af627f3c65fdd2f4677`

Runtime alpha-clean derivatives:

- `button-primary.png`: SHA-256 `612777b4518ef8c731c495e84f683a927a420b23c5cb63af3fd4f0f1d8f45a59`
- `button-secondary.png`: SHA-256 `bcdb0a6999c94233b85b2053dd119f1bb93a5c7d487d122f4f99d2c990d397b1`

Verify/copy the current alpha-clean masters into a review directory:

```sh
python3 scripts/art/clean-pnm-button-alpha.py \
  public/images/pnm-console/painted-controls-v1 \
  /path/to/review-output
```

The script is idempotent for the two clean hashes above. To reconstruct the
derivatives from the opaque sources, run the same command against those two
pre-repair blobs from repository history; the script accepts only the pinned
source and clean hashes.

## Poker Near Me command-drawer extension

`icon-sheet-command.png` is a second built-in OpenAI image-generation master,
1448 x 1086 with a nominal 4 x 3 grid of 362 x 362 cells and SHA-256
`3b7f2e34a8f018188a9c4fa3c7c12933c65309b829c7b43bb20a9b53644be59e`.
It was generated from `icon-sheet.png` as the material-and-lighting reference.

Generation prompt:

> Using the attached Smarter Poker painted control sprite only as the exact material-and-lighting reference, create a SECOND production UI sprite sheet for the Poker Near Me command drawer. Strict 4 columns by 3 rows, TWELVE equal square cells, every object centered at identical scale with generous true-transparent gutters. Each cell must contain one complete standalone photoreal machined casino-console icon holder: thin polished chrome and dark gunmetal, black quilted or brushed-metal face, subtle electric-blue reflected edge energy, sharp intact bevels, realistic reflections, ambient occlusion and depth. Unique integrated holder silhouette per pictogram, but one coherent family. Cell order left-to-right, top-to-bottom: 1 hamburger menu with three horizontal bars, 2 edit/pin pencil, 3 events ticket, 4 live poker game chips; 5 route/road-trip signpost, 6 tournament trophy, 7 alert bell, 8 filter sliders; 9 community players, 10 information letter i symbol, 11 review star, 12 more-tools ellipsis. No words other than the single lowercase information i pictogram, no labels, no numbers, no UI screenshot, no frame around the sheet, no disconnected corner fragments, no cropped objects, no broken rails, no flat/vector/cartoon symbols, no generic app-button look, no CSS-like gradients, no glow fog, and no checkerboard pattern. Preserve true alpha transparency outside each complete control. Front-facing orthographic presentation. PNG with genuine transparent background, designed to remain crisp at 44-64 CSS pixels.

The first output baked a checkerboard into the sheet and was rejected. Final
image-edit prompt:

> Edit this exact 4 by 3 Poker Near Me premium icon-control sprite sheet. Preserve all twelve metal icon holders, their pictograms, exact order, full intact edges, materials, lighting, proportions, scale, and grid positions. Remove the gray-and-white checkerboard completely and replace every checkerboard or sheet-background pixel with genuine alpha transparency. Do not repaint, crop, rearrange, add, remove, relabel, or alter any control. Output PNG with a truly transparent background, no checkerboard baked into the image, no sheet-wide frame, and no text beyond the existing information i pictogram.

The final master has real alpha pixels and is split without resampling by
`scripts/art/crop-pnm-console-sheet.py --sheet command` into menu, edit,
event-ticket, live-games, roadtrip, trophy, alert, filter, community, info,
review, and more painted controls. Runtime labels and menu state remain live
DOM content.

## 2026-09-21 re-crop: holders cut by object, not by cell

Why: the painted holders do not sit inside the sheets' nominal 362 x 362 cells;
rows of holders cross y = 362 and y = 724. Slicing fixed cells therefore cut 20
of the 24 holders flat at an edge (for example calendar's top edge carried 256
painted pixels at alpha > 32, info's top 259 and left 34, menu's right 208) and
dragged fragments of the neighbouring holder into nine icons (alert, close,
edit, info, phone, roadtrip, saved, share, trophy); filter also carried 2,788
pixels of the "more" holder fused to it through glow. Only back, event-ticket,
fullscreen and search were whole, and even those had painted glow touching the
canvas edge because the crop was trimmed to the alpha bounds. The contract test
checked only file size, so none of this was caught.

Method (`scripts/art/crop-pnm-console-sheet.py`, Pillow + numpy + scipy):

1. Cores: connected components of alpha > 96 larger than 5,000 px. Each
   approved sheet has exactly twelve; any other count fails loudly. The script
   also refuses any input whose SHA-256 is not the approved master's.
2. Assignment: every pixel with alpha > 0 belongs to its nearest core
   (Euclidean distance transform of the non-core mask with return indices)
   when it lies within 48 px of that core. Anything farther is a faint speck
   and is dropped: 37 px in the primary sheet and 4 px in the command sheet,
   all alpha 1.
3. Copy: each holder's assigned pixels are copied verbatim, with no resize,
   repaint or filtering. Every other pixel, including a neighbour's glow, is
   written as fully transparent (0, 0, 0, 0).
4. Frame: the canvas is the holder's assigned bounding box plus a uniform
   6 px fully transparent margin, so no painted pixel touches any edge.
5. Names: holders are ordered row-major by centroid (rows clustered by
   centroid y, then sorted by x) and must form 3 rows of 4. Primary: search,
   location, fullscreen, back, close, saved, share, phone, globe, directions,
   calendar, home. Command: menu, edit, event-ticket, live-games, roadtrip,
   trophy, alert, filter, community, info, review, more.

Reproduce (pixel-identical output, byte-identical with Pillow 12.1.1 as used
on 2026-09-21; the script prints each size and SHA-256):

```sh
python3 scripts/art/crop-pnm-console-sheet.py --sheet primary \
  public/images/pnm-console/painted-controls-v1/source/icon-sheet.png \
  public/images/pnm-console/painted-controls-v1
python3 scripts/art/crop-pnm-console-sheet.py --sheet command \
  public/images/pnm-console/painted-controls-v1/source/icon-sheet-command.png \
  public/images/pnm-console/painted-controls-v1
```

Verification before the swap: all four outer edges of every icon are alpha 0;
each icon holds exactly one 8-connected object of alpha > 32 larger than 30 px;
the previous crop template-matches inside the new one at the offset predicted
by the sheet coordinates, with a mean absolute RGBA difference of 0 over the
pixels painted in both and 100% of the old crop's own-holder pixels present; a
labelled contact sheet confirmed every name. In the command sheet the filter
and more holders sit 2 px apart and touch through glow; the nearest-core split
keeps both outlines whole.

`__tests__/poker-near-me-console-contract.test.mjs` now decodes each PNG and
asserts: at least 280 px each way, true alpha (colour type 4 or 6), every
outer-edge pixel alpha 0, exactly one alpha > 32 object larger than 30 px,
alpha > 32 coverage between 0.45 and 0.95, and a luminance standard deviation
of at least 40 over alpha > 200 pixels. The pre-2026-09-21 crops fail it.

Icons are displayed with `background-size: contain` in square boxes, so the
slightly different aspect ratios need no CSS change.

| Icon | Sheet | Size (px) | Bytes | SHA-256 |
| --- | --- | --- | --- | --- |
| `icon-search.png` | primary | 339 x 336 | 175,430 | `e55b50833e26771e95d502299fa2a10681839e9a0b0ae7147d34bf2e3ca3ccc4` |
| `icon-location.png` | primary | 334 x 370 | 181,996 | `a21bd509f687a6acdfac7446775ed0bc5bc22995cbfe9b9f8e3985d0c270e714` |
| `icon-fullscreen.png` | primary | 368 x 337 | 167,501 | `e2ea8542553c54f2eead32c8f572298aac8d70a6a08c9514bc30eec36b4c9783` |
| `icon-back.png` | primary | 336 x 337 | 181,891 | `ada954f0bc88a5c4f1c748134d06cfaccf2ae9004945b34321c8cd2f611234f6` |
| `icon-close.png` | primary | 338 x 335 | 193,118 | `39a72ebdccc93b6cf272c464598a33ee21bae987bff715d5ace0ac51c49f9221` |
| `icon-saved.png` | primary | 335 x 334 | 175,026 | `0af740bacfb94bb35b0f7aadbed1c3723647410b6e5c8ef7f3b737f499f98fb6` |
| `icon-share.png` | primary | 335 x 366 | 175,980 | `97790d2d4ebae278305b14da1d864ecbdc942b1bbfab74f00845395e432f7899` |
| `icon-phone.png` | primary | 345 x 331 | 173,805 | `9f26872de3bee76ee47b37c64e441e2da8dbd5b91cfd92b33fb8e58fda8b4ebf` |
| `icon-globe.png` | primary | 337 x 343 | 188,231 | `0d2b7f11f52620fcdc4888063009c3a1c1be3bbf1cfba5b4fb6e49a20c6c67a5` |
| `icon-directions.png` | primary | 325 x 369 | 178,119 | `a6078c7a7c0b2f47ee9bb30fe4608bf8cdae969783179afc871b3f36e67e15df` |
| `icon-calendar.png` | primary | 371 x 327 | 174,086 | `c53132f13ab20dbe9a1bc030fc77480b18600180acb3a8b20714b35822c67ccc` |
| `icon-home.png` | primary | 337 x 333 | 179,942 | `1ad7a46ed6c731e2d2388c209014542279db616b5bd0220619a477808da1bc44` |
| `icon-menu.png` | command | 355 x 332 | 158,038 | `c8d71e00be2f4ad138b2c65ffaca1ed0fd5a4e790d1c1f0cc5baf72067933e35` |
| `icon-edit.png` | command | 331 x 369 | 170,337 | `5ac689f74109926da8fcc3f28ad51bc9240b8f127d3bccf425b57eb9a9e017d2` |
| `icon-event-ticket.png` | command | 389 x 333 | 180,088 | `71e57e6ad6105ef88450677fddac214b14524e1fbde52f1b096ee552c5cc9842` |
| `icon-live-games.png` | command | 337 x 334 | 181,878 | `67adb463979ee20afd7b0594692f2ca89a29a8f6d31636bddeeaf4b5b94d3681` |
| `icon-roadtrip.png` | command | 307 x 357 | 152,315 | `a28d490a2ade6c80136f90cf8e24ff6e66d50ff6da7c2541d753a878b3d76cdd` |
| `icon-trophy.png` | command | 333 x 325 | 168,030 | `1b157375e9a968c269ec64a7e8b8c84eef3804d5404bef5a23b4f0fec75f6204` |
| `icon-alert.png` | command | 352 x 324 | 159,592 | `69f67a68c5e88738d2f93fcafc18ef2121b16e5d10e1ddf80bf439c32e8c8618` |
| `icon-filter.png` | command | 321 x 358 | 159,986 | `0da917878e882d7bd1b4a95d4979ad2499ba81eaa3f5e35aad7981615e38944c` |
| `icon-community.png` | command | 354 x 341 | 180,628 | `cd4ccf091305836f5f7a056151d2ece09e1125ab0d15f26d37d92bc9ff28d385` |
| `icon-info.png` | command | 366 x 325 | 156,900 | `98d221cc22f8d328376826b74da06b4305b13198b547f3c9382e198c381fb890` |
| `icon-review.png` | command | 320 x 359 | 160,361 | `020b269503a3ef1d94b6914e080c338226e4445ae1130743522ad1090a29f787` |
| `icon-more.png` | command | 337 x 340 | 178,426 | `2c71c6809c277237ea01ec53e684163d78a4926cbd9be9293075954a66a291e0` |
