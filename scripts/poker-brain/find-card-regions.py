#!/usr/bin/env python3
"""
Card Region Finder — Visual Debug Tool
=======================================
For each screenshot, draws rectangles on the card regions so we can
visually confirm/adjust the coordinates before extracting templates.

Also dumps individual crops at each position for quick visual check.
"""

import cv2
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BATCH_DIR = ROOT / "pokerbrain-assets" / "batch2"
DEBUG_DIR = ROOT / "pokerbrain-assets" / "region-debug"
DEBUG_DIR.mkdir(parents=True, exist_ok=True)

# We need to find the actual pixel coordinates of cards in each screenshot.
# Let's do this by examining specific screenshots in detail.

def save_crop(img, x, y, w, h, name, scale=3):
    """Save a crop from the image for inspection."""
    ih, iw = img.shape[:2]
    x = max(0, min(x, iw - 1))
    y = max(0, min(y, ih - 1))
    w = min(w, iw - x)
    h = min(h, ih - y)
    crop = img[y:y+h, x:x+w].copy()
    if crop.size > 0:
        big = cv2.resize(crop, (crop.shape[1] * scale, crop.shape[0] * scale), 
                        interpolation=cv2.INTER_NEAREST)
        cv2.imwrite(str(DEBUG_DIR / f"{name}.png"), big)
        return True
    return False


def probe_shot(filename, probes):
    """Save crops at multiple probe positions for a screenshot."""
    filepath = BATCH_DIR / filename
    img = cv2.imread(str(filepath))
    if img is None:
        print(f"Cannot read {filename}")
        return
    
    ih, iw = img.shape[:2]
    print(f"\n{filename}: {iw}x{ih}")
    
    for label, x, y, w, h in probes:
        ok = save_crop(img, x, y, w, h, f"{filename.replace('.png','')}-{label}")
        print(f"  {label}: ({x},{y},{w},{h}) -> {'OK' if ok else 'FAIL'}")


