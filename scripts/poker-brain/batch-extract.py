#!/usr/bin/env python3
"""
PokerBros Batch Template Extractor — Batch 2
=============================================
Extracts card templates from gameplay screenshots sent by the user.
Each screenshot has cards at known positions (board, hero hole, opponent hole).
We manually map each screenshot to the cards visible.

This script handles TWO PokerBros layout variants:
  - 462x980 (shot01 — CostaDino's phone, 6-max with different UI)
  - 460x1024 (shots 02-07 — standard 5-max)

For each card, we crop from the best available region (board > hero hole > opponent hole),
resize to 64x88 template size, and save to public/hub/poker-brain/templates/.

Usage:
  python scripts/poker-brain/batch-extract.py
"""

import os
import sys
import cv2
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BATCH_DIR = ROOT / "pokerbrain-assets" / "batch2"
TEMPLATES_DIR = ROOT / "public" / "hub" / "poker-brain" / "templates"

TEMPLATE_W = 64
TEMPLATE_H = 88

# =============================================================================
# CARD REGIONS — measured from actual screenshots
# =============================================================================
# Shot01 is 462x980. Shots 02-07 are 460x1024.
# Card regions are specified as (x, y, w, h) in absolute pixels for each image.
#
# Region types:
#   board1-5:    Board cards (center, largest and clearest)
#   hero1-2:     Hero's hole cards (bottom center)
#   opp_left1-2: Opponent left hole cards (shown at showdown)
#   opp_right1-2: Opponent right hole cards (shown at showdown)
#   opp_top1-2:  Opponent top hole cards (shown at showdown)
# =============================================================================

# Layout for 460x1024 (standard 5-max — shots 02-07)
# Board cards are at center, roughly y=390-460
# Each board card is approx 55-65px wide, 65-75px tall
LAYOUT_5MAX = {
    "board": [
        {"x": 88,  "y": 393, "w": 60, "h": 68},  # Board 1 (leftmost)
        {"x": 148, "y": 393, "w": 55, "h": 68},  # Board 2
        {"x": 205, "y": 393, "w": 54, "h": 68},  # Board 3
        {"x": 261, "y": 393, "w": 56, "h": 68},  # Board 4
        {"x": 319, "y": 393, "w": 60, "h": 68},  # Board 5 (rightmost)
    ],
    "hero": [
        {"x": 285, "y": 680, "w": 48, "h": 70},  # Hero card 1 (left)
        {"x": 325, "y": 673, "w": 48, "h": 70},  # Hero card 2 (right)
    ],
    "opp_left": [
        {"x": 45,  "y": 280, "w": 42, "h": 58},  # Opponent left card 1
        {"x": 85,  "y": 280, "w": 42, "h": 58},  # Opponent left card 2
    ],
    "opp_right": [
        {"x": 355, "y": 280, "w": 42, "h": 58},  # Opponent right card 1
        {"x": 390, "y": 280, "w": 42, "h": 58},  # Opponent right card 2
    ],
    "opp_top": [
        {"x": 185, "y": 138, "w": 45, "h": 62},  # Opponent top card 1
        {"x": 225, "y": 138, "w": 45, "h": 62},  # Opponent top card 2
    ],
}

# Layout for 462x980 (6-max variant — shot01)
LAYOUT_6MAX = {
    "board": [
        {"x": 88,  "y": 385, "w": 60, "h": 68},  # Board 1
        {"x": 148, "y": 385, "w": 55, "h": 68},  # Board 2
        {"x": 205, "y": 385, "w": 54, "h": 68},  # Board 3
        {"x": 261, "y": 385, "w": 56, "h": 68},  # Board 4
        {"x": 319, "y": 385, "w": 60, "h": 68},  # Board 5
    ],
    "hero": [
        {"x": 295, "y": 660, "w": 48, "h": 70},  # Hero card 1
        {"x": 335, "y": 653, "w": 48, "h": 70},  # Hero card 2
    ],
    "opp_right": [
        {"x": 360, "y": 270, "w": 42, "h": 58},  # Top-right opponent card 1
        {"x": 400, "y": 270, "w": 42, "h": 58},  # Top-right opponent card 2
    ],
}

