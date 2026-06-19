import os
from PIL import Image, ImageDraw, ImageFont

gen_path = "/Users/smarter.poker/.gemini/antigravity/brain/1f577cdc-49dd-4598-a1e9-360b848af138/mlb_analytics_updated_white_1781876096708.png"
gen_img = Image.open(gen_path).convert("RGB")

# 1. Create a flawless brushed nickel background (695x1024)
# We take a vertical slice of clean metal from the original image (x=200, width=10px, y=300 to 700)
metal_slice = gen_img.crop((200, 300, 210, 700))
# Stretch it to final size. The vertical grain stretches nicely horizontally.
bg = metal_slice.resize((695, 1024), Image.Resampling.LANCZOS)

# 2. Extract ONLY the glowing screen from the original image
# The glowing screen is completely free of text or metal borders from (215, 140) to (805, 880)
screen_original = gen_img.crop((215, 140, 805, 880))

# 3. Decide frame thickness and resize the screen to fit inside
frame_x = 35 # 35px metal border on left and right
frame_y_top = 130 # 130px metal border on top (for big text)
frame_y_bot = 110 # 110px metal border on bottom (for big text)

screen_w = 695 - (frame_x * 2)
screen_h = 1024 - (frame_y_top + frame_y_bot)
screen_resized = screen_original.resize((screen_w, screen_h), Image.Resampling.LANCZOS)

# 4. Paste the screen onto the metal background
bg.paste(screen_resized, (frame_x, frame_y_top))

# 5. Add the big text to the top and bottom metal frames
draw = ImageDraw.Draw(bg)

# "TAKE UP THE ENTIRE FRAME LEFT TO RIGHT"
title_text = "MLB-ANALYTICS"
desc_text = "FIND THE BEST BETS AND EDGE IN EVERY GAME"

try:
    font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 74)
    # We'll use a slightly compressed font if available, or just a large bold font
    font_desc = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 26)
except:
    font_title = ImageFont.load_default()
    font_desc = ImageFont.load_default()

# Draw title centered in the top frame
bbox_title = draw.textbbox((0, 0), title_text, font=font_title)
tw = bbox_title[2] - bbox_title[0]
th = bbox_title[3] - bbox_title[1]
tx = (bg.width - tw) / 2
# Center vertically within the top frame (y=0 to y=130)
ty = (frame_y_top - th) / 2 - 10 # -10 for optical centering 

shadow_color = "black"
for dx, dy in [(-2,-2), (2,-2), (-2,2), (2,2), (0,3)]:
    draw.text((tx+dx, ty+dy), title_text, font=font_title, fill=shadow_color)
draw.text((tx, ty), title_text, font=font_title, fill="white")

# Draw description centered in the bottom frame
bbox_desc = draw.textbbox((0, 0), desc_text, font=font_desc)
dw = bbox_desc[2] - bbox_desc[0]
dh = bbox_desc[3] - bbox_desc[1]
dx = (bg.width - dw) / 2
# Center vertically within the bottom frame (y=1024-110 to 1024)
ty_bot = 1024 - frame_y_bot + (frame_y_bot - dh) / 2 - 5

for ox, oy in [(-1,-1), (1,-1), (-1,1), (1,1), (0,2)]:
    draw.text((dx+ox, ty_bot+oy), desc_text, font=font_desc, fill=shadow_color)
draw.text((dx, ty_bot), desc_text, font=font_desc, fill="white")

out_path = "public/cards/mlb-analytics-v4.jpg"
bg.save(out_path, quality=98)
print(f"Saved perfectly framed image to {out_path} with size {bg.size}")
