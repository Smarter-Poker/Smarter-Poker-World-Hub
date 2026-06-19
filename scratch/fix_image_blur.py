import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

gen_path = "/Users/smarter.poker/.gemini/antigravity/brain/1f577cdc-49dd-4598-a1e9-360b848af138/mlb_analytics_updated_white_1781876096708.png"
gen_img = Image.open(gen_path).convert("RGB")

# Crop off the side background AND the top/bottom background entirely
# Original image is 1024x1024
# The brushed frame is from x=164 to x=859.
# The rounded corners at the top have background until y=80. 
# We'll crop y=80 to y=944.
box = (164, 80, 859, 944)
cropped = gen_img.crop(box)

# Now image is 695x864
# We need to erase the AI text from the top frame (y=0 to y=80)
# and the bottom frame (y=764 to y=864)

# Let's use a very strong Gaussian Blur on just the text area to smooth it into a uniform metallic color.
# Text at top is roughly x=100 to x=600, y=0 to y=80.
top_text_box = (100, 0, 600, 80)
top_text_region = cropped.crop(top_text_box)
# Blur heavily to eliminate the text
top_text_region = top_text_region.filter(ImageFilter.GaussianBlur(radius=15))
cropped.paste(top_text_region, (100, 0))

# Text at bottom is roughly x=50 to x=650, y=764 to y=864.
bottom_text_box = (50, 764, 650, 864)
bottom_text_region = cropped.crop(bottom_text_box)
bottom_text_region = bottom_text_region.filter(ImageFilter.GaussianBlur(radius=15))
cropped.paste(bottom_text_region, (50, 764))

# Now resize to the final card size
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

# Title position
bbox = draw.textbbox((0, 0), title_text, font=font_title)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
tx = (final_img.width - tw) / 2
ty = 130  # Safely inside the screen

shadow_color = "black"
for dx, dy in [(-2,-2), (2,-2), (-2,2), (2,2), (0,3)]:
    draw.text((tx+dx, ty+dy), title_text, font=font_title, fill=shadow_color)
draw.text((tx, ty), title_text, font=font_title, fill="white")

# Description position
bbox2 = draw.textbbox((0, 0), desc_text, font=font_desc)
dw = bbox2[2] - bbox2[0]
dh = bbox2[3] - bbox2[1]
dx = (final_img.width - dw) / 2
dy = final_img.height - dh - 130  # Safely inside the screen

for ox, oy in [(-1,-1), (1,-1), (-1,1), (1,1), (0,2)]:
    draw.text((dx+ox, dy+oy), desc_text, font=font_desc, fill=shadow_color)
draw.text((dx, dy), desc_text, font=font_desc, fill="white")

out_path = "public/cards/mlb-analytics.jpg"
final_img.save(out_path, quality=95)
print(f"Saved cleaned image to {out_path} with size {final_img.size}")
