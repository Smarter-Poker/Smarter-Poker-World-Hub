"""Export one destination intro master into its delivery set (p4-art).

python3 export.py <id> <seed> [--mdy PX] [--ddy PX] [--dx PX] [--grade SPEC] [--dissolve]

  gen/<id>-s<seed>.png (1536x1024, Z-Image-Turbo)  ->  export/<id>/...
  * grade: hue-selective desaturation toward Rec.709 luma, hue untouched,
    6 degree feather (the modes-console-v1 method). SPEC "lo-hi:keep,..."
  * mobile crop 16:10 (1536x960, centred, shifted by --mdy)
  * wide crop 12:5 (1536x640, centred, shifted by --ddy); --dx shifts both
  * 1440/960/640 widths, AVIF (avifenc) + WebP (cwebp), content-hashed names
  * lqip: 32x20 WebP of the mobile crop as a data URI (the placeholder)
  * quiet background: blurred, darkened, vignetted master (review only)
Writes export/<id>/export.json with every setting and file hash.
"""
import argparse, base64, hashlib, io, json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
W0, H0 = 1536, 1024
MOBILE = (1536, 960)    # 16:10
WIDE = (1536, 640)      # 12:5
WIDTHS = (1440, 960, 640)
AVIF_Q, AVIF_SPEED = 52, 4
WEBP_Q = 76
STD_GRADE = "0-186:0,255-359:0"          # keep only electric blue hues

def sha(b): return hashlib.sha256(b).hexdigest()

def parse_grade(spec):
    out = []
    for part in spec.split(','):
        rng, keep = part.split(':'); lo, hi = rng.split('-')
        out.append((float(lo), float(hi), float(keep)))
    return out

def grade(img, ranges, feather=6.0):
    a = np.asarray(img.convert('RGB')).astype(np.float32) / 255.0
    hsv = np.asarray(img.convert('RGB').convert('HSV')).astype(np.float32)
    hue = hsv[..., 0] * 360.0 / 255.0
    keep = np.ones(hue.shape, np.float32)
    for lo, hi, k in ranges:
        # weight 1 inside [lo,hi], ramps to 0 over `feather` degrees outside
        d = np.maximum(np.maximum(lo - hue, hue - hi), 0.0)
        w = np.clip(1.0 - d / feather, 0.0, 1.0)
        keep = np.minimum(keep, 1.0 - w * (1.0 - k))
    y = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])[..., None]
    out = y + (a - y) * keep[..., None]
    return Image.fromarray(np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8))

def dissolve(img, inner=0.72):
    """Fade the frame edges to pure black so a frameless picture melts into the canvas."""
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = np.abs(xx - (w - 1) / 2) / ((w - 1) / 2)
    ny = np.abs(yy - (h - 1) / 2) / ((h - 1) / 2)
    r = np.maximum(nx, ny * 0.9)
    m = np.clip((1.0 - r) / (1.0 - inner), 0.0, 1.0)
    m = m * m * (3 - 2 * m)
    a = np.asarray(img).astype(np.float32) * m[..., None]
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))

def crop(img, size, dx, dy):
    w, h = size
    x = int(round((W0 - w) / 2 + dx)); y = int(round((H0 - h) / 2 + dy))
    x = max(0, min(W0 - w, x)); y = max(0, min(H0 - h, y))
    return img.crop((x, y, x + w, y + h)), [x, y, w, h]

