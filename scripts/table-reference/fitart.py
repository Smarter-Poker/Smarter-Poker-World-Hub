"""Fit each portrait cut-out to the template by masked normalized cross-correlation.

The cut-out's own alpha channel is the mask, so only pixels that are actually the
character are compared -- rail, rings and plate cannot pull the fit.

v2 fix: the v1 coarse pass centred its search on `plate_bottom + 21 - h`, i.e. on
the assumption that the art hangs 21px below the plate. That assumption is what
we are trying to measure, and it is wrong by ~55px, so the true peak sat outside
the +/-30px window and the fitter returned noise (corr 0.17-0.43, mutually
inconsistent heights). Now the search region is absolute and generous.

Output is expressed directly as the CSS variables the build exposes:
  ph : rendered height in template px          -> --ph
  ax : art centre x  -  plate centre x         -> --ax
  po : art bottom    -  plate bottom edge      -> --po  (negative = art stops above)
"""
import os

import numpy as np
from PIL import Image

from refpaths import TEMPLATE, PORTRAITS

TPL = Image.open(TEMPLATE).convert('L')
t = np.asarray(TPL).astype(np.float32)
TH, TW = t.shape

# (label, art, plate centre x, plate centre y STAGE, current --ph)
SEATS = [
    ('v4 wolf',    'wolf',    317, 149, 126),
    ('v5 spartan', 'spartan', 562, 149, 131),
    ('v3 ninja',   'ninja',   203, 345, 127),
    ('v6 pharaoh', 'pharaoh', 677, 345, 122),
    ('v2 wizard',  'wizard',  203, 564, 132),
    ('v7 pirate',  'pirate',  677, 564, 125),
    ('v1 viking',  'viking',  223, 794, 130),
    ('v8 cowboy',  'cowboy',  658, 790, 133),
    ('hero fox',   'fox',     440, 903, 102),
]
PLATE_HALF_H = 21
Y_OFFSET = 152  # stage y -> full-image y

_cache = {}


def prep(art, h):
    key = (art, h)
    if key not in _cache:
        im = Image.open(os.path.join(PORTRAITS, f'{art}.png')).convert('RGBA')
        w = max(1, round(im.width * h / im.height))
        im = im.resize((w, h), Image.LANCZOS)
        a = np.asarray(im).astype(np.float32)
        lum = a[:, :, :3].mean(axis=2)
        mask = a[:, :, 3] > 200
        v = lum[mask]
        v = v - v.mean()
        _cache[key] = (lum.shape, mask, v, float(np.sqrt((v * v).sum())))
    return _cache[key]


def scan(art, h, xs, ys):
    (hh, ww), mask, v, vn = prep(art, h)
    if mask.sum() < 300 or vn == 0:
        return (-2.0, 0, 0)
    best = (-2.0, 0, 0)
    for oy in ys:
        if oy < 0 or oy + hh > TH:
            continue
        for ox in xs:
            if ox < 0 or ox + ww > TW:
                continue
            p = t[oy:oy + hh, ox:ox + ww][mask]
            p = p - p.mean()
            pn = np.sqrt((p * p).sum())
            if pn == 0:
                continue
            c = float((v * p).sum() / (vn * pn))
            if c > best[0]:
                best = (c, ox, oy)
    return best


print(f'{"seat":12s} {"ph":>4s} {"ax":>4s} {"po":>4s} {"corr":>6s}  {"was ph":>6s}')
rows = []
for label, art, pcx, pcy, cur_ph in SEATS:
    plate_bottom = pcy + Y_OFFSET + PLATE_HALF_H

    best = (-2.0, 0, 0, 0)
    for h in range(80, 231, 5):
        (hh, ww), *_ = prep(art, h)
        xs = range(pcx - ww // 2 - 90, pcx - ww // 2 + 91, 3)
        ys = range(plate_bottom - 100 - h, plate_bottom + 55 - h, 3)
        c, ox, oy = scan(art, h, xs, ys)
        if c > best[0]:
            best = (c, ox, oy, h)

    c0, ox0, oy0, h0 = best
    for h in range(max(40, h0 - 4), h0 + 5):
        (hh, ww), *_ = prep(art, h)
        (_, w0), *_2 = prep(art, h0)[0], None
        w0 = prep(art, h0)[0][1]
        cx_anchor = ox0 + w0 / 2
        exl = int(cx_anchor - ww / 2)
        c, ox, oy = scan(art, h, range(exl - 4, exl + 5), range(oy0 - 4, oy0 + 5))
        if c > best[0]:
            best = (c, ox, oy, h)

    c, ox, oy, h = best
    ww = prep(art, h)[0][1]
    ax = round(ox + ww / 2 - pcx)
    po = round(oy + h - plate_bottom)
    rows.append((label, art, h, ax, po, c))
    flag = '  LOW-CONF' if c < 0.55 else ''
    print(f'{label:12s} {h:4d} {ax:4d} {po:4d} {c:6.3f}  {cur_ph:6d}{flag}')

print('\npaste-ready:')
for label, art, h, ax, po, c in rows:
    print(f"    {art:8s} ph={h:3d}, po={po:4d}, ax={ax:4d}   # corr {c:.3f}")
