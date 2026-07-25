from PIL import Image
from rembg import remove
import io

for img_name in ['btn-hamburger.png', 'btn-hub.png', 'header-wallet.png', 'vip-card.png', 'header-settings.png', 'header-help.png', 'header-messenger.png']:
    try:
        path = f"public/images/{img_name}"
        with open(path, "rb") as i:
            input_bytes = i.read()
        
        output_bytes = remove(input_bytes)
        out_name = img_name.replace(".png", "-v4.png")
        
        # open to crop bounding box
        out_img = Image.open(io.BytesIO(output_bytes))
        bbox = out_img.getbbox()
        if bbox:
            out_img = out_img.crop(bbox)
            
        out_img.save(f"public/images/{out_name}")
        print(f"Processed {img_name} -> {out_name}")
    except Exception as e:
        print(f"Failed {img_name}: {e}")
