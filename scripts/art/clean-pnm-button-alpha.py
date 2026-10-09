#!/usr/bin/env python3
"""Remove only the opaque corner matte from the approved PNM button plates.

The two 348 x 114 masters already contain the finished chrome, lighting and
interior. Their RGB pixels are immutable. The source export accidentally left
an opaque black rectangle behind the chamfered silhouette, so this script
changes only the alpha channel in the four outside-corner triangles.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image


ASSETS = {
    "button-primary.png": {
        "source": "6b2cdb78bd430ebb5f7b5bade442829ae4f3b7865d9545168c8992ed3e6f1162",
        "clean": "612777b4518ef8c731c495e84f683a927a420b23c5cb63af3fd4f0f1d8f45a59",
    },
    "button-secondary.png": {
        "source": "67d0f61e1a15288b0eafc32e13ff2b3094881a4307d01af627f3c65fdd2f4677",
        "clean": "bcdb0a6999c94233b85b2053dd119f1bb93a5c7d487d122f4f99d2c990d397b1",
    },
}

# The existing outer steel edge runs from (23, 0) to (0, 23), mirrored in
# each corner. Keep that edge and its antialias; clear only the matte outside.
SOLID_FROM = 24
FEATHER_FROM = 20


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean(source: Path, destination: Path) -> str:
    expected = ASSETS[source.name]
    actual = sha256(source)
    if actual == expected["clean"]:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source.read_bytes())
        print(f"verified {source}; copied alpha-clean master to {destination}; sha256 {actual}")
        return actual
    if actual != expected["source"]:
        raise SystemExit(
            f"clean-pnm-button-alpha: {source} is not the approved source "
            f"or clean derivative (found {actual})"
        )

    rgba = np.array(Image.open(source).convert("RGBA"))
    height, width = rgba.shape[:2]
    if (width, height) != (348, 114):
        raise SystemExit(f"clean-pnm-button-alpha: unexpected geometry {width}x{height}")

    original = rgba.copy()
    yy, xx = np.indices((height, width))
    distance = np.minimum.reduce((
        xx + yy,
        (width - 1 - xx) + yy,
        xx + (height - 1 - yy),
        (width - 1 - xx) + (height - 1 - yy),
    ))
    matte = np.clip(
        (distance - FEATHER_FROM) * (255.0 / (SOLID_FROM - FEATHER_FROM)),
        0,
        255,
    ).astype(np.uint8)
    rgba[..., 3] = np.minimum(rgba[..., 3], matte)

    if not np.array_equal(rgba[..., :3], original[..., :3]):
        raise SystemExit("clean-pnm-button-alpha: RGB pixels changed")
    changed = rgba[..., 3] != original[..., 3]
    if np.any(changed & (distance >= SOLID_FROM)):
        raise SystemExit("clean-pnm-button-alpha: alpha changed inside the painted silhouette")
    if any(rgba[y, x, 3] != 0 for x, y in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))):
        raise SystemExit("clean-pnm-button-alpha: an outer corner is still opaque")

    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(destination, optimize=True)
    digest = sha256(destination)
    if digest != expected["clean"]:
        raise SystemExit(
            f"clean-pnm-button-alpha: generated {source.name} hash drifted "
            f"(expected {expected['clean']}, found {digest})"
        )
    print(
        f"wrote {destination} {width}x{height}; "
        f"alpha-only pixels changed {int(changed.sum())}; sha256 {digest}"
    )
    return digest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    for name in ASSETS:
        clean(args.source_dir / name, args.output_dir / name)


if __name__ == "__main__":
    main()