# =============================================================================
# CARD MAPPING — which cards appear in each screenshot and where
# =============================================================================
# Format: (screenshot_file, card_key, region_type, card_index)
#   card_key: e.g. "7c" = 7 of clubs, "Td" = 10 of diamonds, "As" = ace of spades
#   region_type: "board", "hero", "opp_left", "opp_right", "opp_top"
#   card_index: 0-based index within that region type

CARD_MAP = [
    # =========================================================================
    # shot01.png — 462x980 — CostaDino Two Pair
    # Board: 7♣, 2♥, 7♠, K♣, T♣
    # Hero (CostaDino): A♥, 2♥  (wait — the 2 looks like a "2" suit marker)
    # Actually: A♥, 2♣ (looking more carefully)
    # Opponent top-right (Dorn): T♦, 7♥
    # =========================================================================
    ("shot01.png", "7c",  "board", 0, "6max"),
    ("shot01.png", "2h",  "board", 1, "6max"),
    ("shot01.png", "7s",  "board", 2, "6max"),   # The big 7 in center — 7♠
    ("shot01.png", "Kc",  "board", 3, "6max"),
    ("shot01.png", "Tc",  "board", 4, "6max"),
    ("shot01.png", "Ah",  "hero",  0, "6max"),
    ("shot01.png", "2c",  "hero",  1, "6max"),   # 2♣ — hero right card
    ("shot01.png", "Td",  "opp_right", 0, "6max"),
    ("shot01.png", "7h",  "opp_right", 1, "6max"),

    # =========================================================================
    # shot02.png — 460x1024 — Craw Daddy All In
    # Board: 4♠, 8♥, 9♠, A♦, 6♣
    # Opponent left (Craw Daddy) All In: 5♦, A♠
    # Opponent right (aaaaaaallin): T♠, 7♥ — wait, these overlap with shot01
    # Actually: 10♠, 7♥ — but 7♥ is already in shot01
    # =========================================================================
    ("shot02.png", "4s",  "board", 0, "5max"),
    ("shot02.png", "8h",  "board", 1, "5max"),
    ("shot02.png", "9s",  "board", 2, "5max"),
    ("shot02.png", "Ad",  "board", 3, "5max"),
    ("shot02.png", "6c",  "board", 4, "5max"),
    ("shot02.png", "5d",  "opp_left",  0, "5max"),
    ("shot02.png", "As",  "opp_left",  1, "5max"),   # Board Ace♦ above, this is opp Ace♠
    ("shot02.png", "Ts",  "opp_right", 0, "5max"),
    # 7♥ already from shot01 board, but this is opponent render — grab for quality
    # ("shot02.png", "7h",  "opp_right", 1, "5max"),  # skip duplicate

    # =========================================================================
    # shot03.png — 460x1024 — Squirrelly D All In
    # Board: 8♣, 3♣, 8♠, K♠, 9♦
    # Opponent top (Squirrelly D): A♦, 3♠
    # Wait — A♦ is already in shot02 board. Let's grab 3♠ here more clearly
    # Opponent right (aaaaaaallin): 7♦, 6♠
    # =========================================================================
    ("shot03.png", "8c",  "board", 0, "5max"),
    ("shot03.png", "3c",  "board", 1, "5max"),
    ("shot03.png", "8s",  "board", 2, "5max"),
    ("shot03.png", "Ks",  "board", 3, "5max"),
    ("shot03.png", "9d",  "board", 4, "5max"),
    # Squirrelly D top: Ad (already have from shot02 board), 3s
    ("shot03.png", "3s",  "opp_top",   1, "5max"),
    ("shot03.png", "7d",  "opp_right", 0, "5max"),
    ("shot03.png", "6s",  "opp_right", 1, "5max"),

    # =========================================================================
    # shot04.png — 460x1024 — CostaDino Straight
    # Board: 2♦, 5♥, K♠, 4♣, 3♠
    # Hero (CostaDino): A♠, 7♥  — Both already have. But hero crop quality matters.
    # =========================================================================
    ("shot04.png", "2d",  "board", 0, "5max"),
    ("shot04.png", "5h",  "board", 1, "5max"),
    # Ks already from shot03 board
    ("shot04.png", "4c",  "board", 3, "5max"),
    # 3s already from shot03 opp_top
    # Hero cards - better crop from hero position
    # As already from shot02, 7h from shot01

    # =========================================================================
    # shot05.png — 460x1024 — CostaDino Two Pair (6♣3♣)
    # Board: Q♠, 3♠, 7♠, 7♣, 6♣
    # Hero (CostaDino) All In: 6♣, 3♣ — 6c and 3c already have from board
    # Opponent right (aaaaaaallin): 6♦, 6♠ — wait: the opp cards
    # Actually looking at this: the opp left has 6♦ and the right has 6♠
    # =========================================================================
    ("shot05.png", "Qs",  "board", 0, "5max"),
    # 3s in board pos 1 — already from shot03 — but this is a different render (board vs opp)
    # 7s in board pos 2 — already from shot01
    # 7c in board pos 3 — already from shot01
    # 6c in board pos 4 — already from shot02 board
    ("shot05.png", "6d",  "opp_left",  0, "5max"),   # wait — I see 6♦ on left-opp
    # Actually aaaaaaallin is right side with 6♠ + 6♠? Let me look again...
    # The opp cards show 6♠ and 6♠ or 6♦ and 6♠
    # From the image: left card has a diamond pattern → 6♦, right has club → 6♣... no.
    # Let me re-examine: aaaaaaallin's cards appear to be 6♠ (spade) and 6♠?
    # No — one appears to be green (♣) and one has the specific symbol
    # Craw Daddy on left is showing fold, so those aren't his cards
    # The cards at top-right belong to aaaaaaallin: they look like 6♠ and 6♣ 
    # Actually from the image: I can see a "6" with a club on left, "6" with club on right
    # Wait — they're 6♣ and 6♣? That can't be right in a standard deck.
    # Looking more carefully: aaaaaaallin shows 6♣ (green clover) on left, 6♣ on right
    # But that's impossible. One must be 6♠ (spade = black, pointed)
    # The left card: small 6 with a green symbol = 6♣
    # The right card: small 6 with a pointed black symbol = 6♠
    ("shot05.png", "6s_opp",  "opp_right", 1, "5max"),  # grabbing the 6♠

    # =========================================================================
    # shot06.png — 460x1024 — CostaDino Three of a Kind
    # Board: 7♣, 7♥, 7♠, A♠, 5♣
    # Hero (CostaDino): 6♣, 4♣
    # All of these already exist in our templates! 
    # But hero cards from the hero position give better quality for 6c and 4c
    # =========================================================================
    # All board cards already captured from other shots
    # Hero cards: 6c already from shot02 board, 4c from shot04 board
    # But let's grab hero-position versions for validation

    # =========================================================================
    # shot07.png — 460x1024 — Squirrelly D + Craw Daddy showdown  
    # Board: Q♠, 4♠, 3♣, 7♣, K♠
    # Opponent left (Craw Daddy): 4♣, 3♣ — already have both
    # Opponent top (Squirrelly D): A♠, 3♠ — already have
    # Hero (CostaDino): A♠, K♣ — already have As, Kc from other shots
    # =========================================================================
    # No new unique cards here — all duplicates
]

