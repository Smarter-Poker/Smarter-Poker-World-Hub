#!/usr/bin/env python3
"""
Process all 13 trivia images using rembg (ML-based background removal).
This replaces all previous ImageMagick approaches.
"""
import os
from PIL import Image
from rembg import remove

BRAIN = "/Users/smarter.poker/.gemini/antigravity/brain/cd6c7256-a33a-4751-b18b-0bca614ac742"
TRIVIA = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"

# Map: output_name -> (source_file, crop_box_or_None, resize_or_None)
# crop_box = (left, upper, right, lower)
IMAGES = {
    "mtt-scenarios":  ("media__1770348522477.jpg", (70, 70, 954, 954), None),
    "cash-game":      ("media__1770348761265.jpg", (70, 70, 954, 954), None),
    "icm-chip-ev":    ("media__1770348529887.jpg", (70, 70, 954, 954), None),
    "poker-history":  ("media__1770346417565.jpg", (70, 70, 954, 954), None),
    "rules-quiz":     ("media__1770346413109.jpg", (70, 70, 954, 954), None),
    "pro-knowledge":  ("media__1770346415298.jpg", (70, 70, 954, 954), None),
    "survival-mode":  ("media__1770346406609.jpg", (70, 70, 954, 954), None),
    "endless-mode":   ("media__1770346419994.jpg", (70, 70, 954, 954), None),
    "mixed-mode":     ("media__1770348524702.jpg", (70, 70, 954, 954), None),
    "pvp-battle":     ("media__1770348758855.jpg", (70, 70, 954, 954), None),
    "tournaments":    ("media__1770348520466.jpg", (70, 70, 954, 954), None),
    "quick-stakes":   ("media__1770349622114.jpg", (52, 282, 972, 742), None),
    "gto-master":     ("media__1770391740300.jpg", None, (884, 884)),
}

def process_image(name, source_file, crop_box, resize):
    source_path = os.path.join(BRAIN, source_file)
    output_path = os.path.join(TRIVIA, f"{name}.png")
    
    print(f"Processing {name}...")
    
    # Load
    img = Image.open(source_path)
    
    # Crop if specified
    if crop_box:
        img = img.crop(crop_box)
    
    # Resize if specified
    if resize:
        img = img.resize(resize, Image.LANCZOS)
    
    # Remove background using ML model
    result = remove(img)
    
    # Save
    result.save(output_path, "PNG")
    print(f"  -> Saved {output_path} ({result.size[0]}x{result.size[1]})")

def main():
    print("=== REMBG Batch Processing: All 13 Trivia Images ===")
    print(f"Source: {BRAIN}")
    print(f"Output: {TRIVIA}")
    print()
    
    os.makedirs(TRIVIA, exist_ok=True)
    
    for name, (source, crop, resize) in IMAGES.items():
        try:
            process_image(name, source, crop, resize)
        except Exception as e:
            print(f"  ERROR processing {name}: {e}")
    
    print()
    print("=== DONE ===")

if __name__ == "__main__":
    main()
