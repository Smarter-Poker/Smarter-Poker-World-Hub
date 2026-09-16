#!/usr/bin/env python3
"""Crop a transparent 4x3 painted-control master into twelve intact sprites.

Usage:
    python3 scripts/art/crop-pnm-console-sheet.py <sheet.png> <output-dir>

This is intentionally limited to the approved Poker Near Me command-control
master. It never resizes or repaints the generated objects; it only separates
the equal cells and removes fully transparent outer rows and columns.
"""

from pathlib import Path
import sys

from PIL import Image


NAMES = (
    "menu",
    "edit",
    "event-ticket",
    "live-games",
    "roadtrip",
    "trophy",
    "alert",
    "filter",
    "community",
    "info",
    "review",
    "more",
)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: crop-pnm-console-sheet.py <sheet.png> <output-dir>")

    source = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()
    sheet = Image.open(source).convert("RGBA")

    if sheet.width % 4 or sheet.height % 3 or sheet.width // 4 != sheet.height // 3:
        raise SystemExit(f"expected an equal-cell 4x3 sheet, received {sheet.size}")
    if sheet.getchannel("A").getextrema()[0] != 0:
        raise SystemExit("sheet does not contain true transparent pixels")

    output_dir.mkdir(parents=True, exist_ok=True)
    cell = sheet.width // 4
    for index, name in enumerate(NAMES):
        column = index % 4
        row = index // 4
        sprite = sheet.crop((column * cell, row * cell, (column + 1) * cell, (row + 1) * cell))
        alpha_box = sprite.getchannel("A").getbbox()
        if alpha_box is None:
            raise SystemExit(f"cell {index + 1} ({name}) is empty")
        sprite = sprite.crop(alpha_box)
        destination = output_dir / f"icon-{name}.png"
        sprite.save(destination, optimize=True)
        print(f"wrote {destination} {sprite.width}x{sprite.height}")


if __name__ == "__main__":
    main()
