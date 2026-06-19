import os
from PIL import Image, ImageDraw, ImageFont

gen_path = "/Users/smarter.poker/.gemini/antigravity/brain/1f577cdc-49dd-4598-a1e9-360b848af138/mlb_analytics_updated_white_1781876096708.png"
gen_img = Image.open(gen_path).convert("RGB")

# Crop only the background above and below the frame. 
# The frame itself starts at y=40 and ends at y=984.
# This leaves the full metallic frame intact without chopping it off.
box = (164, 40, 859, 984)
cropped = gen_img.crop(box)

# Now image is 695x944
# Let's cleanly cover the etched text using a 10px strip of clean metal from x=40 (which is x=204 in original)
# Top frame text is roughly y=0 to y=60
top_strip = cropped.crop((40, 0, 50, 70))
# Stretch it horizontally to cover the text area (from x=50 to x=645)
top_cover = top_strip.resize((595, 70), Image.Resampling.LANCZOS)
cropped.paste(top_cover, (50, 0))

# Bottom frame text is roughly y=870 to y=944 (which is bottom 74px)
bottom_strip = cropped.crop((40, 870, 50, 944))
bottom_cover = bottom_strip.resize((595, 74), Image.Resampling.LANCZOS)
cropped.paste(bottom_cover, (50, 870))

# Resize to final dimension
final_img = cropped.resize((695, 1024), Image.Resampling.LANCZOS)

# Add our perfectly positioned text INSIDE the card (the glowing screen)
draw = ImageDraw.Draw(final_img)

try:
    font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 46)
    font_desc = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
except:
    font_title = ImageFont.load_default()
    font_desc = ImageFont.load_default()

title_text = "MLB-ANALYTICS"
desc_text = "FIND THE BEST BETS AND EDGE IN EVERY GAME"

# Title position (safely inside the screen)
bbox = draw.textbbox((0, 0), title_text, font=font_title)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
tx = (final_img.width - tw) / 2
ty = 130

shadow_color = "black"
for dx, dy in [(-2,-2), (2,-2), (-2,2), (2,2), (0,3)]:
    draw.text((tx+dx, ty+dy), title_text, font=font_title, fill=shadow_color)
draw.text((tx, ty), title_text, font=font_title, fill="white")

# Description position (safely inside the screen)
bbox2 = draw.textbbox((0, 0), desc_text, font=font_desc)
dw = bbox2[2] - bbox2[0]
dh = bbox2[3] - bbox2[1]
dx = (final_img.width - dw) / 2
dy = final_img.height - dh - 130

for ox, oy in [(-1,-1), (1,-1), (-1,1), (1,1), (0,2)]:
    draw.text((dx+ox, dy+oy), desc_text, font=font_desc, fill=shadow_color)
draw.text((dx, dy), desc_text, font=font_desc, fill="white")

out_path = "public/cards/mlb-analytics.jpg"
final_img.save(out_path, quality=95)
print(f"Saved perfectly restored image to {out_path} with size {final_img.size}")
