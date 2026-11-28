#!/usr/bin/env python3
"""Build the #SMARTERDESIGN Diamond Store image-header art.

Masters are painted renders (grok-imagine-image, 2026-11-27; prompts in
scripts/art/store-header-prompts.json), one `<name>-seal.jpg` (square) and one
`<name>-scene.jpg` (16:9, subject on the right) per store destination. This
script cuts every runtime asset from them:

  <name>-seal.webp         352px square, shown in the circular chrome frame
  <name>-scene.webp        desktop scene, 420px tall, masked into the header
  <name>-scene-phone.webp  phone scene: a 2:1 frame around the subject,
                           480x240, subject placed right of the title

    python3 scripts/art/derive-store-headers.py <repo-root> .agent/art/store-headers
"""
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
MASTERS = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT / '.agent/art/store-headers'
OUT = ROOT / 'public/images/smarterdesign/headers'

NAMES = ['store-diamonds', 'store-merch', 'store-rewards', 'store-club-shop',
         'store-cart', 'store-orders', 'store-order-detail', 'store-wishlist']

# Seal crop: the centred subject fills ~70% of each master, so keep the
# central 82% to frame it inside the chrome ring.
SEAL_KEEP = 0.82
# Seals whose subject is small in the master get a tighter, re-centred crop:
# name -> (centre x, centre y, kept side as a fraction of the master).
SEAL_FOCUS = {
    'store-diamonds': (0.47, 0.42, 0.28),
}
# Seals whose master puts a bright pedestal under the subject: fade the lower
# part into the header navy (#0b1c2c) so the ring frames the subject alone.
# name -> (fade start as a fraction of height, strength at the bottom 0..1).
SEAL_FLOOR_FADE = {
    'store-diamonds': (0.5, 0.95),
}

# Where each scene's subject sits in its 16:9 master (fractions of width,
# height). The phone frame is cut around it; the desktop focal rules in
# StoreImageHeader.module.css use the same centres.
SUBJECT = {
    'store-diamonds': (0.72, 0.47),
    'store-merch': (0.75, 0.45),
    'store-rewards': (0.72, 0.50),
    'store-club-shop': (0.72, 0.45),
    'store-cart': (0.69, 0.55),
    'store-orders': (0.70, 0.55),
    'store-order-detail': (0.77, 0.45),
    'store-wishlist': (0.76, 0.64),
}
# Phone frame: 2:1, 55% of the master's width, subject at 74% across so it
# clears the title on the left of a 393px header.
PHONE_WIDTH = 0.55
PHONE_SUBJECT_X = 0.74


def seal(img, name):
    w, h = img.size
    cx, cy, keep = SEAL_FOCUS.get(name, (0.5, 0.5, SEAL_KEEP))
    side = min(w, h) * keep
    l = min(max(cx * w - side / 2, 0), w - side)
    t = min(max(cy * h - side / 2, 0), h - side)
    out = img.crop((round(l), round(t), round(l + side), round(t + side)))
    out = out.resize((352, 352), Image.LANCZOS)
    if name in SEAL_FLOOR_FADE:
        start, strength = SEAL_FLOOR_FADE[name]
        navy = Image.new('RGB', out.size, (11, 28, 44))
        mask = Image.new('L', out.size, 0)
        top = round(out.height * start)
        for y in range(top, out.height):
            a = (y - top) / max(1, out.height - 1 - top)
            mask.paste(round(255 * strength * min(1, a * 1.6)), (0, y, out.width, y + 1))
        out = Image.composite(navy, out, mask)
    return ImageEnhance.Contrast(out).enhance(1.04)


def scene(img):
    w, h = img.size
    return img.resize((round(w * 420 / h), 420), Image.LANCZOS)


def phone_scene(img, name):
    w, h = img.size
    sx, sy = SUBJECT[name]
    fw, fh = w * PHONE_WIDTH, w * PHONE_WIDTH / 2
    l = min(max(sx * w - PHONE_SUBJECT_X * fw, 0), w - fw)
    t = min(max(sy * h - fh / 2, 0), h - fh)
    out = img.crop((round(l), round(t), round(l + fw), round(t + fh)))
    return out.resize((480, 240), Image.LANCZOS)


def main():
    if not MASTERS:
        sys.exit('usage: derive-store-headers.py <repo-root> <masters-dir>')
    OUT.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        s = Image.open(MASTERS / f'{name}-seal.jpg').convert('RGB')
        c = Image.open(MASTERS / f'{name}-scene.jpg').convert('RGB')
        seal(s, name).save(OUT / f'{name}-seal.webp', 'WEBP', quality=86, method=6)
        scene(c).save(OUT / f'{name}-scene.webp', 'WEBP', quality=80, method=6)
        phone_scene(c, name).save(OUT / f'{name}-scene-phone.webp', 'WEBP', quality=78, method=6)
        print(name)


if __name__ == '__main__':
    main()
