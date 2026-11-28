#!/usr/bin/env python3
"""BEFORE | AFTER side-by-side sheet on black.

Usage: python3 pair.py <before_dir> <after_dir> <out_dir> <name> <tag> [max_height]

Reads <before_dir>/<tag>-<name>.png and <after_dir>/<tag>-<name>.png (as
written by shoot.mjs / states.mjs), scales both to the tag's CSS width
(phone=393, desk=1280, w<N>=N), crops to max_height (default 2400) and writes
<out_dir>/<tag>-<name>.jpg. Needs Pillow (pip install pillow).
"""
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/Library/Fonts/Arial Bold.ttf',
]


def tag_width(tag):
    if tag == 'phone':
        return 393
    if tag == 'desk':
        return 1280
    m = re.fullmatch(r'w(\d+)', tag)
    if not m:
        sys.exit(f'Unknown tag {tag!r}: use phone, desk or w<width>')
    return int(m.group(1))


def font(size):
    for f in FONTS:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def main(argv):
    if len(argv) < 5:
        sys.exit(__doc__)
    before_dir, after_dir, out_dir, name, tag = argv[:5]
    max_h = int(argv[5]) if len(argv) > 5 else 2400
    w = tag_width(tag)
    shots = []
    for d in (before_dir, after_dir):
        src = os.path.join(d, f'{tag}-{name}.png')
        if not os.path.exists(src):
            sys.exit(f'Missing {src}')
        im = Image.open(src).convert('RGB')
        shots.append(im.resize((w, round(im.height * w / im.width))))
    a, b = shots
    h = min(max(a.height, b.height), max_h)
    sheet = Image.new('RGB', (w * 2 + 60, h + 50), 'black')
    sheet.paste(a.crop((0, 0, w, min(a.height, h))), (20, 44))
    sheet.paste(b.crop((0, 0, w, min(b.height, h))), (w + 40, 44))
    draw = ImageDraw.Draw(sheet)
    f = font(22)
    draw.text((20, 10), 'BEFORE', fill='white', font=f)
    draw.text((w + 40, 10), 'AFTER', fill='white', font=f)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f'{tag}-{name}.jpg')
    sheet.save(out, quality=85)
    print(out)


if __name__ == '__main__':
    main(sys.argv[1:])
