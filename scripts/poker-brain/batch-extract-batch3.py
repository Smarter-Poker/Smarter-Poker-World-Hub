#!/usr/bin/env python3
"""
PokerBros Batch Template Extractor — Batch 3
=============================================
Extracts the remaining 15-16 missing card templates from 19 gameplay
screenshots collected across PLO4 Hi, PLO5 Hi, PLO6 Hi, and NLH tables.

All screenshots are ~460x1024 (standard 5-max/6-max layout).
Board cards are the highest quality source for templates.

Usage:
  python scripts/poker-brain/batch-extract-batch3.py
"""

import os
import sys
import cv2
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BATCH_DIR = ROOT / "pokerbrain-assets" / "batch3"
TEMPLATES_DIR = ROOT / "public" / "hub" / "poker-brain" / "templates"
DEBUG_DIR = ROOT / "pokerbrain-assets" / "debug-batch3"

TEMPLATE_W = 64
TEMPLATE_H = 88

# =============================================================================
# LAYOUT REGIONS for ~460x1024 screenshots
# =============================================================================
# All these screenshots are PLO4 Hi or NLH on phone at ~460x1024.
# Board cards are centered, large, and the best quality for templates.

# Board card positions (5 board cards, standard PokerBros layout)
# Measured across multiple screenshots - board cards are very consistent
BOARD_5MAX = [
    {"x": 88,  "y": 394, "w": 60, "h": 68},  # Board 1 (leftmost)
    {"x": 148, "y": 394, "w": 56, "h": 68},  # Board 2
    {"x": 206, "y": 394, "w": 54, "h": 68},  # Board 3
    {"x": 262, "y": 394, "w": 56, "h": 68},  # Board 4
    {"x": 320, "y": 394, "w": 60, "h": 68},  # Board 5 (rightmost)
]

# PLO4 hero cards (4-card fan, measured from PLO4 screenshots)
# Cards fan from center-right going right, slightly upward
HERO_PLO4 = [
    {"x": 256, "y": 720, "w": 40, "h": 60},  # Card 1 (leftmost)
    {"x": 293, "y": 710, "w": 40, "h": 60},  # Card 2
    {"x": 330, "y": 698, "w": 40, "h": 60},  # Card 3
    {"x": 375, "y": 686, "w": 44, "h": 62},  # Card 4 (rightmost, fully visible)
]

# PLO5 hero cards (5-card wider fan)
HERO_PLO5 = [
    {"x": 236, "y": 726, "w": 38, "h": 58},  # Card 1
    {"x": 273, "y": 718, "w": 38, "h": 58},  # Card 2
    {"x": 310, "y": 706, "w": 38, "h": 58},  # Card 3
    {"x": 347, "y": 694, "w": 38, "h": 58},  # Card 4
    {"x": 390, "y": 680, "w": 42, "h": 60},  # Card 5
]

# NLH hero cards (2 cards, tighter)
HERO_NLH = [
    {"x": 286, "y": 695, "w": 46, "h": 67},  # Card 1 (left)
    {"x": 326, "y": 688, "w": 46, "h": 67},  # Card 2 (right)
]

# Opponent card positions (these are small, lower quality)
# For opponent cards shown at showdown/all-in
OPP_TOP = [
    {"x": 173, "y": 162, "w": 32, "h": 44},  # Opp top card 1
    {"x": 199, "y": 162, "w": 32, "h": 44},  # Opp top card 2
    {"x": 225, "y": 162, "w": 32, "h": 44},  # Opp top card 3
    {"x": 251, "y": 162, "w": 32, "h": 44},  # Opp top card 4
]

OPP_LEFT = [
    {"x": 35,  "y": 340, "w": 30, "h": 42},  # Opp left card 1
    {"x": 58,  "y": 340, "w": 30, "h": 42},  # Opp left card 2
    {"x": 81,  "y": 340, "w": 30, "h": 42},  # Opp left card 3
    {"x": 104, "y": 340, "w": 30, "h": 42},  # Opp left card 4
]

