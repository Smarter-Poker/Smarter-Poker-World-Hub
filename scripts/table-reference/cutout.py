#!/usr/bin/env python3
"""Cut the nine training-table portraits out of their backdrops.

The source avatars under public/avatars/{vip,free} are 1024x1024 renders on a
white studio backdrop with a grey vignette. The table needs them as transparent
busts, so this removes the backdrop, crops to the silhouette, normalises the
height and writes two things:

  public/avatars/portrait/<name>.webp   the binaries the table HTML references
  scripts/table-reference/portraits_webp.json
                                        the same images as base64 data URLs, for
                                        build_table.py's default self-contained
                                        mode, plus portraits3/<name>.png (RGBA)
                                        for the measurement scripts

It is fully deterministic from files already in the repo, so the binaries never
have to be transported -- rerun this and you get byte-identical output.

Run from anywhere:  python3 scripts/table-reference/cutout.py
"""
from PIL import Image, ImageFilter
import numpy as np
import os
import json
import base64
import io
import sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
# scripts/table-reference/ -> repo root is two levels up. Overridable so the
# cloud sandbox (where this file does not sit inside the repo) can still run it.
ROOT = os.environ.get('REPO_ROOT') or os.path.abspath(os.path.join(HERE, '..', '..'))

NAMES = ['wolf', 'spartan', 'ninja', 'cowboy', 'viking', 'wizard', 'pirate',
         'pharaoh', 'fox']
SEARCH = ['public/avatars/vip', 'public/avatars/free']
OUT_WEBP = os.path.join(ROOT, 'public/avatars/portrait')
OUT_PNG = os.path.join(HERE, 'portraits3')
OUT_JSON = os.path.join(HERE, 'portraits_webp.json')

TARGET_H = 340       # every cut-out is normalised to this height before export
WEBP_QUALITY = 86
WEBP_METHOD = 6

SRC = {}
for n in NAMES:
    for d in SEARCH:
        p = os.path.join(ROOT, d, f'{n}.png')
        if os.path.exists(p):
            SRC[n] = p
            break
missing = [n for n in NAMES if n not in SRC]
if missing:
    sys.exit(f'missing source avatars under {ROOT}: {", ".join(missing)}')


def cut(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    L = a.max(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    # "background-like": bright and near-neutral. Tuned against the four failures
    # (wolf/spartan/ninja/cowboy) whose backdrops are white with a grey vignette.
    bg = (L > 198) & (sat < 34)

    # Flood fill inward from the border only. A plain threshold would also delete
    # white teeth, white fur and eye highlights; those are enclosed by the subject
    # and so are never reached from the edge.
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and bg[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))

    alpha = np.where(seen, 0, 255).astype(np.uint8)
    A = Image.fromarray(alpha)
    # erode 1px then soften, so no white halo survives on the edge
    A = A.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.9))
    out = im.convert('RGBA')
    out.putalpha(A)

    m = np.asarray(A) > 24
    rows = np.where(m.sum(axis=1) > 2)[0]
    cols = np.where(m.sum(axis=0) > 2)[0]
    out = out.crop((cols[0], rows[0], cols[-1] + 1, rows[-1] + 1))
    ow, oh = out.size
    return out.resize((max(1, round(ow * TARGET_H / oh)), TARGET_H), Image.LANCZOS)


os.makedirs(OUT_WEBP, exist_ok=True)
os.makedirs(OUT_PNG, exist_ok=True)

webp = {}
for n in NAMES:
    im = cut(SRC[n])
    im.save(os.path.join(OUT_PNG, f'{n}.png'))
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=WEBP_QUALITY, method=WEBP_METHOD)
    raw = buf.getvalue()
    with open(os.path.join(OUT_WEBP, f'{n}.webp'), 'wb') as f:
        f.write(raw)
    webp[n] = 'data:image/webp;base64,' + base64.b64encode(raw).decode()
    # corner alpha is the sanity check: a clean cut leaves all four corners empty.
    a = np.asarray(im)[..., 3]
    c = np.concatenate([a[:12, :12].ravel(), a[:12, -12:].ravel(),
                        a[-12:, :12].ravel(), a[-12:, -12:].ravel()])
    print(f'{n:9s} {im.size[0]:3d}x{im.size[1]}  corner_alpha_mean={c.mean():6.2f}'
          f'  webp={len(raw)} bytes')

with open(OUT_JSON, 'w') as f:
    json.dump(webp, f)
print(f'\nwrote {len(NAMES)} webp -> {OUT_WEBP}')
print(f'wrote {os.path.getsize(OUT_JSON) // 1024} KB -> {OUT_JSON}')
