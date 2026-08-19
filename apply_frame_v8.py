import sys
from PIL import Image, ImageDraw

def apply_frame(base_img_path, ref_frame_path, out_path, crop_px=30, slice_size=16):
    # Load images
    base = Image.open(base_img_path).convert('RGB')
    ref = Image.open(ref_frame_path).convert('RGB')
    
    # --- 1. Destroy AI Borders ---
    w, h = base.size
    cropped = base.crop((crop_px, crop_px, w - crop_px, h - crop_px))
    base_clean = cropped.resize((w, h), Image.LANCZOS)
    
    # --- 2. Fix sharp corners poking out ---
    # Paint black 25x25 boxes in corners so they hide behind the rounded frame
    draw = ImageDraw.Draw(base_clean)
    r = 25
    draw.rectangle([0, 0, r, r], fill=(15, 15, 20))
    draw.rectangle([w-r, 0, w, r], fill=(15, 15, 20))
    draw.rectangle([0, h-r, r, h], fill=(15, 15, 20))
    draw.rectangle([w-r, h-r, w, h], fill=(15, 15, 20))
    
    # --- 3. Extract perfectly neutral 1:1 frame ---
    rw, rh = ref.size
    def process_slice(box):
        return ref.crop(box).convert('L').convert('RGB')
        
    tl = process_slice((0, 0, slice_size, slice_size))
    tr = process_slice((rw - slice_size, 0, rw, slice_size))
    bl = process_slice((0, rh - slice_size, slice_size, rh))
    br = process_slice((rw - slice_size, rh - slice_size, rw, rh))
    
    top = process_slice((slice_size, 0, rw - slice_size, slice_size))
    bottom = process_slice((slice_size, rh - slice_size, rw - slice_size, rh))
    left = process_slice((0, slice_size, slice_size, rh - slice_size))
    right = process_slice((rw - slice_size, slice_size, rw, rh - slice_size))
    
    # --- 4. Composite ---
    top_resized = top.resize((w - 2 * slice_size, slice_size), Image.LANCZOS)
    bottom_resized = bottom.resize((w - 2 * slice_size, slice_size), Image.LANCZOS)
    left_resized = left.resize((slice_size, h - 2 * slice_size), Image.LANCZOS)
    right_resized = right.resize((slice_size, h - 2 * slice_size), Image.LANCZOS)
    
    base_clean.paste(top_resized, (slice_size, 0))
    base_clean.paste(bottom_resized, (slice_size, h - slice_size))
    base_clean.paste(left_resized, (0, slice_size))
    base_clean.paste(right_resized, (w - slice_size, slice_size))
    
    base_clean.paste(tl, (0, 0))
    base_clean.paste(tr, (w - slice_size, 0))
    base_clean.paste(bl, (0, h - slice_size))
    base_clean.paste(br, (w - slice_size, h - slice_size))
    
    base_clean.save(out_path, quality=95)
    print(f"Saved {out_path}")

BRAIN = "/Users/smarter.poker/.gemini/antigravity/brain/d91b8ea2-567b-4029-afb9-0acac78ea587"
ref_path = f"{BRAIN}/club-arena-reference.png"

cards = {
    # Using V7 for Daily Challenges (with the new background)
    "daily_challenges_v7_1787166807294.jpg": "daily_challenges_v8.jpg",
    # Using V4 for the rest (they were good, just had an AI border)
    "player_stats_v4_1787162411541.jpg": "player_stats_v8.jpg",
    "leaderboards_v4_1787162418489.jpg": "leaderboards_v8.jpg",
    "cashier_v4_1787162426599.jpg": "cashier_v8.jpg",
    "marketplace_v4_1787162434439.jpg": "marketplace_v8.jpg"
}

for base_card, out_card in cards.items():
    base_path = f"{BRAIN}/{base_card}"
    out_path = f"{BRAIN}/{out_card}"
    
    # If it's V7 daily challenges (which has a huge border), crop more!
    crop_amount = 75 if 'daily_challenges' in base_card else 35
    
    apply_frame(base_path, ref_path, out_path, crop_px=crop_amount, slice_size=16)