OPP_RIGHT = [
    {"x": 352, "y": 340, "w": 30, "h": 42},  # Opp right card 1
    {"x": 375, "y": 340, "w": 30, "h": 42},  # Opp right card 2
    {"x": 398, "y": 340, "w": 30, "h": 42},  # Opp right card 3
    {"x": 421, "y": 340, "w": 30, "h": 42},  # Opp right card 4
]

OPP_BOTLEFT = [
    {"x": 30,  "y": 548, "w": 28, "h": 40},  # Opp bottom-left card 1
    {"x": 52,  "y": 548, "w": 28, "h": 40},  # Opp bottom-left card 2
    {"x": 74,  "y": 548, "w": 28, "h": 40},  # Opp bottom-left card 3
    {"x": 96,  "y": 548, "w": 28, "h": 40},  # Opp bottom-left card 4
]

# =============================================================================
# SCREENSHOT-TO-CARD MAPPING
# =============================================================================
# We only extract what we NEED (the 15 missing cards).
# Priority: board > hero > opponent (board = largest, clearest templates)
#
# File naming: media__TIMESTAMP.png
# I'll use shorthand identifiers and map to exact filenames.

FILES = {
    # First batch - PLO/NLH screenshots (16:08 timestamp)
    "plo5_preflop":     "media__1775768882443.png",  # PLO5 Hi, hero: 9h 6c 3s 2s 2c
    "plo4_preflop":     "media__1775768884262.png",  # PLO4 Hi, hero: Kd Qd Qs 6s
    "plo6_hand1":       "media__1775768885969.png",  # PLO6 Hi, hero: Ks Qd 9c 3c 2s 2c
    "plo6_hand2":       "media__1775768887567.png",  # PLO6 Hi, hero: As Ad Qs 8h 6h 4h
    "nlh_river":        "media__1775768889369.png",  # NLH, hero: Ah 2s, board: 7c 2h 7s Kc Tc
    
    # Second batch - PLO4 action screenshots (16:28 timestamp)
    "plo4_turn1":       "media__1775770073055.png",  # Board: 3h 3c 5c 9c, hero: A? K? Q? 9?
    "plo4_river2":      "media__1775770075478.png",  # Board: 3h 4c 4s Tc Ah, opp: 6c 6? 4c 2c
    "plo4_river3":      "media__1775770077495.png",  # Board: 2h 5c 7h Th 6c, opp Micks: Js? T? 4? 3?
    "plo4_river4":      "media__1775770079741.png",  # Board: 7c 7h Th 2h 3c, opp a1: As 5s 2c 2c
    "plo4_river5":      "media__1775770082597.png",  # Board: Jh 7h 9s Qd Kd, opp: big one!
    
    # Third batch (16:28 continued)
    "plo4_river5b":     "media__1775770096759.png",  # Same hand as river5, diff moment
    "plo4_flop1":       "media__1775770099335.png",  # Board: 9c 3h 2d, hero: Qd J? 4? 3?
    "plo4_river6":      "media__1775770101778.png",  # Board: 4s Tc 6h Qs Ks
    "nlh_river2":       "media__1775770103982.png",  # NLH board: Qs 4s 3c 7h Kd
    "nlh_river3":       "media__1775770106905.png",  # NLH board: 7s 7h 7d As 5c
    
    # Fourth batch - Jd 3d confirmation (16:36)
    "plo4_turn1_dup":   "media__1775770325644.png",  # Same as plo4_turn1
    "plo4_jd_3d":       "media__1775770565410.png",  # Board: Js 3d Kc Jd!! (observing)
    
    # Fifth batch - Qh confirmation (16:38)
    "plo4_qh_board":    "media__1775770681834.png",  # Board: 3c 7c Qs Qh 8?, hero: A? T? 7? 2?
    "nlh_river2_dup":   "media__1775770706012.png",  # Same as nlh_river2
}

# =============================================================================
# EXTRACTION LIST — (file_key, card_code, region_list, card_index)
# =============================================================================
# We extract ONLY the missing 15 cards, prioritizing board positions.
# Missing: 2s, 3d, 3h, 4d, 4h, 5s, 8d, 9c, Jd, Jh, Js, Kd, Qc, Qd, Qh, Th

