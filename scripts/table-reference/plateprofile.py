"""Compare plate edges between template and build by profile shape.

Why not measure2.py: its hero window is (392,1022)-(492,1084) -- exactly the box
it is meant to be measuring. The plate glow and the felt behind it are both gold,
so the mask fills the window and the reported bbox comes back as the window
itself, for template and build alike. Two numbers agreeing because both are the
search bounds is not evidence of anything.

Here the window is at least 30px clear of the plate on every side, the gold-pixel
count profile is built along each axis, and an edge is called where the profile
crosses a fixed fraction of its own peak. Same rule for both images, and the
answer is nowhere near the window bounds, so agreement is real.

Two edges are deliberately not measured:

  * the plate TOP, because the seat portrait sits directly above the plate in the
    same columns and warm-toned art (fox fur, spartan bronze) passes any gold
    test. Hue cannot separate them and it does not need to -- bottom edge plus
    height fixes the top.
  * the wizard plate, because the mid ring crosses x 232..248 at that height and
    the plate spans 162..242. They overlap in both axes; no window isolates one.

Exit code 0 when every measured edge agrees within TOL px.
"""
import numpy as np

from refpaths import load_pair

FRAC = 0.45  # edge = first/last index at or above this share of the profile peak
TOL = 3      # px of build-vs-template disagreement allowed per edge

PLATES = {
    'hero':       (340, 985, 545, 1120),
    'v4 wolf':    (240, 250, 400, 355),
    'v5 spartan': (485, 250, 645, 355),
}


def gold(img):
    a = np.asarray(img).astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (r > 120) & (g > 85) & (b < g - 25) & (r >= g)


def span(prof):
    """(first, last) index at or above FRAC of the profile's own peak."""
    peak = prof.max()
    if peak == 0:
        return None
    hit = np.nonzero(prof >= peak * FRAC)[0]
    return int(hit[0]), int(hit[-1])


def measure(mask, win):
    x0, y0, x1, y1 = win
    sub = mask[y0:y1, x0:x1]
    sx = span(sub.sum(axis=0))
    if sx is None:
        return None
    # bottom edge: last row with any ink inside the plate's own columns. The
    # window bottom is clear felt, so scanning from below is unambiguous.
    cols = sub[:, sx[0]:sx[1] + 1]
    rows = np.nonzero(cols.sum(axis=1) > 2)[0]
    bottom = y0 + int(rows[-1]) if len(rows) else None
    # a bottom sitting on the window floor means the ink runs out of the window,
    # so the edge was never actually found. Report it as unresolved rather than
    # as a measurement that happens to agree.
    if bottom is not None and bottom >= y1 - 1:
        bottom = None
    return {'left': x0 + sx[0], 'right': x0 + sx[1], 'bottom': bottom}


def main():
    T, B = load_pair()
    gt, gb = gold(T), gold(B)
    worst = 0
    print(f'PLATE INK EDGES  (edge at {FRAC:.0%} of profile peak; window >= 30px clear all round)')
    for name, win in PLATES.items():
        mt, mb = measure(gt, win), measure(gb, win)
        if mt is None or mb is None:
            print(f'  {name:11s} NO INK')
            worst = 999
            continue
        deltas = {k: abs(mt[k] - mb[k]) for k in mt
                  if mt[k] is not None and mb[k] is not None}
        worst = max(worst, max(deltas.values()))
        wt = mt['right'] - mt['left'] + 1
        wb = mb['right'] - mb['left'] + 1
        fmt = lambda v: 'n/a ' if v is None else f'{v:4d}'  # noqa: E731
        print(f'  {name:11s} tpl left {mt["left"]:4d} right {mt["right"]:4d}'
              f' bottom {fmt(mt["bottom"])}   width {wt:3d}')
        print(f'  {"":11s} bld left {mb["left"]:4d} right {mb["right"]:4d}'
              f' bottom {fmt(mb["bottom"])}   width {wb:3d}')
        detail = '  '.join(f'{k} {v}px' for k, v in deltas.items())
        skipped = [k for k in mt if k not in deltas]
        print(f'  {"":11s} build-vs-template: {detail}  width {abs(wt - wb)}px'
              + (f'   [{", ".join(skipped)} not isolated by this window]' if skipped else ''))
    print(f'\nworst build-vs-template edge error: {worst}px  (tolerance {TOL})')
    return 0 if worst <= TOL else 1


if __name__ == '__main__':
    raise SystemExit(main())
