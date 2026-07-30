"""Side-by-side 2x crops of each seat: template | build | red/cyan overlay."""
import os

from PIL import Image

from refpaths import load_pair, OUT

T, B = load_pair()

SEATS = {
    'v4 wolf':    (245, 145, 395, 340),
    'v5 spartan': (490, 145, 640, 340),
    'v3 ninja':   (135, 330, 285, 500),
    'v6 pharaoh': (600, 330, 750, 500),
    'v2 wizard':  (135, 545, 285, 715),
    'v7 pirate':  (600, 545, 750, 715),
    'v1 viking':  (155, 770, 305, 945),
    'v8 cowboy':  (585, 765, 735, 940),
    'hero fox':   (385, 920, 500, 1090),
}

Z = 2
PAD = 8
cells = []
for name, box in SEATS.items():
    ct = T.crop(box)
    cb = B.crop(box)
    # red/cyan: template luminance -> R, build luminance -> G+B
    lt = ct.convert('L')
    lb = cb.convert('L')
    ov = Image.merge('RGB', (lt, lb, lb))
    w, h = ct.size
    row = Image.new('RGB', (w * 3 + PAD * 2, h), (20, 20, 20))
    row.paste(ct, (0, 0))
    row.paste(cb, (w + PAD, 0))
    row.paste(ov, (w * 2 + PAD * 2, 0))
    cells.append((name, row))

CW = max(r.size[0] for _, r in cells)
CH = sum(r.size[1] for _, r in cells) + PAD * len(cells)
sheet = Image.new('RGB', (CW, CH), (20, 20, 20))
y = 0
for name, r in cells:
    sheet.paste(r, (0, y))
    y += r.size[1] + PAD
sheet = sheet.resize((sheet.size[0] * Z, sheet.size[1] * Z), Image.NEAREST)
os.makedirs(OUT, exist_ok=True)
sheet.save(os.path.join(OUT, 'seatzoom.png'))
print('order (top->bottom):', ', '.join(n for n, _ in cells))
print('columns: TEMPLATE | BUILD | OVERLAY(red=template-only, cyan=build-only)')
print('saved', sheet.size)
