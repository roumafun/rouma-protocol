import { mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render } from './render.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = ['logo-20.png', 'logo-40.png', 'logo-60.png', 'apple-touch-icon.png'];

const colour = (tokens, mode, role) => tokens.swatches[tokens[mode][role]].oklch;

export function tokensCss(tokens) {
  const block = (mode) => Object.keys(tokens[mode]).map((r) => `--${r}: ${colour(tokens, mode, r)};`).join(' ');
  const prov = Object.entries(tokens.swatches)
    .map(([k, s]) => ` * ${k.padEnd(8)} ${s.hex}  rgb(${s.rgb.join(' ')})  ${s.file} @ ${s.at.join(',')}  ${s.method}`)
    .join('\n');
  return `/* Generated from src/tokens.json. Every colour is a real pixel of the brand artwork:
${prov}
 */
:root { ${block('light')} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${block('dark')} color-scheme: dark; } }
:root[data-theme="dark"] { ${block('dark')} color-scheme: dark; }
:root[data-theme="light"] { color-scheme: light; }
`;
}

// 32x32, geometric, traced from the logo's real pixel grid (src/assets/logo-grid.json). No XML comments.
export function faviconSvg(tokens, grid) {
  const tile = colour(tokens, 'light', 'tile');
  const mark = colour(tokens, 'light', 'tile-fg');
  const x0 = grid.xEdges[0], y0 = grid.yEdges[0];
  const gw = grid.xEdges.at(-1) - x0, gh = grid.yEdges.at(-1) - y0;
  const s = 20 / gh;
  const ox = (32 - gw * s) / 2, oy = (32 - gh * s) / 2;
  const X = (x) => +(ox + (x - x0) * s).toFixed(2);
  const Y = (y) => +(oy + (y - y0) * s).toFixed(2);
  const d = grid.rects
    .map(([x, y, w, h]) => {
      const a = X(x), b = Y(y), c = X(x + w), e = Y(y + h);
      return `M${a} ${b}H${c}V${e}H${a}Z`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
<rect width="32" height="32" rx="7" fill="${tile}"/>
<path d="${d}" fill="${mark}" shape-rendering="crispEdges"/>
</svg>
`;
}

export function build({ registerPath = resolve(root, 'src/register.json'), out = resolve(root, 'dist') } = {}) {
  const tokens = JSON.parse(readFileSync(resolve(root, 'src/tokens.json'), 'utf8'));
  const grid = JSON.parse(readFileSync(resolve(root, 'src/assets/logo-grid.json'), 'utf8'));
  const register = JSON.parse(readFileSync(registerPath, 'utf8'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'index.html'), render(register));
  writeFileSync(resolve(out, 'tokens.css'), tokensCss(tokens));
  writeFileSync(resolve(out, 'favicon.svg'), faviconSvg(tokens, grid));
  for (const f of ['styles.css', 'app.js', 'gate.js']) copyFileSync(resolve(root, 'src', f), resolve(out, f));
  for (const f of ASSETS) copyFileSync(resolve(root, 'src/assets', f), resolve(out, f));
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--register');
  const o = process.argv.indexOf('--out');
  const out = build({
    registerPath: i > 0 ? resolve(process.argv[i + 1]) : undefined,
    out: o > 0 ? resolve(process.argv[o + 1]) : undefined,
  });
  console.log('built ->', out);
}
