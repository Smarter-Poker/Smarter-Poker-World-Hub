import os
from PIL import Image, ImageDraw, ImageFont

gen_path = "/Users/smarter.poker/.gemini/antigravity/brain/1f577cdc-49dd-4598-a1e9-360b848af138/mlb_analytics_updated_white_1781876096708.png"
gen_img = Image.open(gen_path).convert("RGB")

width, height = gen_img.size
pixels = gen_img.load()

# The background is brown. Let's find the bounding box by looking for the frame (which is silver/grey).
# We can just sample the top-left corner as the background color.
bg_color = pixels[0, 0]

def color_distance(c1, c2):
    return sum((a - b) ** 2 for a, b in zip(c1, c2)) ** 0.5

# Find left
left = 0
for x in range(width):
    if any(color_distance(pixels[x, y], bg_color) > 50 for y in range(height)):
        left = x
        break

# Find right
right = width - 1
for x in range(width - 1, -1, -1):
    if any(color_distance(pixels[x, y], bg_color) > 50 for y in range(height)):
        right = x
        break

# Find top
top = 0
for y in range(height):
    if any(color_distance(pixels[x, y], bg_color) > 50 for x in range(width)):
        top = y
        break

# Find bottom
bottom = height - 1
for y in range(height - 1, -1, -1):
    if any(color_distance(pixels[x, y], bg_color) > 50 for x in range(width)):
        bottom = y
        break

print(f"Detected frame bounds: left={left}, right={right}, top={top}, bottom={bottom}")

# Crop to just the frame
frame_img = gen_img.crop((left, top, right, bottom))

# Resize to exactly 695x1024
final_img = frame_img.resize((695, 1024), Image.Resampling.LANCZOS)

# Draw the text on the card interior
draw = ImageDraw.Draw(final_img)

try:
    font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 46)
    font_desc = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
except:
    font_title = ImageFont.load_default()
    font_desc = ImageFont.load_default()

title_text = "MLB-ANALYTICS"
desc_text = "FIND THE BEST BETS AND EDGE IN EVERY GAME"

# Assuming the brushed nickel frame is thick, we put the text inside
# The frame might be ~100px thick on the resized image.
# We'll place the text around y=80 and y=1024-80
bbox = draw.textbbox((0, 0), title_text, font=font_title)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
tx = (final_img.width - tw) / 2
ty = 90

shadow_color = "black"
for dx, dy in [(-2,-2), (2,-2), (-2,2), (2,2), (0,3)]:
    draw.text((tx+dx, ty+dy), title_text, font=font_title, fill=shadow_color)
draw.text((tx, ty), title_text, font=font_title, fill="white")

bbox2 = draw.textbbox((0, 0), desc_text, font=font_desc)
dw = bbox2[2] - bbox2[0]
dh = bbox2[3] - bbox2[1]
dx = (final_img.width - dw) / 2
dy = final_img.height - dh - 90

for ox, oy in [(-1,-1), (1,-1), (-1,1), (1,1), (0,2)]:
    draw.text((dx+ox, dy+oy), desc_text, font=font_desc, fill=shadow_color)
draw.text((dx, dy), desc_text, font=font_desc, fill="white")

out_path = "public/cards/mlb-analytics.jpg"
final_img.save(out_path, quality=95)
print(f"Saved new image to {out_path}")
