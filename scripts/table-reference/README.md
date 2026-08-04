# Training table — pixel reference

`.agent/design/training-table-template.png` is the design for the GTO trainer
table. This folder holds the tooling that turned it into a real, measured build
instead of an eyeballed approximation, plus the measurement scripts that keep it
honest.

The current build sits at a **mean absolute luminance difference of 13.23 / 255**
against the template, down from 16.34 when the loop started. Every structural
element — plates, rings, banner, action bar, hole cards — matches within a few
pixels; the residual is dominated by the portraits, which are background-removed
cut-outs re-rendered at a new size rather than the template's baked pixels.

## The idea

The template is 873 × 1224. Every dimension in the CSS is written as
`calc(N * var(--u))`, where

```css
--u: min(calc(100vw / 873), calc(100dvh / 1224), 1.6px);
```

so `N` is literally "pixels measured off the template". At a viewport of exactly
873 × 1224, `--u` is 1px and a screenshot can be diffed against the template
pixel for pixel. At any other size the whole frame scales proportionally.

That is what makes the loop possible: a disagreement between build and template
is not a matter of taste, it is a number, and the number tells you which `N` is
wrong.

## The loop

```bash
python3 scripts/table-reference/cutout.py           # once: generate the portraits
python3 scripts/table-reference/build_table.py --assets
node    scripts/table-reference/shot.mjs
python3 scripts/table-reference/banddiff.py         # the scorecard
```

To score what production is actually serving rather than the local file, swap
the third command for `shot_prod.mjs` and rerun `banddiff.py`:

```bash
node    scripts/table-reference/shot_prod.mjs       # https://smarter.poker/...
python3 scripts/table-reference/banddiff.py
node    scripts/table-reference/verify_prod.mjs     # structural checks, live
```

That is the check that catches a stale CDN copy, a portrait that 404s in
production but not locally, or a commit that never actually landed. It fails
loudly on any response >= 400 or any `<img>` that decodes to zero width. Last
run against production: **all 10 images decoded, no 4xx, 13.230 / 255** —
identical to the local build, so the deployed page is the measured one.

`banddiff.py` prints the overall mean and a mean per 153px band, then names the
worst band. Zoom that band, find the specific defect, measure it, fit the CSS to
the measurement, rebuild. Repeat until the worst band stops moving.

Measurement scripts, all reading the same template/screenshot pair via
`refpaths.py`:

| script | measures |
| --- | --- |
| `banddiff.py` | overall + per-band difference, and the red/cyan overlay |
| `measure2.py` | name-plate bounding boxes and ring/felt stroke widths, from gold pixels |
| `cardmeas.py` | hole-card white bbox and pixel count, hero artwork top edge |
| `fitart.py` | best `--ph` / `--ax` / `--po` per portrait, by masked cross-correlation |
| `seatzoom.py` | a 2× contact sheet of all nine seats: template \| build \| overlay |
| `plateprofile.py` | plate ink edges by profile shape — the non-circular version of `measure2.py` |
| `shot.mjs` / `shot_prod.mjs` | screenshot the local build / the deployed page at 873×1224 and 390×844 |
| `verify_prod.mjs` | structural DOM checks on the live page; exits non-zero with the reason |

The red/cyan overlay is the fastest read in the set: template luminance goes into
R, build luminance into G+B, so **red is template-only ink, cyan is build-only
ink, and grey means aligned**. A misaligned edge shows as a red/cyan fringe whose
thickness is the error in pixels.

## Things worth knowing before you change something

**Two metrics have to agree at once.** A bounding box can match exactly while the
content inside it is wrong. The hole cards are the clean example: white pixel
*count* fixes the union area (`white ∝ h·(w+d)`), bbox *width* fixes the spread
(`bbox_w ≈ d + w·cosθ + h·sinθ`). Tuning against either one alone walks you into
a build that satisfies it and misses the other. When the two disagree about
`w + d`, the tilt angle is the free variable that reconciles them.

**Ink deficit is not a geometry problem.** When a text bounding box matches to
the pixel but the white-pixel count is 10% short, the glyphs are in the right
place and merely too thin. A tight `text-shadow` adds the missing ink without
displacing a single edge. Changing the font size instead would fix the count and
break the box.

**Thickening a stroke that is slightly off-shape makes the fit worse.** The gold
scanlines say the template's mid ring is 8px across on the flanks against 3px
here, which looks like an obvious win — but taking it to 4px pushed the overall
mean from 13.34 to 13.58 and the rows-306 band from 14.6 to 15.7. Widening a
stroke doubles the mismatch wherever the curve slants. Only the glow alphas from
that experiment survived.

**Watch your thresholds.** The white test differs between scripts (`cardmeas.py`
uses `>190/>190/>185`, the header measurements used `>170/>170/>165`), so the
same region reports 5720 white pixels in one and 5611 in the other. Only ever
compare numbers produced inside a single script's run.

**A measurement window can return its own floor.** The hero art-top probe
reported y=900 for both template and build, which is the top of the window, not
the top of the art. Print the whole row profile before believing a single
extremum.

