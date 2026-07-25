import os
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
    trivia_dir = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"
    uploads_dir = "/Users/smarter.poker/.gemini/antigravity/brain/308456c4-37f4-4840-b5d4-a53be1ae40c6/.user_uploaded"
    
    trivia_mappings = {
        "media__1785006675778.png": "quick-stakes.png",
        "media__1785006641083.jpg": "gto-master.png",
        "media__1785006639372.jpg": "rules-quiz.png",
        "media__1785006636278.jpg": "pvp-battle.png",
    }
    
    for upload_name, dest_name in trivia_mappings.items():
        upload_path = os.path.join(uploads_dir, upload_name)
        dest_path = os.path.join(trivia_dir, dest_name)
        crop_black_background(upload_path, dest_path, is_png=True)
