#!/usr/bin/env python3
"""
PokerBros Template Extractor
=============================
Reads reference screenshots from pokerbrain-assets/, crops card regions at
confirmed pixel coordinates, normalizes to 64x88 px, and saves templates.

Usage:
  source scripts/poker-brain/.venv/bin/activate
  python scripts/poker-brain/extract-templates.py

Prerequisites:
  - Reference screenshots in pokerbrain-assets/
  - Coordinates confirmed by measuring the actual frames
"""

import os
import sys
import json
import cv2
import numpy as np
from pathlib import Path

# Project root
ROOT = Path(__file__).resolve().parent.parent.parent
ASSETS_DIR = ROOT / "pokerbrain-assets"
TEMPLATES_DIR = ROOT / "public" / "hub" / "poker-brain" / "templates"
LAYOUT_FILE = ROOT / "src" / "lib" / "poker-brain" / "layout.json"

# Template dimensions (PokerBros card aspect ratio)
TEMPLATE_W = 64
TEMPLATE_H = 88

# ============================================================================
# LAYOUT — These coordinates MUST be measured from the actual reference frames.
# The values below are PLACEHOLDERS that will be populated once the user
# provides the 7 reference screenshots. DO NOT USE until confirmed.
# ============================================================================

# Reference emulator resolution (portrait)
REF_W = 478
REF_H = 1065

# Known card assignments per screenshot file
# Format: { filename: { "hole": [(rank, suit), ...], "board": [(rank, suit), ...] } }
SCREENSHOT_CARDS = {
    "preflop.png": {
        "hole": [("K", "h"), ("J", "c")],
        "board": [],
    },
    "flop.png": {
        "hole": [("K", "h"), ("J", "c")],
        "board": [("5", "c"), ("6", "h"), ("A", "c")],
    },
    "turn.png": {
        "hole": [("K", "h"), ("J", "c")],
        "board": [("5", "c"), ("6", "h"), ("A", "c"), ("A", "s")],
    },
    "river.png": {
        "hole": [("K", "h"), ("J", "c")],
        "board": [("5", "c"), ("6", "h"), ("A", "c"), ("A", "s"), ("9", "h")],
    },
}

# Placeholder regions — MUST be replaced with actual measured coordinates
# Each region is { x, y, w, h } in pixels at REF_W x REF_H
LAYOUT = {
    "referenceSize": {"w": REF_W, "h": REF_H},
    "holeCards": [
        # Hole card 1 (left) — PLACEHOLDER
        {"x": 160, "y": 680, "w": 55, "h": 75},
        # Hole card 2 (right) — PLACEHOLDER
        {"x": 260, "y": 680, "w": 55, "h": 75},
    ],
    "boardCards": [
        # Board card 1 (leftmost) — PLACEHOLDER
        {"x": 85,  "y": 420, "w": 50, "h": 68},
        {"x": 150, "y": 420, "w": 50, "h": 68},
        {"x": 215, "y": 420, "w": 50, "h": 68},
        {"x": 280, "y": 420, "w": 50, "h": 68},
        {"x": 345, "y": 420, "w": 50, "h": 68},
    ],
}


def crop_and_normalize(image, region):
    """Crop a region from an image and resize to template dimensions."""
    x, y, w, h = region["x"], region["y"], region["w"], region["h"]
    
    # Bounds check
    ih, iw = image.shape[:2]
    x = max(0, min(x, iw - 1))
    y = max(0, min(y, ih - 1))
    w = min(w, iw - x)
    h = min(h, ih - y)
    
    cropped = image[y:y+h, x:x+w]
    
    if cropped.size == 0:
        print(f"  WARNING: Empty crop at ({x},{y},{w},{h})")
        return None
    
    # Resize to standard template size
    normalized = cv2.resize(cropped, (TEMPLATE_W, TEMPLATE_H), interpolation=cv2.INTER_AREA)
    return normalized


def extract_from_screenshot(filepath, card_map, is_hole=True):
    """Extract card templates from a single screenshot."""
    img = cv2.imread(str(filepath))
    if img is None:
        print(f"  ERROR: Cannot read {filepath}")
        return {}
    
    ih, iw = img.shape[:2]
    print(f"  Image size: {iw}x{ih}")
    
    # Scale regions if image size differs from reference
    sx = iw / REF_W
    sy = ih / REF_H
    
    templates = {}
    
    # Extract hole cards
    for i, (rank, suit) in enumerate(card_map.get("hole", [])):
        if i >= len(LAYOUT["holeCards"]):
            break
        region = LAYOUT["holeCards"][i]
        scaled_region = {
            "x": int(region["x"] * sx),
            "y": int(region["y"] * sy),
            "w": int(region["w"] * sx),
            "h": int(region["h"] * sy),
        }
        template = crop_and_normalize(img, scaled_region)
        if template is not None:
            key = f"{rank}{suit}"
            templates[key] = template
            print(f"  Extracted hole card: {key}")
    
    # Extract board cards
    for i, (rank, suit) in enumerate(card_map.get("board", [])):
        if i >= len(LAYOUT["boardCards"]):
            break
        region = LAYOUT["boardCards"][i]
        scaled_region = {
            "x": int(region["x"] * sx),
            "y": int(region["y"] * sy),
            "w": int(region["w"] * sx),
            "h": int(region["h"] * sy),
        }
        template = crop_and_normalize(img, scaled_region)
        if template is not None:
            key = f"{rank}{suit}"
            templates[key] = template
            print(f"  Extracted board card: {key}")
    
    # Extract card back (from hole card position in lobby/empty screenshots)
    # and empty slot (from board position when no board cards present)
    
    return templates


