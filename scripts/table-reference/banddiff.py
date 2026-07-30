#!/usr/bin/env python3
"""The scorecard: mean absolute luminance difference, overall and per band.

This is the single number the whole loop optimises. Bands are 153px tall (an
eighth of the frame) because that is fine enough to say WHERE the build is
wrong -- the header, the ring flanks, the hero, the action bar -- and coarse
enough that one bad glyph does not swamp the reading.

Also writes a red/cyan overlay: template luminance into R, build luminance into
G+B, so red is template-only ink, cyan is build-only ink, and anything grey or
white is aligned. Misalignment reads as a red/cyan fringe whose thickness is
the error in pixels.

  python3 scripts/table-reference/banddiff.py
"""
import numpy as np
from PIL import Image

from refpaths import load_pair, OUT
import os

T, B = load_pair()
t = np.asarray(T.convert('L')).astype(np.float32)
b = np.asarray(B.convert('L')).astype(np.float32)
d = np.abs(t - b)

H, W = t.shape
BAND = H // 8

print(f'overall mean |diff| = {d.mean():.3f} / 255')
print()
print(f'{"rows":>12s} {"mean":>6s}')
worst = (0, -1)
for y in range(0, H, BAND):
    m = float(d[y:y + BAND].mean())
    print(f'{y:5d}-{min(y + BAND, H) - 1:<6d} {m:6.1f}')
    if m > worst[1]:
        worst = (y, m)
print(f'\nworst band: rows {worst[0]}-{worst[0] + BAND - 1} at {worst[1]:.1f}')

os.makedirs(OUT, exist_ok=True)
ov = Image.merge('RGB', (T.convert('L'), B.convert('L'), B.convert('L')))
path = os.path.join(OUT, 'overlay.png')
ov.save(path)
print(f'\nwrote {path}  (red = template only, cyan = build only, grey = aligned)')
