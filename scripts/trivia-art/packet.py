"""Design-review packet for Dan (p4-art): one PDF, pages of JPEG-compressed sheets.

python3 packet.py <worktree> <before_shots_dir> <after_shots_dir> <out.pdf>
Pages: (1) per family, lobby thumbnail | new mobile crop | new wide crop;
(2..) destination before | after at 390 and 1440; (last) quiet backgrounds
(not shipped, for decision) and state fixtures if present in after/states.
"""
import os, sys, glob
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from proof import THUMB, ORDER
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
def font(n): return ImageFont.truetype(FONT, n)
BG, INK, MUTED, BLUE = (18, 18, 20), (228, 231, 236), (154, 165, 179), (69, 173, 255)
ROUTE = {'lobby': 'trivia', 'survival': 'survival-game'}

def fit(im, w, h):
    im = im.convert('RGB'); r = min(w / im.width, h / im.height)
    return im.resize((max(1, int(im.width * r)), max(1, int(im.height * r))), Image.LANCZOS)

def page(title, sub=''):
    p = Image.new('RGB', (2400, 1600), BG); d = ImageDraw.Draw(p)
    d.text((40, 24), title, font=font(40), fill=INK); d.text((40, 76), sub, font=font(24), fill=MUTED)
    return p, d

def art_pages(wt):
    pages = []
    for chunk in (ORDER[:8], ORDER[8:]):
        p, d = page('Trivia Unique Art: Lobby Thumbnail vs New Destination Art (intro-v1)',
                    'Left: the lobby thumbnail players tap. Middle: new phone intro (16:10). Right: new tablet/desktop intro (12:5). Text-free; all copy is live HTML.')
        y = 120
        for i in chunk:
            d.text((40, y + 70), i.replace('-', ' ').title(), font=font(30), fill=BLUE)
            t = fit(Image.open(os.path.join(wt, 'public', THUMB[i])), 420, 170)
            m = fit(Image.open(os.path.join(HERE, 'export', i, 'mobile.png')), 272, 170)
            w = fit(Image.open(os.path.join(HERE, 'export', i, 'wide.png')), 1100, 170)
            x = 300
            for im in (t, m, w):
                p.paste(im, (x, y)); x += im.width + 40
            y += 182
        pages.append(p)
    return pages

def shot_pages(before, after, vp):
    pages = []
    phone = vp == '390'
    per_row, rows = (4, 2) if phone else (1, 2)
    per = per_row * rows
    for k in range(0, len(ORDER), per):
        p, d = page(f'Destinations at {vp}px: Before | After', 'Before: production today (the lobby thumbnail reused as the hero). After: the new destination art. Viewport screenshots, top of page.')
        cell_w = (2400 - 80) // per_row
        img_w = cell_w // 2 - 16
        img_h = 640 if phone else 690
        for n, i in enumerate(ORDER[k:k + per]):
            name = ROUTE.get(i, i)
            x0 = 40 + (n % per_row) * cell_w; y0 = 120 + (n // per_row) * (img_h + 80)
            d.text((x0, y0), i.replace('-', ' ').title(), font=font(26), fill=BLUE)
            b = os.path.join(before, f'{name}-{vp}.png'); a = os.path.join(after, 'shots', f'{name}-{vp}.png')
            flagged = i in ('pvp', 'tournaments')
            if flagged:
                b = os.path.join(WT, 'public', THUMB[i])
                a = os.path.join(LOCAL, 'shots', f'{name}-{vp}.png')
            for j, pth in enumerate((b, a)):
                if not os.path.exists(pth): continue
                im = fit(Image.open(pth), img_w, img_h)
                x = x0 + j * (img_w + 16); p.paste(im, (x, y0 + 36))
                label = ('Before: Former Hero Art (Flag Off In Production)' if flagged else 'Before: Production') if j == 0 else ('After: Local Build, Flag On' if flagged else 'After: Production (Live)')
                d.text((x, y0 + 40 + im.height), label, font=font(18), fill=MUTED)
        pages.append(p)
    return pages

def quiet_page():
    p, d = page('Quiet Gameplay Backgrounds (Produced, Not Shipped: Owner Decision)',
                'The console law keeps the canvas and glass black and never lays art behind art, so these are held for your call.')
    x, y = 40, 130
    for n, i in enumerate(ORDER):
        im = fit(Image.open(os.path.join(HERE, 'export', i, 'quiet.png')), 560, 350)
        p.paste(im, (x, y)); d.text((x, y + 355), i, font=font(20), fill=MUTED)
        x += 590
        if (n + 1) % 4 == 0: x, y = 40, y + 390
    return p

def state_pages(after):
    shots = sorted(glob.glob(os.path.join(after, 'states', '*.png')))
    pages = []
    for k in range(0, len(shots), 6):
        p, d = page('Key States', 'Fallbacks, zoom, forced colours, dialog, reduced motion (local production build).')
        for n, s in enumerate(shots[k:k + 6]):
            im = fit(Image.open(s), 740, 640); x = 40 + (n % 3) * 780; y = 130 + (n // 3) * 720
            p.paste(im, (x, y)); d.text((x, y + 650), os.path.basename(s)[:-4], font=font(22), fill=MUTED)
        pages.append(p)
    return pages

if __name__ == '__main__':
    wt, before, after, out = sys.argv[1:5]
    WT = wt
    LOCAL = sys.argv[5] if len(sys.argv) > 5 else after
    pages = art_pages(wt) + shot_pages(before, after, '390') + shot_pages(before, after, '1440') + [quiet_page()] + state_pages(LOCAL)
    pages[0].save(out, save_all=True, append_images=pages[1:], resolution=150, quality=80)
    print(out, len(pages), os.path.getsize(out))