EXTRACTIONS = [
    # --- HIGH CONFIDENCE: Board cards (large, clear) ---
    
    # 3h — board card in plo4_turn1 (board pos 0, red heart)
    ("plo4_turn1",   "3h", BOARD_5MAX, 0),
    
    # 9c — board card in plo4_turn1 (board pos 3, green club)
    ("plo4_turn1",   "9c", BOARD_5MAX, 3),
    
    # Th — board card in plo4_river3 (board pos 3, red heart)
    ("plo4_river3",  "Th", BOARD_5MAX, 3),
    
    # Jh — board card in plo4_river5 (board pos 0, red heart)
    ("plo4_river5",  "Jh", BOARD_5MAX, 0),
    
    # Qd — board card in plo4_river5 (board pos 3, blue diamond)
    ("plo4_river5",  "Qd", BOARD_5MAX, 3),
    
    # Kd — board card in plo4_river5 (board pos 4, blue diamond)
    ("plo4_river5",  "Kd", BOARD_5MAX, 4),
    
    # Jd — board card in plo4_jd_3d (board pos 3, blue diamond)
    ("plo4_jd_3d",   "Jd", BOARD_5MAX, 3),
    
    # 3d — board card in plo4_jd_3d (board pos 1, blue diamond)
    ("plo4_jd_3d",   "3d", BOARD_5MAX, 1),
    
    # Js — board card in plo4_jd_3d (board pos 0, black spade)
    ("plo4_jd_3d",   "Js", BOARD_5MAX, 0),
    
    # Qh — board card in plo4_qh_board (board pos 3, red heart)
    ("plo4_qh_board", "Qh", BOARD_5MAX, 3),
    
    # --- MEDIUM CONFIDENCE: Hero fan cards ---
    
    # 4h — hero card in plo6_hand2 (PLO6 hero fan, card index 5 = rightmost)
    # PLO6 hero fan is wider. Let me use PLO6 positions.
    # Actually the plo6_hand2 is 472x1024, hero has 6 cards: As Ad Qs 8h 6h 4h
    # 4h is the rightmost card (index 5)
    # Since it's PLO6, the fan is wider. Let me define PLO6 hero regions.
    # For PLO6: cards span roughly x=215 to x=420
    # Card 6 (rightmost, 4h): approximately x=400, y=674, w=42, h=58
    ("plo6_hand2",   "4h", [
        {"x": 215, "y": 730, "w": 36, "h": 54},  # Card 1 (As)
        {"x": 251, "y": 722, "w": 36, "h": 54},  # Card 2 (Ad)
        {"x": 287, "y": 712, "w": 36, "h": 54},  # Card 3 (Qs)
        {"x": 323, "y": 702, "w": 36, "h": 54},  # Card 4 (8h)
        {"x": 359, "y": 692, "w": 36, "h": 54},  # Card 5 (6h)
        {"x": 400, "y": 680, "w": 40, "h": 56},  # Card 6 (4h) - rightmost
    ], 5),
    
    # 2s — hero card in plo5_preflop (PLO5 hero fan)
    # Hero: 9h 6c 3s 2s 2c — 2s is card index 3
    ("plo5_preflop",  "2s", HERO_PLO5, 3),
    
    # --- OPPONENT CARDS (smaller but usable) ---
    
    # 5s — opponent a1 in plo4_river4, showing As 5s 2c 2? (card index 1)
    # a1 is top-right position in these screenshots
    ("plo4_river4",   "5s", OPP_RIGHT, 1),
    
    # 4d — opponent a1 in plo4_river5 (A 9 6 4), card 3 has blue pip
    ("plo4_river5",   "4d", OPP_RIGHT, 3),
    
    # 8d — opponent KCChiefsRob in plo4_river5b (bottom-left), 8 6 ? 5
    ("plo4_river5b",  "8d", OPP_BOTLEFT, 0),
]


