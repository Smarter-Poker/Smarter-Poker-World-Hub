import os
from PIL import Image

def find_crop_bbox(img, threshold=30):
    pixels = img.load()
    width, height = img.size
    
    left = 0
    for x in range(width):
        if any(sum(pixels[x, y]) > threshold * 3 for y in range(height)):
            left = x
            break
            
    right = width - 1
    for x in range(width - 1, -1, -1):
        if any(sum(pixels[x, y]) > threshold * 3 for y in range(height)):
            right = x
            break
            
    top = 0
    for y in range(height):
        if any(sum(pixels[x, y]) > threshold * 3 for x in range(width)):
            top = y
            break
            
    bottom = height - 1
    for y in range(height - 1, -1, -1):
        if any(sum(pixels[x, y]) > threshold * 3 for x in range(width)):
            bottom = y
            break
            
    return (left, top, right + 1, bottom + 1)

def crop_black_borders(img_path):
    img = Image.open(img_path).convert("RGB")
    bbox = find_crop_bbox(img)
    
    if bbox[2] > bbox[0] and bbox[3] > bbox[1]:
        cropped = img.crop(bbox)
        # Only save if we actually cropped something significant (more than 5 pixels)
        if bbox[0] > 5 or bbox[1] > 5 or (img.size[0] - bbox[2]) > 5 or (img.size[1] - bbox[3]) > 5:
            cropped.save(img_path)
            print(f"Cropped {os.path.basename(img_path)} from {img.size} to {cropped.size}")
        else:
            print(f"Skipped {os.path.basename(img_path)} - already tightly cropped")
    else:
        print(f"Failed to find bounds for {os.path.basename(img_path)}")

card_dir = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/cards"
for filename in os.listdir(card_dir):
    if filename.endswith(".jpg"):
        crop_black_borders(os.path.join(card_dir, filename))
