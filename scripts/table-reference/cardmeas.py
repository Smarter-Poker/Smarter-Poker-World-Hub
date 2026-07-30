import numpy as np
from PIL import Image
from refpaths import load_pair

T, B = load_pair()

def white(img):
    a = np.asarray(img).astype(np.int16)
    r,g,b = a[:,:,0],a[:,:,1],a[:,:,2]
    return (r>190)&(g>190)&(b>185)

def rep(tag, m, x0,y0,x1,y1):
    sub = m[y0:y1, x0:x1]
    ys,xs = np.nonzero(sub)
    if len(xs)==0: print(f'  {tag} none'); return
    print(f'  {tag} bbox=({x0+xs.min()},{y0+ys.min()})-({x0+xs.max()},{y0+ys.max()}) '
          f'{xs.max()-xs.min()+1} x {ys.max()-ys.min()+1}  white={int(sub.sum())}')

W = (495,960,630,1075)
print('HOLE CARDS')
rep('tpl', white(T), *W)
rep('bld', white(B), *W)

# hero art top: find topmost non-background row in a column window above the plate
def arttop(img, x0,x1,y0,y1):
    a = np.asarray(img.convert('RGB')).astype(np.int16)
    reg = a[y0:y1, x0:x1]
    # background felt/rail is dark & desaturated; art is brighter
    lum = reg.mean(axis=2)
    rows = np.nonzero((lum>95).sum(axis=1) > 6)[0]
    return y0+rows.min() if len(rows) else None
print('HERO ART TOP (window x 405..480, y 900..1025)')
print('  tpl', arttop(T,405,480,900,1025))
print('  bld', arttop(B,405,480,900,1025))
