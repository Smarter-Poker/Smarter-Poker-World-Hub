import sys
from PIL import Image, ImageChops

def clean_and_crop(input_path, output_path, remove_black=True, remove_white=False):
    try:
        img = Image.open(input_path).convert("RGBA")
        data = img.getdata()
        
        new_data = []
        for item in data:
            # item is (R, G, B, A)
            r, g, b, a = item
            if a == 0:
                new_data.append(item)
                continue
                
            # Remove black background (some compression artifacts might make it not exactly 0,0,0)
            if remove_black and r < 20 and g < 20 and b < 20:
                new_data.append((r, g, b, 0))
            # Remove white background
            elif remove_white and r > 235 and g > 235 and b > 235:
                new_data.append((r, g, b, 0))
            else:
                new_data.append(item)
                
        img.putdata(new_data)
        
        # Crop the bounding box
        bg = Image.new(img.mode, img.size, img.getpixel((0,0)))
        diff = ImageChops.difference(img, bg)
        diff = ImageChops.add(diff, diff, 2.0, -100)
        bbox = diff.getbbox()
        if bbox:
            img = img.crop(bbox)
            
        img.save(output_path, "PNG")
        print(f"Processed {input_path} -> {output_path} (Size: {img.size})")
    except Exception as e:
        print(f"Error processing {input_path}: {e}")

images = [
    ("public/images/btn-hamburger.png", "public/images/btn-hamburger-v3.png", True, False),
    ("public/images/btn-hub.png", "public/images/btn-hub-v3.png", True, False),
    ("public/images/header-help.png", "public/images/header-help-v3.png", True, False),
    ("public/images/header-settings.png", "public/images/header-settings-v3.png", True, False),
    ("public/images/header-wallet.png", "public/images/header-wallet-v3.png", True, False),
    ("public/images/header-messenger.png", "public/images/header-messenger-v3.png", True, True),
    ("public/images/vip-card.png", "public/images/vip-card-v3.png", True, False)
]

for in_path, out_path, rm_black, rm_white in images:
    clean_and_crop(in_path, out_path, rm_black, rm_white)

