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
    fams = ORDER
    per = 4 if vp == '390' else 2
    for k in range(0, len(fams), per):
        p, d = page(f'Destinations at {vp}px: Before (Lobby Thumbnail Reused) | After (Own Art)', 'Viewport screenshots, signed out, top of page.')
        x = 40
        for i in fams[k:k + per]:
            name = ROUTE.get(i, i)
            b = os.path.join(before, f'{name}-{vp}.png'); a = os.path.join(after, f'{name}-{vp}.png')
            d.text((x, 110), i.replace('-', ' ').title(), font=font(28), fill=BLUE)
            cw = (2400 - 80) // per - 20
            for j, pth in enumerate((b, a)):
                if not os.path.exists(pth): continue
                im = fit(Image.open(pth), cw // 2 - 10, 1420)
                p.paste(im, (x + j * (cw // 2), 150))
                d.text((x + j * (cw // 2), 1575 - 22), 'Before' if j == 0 else 'After', font=font(20), fill=MUTED)
            x += cw + 20
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
    pages = art_pages(wt) + shot_pages(before, after, '390') + shot_pages(before, after, '1440') + [quiet_page()] + state_pages(after)
    pages[0].save(out, save_all=True, append_images=pages[1:], resolution=150, quality=80)
    print(out, len(pages), os.path.getsize(out))
