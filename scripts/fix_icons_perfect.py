import os
from PIL import Image
import numpy as np
from scipy import ndimage

def perfect_clean(input_path, output_path):
    print(f"\nProcessing {input_path}")
    img = Image.open(input_path).convert("RGBA")
    data = np.array(img, dtype=np.float64)
    
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
    brightness = 0.299 * r + 0.587 * g + 0.114 * b
    
    # 1. We want to remove the grey/black fringes on the extreme edges.
    # The fringes are relatively dark, often < 70 brightness.
    # Mask of pixels that are dark, OR pixels that are practically transparent (alpha < 10)
    dark_mask = (brightness < 60) | (a < 10)
    
    # 2. Label all connected components
    labeled, num_features = ndimage.label(dark_mask)
    
    # 3. Find which of these components touch the exact image borders
    border_labels = set()
    border_labels.update(labeled[0, :].flatten())
    border_labels.update(labeled[-1, :].flatten())
    border_labels.update(labeled[:, 0].flatten())
    border_labels.update(labeled[:, -1].flatten())
    border_labels.discard(0) # 0 means not in dark_mask
    
    # 4. Make all pixels in these border components fully transparent
    bg_mask = np.isin(labeled, list(border_labels))
    
    # Also aggressively erode the fringes by 1 pixel more to catch halo
    # Dilate the background mask by 1 to eat into the remaining edge.
    # But ONLY eat into pixels that have low alpha (< 150) or are darkish (< 100)
    dilated_bg = ndimage.binary_dilation(bg_mask, iterations=1)
    eat_fringe = dilated_bg & ~bg_mask & ((brightness < 100) | (a < 150))
    
    final_bg_mask = bg_mask | eat_fringe
    
    # Apply transparency
    data[:,:,3][final_bg_mask] = 0
    
    # 5. Fix internal translucency (user specifically asked: "PARTS OF FRAMES ARE TRANSLUCENT")
    # If the interior of the frame is 150 < alpha < 250, we want to boost it to 255
    # so the frame becomes solid, but preserve extreme soft edges (alpha < 50)
    a_new = data[:,:,3].copy()
    
    # Map alpha: 50 -> 0, 150 -> 255
    # This sharpens the edge significantly and solidifies the core frame
    # Formula: a = (a - 50) * (255 / 100)
    a_sharpened = np.clip((a_new - 50) * 2.55, 0, 255)
    
    # Apply the sharpened alpha
    data[:,:,3] = a_sharpened
    
    result = Image.fromarray(data.astype(np.uint8), "RGBA")
    
    # 6. Autocrop
    data_int = np.array(result)
    alpha_int = data_int[:,:,3]
    rows = np.any(alpha_int > 0, axis=1)
    cols = np.any(alpha_int > 0, axis=0)
    
    if rows.any() and cols.any():
        top, bottom = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
        left, right = np.argmax(cols), len(cols) - np.argmax(cols[::-1])
        cropped = result.crop((left, top, right, bottom))
        
        # 7. Add 15px padding to prevent CSS clipping
        pad = 15
        final_img = Image.new("RGBA", (cropped.width + pad*2, cropped.height + pad*2), (0,0,0,0))
        final_img.paste(cropped, (pad, pad))
        final_img.save(output_path)
        print(f"  Removed {final_bg_mask.sum()} fringe pixels.")
        print(f"  Saved {output_path} (size {final_img.size})")
    else:
        print("Empty image after processing")

assets_dir = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/assets/tablet-buttons'
images = ['call-floor.png', 'call-clock.png', 'tournament-clock.png', 'tournament-table.png']

for img in images:
    path = os.path.join(assets_dir, img)
    if os.path.exists(path):
        perfect_clean(path, path)
