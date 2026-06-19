import os
from PIL import Image, ImageDraw, ImageFont

gen_path = "/Users/smarter.poker/.gemini/antigravity/brain/1f577cdc-49dd-4598-a1e9-360b848af138/mlb_analytics_updated_white_1781876096708.png"
gen_img = Image.open(gen_path).convert("RGB")

# 1. Create a flawless brushed nickel background (695x1024)
metal_slice = gen_img.crop((200, 300, 210, 700))
bg = metal_slice.resize((695, 1024), Image.Resampling.LANCZOS)

# 2. Extract ONLY the glowing screen from the original image
screen_original = gen_img.crop((215, 140, 805, 880))

# 3. THIN brushed nickel frame! 15px all the way around!
frame_thickness = 15
screen_w = 695 - (frame_thickness * 2)
screen_h = 1024 - (frame_thickness * 2)
screen_resized = screen_original.resize((screen_w, screen_h), Image.Resampling.LANCZOS)

# 4. Paste the screen onto the metal background
bg.paste(screen_resized, (frame_thickness, frame_thickness))

# 5. Add the big text ON THE IMAGE
draw = ImageDraw.Draw(bg)

title_text = "MLB-ANALYTICS"
desc_text = "FIND THE BEST BETS AND EDGE IN EVERY GAME"

try:
    font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 80)
    font_desc = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 26)
except:
    font_title = ImageFont.load_default()
    font_desc = ImageFont.load_default()

# Draw title ON THE IMAGE at the top
bbox_title = draw.textbbox((0, 0), title_text, font=font_title)
tw = bbox_title[2] - bbox_title[0]
th = bbox_title[3] - bbox_title[1]
tx = (bg.width - tw) / 2
ty = frame_thickness + 30 # 30px padding from the top frame

shadow_color = "black"
for dx, dy in [(-2,-2), (2,-2), (-2,2), (2,2), (0,3)]:
    draw.text((tx+dx, ty+dy), title_text, font=font_title, fill=shadow_color)
draw.text((tx, ty), title_text, font=font_title, fill="white")

# Draw description ON THE IMAGE at the bottom
bbox_desc = draw.textbbox((0, 0), desc_text, font=font_desc)
dw = bbox_desc[2] - bbox_desc[0]
dh = bbox_desc[3] - bbox_desc[1]
dx = (bg.width - dw) / 2
ty_bot = bg.height - frame_thickness - dh - 30 # 30px padding from the bottom frame

for ox, oy in [(-1,-1), (1,-1), (-1,1), (1,1), (0,2)]:
    draw.text((dx+ox, ty_bot+oy), desc_text, font=font_desc, fill=shadow_color)
draw.text((dx, ty_bot), desc_text, font=font_desc, fill="white")

out_path = "public/cards/mlb-analytics-v5.jpg"
bg.save(out_path, quality=98)
print(f"Saved PERFECT image to {out_path} with size {bg.size}")
