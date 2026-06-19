import os
from PIL import Image, ImageDraw, ImageFont

gen_path = "/Users/smarter.poker/.gemini/antigravity/brain/1f577cdc-49dd-4598-a1e9-360b848af138/mlb_analytics_updated_white_1781876096708.png"
gen_img = Image.open(gen_path).convert("RGB")

# Crop the brown background off the sides (left=164, right=859)
# Crop the brown background off the top/bottom (guess top=40, bottom=984)
box = (164, 40, 859, 984)
cropped = gen_img.crop(box)

# Now image is 695x944
# Let's cover the etched text on the top metal frame
# The top frame is roughly y=0 to y=100
# We'll take a patch from the left side of the top frame: x=10 to x=60
top_patch = cropped.crop((15, 10, 65, 110))
# Paste it repeatedly across the top frame where the text is
for px in range(65, 630, 50):
    cropped.paste(top_patch, (px, 10))

# Cover the etched text on the bottom metal frame
# The bottom frame is roughly y=840 to y=944
# We'll take a patch from the left side of the bottom frame: x=10 to x=60
bottom_patch = cropped.crop((15, 840, 65, 930))
for px in range(65, 630, 50):
    cropped.paste(bottom_patch, (px, 840))

# Now we need to resize this perfectly clean frame to 695x1024
final_img = cropped.resize((695, 1024), Image.Resampling.LANCZOS)

# Draw the white text INSIDE the card (the screen area)
draw = ImageDraw.Draw(final_img)

try:
    font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 46)
    font_desc = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
except:
    font_title = ImageFont.load_default()
    font_desc = ImageFont.load_default()

title_text = "MLB-ANALYTICS"
desc_text = "FIND THE BEST BETS AND EDGE IN EVERY GAME"

# Position the text on the UI screen, safely below the top frame and above the bottom frame.
# If top frame is ~120px thick (after resize), we put text at y=140.
bbox = draw.textbbox((0, 0), title_text, font=font_title)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
tx = (final_img.width - tw) / 2
ty = 135  # Inside the screen

shadow_color = "black"
for dx, dy in [(-2,-2), (2,-2), (-2,2), (2,2), (0,3)]:
    draw.text((tx+dx, ty+dy), title_text, font=font_title, fill=shadow_color)
draw.text((tx, ty), title_text, font=font_title, fill="white")

bbox2 = draw.textbbox((0, 0), desc_text, font=font_desc)
dw = bbox2[2] - bbox2[0]
dh = bbox2[3] - bbox2[1]
dx = (final_img.width - dw) / 2
# Bottom frame is ~120px thick. Text at y = 1024 - 120 - dh - 20
dy = final_img.height - dh - 150  # Inside the screen

for ox, oy in [(-1,-1), (1,-1), (-1,1), (1,1), (0,2)]:
    draw.text((dx+ox, dy+oy), desc_text, font=font_desc, fill=shadow_color)
draw.text((dx, dy), desc_text, font=font_desc, fill="white")

out_path = "public/cards/mlb-analytics.jpg"
final_img.save(out_path, quality=95)
print(f"Saved cleaned image to {out_path} with size {final_img.size}")
