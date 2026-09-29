#!/usr/bin/env python3
r"""Separate an approved Poker Near Me painted-control master into its twelve holders.

Usage:
    python3 scripts/art/crop-pnm-console-sheet.py --sheet primary \
        public/images/pnm-console/painted-controls-v1/source/icon-sheet.png \
        public/images/pnm-console/painted-controls-v1
    python3 scripts/art/crop-pnm-console-sheet.py --sheet command \
        public/images/pnm-console/painted-controls-v1/source/icon-sheet-command.png \
        public/images/pnm-console/painted-controls-v1

Requires Pillow, numpy and scipy.

Why objects and not cells: the painted holders do not sit inside the sheet's
nominal 362 x 362 cells (several cross y=362 and y=724), so slicing fixed cells
cut holders flat and dragged fragments of the neighbouring holder into the
crop. This script finds the holders themselves:

1. cores   = connected components of alpha > 96 larger than 5000 px; each
             approved sheet has exactly twelve and anything else fails loudly;
2. assign  = every pixel with alpha > 0 goes to its nearest core (Euclidean
             distance transform of the non-core mask) when it lies within
             48 px of that core; anything farther is a faint speck and is
             dropped;
3. copy    = each holder's assigned pixels are copied verbatim - no resize,
             no repaint, no filtering. Every other pixel, including any
             neighbour's glow, becomes fully transparent (0, 0, 0, 0);
4. frame   = the canvas is the holder's assigned bounding box plus a uniform
             6 px fully transparent margin, so no painted pixel touches an
             edge;
5. name    = holders are ordered row-major by centroid (rows clustered by
             centroid y, then sorted by x) and must form 3 rows of 4.

Re-running it on the approved sources reproduces the runtime icons pixel for
pixel (byte for byte with the same Pillow build); it prints each output's size
and SHA-256.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SHEETS = {
    "primary": {
        "sha256": "3486670cd82502e59ec48c79c084bee2a29767bbac012df0cb088e0128547d32",
        "names": (
            "search", "location", "fullscreen", "back",
            "close", "saved", "share", "phone",
            "globe", "directions", "calendar", "home",
        ),
    },
    "command": {
        "sha256": "3b7f2e34a8f018188a9c4fa3c7c12933c65309b829c7b43bb20a9b53644be59e",
        "names": (
            "menu", "edit", "event-ticket", "live-games",
            "roadtrip", "trophy", "alert", "filter",
            "community", "info", "review", "more",
        ),
    },
}

CORE_ALPHA = 96        # a holder's body is alpha > 96
CORE_MIN_PX = 5000     # a core is a component larger than this
REACH_PX = 48          # glow further than this from every core is a speck
MARGIN_PX = 6          # uniform fully transparent frame around each holder
COLUMNS, ROWS = 4, 3


def fail(message: str) -> None:
    raise SystemExit(f"crop-pnm-console-sheet: {message}")


def find_cores(alpha: np.ndarray) -> tuple[np.ndarray, int]:
    labels, count = ndimage.label(alpha > CORE_ALPHA)
    sizes = np.bincount(labels.ravel(), minlength=count + 1)
    keep = np.flatnonzero(sizes > CORE_MIN_PX)
    keep = keep[keep != 0]
    if keep.size != COLUMNS * ROWS:
        fail(
            f"expected exactly {COLUMNS * ROWS} holder cores (alpha > {CORE_ALPHA}, "
            f"> {CORE_MIN_PX} px), found {keep.size}"
        )
    relabel = np.zeros(count + 1, dtype=np.int32)
    relabel[keep] = np.arange(1, keep.size + 1)
    return relabel[labels], int(keep.size)


def order_row_major(cores: np.ndarray, count: int) -> list[int]:
    centroids = ndimage.center_of_mass(np.ones(cores.shape), cores, range(1, count + 1))
    ids = sorted(range(1, count + 1), key=lambda i: centroids[i - 1][0])
    heights = [s[0].stop - s[0].start for s in ndimage.find_objects(cores)]
    gap = 0.5 * float(np.median(heights))
    rows: list[list[int]] = [[ids[0]]]
    for core_id in ids[1:]:
        if centroids[core_id - 1][0] - centroids[rows[-1][-1] - 1][0] > gap:
            rows.append([])
        rows[-1].append(core_id)
    if len(rows) != ROWS or any(len(row) != COLUMNS for row in rows):
        fail(f"holders do not form {ROWS} rows of {COLUMNS}: {[len(r) for r in rows]}")
    return [core_id for row in rows for core_id in sorted(row, key=lambda i: centroids[i - 1][1])]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--sheet", choices=sorted(SHEETS), required=True)
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()

    spec = SHEETS[args.sheet]
    raw = args.source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != spec["sha256"]:
        fail(f"{args.source} is not the approved {args.sheet} master (sha256 {digest})")

    rgba = np.array(Image.open(args.source).convert("RGBA"))
    alpha = rgba[..., 3]
    if alpha.min() != 0:
        fail("sheet does not contain true transparent pixels")

    cores, count = find_cores(alpha)
    distance, (iy, ix) = ndimage.distance_transform_edt(cores == 0, return_indices=True)
    owner = cores[iy, ix]
    owner[(alpha == 0) | (distance > REACH_PX)] = 0
    dropped = int(((alpha > 0) & (owner == 0)).sum())

    height, width = alpha.shape
    args.output_dir.mkdir(parents=True, exist_ok=True)
    print(f"{args.source} {width}x{height} sha256 {digest}; dropped {dropped} faint speck px beyond {REACH_PX} px")
    for name, core_id in zip(spec["names"], order_row_major(cores, count)):
        mask = owner == core_id
        ys, xs = np.nonzero(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        if y0 == 0 or x0 == 0 or y1 == height or x1 == width:
            fail(f"{name} touches the sheet edge; the master itself is clipped")
        body = np.where(mask[y0:y1, x0:x1, None], rgba[y0:y1, x0:x1], 0).astype(np.uint8)
        canvas = np.zeros((y1 - y0 + 2 * MARGIN_PX, x1 - x0 + 2 * MARGIN_PX, 4), dtype=np.uint8)
        canvas[MARGIN_PX:MARGIN_PX + body.shape[0], MARGIN_PX:MARGIN_PX + body.shape[1]] = body
        destination = args.output_dir / f"icon-{name}.png"
        Image.fromarray(canvas, "RGBA").save(destination, optimize=True)
        out_hash = hashlib.sha256(destination.read_bytes()).hexdigest()
        print(
            f"wrote {destination} {canvas.shape[1]}x{canvas.shape[0]} "
            f"(sheet box x {x0}-{x1} y {y0}-{y1}, {int(mask.sum())} px) sha256 {out_hash}"
        )


if __name__ == "__main__":
    main()