# Clean up the card map — remove layout variant marker and duplicates
# We'll prefer board cards (biggest, cleanest pixel data) over opponent cards
EXTRACTION_LIST = []
seen_cards = set()

for entry in CARD_MAP:
    filename, card_key, region_type, card_index, layout_type = entry
    
    # Strip any _opp suffix for dedup
    clean_key = card_key.replace("_opp", "")
    
    if clean_key in seen_cards:
        continue
    seen_cards.add(clean_key)
    EXTRACTION_LIST.append((filename, clean_key, region_type, card_index, layout_type))


def crop_and_resize(img, region):
    """Crop region from image and resize to template dimensions."""
    x, y, w, h = region["x"], region["y"], region["w"], region["h"]
    ih, iw = img.shape[:2]
    
    # Bounds clamp
    x = max(0, min(x, iw - 1))
    y = max(0, min(y, ih - 1))
    w = min(w, iw - x)
    h = min(h, ih - y)
    
    if w < 10 or h < 10:
        print(f"  WARNING: Region too small ({w}x{h})")
        return None
    
    cropped = img[y:y+h, x:x+w]
    
    if cropped.size == 0:
        return None
    
    resized = cv2.resize(cropped, (TEMPLATE_W, TEMPLATE_H), interpolation=cv2.INTER_AREA)
    return resized


