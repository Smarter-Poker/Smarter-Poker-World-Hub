import os
from PIL import Image
import numpy as np
from scipy import ndimage

def composite_clean(input_path, output_path):
    print(f"\nProcessing {input_path}")
    img = Image.open(input_path).convert("RGBA")
    
    # 1. Composite onto solid black to fix all internal translucency
    black_bg = Image.new("RGBA", img.size, (0, 0, 0, 255))
    composited = Image.alpha_composite(black_bg, img)
    data = np.array(composited, dtype=np.float64)
    
    # We still need the original alpha and brightness to find the exterior
    orig_data = np.array(img, dtype=np.float64)
    r, g, b, orig_a = orig_data[:,:,0], orig_data[:,:,1], orig_data[:,:,2], orig_data[:,:,3]
    brightness = 0.299 * r + 0.587 * g + 0.114 * b
    
    # 2. Find the exterior background
    # The fringes are relatively dark, often < 60 brightness, or alpha < 10
    dark_mask = (brightness < 60) | (orig_a < 10)
    
    labeled, num_features = ndimage.label(dark_mask)
    
    border_labels = set()
    border_labels.update(labeled[0, :].flatten())
    border_labels.update(labeled[-1, :].flatten())
    border_labels.update(labeled[:, 0].flatten())
    border_labels.update(labeled[:, -1].flatten())
    border_labels.discard(0) 
    
    bg_mask = np.isin(labeled, list(border_labels))
    
    # 3. Erode the fringes by 1 pixel more to catch any halo 
    # Dilate the background mask by 1 to eat into the remaining edge.
    dilated_bg = ndimage.binary_dilation(bg_mask, iterations=1)
    eat_fringe = dilated_bg & ~bg_mask & ((brightness < 100) | (orig_a < 150))
    
    final_bg_mask = bg_mask | eat_fringe
    
    # 4. Apply the exterior transparency to the composited image
    # We want smooth edges where the exterior meets the object.
    # We'll use the original alpha for the edges, but ONLY where it's not in the background mask
    
    new_alpha = np.ones_like(orig_a) * 255
    new_alpha[final_bg_mask] = 0
    
    # Smooth the transition area
    edge_zone = ndimage.binary_dilation(final_bg_mask, iterations=2) & ~final_bg_mask
    new_alpha[edge_zone] = orig_a[edge_zone]
    
    # Note: everything INSIDE the frame that was semi-transparent stays 255 (solid black)!
    data[:,:,3] = new_alpha
    
    result = Image.fromarray(data.astype(np.uint8), "RGBA")
    
    # 5. Autocrop
    data_int = np.array(result)
    alpha_int = data_int[:,:,3]
    rows = np.any(alpha_int > 0, axis=1)
    cols = np.any(alpha_int > 0, axis=0)
    
    if rows.any() and cols.any():
        top, bottom = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
        left, right = np.argmax(cols), len(cols) - np.argmax(cols[::-1])
        cropped = result.crop((left, top, right, bottom))
        
        # 6. Add 15px padding to prevent CSS clipping
        pad = 15
        final_img = Image.new("RGBA", (cropped.width + pad*2, cropped.height + pad*2), (0,0,0,0))
        final_img.paste(cropped, (pad, pad))
        final_img.save(output_path)
        print(f"  Saved {output_path} (size {final_img.size})")
    else:
        print("Empty image after processing")

assets_dir = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/assets/tablet-buttons'
images = ['call-floor.png', 'call-clock.png', 'tournament-clock.png', 'tournament-table.png']

for img in images:
    path = os.path.join(assets_dir, img)
    if os.path.exists(path):
        composite_clean(path, path)
