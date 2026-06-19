import os
from PIL import Image, ImageDraw, ImageFont

# 1. Load the base frame (video-library.jpg)
base_path = "public/cards/video-library.jpg"
base_img = Image.open(base_path).convert("RGBA")

# 2. Define the inner area of the frame (using 45px border on sides, 45px top/bottom)
frame_border_x = 42
frame_border_y = 42
inner_width = base_img.width - (frame_border_x * 2)
inner_height = base_img.height - (frame_border_y * 2)

# 3. Load the MLB UI (from the generated image)
gen_path = "/Users/smarter.poker/.gemini/antigravity/brain/1f577cdc-49dd-4598-a1e9-360b848af138/mlb_analytics_updated_white_1781876096708.png"
gen_img = Image.open(gen_path).convert("RGBA")

# Crop the inner UI from the generated image
# The generated image is 1024x1024. The UI is safely inside 160 to 864 horizontally, and 120 to 900 vertically.
ui_crop = gen_img.crop((160, 120, 864, 900))

# Resize the UI to fit the exact inner area of the standard frame
ui_resized = ui_crop.resize((inner_width, inner_height), Image.Resampling.LANCZOS)

# 4. Paste the UI onto the base image, perfectly aligning it inside the frame
base_img.paste(ui_resized, (frame_border_x, frame_border_y))

# 5. Add the text "MLB-ANALYTICS" at the top of the CARD
draw = ImageDraw.Draw(base_img)

try:
    font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 46)
    font_desc = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
except:
    font_title = ImageFont.load_default()
    font_desc = ImageFont.load_default()

title_text = "MLB-ANALYTICS"
desc_text = "FIND THE BEST BETS AND EDGE IN EVERY GAME"

# Center title
bbox = draw.textbbox((0, 0), title_text, font=font_title)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
tx = (base_img.width - tw) / 2
ty = frame_border_y + 20 # 20px padding from the top of the inner card

# Draw title shadow/outline for visibility
shadow_color = "black"
for dx, dy in [(-2,-2), (2,-2), (-2,2), (2,2), (0,3)]:
    draw.text((tx+dx, ty+dy), title_text, font=font_title, fill=shadow_color)
draw.text((tx, ty), title_text, font=font_title, fill="white")

# Center description
bbox2 = draw.textbbox((0, 0), desc_text, font=font_desc)
dw = bbox2[2] - bbox2[0]
dh = bbox2[3] - bbox2[1]
dx = (base_img.width - dw) / 2
dy = base_img.height - frame_border_y - dh - 20 # 20px padding from bottom

for ox, oy in [(-1,-1), (1,-1), (-1,1), (1,1), (0,2)]:
    draw.text((dx+ox, dy+oy), desc_text, font=font_desc, fill=shadow_color)
draw.text((dx, dy), desc_text, font=font_desc, fill="white")

# Save as JPEG
out_path = "public/cards/mlb-analytics.jpg"
base_img.convert("RGB").save(out_path, quality=95)
print(f"Saved perfectly composed standard frame image to {out_path} with size {base_img.size}")