**And a window can return its own bounds on every side at once.** `measure2.py`
searches for the hero plate inside (392,1022)–(492,1084), which *is* the box it
is looking for. The plate's glow and the felt behind it are both gold, so the
mask fills the window and the answer comes back as the window — for template and
build alike. Two numbers agreeing because both are the search bounds is not
evidence. `plateprofile.py` is the fix: the window is at least 30px clear of the
plate on every side, an edge is called where the gold-count profile crosses 45%
of its own peak, and the same rule runs on both images. Template and build agree
to **1px or better** on every edge it can isolate. It refuses to report two edges
rather than fake them — the plate top (the portrait sits directly above it in the
same columns, and warm art passes any gold test, so hue cannot separate them) and
the wizard plate (the mid ring crosses x 232–248 where the plate spans 162–242,
overlapping in both axes).

**Ink bounds and layout boxes are different things, and both are right.** The
coordinates in the table below are gold-ink extents, so they include the plate's
box-shadow glow: about 10px past the border box each side, 5px top and bottom.
`getBoundingClientRect` returns the border box. The hero plate reads 100 × 62 as
ink and 76 × 57 as a rect; neither is an error, and comparing one against the
other manufactures a 24px "failure". `verify_prod.mjs` therefore asserts only
what the DOM can state — what is beside what, which images actually loaded, how
many seats exist — and leaves ink-versus-ink to `plateprofile.py`.

## Portraits

`cutout.py` takes the nine 1024×1024 studio renders under `public/avatars/{vip,free}`
and produces transparent busts. Background removal is a border-seeded flood fill
over `(L > 198) & (sat < 34)` — a flood fill rather than a plain threshold,
because white teeth, white fur and eye highlights are enclosed by the subject and
so are never reached from the edge. The alpha is then eroded 1px and softened so
no white halo survives, cropped to the silhouette, and normalised to 340px tall.

Output goes to two places:

- `public/avatars/portrait/*.webp` — what the page actually loads
- `portraits_webp.json` — the same images as base64 data URLs

The script is **deterministic from files already in the repo**: rerunning it
reproduces every `.webp` byte for byte, on any machine — that was checked by
running it in two environments and comparing md5s, not assumed. So the nine
`public/avatars/portrait/*.webp` are committed (the page needs them at runtime)
but they are also regenerable, and `cutout.py` is the source of truth if they
ever drift. Everything else it emits — `portraits3/`, `portraits_webp.json`,
`shots/`, and the inline `table-reference.html` — is gitignored scratch.

`build_table.py` has two modes to match:

- `--assets` (what is committed) writes `public/hub/training/table-reference.html`
  at ~20 KB, referencing `/avatars/portrait/*.webp`
- no flag writes a self-contained ~291 KB file with every portrait inlined —
  one file you can open anywhere, useful for review, too big to commit

Both render **byte-identically**; that equivalence is checked, not assumed.

## Measured geometry

Numbers below are full-image template coordinates. The build's stage coordinates
are `full_y - 152`.

| element | template | status |
| --- | --- | --- |
| hero plate | (392,1022)–(491,1083) = 100 × 62 | exact |
| v5 spartan plate | (515,274)–(616,331) = 102 × 58 | exact |
| v4 wolf plate | (272,278)–(371,331) = 100 × 54 | within 2px |
| v2 wizard plate | (162,690)–(242,746) = 81 × 57 | within 3px (narrowest — drives `min-width`) |
| hole cards | (512,978)–(611,1061) = 100 × 84, white 5720 | 99 × 84, white 5754 |
| banner | (16,59)–(863,149) = 848 × 91 | exact |
| title cyan | (309,19)–(503,31) = 195 × 13 | exact x-extent |
| action rows | y 1100–1148 and 1157–1205; cols 17–436, 444–862 | within 1px all edges |

A seat box **is** its name plate, anchored at `--cx` / `--cy`. The artwork is
absolutely positioned behind it at `z-index:-1`, sized by `--ph` (height in
template px), offset vertically by `--po` (px the art extends *below* the plate's
bottom edge, so negative means it stops above) and horizontally by `--ax`.

`fitart.py` established that the template's seat art is a small bust tucking
*behind* the plate — `ph` 122–133, `po` −33…−44 — not the large portrait hanging
below it that the first pass assumed (`ph` 160–190, `po` +21). Seven of eight
villains fit at correlation 0.80–0.98 and agree tightly. The viking will not fit
(corr 0.38): the template's own viking asset still carries a patch of un-removed
white background under the beard that this cut-out correctly deletes, so the
masked pixels genuinely disagree. It uses the consensus of the other seven.

## Mobile

At 390 × 844 the frame is width-bound (`--u` = 0.447) and letterboxes with about
35% black. That is correct "contain" behaviour for a fixed-proportion reference,
but it is **not** what the production component should do — that needs to reflow
(taller table, tighter header) rather than scale. The reference exists to fix the
geometry, not to ship as-is.
