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
reproduces every `.webp` byte for byte. That is deliberate. The generated
binaries and the JSON are gitignored; if you need them, run the script.

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
