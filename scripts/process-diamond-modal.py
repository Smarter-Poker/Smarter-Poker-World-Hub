#!/usr/bin/env python3
import os
from PIL import Image
from rembg import remove

SOURCE_IMG = "/Users/smarter.poker/.gemini/antigravity/brain/37e82834-65f6-422e-baca-ceee5bb32911/media__1773072693106.jpg"
OUTPUT_DIR = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"
OUTPUT_IMG = os.path.join(OUTPUT_DIR, "diamond-entry-modal.png")

def main():
    print(f"Removing background from {SOURCE_IMG}...")
    img = Image.open(SOURCE_IMG)
    result = remove(img)
    result.save(OUTPUT_IMG, "PNG")
    print(f"Saved transparent image to {OUTPUT_IMG}")

if __name__ == "__main__":
    main()