def extract_special_templates(assets_dir):
    """Extract card back and empty slot templates from non-game screenshots."""
    specials = {}
    
    # Look for screenshots where cards are face-down or slots are empty
    for name in ["seated.png", "empty.png", "lobby.png"]:
        filepath = assets_dir / name
        if not filepath.exists():
            continue
        
        img = cv2.imread(str(filepath))
        if img is None:
            continue
        
        ih, iw = img.shape[:2]
        sx = iw / REF_W
        sy = ih / REF_H
        
        # Try to extract card back from hole card position
        if name == "seated.png" and "back" not in specials:
            region = LAYOUT["holeCards"][0]
            scaled_region = {
                "x": int(region["x"] * sx),
                "y": int(region["y"] * sy),
                "w": int(region["w"] * sx),
                "h": int(region["h"] * sy),
            }
            template = crop_and_normalize(img, scaled_region)
            if template is not None:
                specials["back"] = template
                print(f"  Extracted card back from {name}")
        
        # Try to extract empty slot from board position
        if "empty" not in specials:
            region = LAYOUT["boardCards"][0]
            scaled_region = {
                "x": int(region["x"] * sx),
                "y": int(region["y"] * sy),
                "w": int(region["w"] * sx),
                "h": int(region["h"] * sy),
            }
            template = crop_and_normalize(img, scaled_region)
            if template is not None:
                specials["empty"] = template
                print(f"  Extracted empty slot from {name}")
    
    return specials


def main():
    print("=" * 60)
    print("PokerBros Template Extractor")
    print("=" * 60)
    
    # Check assets directory
    if not ASSETS_DIR.exists():
        print(f"\nERROR: Assets directory not found: {ASSETS_DIR}")
        print("Please create pokerbrain-assets/ and add reference screenshots.")
        sys.exit(1)
    
    # List available screenshots
    screenshots = list(ASSETS_DIR.glob("*.png")) + list(ASSETS_DIR.glob("*.jpg"))
    if not screenshots:
        print(f"\nERROR: No screenshots found in {ASSETS_DIR}")
        sys.exit(1)
    
    print(f"\nFound {len(screenshots)} screenshots:")
    for s in sorted(screenshots):
        print(f"  - {s.name}")
    
    # Create output directory
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nOutput directory: {TEMPLATES_DIR}")
    
    # Extract templates from each screenshot
    all_templates = {}
    
    for filepath in sorted(screenshots):
        name = filepath.name
        if name in SCREENSHOT_CARDS:
            print(f"\nProcessing {name}...")
            templates = extract_from_screenshot(filepath, SCREENSHOT_CARDS[name])
            all_templates.update(templates)
    
    # Extract special templates (back, empty)
    print("\nExtracting special templates...")
    specials = extract_special_templates(ASSETS_DIR)
    
    # Save all templates
    print(f"\nSaving {len(all_templates)} card templates + {len(specials)} special templates...")
    
    for key, template in all_templates.items():
        outpath = TEMPLATES_DIR / f"{key}.png"
        cv2.imwrite(str(outpath), template)
        print(f"  Saved: {outpath.name}")
    
    for key, template in specials.items():
        outpath = TEMPLATES_DIR / f"{key}.png"
        cv2.imwrite(str(outpath), template)
        print(f"  Saved: {outpath.name}")
    
    # Save layout.json
    LAYOUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LAYOUT_FILE, "w") as f:
        json.dump(LAYOUT, f, indent=2)
    print(f"\nSaved layout: {LAYOUT_FILE}")
    
    # Summary
    unique_cards = set(all_templates.keys())
    print(f"\n{'=' * 60}")
    print(f"SUMMARY")
    print(f"{'=' * 60}")
    print(f"Unique card templates extracted: {len(unique_cards)}")
    print(f"Cards: {', '.join(sorted(unique_cards))}")
    print(f"Missing: {52 - len(unique_cards)} of 52")
    print(f"Special templates: {', '.join(specials.keys()) if specials else 'none'}")
    print(f"\nTo complete the library, either:")
    print(f"  (a) Extract PokerBros APK and provide sprite atlas")
    print(f"  (b) Play more hands and screenshot new cards")


if __name__ == "__main__":
    main()
