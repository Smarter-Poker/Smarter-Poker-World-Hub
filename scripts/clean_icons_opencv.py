import cv2
import numpy as np
import os
from PIL import Image

def process_icon(input_path, output_path):
    print(f"Processing {input_path}...")
    
    # 1. Read image with alpha channel
    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        print(f"Failed to load {input_path}")
        return
        
    if img.shape[2] == 4:
        # Separate channels
        b, g, r, a = cv2.split(img)
    else:
        b, g, r = cv2.split(img)
        a = np.ones_like(b) * 255
        
    # 2. Convert to grayscale to find the object
    gray = cv2.cvtColor(cv2.merge([b,g,r]), cv2.COLOR_BGR2GRAY)
    
    # The background is dark/black that the AI generated.
    # We create a binary mask of anything that is NOT the dark background.
    # Experimentally, AI artifacts are around 0-30 intensity.
    # Let's use a threshold of 40. Keep pixels > 40.
    _, thresh = cv2.threshold(gray, 40, 255, cv2.THRESH_BINARY)
    
    # Also if the original image had transparency, use that as well
    if img.shape[2] == 4:
        _, a_thresh = cv2.threshold(a, 10, 255, cv2.THRESH_BINARY)
        combined_mask = cv2.bitwise_and(thresh, a_thresh)
    else:
        combined_mask = thresh
        
    # Apply morphological closing to connect parts of the frame
    kernel = np.ones((10,10), np.uint8)
    closed = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel)
    
    # 3. Find the largest external contour
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        print("No contours found!")
        return
        
    # Assume largest contour by area is the button
    c = max(contours, key=cv2.contourArea)
    
    # 4. Create a solid mask filling this contour completely
    # This solves the "internal see-through" issue!
    solid_mask = np.zeros_like(gray)
    cv2.drawContours(solid_mask, [c], -1, 255, -1)
    
    # 5. Erode the mask slightly (e.g., 3-5 pixels) to chop off the dark noisy AI edges
    erode_kernel = np.ones((5,5), np.uint8)
    eroded_mask = cv2.erode(solid_mask, erode_kernel, iterations=2)
    
    # Smooth the mask edges slightly with GaussianBlur
    smooth_mask = cv2.GaussianBlur(eroded_mask, (7,7), 0)
    
    # 6. Apply the new mask to the alpha channel
    img_new = cv2.merge([b, g, r, smooth_mask])
    
    # We now have an image where the *inside* is completely opaque (from the filled contour)
    # But wait, `smooth_mask` values are 0-255.
    # We just overwrite the alpha channel with this solid, filled, eroded contour.
    
    # 7. Convert to PIL for easy cropping and padding
    pil_img = Image.fromarray(cv2.cvtColor(img_new, cv2.COLOR_BGRA2RGBA))
    
    # 8. Autocrop
    data = np.array(pil_img)
    alpha = data[:,:,3]
    rows = np.any(alpha > 0, axis=1)
    cols = np.any(alpha > 0, axis=0)
    
    if rows.any() and cols.any():
        top, bottom = np.argmax(rows), len(rows) - np.argmax(rows[::-1])
        left, right = np.argmax(cols), len(cols) - np.argmax(cols[::-1])
        cropped = pil_img.crop((left, top, right, bottom))
        
        # Add 15px padding
        padding = 15
        final_img = Image.new("RGBA", (cropped.width + padding*2, cropped.height + padding*2), (0,0,0,0))
        final_img.paste(cropped, (padding, padding))
        
        final_img.save(output_path)
        print(f"Saved {output_path} (size {final_img.size})")
    else:
        print("Failed to crop")

assets_dir = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/assets/tablet-buttons'
images = ['call-floor.png', 'call-clock.png', 'tournament-clock.png', 'tournament-table.png']

for img in images:
    path = os.path.join(assets_dir, img)
    if os.path.exists(path):
        process_icon(path, path)