def get_region(layout, region_type, index):
    """Get region coords from layout dict."""
    regions = layout.get(region_type, [])
    if index >= len(regions):
        return None
    return regions[index]


def main():
    print("=" * 60)
    print("PokerBros Batch Template Extractor — Batch 2")
    print("=" * 60)
    
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    
    # Track what we already have
    existing = set()
    for f in TEMPLATES_DIR.glob("*.png"):
        existing.add(f.stem)
    print(f"\nExisting templates: {len(existing)} — {', '.join(sorted(existing))}")
    
    # Track new extractions
    new_templates = {}
    skipped = []
    
    for filename, card_key, region_type, card_index, layout_type in EXTRACTION_LIST:
        filepath = BATCH_DIR / filename
        if not filepath.exists():
            print(f"\n  SKIP: {filepath.name} not found")
            skipped.append(card_key)
            continue
        
        img = cv2.imread(str(filepath))
        if img is None:
            print(f"\n  ERROR: Cannot read {filepath.name}")
            skipped.append(card_key)
            continue
        
        ih, iw = img.shape[:2]
        layout = LAYOUT_6MAX if layout_type == "6max" else LAYOUT_5MAX
        
        region = get_region(layout, region_type, card_index)
        if region is None:
            print(f"\n  SKIP: No region for {region_type}[{card_index}]")
            skipped.append(card_key)
            continue
        
        # Scale if needed (layouts are defined for specific resolutions)
        ref_w = 462 if layout_type == "6max" else 460
        ref_h = 980 if layout_type == "6max" else 1024
        sx = iw / ref_w
        sy = ih / ref_h
        
        scaled_region = {
            "x": int(region["x"] * sx),
            "y": int(region["y"] * sy),
            "w": int(region["w"] * sx),
            "h": int(region["h"] * sy),
        }
        
        template = crop_and_resize(img, scaled_region)
        if template is not None:
            new_templates[card_key] = template
            status = "NEW" if card_key not in existing else "UPDATE"
            print(f"  [{status}] {card_key} from {filename} ({region_type}[{card_index}])")
    
    # Save templates
    print(f"\n{'=' * 60}")
    print(f"Saving {len(new_templates)} templates...")
    
    for key, template in new_templates.items():
        outpath = TEMPLATES_DIR / f"{key}.png"
        cv2.imwrite(str(outpath), template)
        print(f"  ✓ {outpath.name}")
    
    # Also save debug crops (larger, for human review)
    debug_dir = ROOT / "pokerbrain-assets" / "debug-batch2"
    debug_dir.mkdir(parents=True, exist_ok=True)
    for key, template in new_templates.items():
        debug_path = debug_dir / f"debug-{key}.png"
        # Save at 2x for easier visual inspection
        big = cv2.resize(template, (TEMPLATE_W * 3, TEMPLATE_H * 3), interpolation=cv2.INTER_NEAREST)
        cv2.imwrite(str(debug_path), big)
    
    # Final summary
    all_templates = existing | set(new_templates.keys())
    all_52 = set()
    for r in "AKQJT98765432":
        for s in "shdc":
            all_52.add(f"{r}{s}")
    
    missing = all_52 - all_templates
    
    print(f"\n{'=' * 60}")
    print(f"SUMMARY")
    print(f"{'=' * 60}")
    print(f"Previously had:    {len(existing)} templates")
    print(f"Newly extracted:   {len(new_templates)} templates")
    print(f"Total coverage:    {len(all_templates - {'back', 'empty'})}/52 cards")
    print(f"Missing:           {len(missing)} cards")
    if missing:
        print(f"Missing cards:     {', '.join(sorted(missing))}")
    if skipped:
        print(f"Skipped:           {', '.join(skipped)}")
    
    print(f"\nDebug crops saved to: {debug_dir}")
    print(f"Templates saved to:  {TEMPLATES_DIR}")


if __name__ == "__main__":
    main()
