#!/usr/bin/env python3
"""Build the #SMARTERDESIGN Diamond Store image-header art.

Masters are painted renders (grok-imagine-image, 2026-11-27; prompts in
scripts/art/store-header-prompts.json), one `<name>-seal.jpg` (square) and one
`<name>-scene.jpg` (16:9, subject on the right) per store destination. This
script cuts every runtime asset from them:

  <name>-seal.webp         352px square, shown in the circular chrome frame
  <name>-scene.webp        desktop scene, 420px tall, masked into the header
  <name>-scene-phone.webp  phone scene: the right-hand subject, 400px wide

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
# Phone scene: the subject sits in the right half of each scene master.
PHONE_FROM = 0.42


def seal(img):
    w, h = img.size
    side = min(w, h) * SEAL_KEEP
    l, t = (w - side) / 2, (h - side) / 2
    out = img.crop((round(l), round(t), round(l + side), round(t + side)))
    out = out.resize((352, 352), Image.LANCZOS)
    return ImageEnhance.Contrast(out).enhance(1.04)


def scene(img):
    w, h = img.size
    return img.resize((round(w * 420 / h), 420), Image.LANCZOS)


def phone_scene(img):
    w, h = img.size
    out = img.crop((round(w * PHONE_FROM), 0, w, h))
    return out.resize((400, round(out.height * 400 / out.width)), Image.LANCZOS)


def main():
    if not MASTERS:
        sys.exit('usage: derive-store-headers.py <repo-root> <masters-dir>')
    OUT.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        s = Image.open(MASTERS / f'{name}-seal.jpg').convert('RGB')
        c = Image.open(MASTERS / f'{name}-scene.jpg').convert('RGB')
        seal(s).save(OUT / f'{name}-seal.webp', 'WEBP', quality=86, method=6)
        scene(c).save(OUT / f'{name}-scene.webp', 'WEBP', quality=80, method=6)
        phone_scene(c).save(OUT / f'{name}-scene-phone.webp', 'WEBP', quality=78, method=6)
        print(name)


if __name__ == '__main__':
    main()
