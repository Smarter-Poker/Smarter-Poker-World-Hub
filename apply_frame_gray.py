import sys
from PIL import Image

def apply_frame(base_img_path, ref_frame_path, out_path, slice_size=16):
    base = Image.open(base_img_path).convert('RGB')
    ref = Image.open(ref_frame_path).convert('RGB')
    
    bw, bh = base.size
    rw, rh = ref.size
    
    out = base.copy()
    
    def process_slice(box):
        # Convert frame to grayscale then back to RGB
        return ref.crop(box).convert('L').convert('RGB')
        
    tl = process_slice((0, 0, slice_size, slice_size))
    tr = process_slice((rw - slice_size, 0, rw, slice_size))
    bl = process_slice((0, rh - slice_size, slice_size, rh))
    br = process_slice((rw - slice_size, rh - slice_size, rw, rh))
    
    top = process_slice((slice_size, 0, rw - slice_size, slice_size))
    bottom = process_slice((slice_size, rh - slice_size, rw - slice_size, rh))
    left = process_slice((0, slice_size, slice_size, rh - slice_size))
    right = process_slice((rw - slice_size, slice_size, rw, rh - slice_size))
    
    top_resized = top.resize((bw - 2 * slice_size, slice_size), Image.LANCZOS)
    bottom_resized = bottom.resize((bw - 2 * slice_size, slice_size), Image.LANCZOS)
    left_resized = left.resize((slice_size, bh - 2 * slice_size), Image.LANCZOS)
    right_resized = right.resize((slice_size, bh - 2 * slice_size), Image.LANCZOS)
    
    out.paste(top_resized, (slice_size, 0))
    out.paste(bottom_resized, (slice_size, bh - slice_size))
    out.paste(left_resized, (0, slice_size))
    out.paste(right_resized, (bw - slice_size, slice_size))
    
    out.paste(tl, (0, 0))
    out.paste(tr, (bw - slice_size, 0))
    out.paste(bl, (0, bh - slice_size))
    out.paste(br, (bw - slice_size, bh - slice_size))
    
    out.save(out_path, quality=95)
    print(f"Saved {out_path}")

BRAIN = "/Users/smarter.poker/.gemini/antigravity/brain/d91b8ea2-567b-4029-afb9-0acac78ea587"
ref_path = f"{BRAIN}/club-arena-reference.png"

for card in ["daily_challenges_v4_1787162404983.jpg", 
             "player_stats_v4_1787162411541.jpg", 
             "leaderboards_v4_1787162418489.jpg", 
             "cashier_v4_1787162426599.jpg", 
             "marketplace_v4_1787162434439.jpg"]:
    base_path = f"{BRAIN}/{card}"
    out_name = card.replace('_v4_', '_v5_')
    out_path = f"{BRAIN}/{out_name}"
    apply_frame(base_path, ref_path, out_path, slice_size=16)