def encode(img, fmt, tmpdir):
    src = os.path.join(tmpdir, 'src.png'); img.save(src, optimize=False)
    dst = os.path.join(tmpdir, 'out.' + fmt)
    if fmt == 'avif':
        subprocess.run(['avifenc', '-q', str(AVIF_Q), '-s', str(AVIF_SPEED), '-y', '420', '-j', '8', '--ignore-exif', '--ignore-xmp', src, dst], check=True, capture_output=True)
    else:
        subprocess.run(['cwebp', '-quiet', '-q', str(WEBP_Q), '-m', '6', '-sharp_yuv', '-metadata', 'none', src, '-o', dst], check=True, capture_output=True)
    return open(dst, 'rb').read()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id'); ap.add_argument('seed', type=int)
    ap.add_argument('--mdy', type=float, default=0); ap.add_argument('--ddy', type=float, default=0)
    ap.add_argument('--dx', type=float, default=0)
    ap.add_argument('--grade', default=STD_GRADE)
    ap.add_argument('--dissolve', action='store_true')
    a = ap.parse_args()
    src_path = os.path.join(HERE, 'gen', f'{a.id}-s{a.seed}.png')
    raw = open(src_path, 'rb').read()
    master = Image.open(io.BytesIO(raw)).convert('RGB')
    assert master.size == (W0, H0), master.size
    graded = grade(master, parse_grade(a.grade))
    outdir = os.path.join(HERE, 'export', a.id); os.makedirs(outdir, exist_ok=True)
    tmp = os.path.join(outdir, '.tmp'); os.makedirs(tmp, exist_ok=True)
    graded.save(os.path.join(outdir, 'master-graded.png'))
    crops = {}
    for name, size, dy in (('mobile', MOBILE, a.mdy), ('wide', WIDE, a.ddy)):
        c, box = crop(graded, size, a.dx, dy)
        if a.dissolve: c = dissolve(c)
        c.save(os.path.join(outdir, f'{name}.png'))
        files = []
        for w in WIDTHS:
            h = round(w * size[1] / size[0])
            r = c.resize((w, h), Image.LANCZOS)
            for fmt in ('avif', 'webp'):
                b = encode(r, fmt, tmp)
                digest = sha(b)
                fname = f'{a.id}-{name}-{w}.{digest[:10]}.{fmt}'
                open(os.path.join(outdir, fname), 'wb').write(b)
                files.append({'file': fname, 'format': fmt, 'width': w, 'height': h, 'bytes': len(b), 'sha256': digest})
        crops[name] = {'box': box, 'ratio': [size[0] // 64, size[1] // 64] if name == 'wide' else [16, 10], 'files': files}
    crops['wide']['ratio'] = [12, 5]
    lq = crops_img = Image.open(os.path.join(outdir, 'mobile.png')).resize((32, 20), Image.LANCZOS)
    b = io.BytesIO(); lq.save(b, 'WEBP', quality=40, method=6); lqb = b.getvalue()
    lqip = 'data:image/webp;base64,' + base64.b64encode(lqb).decode()
    # quiet gameplay background (review candidate; not shipped)
    q = graded.filter(ImageFilter.GaussianBlur(22))
    q = Image.fromarray(np.clip(np.asarray(q).astype(np.float32) * 0.30, 0, 255).astype(np.uint8))
    q = dissolve(q, inner=0.55)
    q.save(os.path.join(outdir, 'quiet.png'))
    qfiles = []
    for w in WIDTHS:
        r = q.resize((w, round(w * H0 / W0)), Image.LANCZOS)
        for fmt in ('avif', 'webp'):
            qb = encode(r, fmt, tmp); d = sha(qb)
            fname = f'{a.id}-quiet-{w}.{d[:10]}.{fmt}'
            open(os.path.join(outdir, fname), 'wb').write(qb)
            qfiles.append({'file': fname, 'format': fmt, 'width': w, 'height': r.size[1], 'bytes': len(qb), 'sha256': d})
    prompt = open(os.path.join(HERE, 'prompts', f'{a.id}.txt'), 'rb').read()
    meta_path = src_path[:-4] + ".metadata.json"
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    rec = {
        'id': a.id, 'seed': a.seed, 'source': os.path.relpath(src_path, HERE), 'source_sha256': sha(raw),
        'source_size': [W0, H0], 'prompt_file': f'prompts/{a.id}.txt', 'prompt_sha256': sha(prompt),
        'model': 'Tongyi-MAI/Z-Image-Turbo', 'model_licence': 'Apache-2.0', 'runner': 'mflux 0.19.2 (MIT), mlx 0.32.3, Apple M3 Ultra',
        'generation': {k: meta.get(k) for k in ('steps', 'guidance', 'quantize', 'width', 'height', 'seed', 'scheduler', 'mflux_version', 'generation_time_seconds') if k in meta},
        'grade': {'method': 'HSV hue-selective desaturation toward Rec.709 luma, 6 degree feather, hue untouched', 'spec': a.grade},
        'dissolve_edges': a.dissolve, 'shift': {'dx': a.dx, 'mobile_dy': a.mdy, 'wide_dy': a.ddy},
        'encoders': {'avif': f'avifenc -q {AVIF_Q} -s {AVIF_SPEED} -y 420', 'webp': f'cwebp -q {WEBP_Q} -m 6 -sharp_yuv'},
        'crops': crops, 'lqip': lqip, 'lqip_bytes': len(lqb),
        'quiet': {'method': 'gaussian blur 22px, 30% exposure, edge dissolve to black', 'files': qfiles, 'shipped': False},
    }
    json.dump(rec, open(os.path.join(outdir, 'export.json'), 'w'), indent=1)
    tot = sum(f['bytes'] for c in crops.values() for f in c['files'])
    print(a.id, a.seed, 'shipped bytes', tot, 'lqip', len(lqb), {c: [f['bytes'] for f in v['files']] for c, v in crops.items()})

if __name__ == '__main__':
    main()
