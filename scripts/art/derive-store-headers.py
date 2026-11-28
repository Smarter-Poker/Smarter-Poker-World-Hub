#!/usr/bin/env python3
"""Derive the #SMARTERDESIGN Diamond Store image-header art.

Every seal (352px square, shown in a circular chrome frame) and scene
(<=420px tall, masked into the right of the header) is cropped from the
store's own existing renders in public/images/store-v3, so no new art
generation is needed. Re-run after changing a crop:

    python3 scripts/art/derive-store-headers.py <repo-root>
"""
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
SRC = ROOT / 'public/images/store-v3'
OUT = ROOT / 'public/images/smarterdesign/headers'

# name: (seal source, seal box as fractions l,t,r,b), (scene source, scene box)
# Seal boxes are made square in pixels around their centre.
ART = {
    'store-diamonds': (('diamond-vault-hero', (0.53, 0.06, 0.87, 0.52)),
                       ('diamond-vault-hero', (0.22, 0.0, 1.0, 1.0))),
    'store-merch': (('merch-hero', (0.45, 0.14, 0.80, 0.86)),
                    ('merch-hero', (0.15, 0.0, 1.0, 1.0))),
    'store-rewards': (('rewards-hero', (0.56, 0.02, 0.90, 0.78)),
                      ('rewards-hero', (0.30, 0.0, 1.0, 1.0))),
    'store-club-shop': (('club-shop-product-atlas-v2', (0.262, 0.015, 0.488, 0.27)),
                        ('club-shop-hero', (0.0, 0.0, 1.0, 1.0))),
    'store-cart': (('commerce-operations-atlas', (0.045, 0.12, 0.33, 0.86)),
                   ('commerce-operations-atlas', (0.0, 0.0, 0.333, 1.0))),
    'store-orders': (('commerce-operations-atlas', (0.43, 0.38, 0.57, 0.80)),
                     ('commerce-operations-atlas', (0.334, 0.0, 0.666, 1.0))),
    'store-order-detail': (('marketplace-lower-suites-atlas', (0.385, 0.56, 0.49, 0.83)),
                           ('marketplace-lower-suites-atlas', (0.251, 0.0, 0.499, 1.0))),
    'store-wishlist': (('commerce-operations-atlas', (0.785, 0.30, 0.875, 0.62)),
                       ('commerce-operations-atlas', (0.667, 0.0, 1.0, 1.0))),
}

# Seals whose subject is dark at seal size get a brightness lift.
LIFT = {'store-cart': 1.35, 'store-orders': 1.1}


def box(img, frac, square):
    w, h = img.size
    l, t, r, b = frac[0] * w, frac[1] * h, frac[2] * w, frac[3] * h
    if square:
        cx, cy, side = (l + r) / 2, (t + b) / 2, max(r - l, b - t)
        side = min(side, w, h)
        l = min(max(cx - side / 2, 0), w - side)
        t = min(max(cy - side / 2, 0), h - side)
        r, b = l + side, t + side
    return img.crop((round(l), round(t), round(r), round(b)))


def load(name):
    return Image.open(SRC / f'{name}.webp').convert('RGB')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, ((seal_src, seal_box), (scene_src, scene_box)) in ART.items():
        seal = box(load(seal_src), seal_box, True).resize((352, 352), Image.LANCZOS)
        seal = ImageEnhance.Contrast(seal).enhance(1.06)
        if name in LIFT:
            seal = ImageEnhance.Brightness(seal).enhance(LIFT[name])
        seal.save(OUT / f'{name}-seal.webp', 'WEBP', quality=86, method=6)
        scene = box(load(scene_src), scene_box, False)
        if scene.height > 420:
            scene = scene.resize((round(scene.width * 420 / scene.height), 420), Image.LANCZOS)
        scene.save(OUT / f'{name}-scene.webp', 'WEBP', quality=82, method=6)
        print(name, seal.size, scene.size)


if __name__ == '__main__':
    main()
