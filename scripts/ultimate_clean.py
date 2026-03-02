import os
import cv2
import numpy as np
from PIL import Image
from rembg import remove

def ultimate_clean(input_path, output_path):
    print(f"\nProcessing {input_path}")
    
    # 1. Load original image
    with open(input_path, 'rb') as f:
        orig_bytes = f.read()
    orig_img = Image.open(input_path).convert("RGBA")
    
    # 2. Get REMBG result for perfect outer edges
    rembg_bytes = remove(orig_bytes)
    import io
    rembg_img = Image.open(io.BytesIO(rembg_bytes)).convert("RGBA")
    rembg_data = np.array(rembg_img)
    rembg_alpha = rembg_data[:,:,3]
    
    # 3. Composite original over black to fix all see-through / text blending issues
    # Since the user's tablet is black, this makes the transparent text background solid black
    black_bg = Image.new("RGBA", orig_img.size, (0, 0, 0, 255))
    composited_img = Image.alpha_composite(black_bg, orig_img)
    comp_data = np.array(composited_img)
    
    # 4. Use OpenCV to find the solid internal core from rembg's alpha
    # Use a threshold > 50 to get a binary mask of the button
    _, binary = cv2.threshold(rembg_alpha, 50, 255, cv2.THRESH_BINARY)
    
    # Fill any holes in the binary mask (the translucent parts inside the frame)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        print("No contours found.")
        return
        
    c = max(contours, key=cv2.contourArea)
    
    solid_mask = np.zeros_like(rembg_alpha)
    cv2.drawContours(solid_mask, [c], -1, 255, -1)
    
    # We want to force alpha=255 inside the button.
    # But we want to KEEP the soft anti-aliased edge from rembg_alpha!
    # So we ERODE the solid_mask by 5-10 pixels. 
    # This creates an "inner core" that is 100% solid, leaving a 5-10 pixel soft edge region controlled by rembg.
    kernel = np.ones((10,10), np.uint8)
    inner_core = cv2.erode(solid_mask, kernel, iterations=1)
    
    # 5. Combine the final alpha channel
    final_alpha = np.where(inner_core == 255, 255, rembg_alpha)
    
    # Apply the final alpha to the composited RGB data
    comp_data[:,:,3] = final_alpha
    
    result = Image.fromarray(comp_data, "RGBA")
    
    # 6. Autocrop tight, then pad 15px
    alpha_int = comp_data[:,:,3]
    rows = np.any(alpha_int > 0, axis=1)
    cols = np.any(alpha_int > 0, axis=0)
    
    if rows.any() and cols.any():
        top, bottom = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
        left, right = np.argmax(cols), len(cols) - np.argmax(cols[::-1])
        cropped = result.crop((left, top, right, bottom))
        
        pad = 15
        final_img = Image.new("RGBA", (cropped.width + pad*2, cropped.height + pad*2), (0,0,0,0))
        final_img.paste(cropped, (pad, pad))
        final_img.save(output_path)
        print(f"  Saved {output_path} (size {final_img.size})")
    else:
        print("Empty image.")

assets_dir = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/assets/tablet-buttons'
images = ['call-floor.png', 'call-clock.png', 'tournament-clock.png', 'tournament-table.png']

for img in images:
    path = os.path.join(assets_dir, img)
    if os.path.exists(path):
        ultimate_clean(path, path)
