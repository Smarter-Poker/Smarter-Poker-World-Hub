import os
from PIL import Image
import numpy as np
from collections import deque

def clean_icon(input_path, output_path):
    print(f"Cleaning {input_path}...")
    img = Image.open(input_path).convert("RGBA")
    data = np.array(img, dtype=np.int32)
    
    h, w = data.shape[:2]
    
    # We want to identify the exterior background.
    # Background is defined as pixels reachable from the border edges 
    # that are dark or greyish (brightness < some threshold, or close to black).
    # Since these were AI generated, the frame might have drop shadows.
    
    # Calculate brightness
    r, g, b = data[:,:,0], data[:,:,1], data[:,:,2]
    # Simple lightness metric
    brightness = (r + g + b) // 3
    
    # Tolerance for background: anything relatively dark (< 80 brightness)
    # or alpha is already 0.
    is_bg_candidate = (brightness < 60) | (data[:,:,3] < 128)
    
    # Flood-fill from borders
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()
    
    # Add all border pixels that are bg candidates
    for x in range(w):
        if is_bg_candidate[0, x]: queue.append((0, x)); visited[0, x] = True
        if is_bg_candidate[h-1, x]: queue.append((h-1, x)); visited[h-1, x] = True
    for y in range(h):
        if is_bg_candidate[y, 0]: queue.append((y, 0)); visited[y, 0] = True
        if is_bg_candidate[y, w-1]: queue.append((y, w-1)); visited[y, w-1] = True
        
    while queue:
        y, x = queue.popleft()
        
        # neighbors
        for dy, dx in [(-1,0), (1,0), (0,-1), (0,1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                if not visited[ny, nx] and is_bg_candidate[ny, nx]:
                    visited[ny, nx] = True
                    queue.append((ny, nx))
                    
    # Now set all visited pixels to fully transparent, AND keep everything else 100% opaque.
    # This guarantees the frame is NEVER translucent.
    data[visited, 3] = 0
    data[~visited, 3] = 255 # Force 100% opacity on the frame!
    
    # Autocrop
    alpha = data[:,:,3]
    rows = np.any(alpha > 0, axis=1)
    cols = np.any(alpha > 0, axis=0)
    
    if rows.any() and cols.any():
        top, bottom = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
        left, right = np.argmax(cols), len(cols) - np.argmax(cols[::-1])
        
        cropped_data = np.clip(data[top:bottom, left:right], 0, 255).astype(np.uint8)
        cropped_img = Image.fromarray(cropped_data, "RGBA")
        
        # Add 15px padding
        padding = 15
        final_img = Image.new("RGBA", (cropped_img.width + padding*2, cropped_img.height + padding*2), (0,0,0,0))
        final_img.paste(cropped_img, (padding, padding))
        
        final_img.save(output_path)
        print(f"Saved {output_path} (size {final_img.size})")
    else:
        print("Failed to crop")

assets_dir = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/assets/tablet-buttons'
images = ['call-floor.png', 'call-clock.png', 'tournament-clock.png', 'tournament-table.png']

for img in images:
    path = os.path.join(assets_dir, img)
    if os.path.exists(path):
        clean_icon(path, path)
