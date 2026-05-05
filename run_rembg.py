from PIL import Image
from rembg import remove
import io

img_path = '/Users/smarter.poker/.gemini/antigravity/brain/219ed5e5-32b8-45d9-a30e-55c0fec9fb8c/media__1777986324001.jpg'
original = Image.open(img_path)

# Crop coordinates
crown_box = (290, 50, 500, 200)
diamond_box = (150, 420, 380, 580)
vip_crown_box = (540, 420, 710, 530)

# Process Crown
crown = original.crop(crown_box)
crown_bytes = io.BytesIO()
crown.save(crown_bytes, format='PNG')
crown_out = remove(crown_bytes.getvalue())
Image.open(io.BytesIO(crown_out)).save('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/wallet-crown.png')

# Process Diamond
diamond = original.crop(diamond_box)
diamond_bytes = io.BytesIO()
diamond.save(diamond_bytes, format='PNG')
diamond_out = remove(diamond_bytes.getvalue())
Image.open(io.BytesIO(diamond_out)).save('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/wallet-diamond.png')

# Process VIP Crown
vip_crown = original.crop(vip_crown_box)
vip_crown_bytes = io.BytesIO()
vip_crown.save(vip_crown_bytes, format='PNG')
vip_crown_out = remove(vip_crown_bytes.getvalue())
Image.open(io.BytesIO(vip_crown_out)).save('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/wallet-vip-crown.png')

print("Assets processed with rembg")
