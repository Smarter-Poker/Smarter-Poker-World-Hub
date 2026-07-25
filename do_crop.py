import os
import glob
import shutil
from PIL import Image, ImageChops

def crop_black_background(img_path, out_path, is_png=False):
    print(f"Processing {img_path} -> {out_path}")
    img = Image.open(img_path)
    if is_png:
        img = img.convert("RGBA")
    
    diff = ImageChops.difference(img.convert("RGB"), Image.new("RGB", img.size, (0, 0, 0)))
    diff = diff.convert("L")
    mask = diff.point(lambda p: p > 10 and 255)
    bbox = mask.getbbox()
    
    if bbox:
        if bbox != (0, 0, img.size[0], img.size[1]):
            cropped = img.crop(bbox)
            cropped.save(out_path, format="PNG" if is_png else "JPEG", quality=95)
            print(f"  Cropped {img.size} -> {cropped.size}")
        else:
            print(f"  No black border found")
            if img_path != out_path:
                img.save(out_path, format="PNG" if is_png else "JPEG", quality=95)
    else:
        print(f"  Image is entirely black or couldn't find content.")
        if img_path != out_path:
            img.save(out_path, format="PNG" if is_png else "JPEG", quality=95)

if __name__ == "__main__":
    cards_dir = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/cards"
    trivia_dir = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"
    uploads_dir = "/Users/smarter.poker/.gemini/antigravity/brain/308456c4-37f4-4840-b5d4-a53be1ae40c6/.user_uploaded"
    
    # 1. Crop all existing cards
    for file in glob.glob(os.path.join(cards_dir, "*.jpg")):
        crop_black_background(file, file)
        
    # 2. Crop social media card from upload
    social_upload = os.path.join(uploads_dir, "media__1785004123592.jpg")
    social_dest = os.path.join(cards_dir, "social-media.jpg")
    crop_black_background(social_upload, social_dest)
    
    # 3. Crop trivia images from uploads (convert to PNG)
    trivia_mappings = {
        "media__1785004516366.png": "daily-trivia-header-final.png",
        "media__1785004523591.jpg": "cash-game.png",
        "media__1785004525428.jpg": "icm-chip-ev.png",
        "media__1785004528509.jpg": "mtt-scenarios.png",
        "media__1785004896755.jpg": "poker-history.png",
        "media__1785004899194.jpg": "tournaments.png",
        "media__1785005186103.jpg": "pro-knowledge.png",
    }
    
    for upload_name, dest_name in trivia_mappings.items():
        upload_path = os.path.join(uploads_dir, upload_name)
        dest_path = os.path.join(trivia_dir, dest_name)
        crop_black_background(upload_path, dest_path, is_png=True)
