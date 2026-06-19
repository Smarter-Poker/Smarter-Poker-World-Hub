import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

gen_path = "/Users/smarter.poker/.gemini/antigravity/brain/1f577cdc-49dd-4598-a1e9-360b848af138/mlb_analytics_updated_white_1781876096708.png"
gen_img = Image.open(gen_path).convert("RGB")

# Extract a very clean, uniform patch of metal from the middle of the left frame
# x=200 to 220, y=500 to 520
patch = gen_img.crop((200, 500, 220, 520))

# To make it perfectly uniform and tileable without seams, we can just take a 1-pixel wide slice and stretch it horizontally,
# and a 1-pixel tall slice and stretch it vertically?
# No, let's just create a solid uniform grey color, and add some noise, then motion blur it to create our OWN flawless brushed nickel!
import random

bg = Image.new('RGB', (695, 1024), color=(160, 160, 155)) # Base nickel color
# Create noise
noise = Image.new('RGB', (695, 1024))
pixels = noise.load()
for i in range(bg.size[0]):
    for j in range(bg.size[1]):
        val = random.randint(-20, 20)
        pixels[i, j] = (160+val, 160+val, 155+val)

# Blend noise into background
bg = Image.blend(bg, noise, alpha=0.5)

# Apply a strong vertical motion blur to create a brushed effect
# PIL doesn't have a built-in MotionBlur, but we can fake it by resizing a noisy image
# Let's create a noisy image that is 695x10, and stretch it vertically to 1024!
noise_strip = Image.new('RGB', (695, 10))
strip_pixels = noise_strip.load()
for i in range(695):
    for j in range(10):
        val = random.randint(-15, 15)
        strip_pixels[i, j] = (165+val, 165+val, 160+val)

# Stretching vertically creates perfect vertical brushed lines!
brushed_bg = noise_strip.resize((695, 1024), Image.Resampling.LANCZOS)

# 2. Extract ONLY the glowing screen from the original image
screen_original = gen_img.crop((215, 140, 805, 880))

# 3. THIN brushed nickel frame! 15px all the way around!
frame_thickness = 15
screen_w = 695 - (frame_thickness * 2)
screen_h = 1024 - (frame_thickness * 2)
screen_resized = screen_original.resize((screen_w, screen_h), Image.Resampling.LANCZOS)

# 4. Paste the screen onto the metal background
brushed_bg.paste(screen_resized, (frame_thickness, frame_thickness))

# 5. Add the big text ON THE IMAGE
draw = ImageDraw.Draw(brushed_bg)

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
tx = (brushed_bg.width - tw) / 2
ty = frame_thickness + 30 # 30px padding from the top frame

shadow_color = "black"
for dx, dy in [(-2,-2), (2,-2), (-2,2), (2,2), (0,3)]:
    draw.text((tx+dx, ty+dy), title_text, font=font_title, fill=shadow_color)
draw.text((tx, ty), title_text, font=font_title, fill="white")

# Draw description ON THE IMAGE at the bottom
bbox_desc = draw.textbbox((0, 0), desc_text, font=font_desc)
dw = bbox_desc[2] - bbox_desc[0]
dh = bbox_desc[3] - bbox_desc[1]
dx = (brushed_bg.width - dw) / 2
ty_bot = brushed_bg.height - frame_thickness - dh - 30 # 30px padding from the bottom frame

for ox, oy in [(-1,-1), (1,-1), (-1,1), (1,1), (0,2)]:
    draw.text((dx+ox, ty_bot+oy), desc_text, font=font_desc, fill=shadow_color)
draw.text((dx, ty_bot), desc_text, font=font_desc, fill="white")

# Let's add a subtle 1px border around the glowing screen to make the frame pop
draw.rectangle(
    [frame_thickness-1, frame_thickness-1, brushed_bg.width-frame_thickness, brushed_bg.height-frame_thickness],
    outline=(100, 100, 95), width=1
)

out_path = "public/cards/mlb-analytics-v6.jpg"
brushed_bg.save(out_path, quality=98)
print(f"Saved PERFECT uniform image to {out_path} with size {brushed_bg.size}")
