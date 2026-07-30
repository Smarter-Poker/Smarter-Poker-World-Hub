"""Measure name-plate boxes and ring widths in template vs build, from gold pixels.

Gold test is deliberately loose (warm hue, decent saturation, mid-to-high value)
because the plate border, the ring strokes and the ring glow are all the same
family of gold and we only ever measure inside a window that contains one of them.
"""
import numpy as np
from PIL import Image

from refpaths import load_pair

T, B = load_pair()


def gold(img):
    a = np.asarray(img).astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (r > 120) & (g > 85) & (b < g - 25) & (r >= g)


gt, gb = gold(T), gold(B)


def bbox(m, x0, y0, x1, y1):
    sub = m[y0:y1, x0:x1]
    ys, xs = np.nonzero(sub)
    if len(xs) == 0:
        return None
    return (x0 + xs.min(), y0 + ys.min(), x0 + xs.max(), y0 + ys.max())


PLATES = {
    # window generous enough to hold the whole plate but to exclude ring strokes
    'v4 wolf':    (270, 272, 372, 332),
    'v5 spartan': (515, 272, 617, 332),
    'v2 wizard':  (156, 687, 258, 747),
    'hero':       (392, 1022, 492, 1084),
}
print('PLATE BOXES  (x0,y0,x1,y1  ->  w x h)')
for name, w in PLATES.items():
    for tag, m in (('tpl', gt), ('bld', gb)):
        bb = bbox(m, *w)
        if bb is None:
            print(f'  {name:11s} {tag}  none')
            continue
        print(f'  {name:11s} {tag}  {bb}  {bb[2]-bb[0]+1:3d} x {bb[3]-bb[1]+1:3d}'
              f'   centre ({(bb[0]+bb[2])/2:.1f}, {(bb[1]+bb[3])/2:.1f})')
    print()


def runs(m, y, x0=0, x1=873):
    """Contiguous gold runs along scanline y -> list of (start, end) inclusive."""
    row = m[y, x0:x1]
    out = []
    i = 0
    while i < len(row):
        if row[i]:
            j = i
            while j + 1 < len(row) and row[j + 1]:
                j += 1
            out.append((x0 + i, x0 + j))
            i = j + 1
        else:
            i += 1
    return out


print('RING / FELT SCANLINES  (gold runs across the full width)')
for y in (560, 600, 656, 700):
    print(f'  y={y}')
    print(f'    tpl {runs(gt, y)}')
    print(f'    bld {runs(gb, y)}')
