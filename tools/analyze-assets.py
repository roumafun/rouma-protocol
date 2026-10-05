"""Inspect every raster in brand/ and reference/: container header, alpha, dominant colours.

Dominant colours: k-means in sRGB, then each centre is snapped to the nearest real pixel
(its coordinate is reported), so no colour is invented.
Run: python tools/analyze-assets.py [--json out.json]
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

root = Path(__file__).resolve().parent.parent
COLOURTYPE = {0: 'greyscale', 2: 'truecolour', 3: 'indexed', 4: 'greyscale+alpha', 6: 'truecolour+alpha'}


def png_ihdr(path):
    b = path.read_bytes()
    if b[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    w, h, depth, ctype, comp, filt, interlace = struct.unpack('>IIBBBBB', b[16:29])
    chunks = []
    i = 8
    while i < len(b):
        n = struct.unpack('>I', b[i:i + 4])[0]
        chunks.append(b[i + 4:i + 8].decode('latin1'))
        i += 12 + n
    return dict(width=w, height=h, bitDepth=depth, colourType=ctype, colourTypeName=COLOURTYPE.get(ctype), interlace=interlace, chunks=chunks)


def jpeg_info(path):
    b = path.read_bytes()
    i = 2
    while i < len(b):
        if b[i] != 0xFF:
            i += 1
            continue
        m = b[i + 1]
        if m in (0xC0, 0xC1, 0xC2):
            prec, h, w, comps = struct.unpack('>BHHB', b[i + 4:i + 10])
            return dict(width=w, height=h, precision=prec, components=comps, progressive=m == 0xC2)
        i += 2 + struct.unpack('>H', b[i + 2:i + 4])[0]
    return None


def dominant(rgb, k=6, sample=60000):
    flat = rgb.reshape(-1, 3)
    rng = np.random.default_rng(7)
    pts = flat[rng.choice(len(flat), min(sample, len(flat)), replace=False)].astype(float)
    km = KMeans(n_clusters=k, n_init=4, random_state=7).fit(pts)
    counts = np.bincount(km.predict(flat.astype(float)), minlength=k)
    out = []
    h, w = rgb.shape[:2]
    for c, n in zip(km.cluster_centers_, counts):
        d = ((flat.astype(float) - c) ** 2).sum(1)
        idx = int(d.argmin())  # real pixel nearest the centre
        y, x = divmod(idx, w)
        px = rgb[y, x]
        out.append(dict(share=round(float(n) / len(flat), 4), centre=[round(float(v), 1) for v in c], snapped=[int(v) for v in px], at=[int(x), int(y)]))
    return sorted(out, key=lambda o: -o['share'])


def analyse(path):
    r = dict(file=str(path.relative_to(root)).replace('\\', '/'), bytes=path.stat().st_size)
    r['header'] = png_ihdr(path) or jpeg_info(path)
    im = Image.open(path)
    r['mode'] = im.mode
    r['size'] = list(im.size)
    rgba = np.array(im.convert('RGBA'))
    a = rgba[..., 3]
    hist = np.bincount(a.ravel(), minlength=256)
    r['alpha'] = dict(
        min=int(a.min()), max=int(a.max()),
        opaque=int(hist[255]), transparent=int(hist[0]), partial=int(hist[1:255].sum()),
        histogram8=[int(hist[i * 32:(i + 1) * 32].sum()) for i in range(8)],
    )
    clear = a == 0
    r['alpha']['pureBlackWhereTransparent'] = int((clear & (rgba[..., :3].sum(-1) == 0)).sum())
    r['alpha']['rgbWhereTransparentDistinct'] = int(len({tuple(p) for p in rgba[clear][:, :3][:20000]})) if clear.any() else 0
    opaque_rgb = rgba[..., :3][a > 0] if (a > 0).any() else rgba[..., :3].reshape(-1, 3)
    # dominant pixels over what is actually visible
    vis = rgba[a > 0] if clear.any() else rgba.reshape(-1, 4)
    img = vis[:, :3].reshape(1, -1, 3)
    r['dominant'] = dominant(img)
    r['mean'] = [round(float(v), 1) for v in opaque_rgb.mean(0)]
    return r


if __name__ == '__main__':
    files = sorted(p for d in ('brand', 'reference') for p in (root / d).iterdir() if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp'))
    res = [analyse(p) for p in files]
    if '--json' in sys.argv:
        Path(sys.argv[sys.argv.index('--json') + 1]).write_text(json.dumps(res, indent=1))
    for r in res:
        print(json.dumps(r))