def main():
    # ===== shot01.png (462x980) =====
    # CostaDino's table with Two Pair
    # Hero cards (A♥, 2♣) are at bottom-center, overlapping/fanned
    # Board is center row
    # Opponent top-right (T♦, 7♥) has a win overlay (+2,595)
    
    # Let's probe hero card positions more aggressively for shot01
    probe_shot("shot01.png", [
        # Board cards — already confirmed good
        ("board1", 88, 385, 60, 68),
        ("board2", 148, 385, 55, 68),
        ("board3", 205, 385, 54, 68),
        ("board4", 261, 385, 56, 68),
        ("board5", 319, 385, 60, 68),
        # Hero cards — the fanned cards at bottom
        # From the image, hero cards appear to be around y=680-750
        # They're to the right of the avatar, fanned
        ("hero-probe1", 305, 670, 50, 70),   # wider area
        ("hero-probe2", 320, 660, 50, 70),   
        ("hero-probe3", 290, 685, 50, 70),   
        ("hero-probe4", 300, 690, 40, 60),   # tighter
        ("hero-probe5", 340, 680, 40, 60),   # right card
        # Look at the actual card positions — they appear as small 
        # fanned cards to the right and slightly below the avatar
        ("hero-wide", 280, 655, 120, 90),    # wide view of both hero cards
        # Opponent top-right — these have win overlay so may not be usable
        ("oppr-probe1", 360, 260, 45, 60),
        ("oppr-probe2", 370, 265, 40, 55),
        ("oppr-probe3", 380, 260, 45, 60),
        ("oppr-wide", 350, 250, 100, 80),    # wide view of opp right
    ])
    
    # ===== shot02.png (460x1024) =====
    # Craw Daddy All In with 5♦ A♠ visible
    # aaaaaaallin with T♠ 7♥ visible
    probe_shot("shot02.png", [
        # Board
        ("board1", 88, 393, 60, 68),
        ("board2", 148, 393, 55, 68),
        ("board3", 205, 393, 54, 68),
        ("board4", 261, 393, 56, 68),
        ("board5", 319, 393, 60, 68),
        # Craw Daddy's cards (top-left position, "All In" label above)
        # Cards are near the player name, slightly below and right
        ("oppl-probe1", 40, 285, 50, 65),
        ("oppl-probe2", 50, 290, 45, 60),
        ("oppl-probe3", 55, 280, 40, 58),
        ("oppl-probe4", 85, 280, 40, 58),
        ("oppl-wide", 35, 270, 110, 80),     # wide view
        # aaaaaaallin's cards (top-right)
        ("oppr-probe1", 350, 285, 45, 60),
        ("oppr-probe2", 360, 280, 40, 58),
        ("oppr-probe3", 385, 280, 40, 58),
        ("oppr-wide", 345, 270, 110, 80),     # wide view
    ])
    
    # ===== shot03.png (460x1024) =====
    # Squirrelly D All In A♦ 3♠ (top center)
    # aaaaaaallin 7♦ 6♠ (right)
    probe_shot("shot03.png", [
        # Board
        ("board1", 88, 393, 60, 68),
        # Squirrelly D's cards (top center, very large "All In" cards)
        # These are the BIG cards shown near Squirrelly D's name
        ("opptop-probe1", 175, 130, 50, 68),
        ("opptop-probe2", 185, 140, 45, 62),
        ("opptop-probe3", 220, 130, 50, 68),
        ("opptop-probe4", 225, 140, 45, 62),
        ("opptop-wide", 165, 120, 120, 85),
        # aaaaaaallin's cards (right side)
        ("oppr-probe1", 355, 278, 42, 58),
        ("oppr-probe2", 365, 280, 38, 55),
        ("oppr-probe3", 390, 278, 42, 58),
        ("oppr-wide", 345, 270, 100, 75),
    ])
    
    # ===== shot04.png (460x1024) =====
    # CostaDino Straight — hero has A♠, 7♥
    # Large hero cards displayed at bottom (with +36.20 overlay)
    probe_shot("shot04.png", [
        # Board
        ("board1", 88, 393, 60, 68),
        # Hero cards — these are the big fanned cards at bottom
        # The A♠ and 7♥ are shown large, tilted
        ("hero-probe1", 280, 670, 50, 70),
        ("hero-probe2", 290, 675, 50, 70),
        ("hero-probe3", 310, 665, 50, 70),
        ("hero-probe4", 330, 680, 55, 75),
        ("hero-wide", 270, 650, 140, 110),    # wide view of hero area
    ])
    
    # ===== shot05.png (460x1024) =====
    # Two Pair — hero 6♣ 3♣, opp shows 6♠ and 6♣ 
    probe_shot("shot05.png", [
        # Board
        ("board1", 88, 393, 60, 68),
        ("board2", 148, 393, 55, 68),
        # Hero cards at bottom (All In, 6♣ 3♣)
        ("hero-wide", 195, 680, 100, 75),
        ("hero-probe1", 195, 690, 45, 60),
        ("hero-probe2", 225, 690, 45, 60),
        # aaaaaaallin cards (right side)
        ("oppr-wide", 345, 270, 100, 80),
        ("oppr-probe1", 357, 283, 38, 55),
        ("oppr-probe2", 390, 283, 38, 55),
    ])
    
    # ===== shot06.png (460x1024) =====
    # CostaDino 3 of a Kind — hero 6♣ 4♣ 
    probe_shot("shot06.png", [
        # Hero cards — fanned at bottom right
        ("hero-wide", 310, 680, 100, 75),
        ("hero-probe1", 315, 690, 42, 58),
        ("hero-probe2", 345, 688, 42, 58),
    ])
    
    # ===== shot07.png (460x1024) =====
    # CostaDino fold — hero A♠ K♣
    # Craw Daddy All In 4♣ 3♣ (left)
    # Squirrelly D All In A♠ 3♠ (top)
    probe_shot("shot07.png", [
        # Board
        ("board1", 88, 393, 60, 68),
        ("board2", 148, 393, 55, 68),
        ("board3", 205, 393, 54, 68),
        ("board4", 261, 393, 56, 68),
        ("board5", 319, 393, 60, 68),
        # Hero cards at bottom
        ("hero-wide", 305, 680, 100, 75),
        # Craw Daddy (left) — All In cards
        ("oppl-wide", 40, 275, 105, 75),
        ("oppl-probe1", 50, 285, 42, 58),
        ("oppl-probe2", 85, 285, 42, 58),
        # Squirrelly D (top) All In — large cards
        ("opptop-wide", 170, 125, 110, 80),
    ])
    
    print(f"\nDebug crops saved to: {DEBUG_DIR}")
    print(f"Review them to find correct card coordinates.")


if __name__ == "__main__":
    main()
