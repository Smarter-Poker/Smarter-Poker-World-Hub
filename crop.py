import sys
import glob
import os
from PIL import Image, ImageChops

def crop_black_background(img_path, out_path=None):
    if out_path is None:
        out_path = img_path
        
    img = Image.open(img_path)
    
    # Calculate difference from pure black
    diff = ImageChops.difference(img.convert("RGB"), Image.new("RGB", img.size, (0, 0, 0)))
    diff = diff.convert("L")
    
    # Threshold to ignore compression artifacts (values <= 10 are considered black)
    mask = diff.point(lambda p: p > 10 and 255)
    bbox = mask.getbbox()
    
    if bbox:
        # Check if the image actually has a black border
        # If the bbox is the same size as the image, do nothing
        if bbox != (0, 0, img.size[0], img.size[1]):
            cropped = img.crop(bbox)
            cropped.save(out_path, quality=95)
            print(f"[{img_path}] Cropped {img.size} -> {cropped.size}")
        else:
            print(f"[{img_path}] No black border found")
            if img_path != out_path:
                img.save(out_path, quality=95)
    else:
        print(f"[{img_path}] Image is entirely black or couldn't find content.")
        if img_path != out_path:
            img.save(out_path, quality=95)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python crop.py <directory_or_file>")
        sys.exit(1)
        
    path = sys.argv[1]
    
    if os.path.isdir(path):
        for file in glob.glob(os.path.join(path, "*.jpg")):
            crop_black_background(file)
        for file in glob.glob(os.path.join(path, "*.png")):
            crop_black_background(file)
    else:
        # Second argument can be output path
        out_path = sys.argv[2] if len(sys.argv) > 2 else None
        crop_black_background(path, out_path)
