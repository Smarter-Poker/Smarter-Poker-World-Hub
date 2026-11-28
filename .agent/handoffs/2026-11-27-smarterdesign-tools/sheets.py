"""Build before/after pair images and contact sheets.
usage: python3 sheets.py BEFORE_DIR AFTER_DIR OUT_DIR"""
import sys, os, json
from PIL import Image, ImageDraw, ImageFont

before_dir, after_dir, out_dir = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
except Exception:
    font = small = ImageFont.load_default()

W = 393
names = sorted(n[:-4] for n in os.listdir(after_dir) if n.endswith('.png'))
pairs = []
for n in names:
    a = Image.open(os.path.join(after_dir, n + '.png')).convert('RGB')
    a = a.resize((W, int(a.height * W / a.width)))
    bp = None
    for ext in ('.webp', '.png'):
        p = os.path.join(before_dir, n + ext)
        if os.path.exists(p):
            bp = p
            break
    b = Image.open(bp).convert('RGB').resize((W, int(Image.open(bp).height * W / Image.open(bp).width))) if bp else Image.new('RGB', (W, a.height), (20, 20, 20))
    h = max(a.height, b.height)
    tile = Image.new('RGB', (W * 2 + 30, h + 44), (0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.text((10, 10), 'BEFORE', fill=(170, 190, 210), font=font)
    d.text((W + 30, 10), 'AFTER', fill=(134, 218, 255), font=font)
    d.text((140, 14), n, fill=(230, 240, 250), font=small)
    tile.paste(b, (0, 44))
    tile.paste(a, (W + 30, 44))
    tile.save(os.path.join(out_dir, 'pair-' + n + '.webp'), quality=78)
    pairs.append((n, tile))

# contact sheets: 3 pairs per row, top 620px of each pair, 9 pairs per sheet
crop_h = 620
per = 9
for s in range(0, len(pairs), per):
    chunk = pairs[s:s + per]
    tw = W * 2 + 30
    sheet = Image.new('RGB', (tw * 3 + 40, (crop_h + 44 + 20) * ((len(chunk) + 2) // 3)), (0, 0, 0))
    for i, (n, t) in enumerate(chunk):
        x = (i % 3) * (tw + 20)
        y = (i // 3) * (crop_h + 64)
        sheet.paste(t.crop((0, 0, tw, min(t.height, crop_h + 44))), (x, y))
    sheet.save(os.path.join(out_dir, f'sheet-{s // per + 1:02d}.webp'), quality=72)
print(len(pairs), 'pairs')