def crop_and_resize(img, region):
    """Crop a region from img and resize to template dimensions."""
    x, y, w, h = region["x"], region["y"], region["w"], region["h"]
    ih, iw = img.shape[:2]
    
    # Clamp to image boundaries
    x = max(0, min(x, iw - 1))
    y = max(0, min(y, ih - 1))
    w = min(w, iw - x)
    h = min(h, ih - y)
    
    if w < 5 or h < 5:
        return None
    
    cropped = img[y:y+h, x:x+w]
    if cropped.size == 0:
        return None
    
    resized = cv2.resize(cropped, (TEMPLATE_W, TEMPLATE_H), interpolation=cv2.INTER_AREA)
    return resized


def main():
    print("=" * 60)
    print("PokerBros Batch Template Extractor — Batch 3")
    print("=" * 60)
    
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    
    # Track existing templates
    existing = set()
    for f in TEMPLATES_DIR.glob("*.png"):
        existing.add(f.stem)
    print(f"\nExisting templates: {len(existing)}")
    
    # Track new extractions
    new_templates = {}
    errors = []
    
    for file_key, card_key, regions, card_index in EXTRACTIONS:
        filename = FILES.get(file_key)
        if not filename:
            errors.append(f"{card_key}: unknown file key '{file_key}'")
            continue
        
        filepath = BATCH_DIR / filename
        if not filepath.exists():
            errors.append(f"{card_key}: file not found '{filename}'")
            continue
        
        img = cv2.imread(str(filepath))
        if img is None:
            errors.append(f"{card_key}: cannot read '{filename}'")
            continue
        
        ih, iw = img.shape[:2]
        
        if card_index >= len(regions):
            errors.append(f"{card_key}: index {card_index} out of range for regions (len={len(regions)})")
            continue
        
        region = regions[card_index]
        
        # Scale regions from reference 460x1024 to actual image size
        ref_w = 460
        ref_h = 1024
        sx = iw / ref_w
        sy = ih / ref_h
        
        scaled = {
            "x": int(region["x"] * sx),
            "y": int(region["y"] * sy),
            "w": int(region["w"] * sx),
            "h": int(region["h"] * sy),
        }
        
        template = crop_and_resize(img, scaled)
        if template is not None:
            new_templates[card_key] = template
            status = "NEW" if card_key not in existing else "UPDATE"
            print(f"  [{status}] {card_key} from {file_key} ({card_index})")
        else:
            errors.append(f"{card_key}: crop produced empty result")
    
    # Save templates
    print(f"\n{'=' * 60}")
    print(f"Saving {len(new_templates)} templates...")
    
    for key, template in sorted(new_templates.items()):
        outpath = TEMPLATES_DIR / f"{key}.png"
        cv2.imwrite(str(outpath), template)
        print(f"  ✓ {outpath.name}")
        
        # Debug crop at 3x
        debug_path = DEBUG_DIR / f"debug-{key}.png"
        big = cv2.resize(template, (TEMPLATE_W * 3, TEMPLATE_H * 3), interpolation=cv2.INTER_NEAREST)
        cv2.imwrite(str(debug_path), big)
    
    # Final coverage check
    all_templates = existing | set(new_templates.keys())
    all_52 = set()
    for r in "AKQJT98765432":
        for s in "shdc":
            all_52.add(f"{r}{s}")
    
    missing = all_52 - all_templates - {"back", "empty"}
    
    print(f"\n{'=' * 60}")
    print(f"SUMMARY")
    print(f"{'=' * 60}")
    print(f"Previously had:    {len(existing)} templates")
    print(f"Newly extracted:   {len(new_templates)} templates")
    print(f"Total coverage:    {len(all_templates - {'back', 'empty'})}/52 cards")
    if missing:
        print(f"Still missing:     {len(missing)} — {', '.join(sorted(missing))}")
    else:
        print(f"Coverage:          COMPLETE! All 52 cards! 🎉")
    
    if errors:
        print(f"\nErrors ({len(errors)}):")
        for e in errors:
            print(f"  ✗ {e}")
    
    print(f"\nDebug crops: {DEBUG_DIR}")
    print(f"Templates:   {TEMPLATES_DIR}")


if __name__ == "__main__":
    main()
