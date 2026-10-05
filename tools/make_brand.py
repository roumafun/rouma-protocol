"""Build brand outputs from the real files in brand/ and reference/.

  python tools/make_brand.py            regenerate src/tokens.json, src/assets/*, tools/data/brand-report.json
  python tools/make_brand.py --verify   re-read every sampled pixel and every hash; exit 1 on any mismatch

Palette method: k-means over the exact colours found in the artwork (weighted by log pixel count),
each centre snapped to the nearest real colour that occurs in at least MIN_COUNT pixels, and the
coordinate of that pixel is recorded. Nothing is invented; every swatch points at a pixel.

Logo method: the transparent PNG hides pure black RGB under alpha 0, so it is resized premultiplied
(colour * alpha), then un-premultiplied. A straight resize is run beside it to show the dark fringe it avoids.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

ROOT = Path(__file__).resolve().parent.parent
LOGO_JPG = 'brand/LOGO ROUMA JPG.jpg.jpeg'
LOGO_PNG_T = 'brand/LOGO ROUMA PNG...png'
BANNER = 'reference/SAMPUL ROUMA JPG.jpg.jpeg'
MIN_COUNT = 50
LOGO_HEIGHTS = [20, 40, 60]
TOUCH = 180


def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def to_oklch(rgb):
    c = [v / 255 for v in rgb]
    lin = [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]
    r, g, b = lin
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    C = math.hypot(a, bb)
    H = math.degrees(math.atan2(bb, a)) % 360
    return L, C, H


def fmt_oklch(rgb):
    L, C, H = to_oklch(rgb)
    return f'oklch({L:.4f} {C:.4f} {H:.1f})'


def load_rgb(path):
    return np.array(Image.open(ROOT / path).convert('RGB'))


def colour_table(path, stride=1):
    """unique exact colours -> (count, first x, first y)"""
    a = load_rgb(path)[::stride, ::stride]
    h, w, _ = a.shape
    key = (a[..., 0].astype(np.int64) << 16) | (a[..., 1].astype(np.int64) << 8) | a[..., 2]
    flat = key.ravel()
    uniq, first, cnt = np.unique(flat, return_index=True, return_counts=True)
    out = {}
    for k, f, n in zip(uniq, first, cnt):
        y, x = divmod(int(f), w)
        out[(int(k) >> 16, (int(k) >> 8) & 255, int(k) & 255)] = (int(n), x * stride, y * stride)
    return out


def snap(centre, table, min_count=MIN_COUNT):
    best, bd = None, 1e18
    for rgb, (n, x, y) in table.items():
        if n < min_count:
            continue
        d = sum((p - q) ** 2 for p, q in zip(rgb, centre))
        if d < bd:
            best, bd = rgb, d
    n, x, y = table[best]
    return best, (x, y), n


def kmeans_snap(table, k, filt, min_count=MIN_COUNT):
    items = [(rgb, v[0]) for rgb, v in table.items() if filt(rgb)]
    pts = np.array([r for r, _ in items], float)
    w = np.log1p(np.array([n for _, n in items], float))
    km = KMeans(n_clusters=min(k, len(items)), n_init=8, random_state=7).fit(pts, sample_weight=w)
    share = np.zeros(len(km.cluster_centers_))
    for lab, (_, n) in zip(km.labels_, items):
        share[lab] += n
    res = []
    for c, s in zip(km.cluster_centers_, share):
        rgb, at, n = snap(c, {r: table[r] for r, _ in items}, min_count)
        res.append(dict(rgb=list(rgb), at=list(at), count=n, share=int(s), centre=[round(float(v), 1) for v in c]))
    return res


def swatch(name, rgb, file, at, method):
    return dict(rgb=list(rgb), hex='#%02X%02X%02X' % tuple(rgb), oklch=fmt_oklch(rgb), file=file, at=list(at), sha256=sha(file), method=method)


# ---------- palette ----------
def build_palette():
    ramp_src = {}
    for f in (LOGO_JPG, BANNER):
        for rgb, v in colour_table(f, stride=1).items():
            if max(rgb) - min(rgb) <= 6:
                old = ramp_src.get(rgb)
                if old is None or v[0] > old[0][0]:
                    ramp_src[rgb] = (v, f)
    table = {rgb: v for rgb, (v, _) in ramp_src.items()}
    file_of = {rgb: f for rgb, (_, f) in ramp_src.items()}
    ramp = kmeans_snap(table, 24, lambda c: True)
    sw = {}
    for r in ramp:
        rgb = tuple(r['rgb'])
        sw[rgb] = swatch('', rgb, file_of[rgb], r['at'], 'k-means k=24 on neutral colours of logo+banner, snapped to real pixel')
    # exact brand anchors, confirmed on the pixel grid
    logo = load_rgb(LOGO_JPG)
    for want, label in (((17, 17, 15), 'ink'), ((237, 236, 234), 'paper')):
        ys, xs = np.where((logo == np.array(want)).all(-1))
        if len(xs):
            sw[want] = swatch(label, want, LOGO_JPG, (int(xs[0]), int(ys[0])), f'exact brand colour confirmed at pixel ({int(xs[0])},{int(ys[0])}); {len(xs)} pixels')
    # accent: saturated pixels of the banner
    bt = colour_table(BANNER)
    sat = kmeans_snap(bt, 3, lambda c: max(c) - min(c) >= 90 and max(c) >= 140, min_count=1)
    sat.sort(key=lambda r: -r['share'])
    a = sat[0]
    accent = swatch('accent', a['rgb'], BANNER, a['at'], 'k-means k=3 on saturated banner pixels (spread>=90, max>=140), dominant cluster, snapped to real pixel')
    solid = {rgb: (v, file_of[rgb]) for rgb, (v, _) in ramp_src.items() if v[0] >= MIN_COUNT}
    return sw, accent, solid


def pick(sw, solid, target_l, used):
    best = None
    for rgb in sw:
        if rgb in used:
            continue
        d = abs(to_oklch(rgb)[0] - target_l)
        if best is None or d < best[0]:
            best = (d, rgb)
    if best[0] > 0.05:  # k-means centres leave a gap here: take the nearest solid real colour instead
        cand = None
        for rgb, ((n, x, y), f) in solid.items():
            if rgb in used:
                continue
            d = abs(to_oklch(rgb)[0] - target_l)
            if cand is None or (d, -n) < (cand[0], -cand[2]):
                cand = (d, rgb, n)
        if cand[0] < best[0]:
            rgb = cand[1]
            (n, x, y), f = solid[rgb]
            sw[rgb] = swatch('', rgb, f, (x, y), f'role fill: nearest solid real colour ({n} px) to target lightness {target_l}; k-means centres left a gap')
            best = (cand[0], rgb)
    used.add(best[1])
    return best[1]


def build_tokens():
    sw, accent, solid = build_palette()
    names = {}
    # dark theme is the brand's native look
    dark_targets = [('bg', 0.165), ('surface', 0.19), ('hover', 0.27), ('line-strong', 0.38), ('faint', 0.58), ('muted', 0.78), ('fg', 0.94)]
    light_targets = [('surface', 0.985), ('bg', 0.94), ('hover', 0.90), ('line-strong', 0.78), ('faint', 0.60), ('muted', 0.44), ('fg', 0.19)]
    used = set()
    out_sw = {}
    roles = {'dark': {}, 'light': {}}

    def reg(rgb):
        key = 's%02X%02X%02X' % tuple(rgb)
        out_sw[key] = sw[rgb]
        return key

    for mode, targets in (('dark', dark_targets), ('light', light_targets)):
        used = set()
        for role, t in targets:
            roles[mode][role] = reg(pick(sw, solid, t, used))
    # the confirmed brand ink is the light theme's text and the dark theme's surface
    roles['light']['fg'] = reg((17, 17, 15))
    roles['dark']['surface'] = reg((17, 17, 15))
    roles['dark']['line'] = roles['dark']['hover']
    roles['light']['line'] = roles['light']['hover']
    ink = reg((17, 17, 15))
    paper = reg((237, 236, 234))
    roles['dark']['ink'] = roles['dark']['fg']
    roles['dark']['ink-fg'] = roles['dark']['bg']
    roles['light']['ink'] = roles['light']['fg']
    roles['light']['ink-fg'] = roles['light']['surface']
    for m in roles:
        roles[m]['tile'] = ink
        roles[m]['tile-fg'] = paper
        roles[m]['accent'] = 'accent'
    out_sw['accent'] = accent
    used_keys = {v for m in roles.values() for v in m.values()}
    out_sw = {k: v for k, v in out_sw.items() if k in used_keys}
    return dict(
        _note='The only file with colour literals. Every swatch is a real pixel (file + coordinate) in the brand artwork.',
        swatches=out_sw, light=roles['light'], dark=roles['dark'],
    )


# ---------- logo ----------
def premult_resize(rgba, size):
    arr = rgba.astype(np.float32)
    a = arr[..., 3:4] / 255.0
    pm = np.concatenate([arr[..., :3] * a, a * 255.0], axis=-1)
    chans = [np.array(Image.fromarray(pm[..., i], mode='F').resize(size, Image.LANCZOS)) for i in range(4)]
    pm2 = np.stack(chans, -1)
    a2 = np.clip(pm2[..., 3:4] / 255.0, 0, 1)
    rgb = np.where(a2 > 1e-4, pm2[..., :3] / np.maximum(a2, 1e-4), 0)
    return np.clip(np.concatenate([rgb, a2 * 255.0], -1), 0, 255).round().astype(np.uint8), pm2


def naive_fringe(rgba, size):
    """channel-wise resize with no premultiplication, to measure the dark fringe it creates"""
    chans = [np.array(Image.fromarray(rgba[..., i], mode='L').resize(size, Image.LANCZOS)) for i in range(4)]
    out = np.stack(chans, -1)
    m = (out[..., 3] > 0) & (out[..., 3] < 255)
    return int(out[m][:, :3].mean(-1).min()) if m.any() else 255


def build_logo(tok):
    src = np.array(Image.open(ROOT / LOGO_PNG_T).convert('RGBA'))
    a = src[..., 3]
    clear = a == 0
    stats = dict(
        transparent=int(clear.sum()),
        pureBlackWhereTransparent=int((clear & (src[..., :3].sum(-1) == 0)).sum()),
        partialAlpha=int(((a > 0) & (a < 255)).sum()),
    )
    ys, xs = np.where(a > 0)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = src[y0:y1, x0:x1]
    bw, bh = crop.shape[1], crop.shape[0]
    outdir = ROOT / 'src/assets'
    outdir.mkdir(parents=True, exist_ok=True)
    files = {}
    fringe = {}
    for h in LOGO_HEIGHTS:
        w = round(h * bw / bh)
        out, _ = premult_resize(crop, (w, h))
        Image.fromarray(out, 'RGBA').save(outdir / f'logo-{h}.png', optimize=True)
        m = (out[..., 3] > 0) & (out[..., 3] < 255)
        fringe[h] = dict(width=w, premultipliedMinLuma=int(out[m][:, :3].mean(-1).min()) if m.any() else 255, naiveMinLuma=naive_fringe(crop, (w, h)))
        files[f'src/assets/logo-{h}.png'] = None
    # touch icon: R on the ink tile, composited from the premultiplied resize
    ink = np.array(tok['swatches'][tok['light']['tile']]['rgb'], float)
    th = round(TOUCH * 0.58)
    tw = round(th * bw / bh)
    out, pm = premult_resize(crop, (tw, th))
    canvas = np.tile(ink, (TOUCH, TOUCH, 1))
    ox, oy = (TOUCH - tw) // 2, (TOUCH - th) // 2
    al = out[..., 3:4] / 255.0
    canvas[oy:oy + th, ox:ox + tw] = out[..., :3] * al + canvas[oy:oy + th, ox:ox + tw] * (1 - al)
    Image.fromarray(canvas.round().astype(np.uint8), 'RGB').save(outdir / 'apple-touch-icon.png', optimize=True)
    files['src/assets/apple-touch-icon.png'] = None
    for f in files:
        files[f] = sha(f)
    stats.update(bbox=[int(x0), int(y0), int(bw), int(bh)], fringe=fringe, outputs=files)
    return stats, (crop[..., 3] >= 128)


# ---------- favicon grid ----------
def merge_edges(vals, gap=10):
    vals = sorted(vals)
    groups = [[vals[0]]]
    for v in vals[1:]:
        if v - groups[-1][-1] <= gap:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [int(round(sum(g) / len(g))) for g in groups]


def trace_grid(mask):
    h, w = mask.shape
    xe = [0, w]
    ye = [0, h]
    dx = mask[:, 1:] != mask[:, :-1]
    dy = mask[1:, :] != mask[:-1, :]
    xe += [x + 1 for x in range(w - 1) if dx[:, x].sum() >= 20]
    ye += [y + 1 for y in range(h - 1) if dy[y, :].sum() >= 20]
    xs = merge_edges(xe)
    ys = merge_edges(ye)
    cells = []
    for j in range(len(ys) - 1):
        row = []
        for i in range(len(xs) - 1):
            cy, cx = (ys[j] + ys[j + 1]) // 2, (xs[i] + xs[i + 1]) // 2
            row.append(bool(mask[cy, cx]))
        cells.append(row)
    # merge: horizontal runs per band, then identical consecutive bands
    bands = []
    for j, row in enumerate(cells):
        runs, i = [], 0
        while i < len(row):
            if row[i]:
                k = i
                while k + 1 < len(row) and row[k + 1]:
                    k += 1
                runs.append((i, k + 1))
                i = k + 1
            else:
                i += 1
        bands.append(runs)
    rects, j = [], 0
    while j < len(bands):
        if not bands[j]:
            j += 1
            continue
        k = j
        while k + 1 < len(bands) and bands[k + 1] == bands[j]:
            k += 1
        for a, b in bands[j]:
            rects.append([xs[a], ys[j], xs[b] - xs[a], ys[k + 1] - ys[j]])
        j = k + 1
    return dict(xEdges=xs, yEdges=ys, cells=cells, rects=rects, width=w, height=h)


def build_all():
    tok = build_tokens()
    (ROOT / 'src').mkdir(exist_ok=True)
    (ROOT / 'src/tokens.json').write_text(json.dumps(tok, indent=2) + '\n')
    logo, mask = build_logo(tok)
    grid = trace_grid(mask)
    grid['source'] = LOGO_PNG_T
    grid['sha256'] = sha(LOGO_PNG_T)
    (ROOT / 'src/assets/logo-grid.json').write_text(json.dumps(grid))
    report = dict(
        assets={f: dict(sha256=sha(f), bytes=(ROOT / f).stat().st_size) for f in [LOGO_JPG, LOGO_PNG_T, 'brand/LOGO ROUMA PNG.png', BANNER]},
        logoPng=dict(colourType=6, colourTypeName='truecolour+alpha', bitDepth=8, **logo),
        premultiplied=True,
        favicon=dict(rects=len(grid['rects']), xEdges=grid['xEdges'], yEdges=grid['yEdges']),
        palette={k: dict(hex=v['hex'], at=v['at'], file=v['file']) for k, v in tok['swatches'].items()},
    )
    (ROOT / 'tools/data').mkdir(exist_ok=True)
    (ROOT / 'tools/data/brand-report.json').write_text(json.dumps(report, indent=1) + '\n')
    return tok, report


def verify():
    bad = []
    tok = json.loads((ROOT / 'src/tokens.json').read_text())
    imgs = {}
    for name, s in tok['swatches'].items():
        f = s['file']
        if f not in imgs:
            imgs[f] = load_rgb(f)
            if sha(f) != s['sha256']:
                bad.append(f'{name}: {f} hash changed')
        x, y = s['at']
        px = imgs[f][y, x].tolist()
        if px != s['rgb']:
            bad.append(f'{name}: pixel ({x},{y}) in {f} is {px}, token says {s["rgb"]}')
        if s['hex'] != '#%02X%02X%02X' % tuple(s['rgb']):
            bad.append(f'{name}: hex does not match rgb')
        if s['oklch'] != fmt_oklch(s['rgb']):
            bad.append(f'{name}: oklch does not match rgb')
    rep = json.loads((ROOT / 'tools/data/brand-report.json').read_text())
    for f, v in rep['logoPng']['outputs'].items():
        if sha(f) != v:
            bad.append(f'{f}: hash differs from the report')
    if not rep.get('premultiplied'):
        bad.append('logo was not resized premultiplied')
    if rep['logoPng']['pureBlackWhereTransparent'] != rep['logoPng']['transparent']:
        bad.append('report disagrees with the transparent-pixel finding')
    for h, f in rep['logoPng']['fringe'].items():
        if f['premultipliedMinLuma'] < 100 or f['naiveMinLuma'] > 20:
            bad.append(f'logo-{h}: dark fringe remains (min luma {f["premultipliedMinLuma"]})')
    print('\n'.join(bad) if bad else f'verified {len(tok["swatches"])} swatches, {len(rep["logoPng"]["outputs"])} logo files')
    return 1 if bad else 0


if __name__ == '__main__':
    if '--verify' in sys.argv:
        sys.exit(verify())
    tok, rep = build_all()
    for k, v in tok['swatches'].items():
        print(k, v['hex'], v['at'], v['oklch'])
    print('light', tok['light'])
    print('dark', tok['dark'])
    print(json.dumps({k: rep['logoPng'][k] for k in ('transparent', 'pureBlackWhereTransparent', 'partialAlpha', 'bbox', 'fringe')}))
    print('favicon rects', rep['favicon'])
