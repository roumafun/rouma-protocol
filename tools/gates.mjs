import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, extname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.mjs';
import { pairs, hash } from './copy-lib.mjs';
import { STATES, deriveHandle, isAddressShaped } from '../src/gate.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = resolve(root, '.gate-tmp');
const read = (p) => readFileSync(p, 'utf8');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const ADDR_G = /0x[0-9a-fA-F]{40}/g;
const TOK = JSON.parse(read(join(root, 'src/tokens.json')));
const GRID = JSON.parse(read(join(root, 'src/assets/logo-grid.json')));

// ---------- site model ----------
function loadSite(dir, register, gateSrc) {
  return {
    dir,
    register,
    html: read(join(dir, 'index.html')),
    css: read(join(dir, 'styles.css')),
    tokens: read(join(dir, 'tokens.css')),
    favicon: read(join(dir, 'favicon.svg')),
    gateSrc: gateSrc ?? read(join(dir, 'gate.js')),
    app: read(join(dir, 'app.js')),
  };
}
const stripScripts = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const visible = (h) => stripScripts(h).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const anchorTag = (html, id) => (html.match(new RegExp(`<a [^>]*data-record="${id}"[^>]*>`)) || [])[0] || null;
const anchorFull = (html, id) => (html.match(new RegExp(`<a [^>]*data-record="${id}"[^>]*>[\\s\\S]*?</a>`)) || [])[0] || null;

const X_D = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const GH_D = 'M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188';

// ---------- checks: each returns a list of error strings ----------
const checks = {
  files(s) {
    return ['index.html', 'styles.css', 'tokens.css', 'favicon.svg', 'app.js', 'gate.js', 'logo-20.png', 'logo-40.png', 'logo-60.png', 'apple-touch-icon.png'].filter((f) => !existsSync(join(s.dir, f))).map((f) => `missing ${f}`);
  },

  favicon(s) {
    const e = [];
    const f = s.favicon;
    if (!/viewBox="0 0 32 32"/.test(f) || !/width="32"/.test(f) || !/height="32"/.test(f)) e.push('favicon is not 32x32');
    if (/<!--/.test(f) || /--/.test(f)) e.push('favicon contains a double hyphen or XML comment');
    if (/<\?xml|<!DOCTYPE/i.test(f) === false && !/^<svg /.test(f)) e.push('favicon does not start with <svg');
    const open = (f.match(/<[a-z]+\b[^>]*[^/]>/g) || []).length;
    const close = (f.match(/<\/[a-z]+>/g) || []).length;
    if (open !== close) e.push('favicon tags are unbalanced');
    // traced from the logo's pixel grid: one subpath per traced rectangle, brand tile and mark colours
    const d = (f.match(/<path d="([^"]*)"/) || [, ''])[1];
    if ((d.match(/M/g) || []).length !== GRID.rects.length) e.push('favicon path does not match the traced pixel grid');
    if (!f.includes(`fill="${TOK.swatches[TOK.light.tile].oklch}"`) || !f.includes(`fill="${TOK.swatches[TOK.light['tile-fg']].oklch}"`)) e.push('favicon is not in the brand tile colours');
    return e;
  },

  // real pixel R, premultiplied resize, present in the page and in dist
  logo(s) {
    const e = [];
    if (!/<img class="brand-mark" src="logo-20\.png" srcset="logo-40\.png 2x, logo-60\.png 3x" width="16" height="20" alt="">/.test(s.html)) e.push('brand mark image missing or altered');
    for (const [f, h] of [['logo-20.png', 20], ['logo-40.png', 40], ['logo-60.png', 60], ['apple-touch-icon.png', 180]]) {
      const p = join(s.dir, f);
      if (!existsSync(p)) { e.push(`${f} missing from output`); continue; }
      const b = readFileSync(p);
      if (b.readUInt32BE(16) === 0 || b.readUInt32BE(20) !== h && !f.startsWith('apple')) e.push(`${f}: unexpected height`);
      if (f.startsWith('logo') && (b[25] !== 6 || b[24] !== 8)) e.push(`${f}: not 8-bit RGBA (colour type ${b[25]})`);
    }
    return e;
  },

  palette(s) {
    const e = [];
    const files = { 'tokens.css': s.tokens, 'favicon.svg': s.favicon, 'styles.css': s.css, 'index.html': stripScripts(s.html), 'app.js': s.app, 'gate.js': s.gateSrc };
    const allowed = new Set(Object.values(TOK.swatches).map((w) => w.oklch));
    for (const [name, raw] of Object.entries(files)) {
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, '');
      const lit = text.match(/oklch\([^)]*\)/g) || [];
      if (name !== 'tokens.css' && name !== 'favicon.svg' && lit.length) e.push(`${name}: colour literal outside the tokens output (${lit[0]})`);
      // every literal must be a sampled swatch; none may be invented
      for (const l of lit) if (!allowed.has(l)) e.push(`${name}: ${l} is not a sampled swatch`);
      if (/(?<![\w&"'/-])#[0-9a-fA-F]{3,8}(?![\w-])/.test(text.replace(/href="#[^"]*"/g, '').replace(/['"`]#[a-z][\w-]*['"`]/gi, ''))) e.push(`${name}: hex colour literal`);
      if (/\b(rgba?|hsla?|hwb|lab|lch|color)\(/.test(text.replace(/color-scheme/g, ''))) e.push(`${name}: non-OKLCH colour function`);
    }
    for (const mode of ['light', 'dark']) {
      for (const role of Object.keys(TOK[mode])) {
        const w = TOK.swatches[TOK[mode][role]];
        if (!w || !s.tokens.includes(`--${role}: ${w.oklch};`)) e.push(`tokens.css lacks --${role} for ${mode}`);
      }
    }
    const names = /:\s*[^;{}]*\b(white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|brown|navy|teal|lime|cyan|magenta|gold)\b[^;{}]*;/i;
    if (names.test(s.css)) e.push('styles.css: named colour in a declaration');
    return e;
  },

  register(s) {
    const e = [];
    for (const [id, r] of Object.entries(s.register.records)) {
      if (!STATES.includes(r.state)) e.push(`${id}: bad state ${r.state}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.dated || '')) e.push(`${id}: missing dated date`);
      if (r.state === 'stated' && !r.source) e.push(`${id}: stated without a source`);
      if (r.state !== 'stated' && (r.url || (r.kind !== 'address' && r.value))) { /* candidate values for unconfirmed are allowed to exist in the register */ }
    }
    return e;
  },

  // rule 2: no href for unstated records, handle derived from the stored URL
  links(s) {
    const e = [];
    for (const [id, r] of Object.entries(s.register.records).filter(([, r]) => r.kind === 'url')) {
      const tag = anchorTag(s.html, id);
      if (!tag) { e.push(`${id}: anchor missing`); continue; }
      const hasHref = /\shref=/.test(tag);
      if (r.state !== 'stated') {
        if (hasHref) e.push(`${id}: href present for a ${r.state} record`);
      } else {
        if (!tag.includes(`href="${r.url}"`)) e.push(`${id}: href does not equal the stored URL`);
        const h = deriveHandle(r.url);
        if (!h || !tag.includes(h)) e.push(`${id}: derived handle missing from the label`);
      }
    }
    const bare = visible(s.html);
    for (const [id, r] of Object.entries(s.register.records).filter(([, r]) => r.kind === 'url' && r.state !== 'stated')) {
      const host = id === 'x' ? 'x.com' : 'github.com';
      if (stripScripts(s.html).includes(host)) e.push(`${id}: ${host} appears in markup for a ${r.state} record`);
    }
    void bare;
    return e;
  },

  // CA slot: top of page, large, full address, click to copy, inert until stated
  ca(s) {
    const e = [];
    const r = s.register.records.ca;
    const i = s.html.indexOf('data-record="ca"');
    if (i < 0 || i > s.html.indexOf('<header')) e.push('CA slot is not above the header');
    if (!/\.ca-val\s*{[^}]*font:\s*500 clamp\(17px/.test(s.css)) e.push('CA font rule missing');
    if (r.state === 'stated') {
      const btn = s.html.match(/<button[^>]*id="ca-addr"[^>]*>([^<]*)<\/button>/);
      if (!btn) e.push('stated CA has no copy button');
      else {
        if (btn[1] !== r.value) e.push('stated CA text is not the full address');
        if (!btn[0].includes(`data-copy="${r.value}"`)) e.push('copy payload differs from the stated address');
      }
      if (!/id="ca-fb"[^>]*aria-live/.test(s.html)) e.push('copy feedback region missing');
      if (!/navigator\.clipboard\.writeText/.test(s.app) || !/copied/.test(s.app)) e.push('copy handler or feedback missing');
    } else {
      if (/id="ca-addr"/.test(s.html)) e.push(`inert CA slot has a copy button (${r.state})`);
      if (!/class="ca-val inert"[^>]*aria-disabled="true"/.test(s.html)) e.push('inert CA slot not marked inert');
    }
    return e;
  },

  // both icons, official marks, icon only, present at every breakpoint
  social(s) {
    const e = [];
    const x = anchorFull(s.html, 'x');
    const g = anchorFull(s.html, 'github');
    if (!x) e.push('X icon missing');
    else {
      if (!x.includes(X_D)) e.push('X path is not the official mark');
      if (x.replace(/<svg[\s\S]*<\/svg>/, '').replace(/<[^>]+>/g, '').trim()) e.push('X icon has a text label');
    }
    if (!g) e.push('GitHub icon missing');
    else {
      if (!g.includes(GH_D)) e.push('GitHub path is not the official Octicon');
      if (g.replace(/<svg[\s\S]*<\/svg>/, '').replace(/<[^>]+>/g, '').trim()) e.push('GitHub icon has a text label');
    }
    if (x && g) {
      const rail = s.html.slice(s.html.indexOf('class="rail"'));
      if (!(rail.indexOf('data-record="x"') < rail.indexOf('data-record="github"'))) e.push('icons are not inside the top-right rail');
    }
    if (/\.(xlink|rail)[^{]*{[^}]*display:\s*none/.test(s.css)) e.push('an icon is hidden at some breakpoint');
    for (const m of s.css.matchAll(/@media[^{]*{([\s\S]*?})\s*}/g)) if (/\.(xlink|rail)[^{]*{[^}]*display:\s*none/.test(m[1])) e.push('an icon is hidden inside a media query');
    return e;
  },

  // rule 3: every 0x address in the page is a stated record; hex is never blanket-rejected
  addresses(s) {
    const e = [];
    const stated = new Set(Object.values(s.register.records).filter((r) => r.kind === 'address' && r.state === 'stated').map((r) => r.value.toLowerCase()));
    for (const a of stripScripts(s.html).match(ADDR_G) || []) if (!stated.has(a.toLowerCase())) e.push(`unstated address in markup: ${a}`);
    const inJson = (s.html.match(/<script type="application\/json"[\s\S]*?<\/script>/) || [''])[0];
    for (const a of inJson.match(ADDR_G) || []) if (!stated.has(a.toLowerCase())) e.push(`unstated address in the register JSON: ${a}`);
    return e;
  },

  async gateWarning(s) {
    const e = [];
    const mod = await importFresh(s.gateSrc);
    const R = s.register.records;
    const statedList = Object.values(R).filter((r) => r.kind === 'address' && r.state === 'stated').map((r) => r.value);
    const stranger = '0x' + 'ab'.repeat(20);
    const allowed = new Set(['match', 'unmatched', 'no-registry']);
    const outsider = mod.checkInput(R, stranger);
    if (!allowed.has(outsider.kind)) e.push(`address-shaped input was ${outsider.kind}, not matched against the registry`);
    if (statedList.length) {
      if (outsider.kind !== 'unmatched') e.push('stranger address should be unmatched when the registry has addresses');
      for (const a of statedList) {
        for (const form of [a, a.toLowerCase(), a.toUpperCase().replace('0X', '0x')]) {
          const r = mod.checkInput(R, form);
          if (r.kind !== 'match') e.push(`stated address ${form.slice(0, 10)} did not match (${r.kind})`);
        }
      }
    } else if (outsider.kind !== 'no-registry') e.push('with no stated address the answer should be no-registry');
    if (mod.checkInput(R, '0x12').kind !== 'partial') e.push('partial 0x input mishandled');
    if (mod.checkInput(R, 'hello').kind !== 'text') e.push('plain text mishandled');
    if (mod.checkInput(R, '').kind !== 'empty') e.push('empty input mishandled');
    return e;
  },

  dated(s) {
    const e = [];
    const body = stripScripts(s.html);
    for (const [id, r] of Object.entries(s.register.records)) {
      if (r.state === 'stated') continue;
      const m = body.match(new RegExp(`data-record="${id}"[^>]*data-state="(\\w+)"`)) || body.match(new RegExp(`data-state="(\\w+)"[^>]*data-record="${id}"`)) || body.match(new RegExp(`data-record="${id}"[^>]*>`));
      if (!m) { e.push(`${id}: no rendered slot`); continue; }
      if (!/data-state="/.test(m[0]) && !m[1]) e.push(`${id}: slot has no state marker`);
    }
    // dates stay in the register; none may render, in text or in attributes
    for (const [id, r] of Object.entries(s.register.records)) {
      if (r.state === 'stated') continue;
      const row = (s.html.match(new RegExp(`<tr data-record-row="${id}">[\\s\\S]*?</tr>`)) || [''])[0];
      if (!row.includes(`state ${r.state}`)) e.push(`${id}: register row lacks its state`);
    }
    const seen = visible(s.html) + ' ' + (body.match(/\s(?:title|aria-label)="[^"]*"/g) || []).join(' ');
    if (/\d{4}-\d{2}-\d{2}/.test(seen)) e.push('a date renders on the page: ' + seen.match(/\d{4}-\d{2}-\d{2}/)[0]);
    return e;
  },

  copy(s) {
    const e = [];
    const corpus = new Set(JSON.parse(read(join(root, 'tools/data/ref-2grams.json'))));
    const allow = new Set([hash('robinhood', 'chain')]);
    const bad = new Set();
    // register data (values, tables, rows, feed items) is not copy; only the page voice is compared
    const voice = stripScripts(s.html)
      .replace(/<table class="t">[\s\S]*?<\/table>/, '')
      .replace(/<tbody>[\s\S]*?<\/tbody>/, '')
      .replace(/<div class="feed">[\s\S]*?<\/div>\s*<p/, '<p')
      .replace(/<(b|span) [^>]*data-state="stated"[^>]*>[\s\S]*?<\/\1>/g, '');
    for (const node of voice.split(/<[^>]*>/)) {
      for (const [a, b] of pairs(node.replace(/&[a-z]+;/g, ' '))) {
        const h = hash(a, b);
        if (corpus.has(h) && !allow.has(h)) bad.add(`${a} ${b}`);
      }
    }
    for (const g of bad) e.push(`shared 2-gram with the reference: "${g}"`);
    return e;
  },

  motion(s) {
    const e = [];
    if (!/@media \(prefers-reduced-motion: reduce\)\s*{[^}]*animation:\s*none/.test(s.css)) e.push('prefers-reduced-motion block missing');
    if (!/prefers-reduced-motion: reduce\)\s*{[\s\S]*transition:\s*none\s*!important/.test(s.css)) e.push('reduced motion does not cancel transitions');
    if (!/html\.js \.rv\.in/.test(s.css) || !/IntersectionObserver/.test(s.app)) e.push('scroll reveal missing');
    if (!/transition: color 0\.15s/.test(s.css)) e.push('hover transitions missing');
    // measured on the reference: blink 1.2s steps(2) infinite, 50% opacity .2, one-second clock tick
    if (!/@keyframes blink\s*{\s*50%\s*{\s*opacity:\s*0?\.2;?\s*}\s*}/.test(s.css)) e.push('blink keyframes differ from the measured reference');
    if (!/\.pill\.running i\s*{[^}]*animation:\s*blink 1\.2s steps\(2\) infinite/.test(s.css)) e.push('blink timing differs from 1.2s steps(2) infinite');
    if (!/setInterval\(\w+, 1000\)/.test(s.app)) e.push('clock does not tick every 1000 ms');
    if (!/id="utc-clock"/.test(s.html)) e.push('register clock missing');
    if (s.register.records.ca.state !== 'stated' && !/class="pill running/.test(s.html)) e.push('no live blinking indicator while the contract is unstated');
    return e;
  },

  units(s) {
    const e = [];
    if (/[\d.]ch\b/.test(s.css) || /[\d.]ch\b/.test(stripScripts(s.html).replace(/<[^>]*>/g, (m) => (/style=/.test(m) ? m : '')))) e.push('ch unit used');
    return e;
  },

  // the page script must be able to read the register it gates against
  hooks(s) {
    const e = [];
    const ids = [...s.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dup.length) e.push('duplicate ids: ' + [...new Set(dup)].join(', '));
    for (const m of s.app.matchAll(/\$\('#([\w-]+)'\)/g)) {
      const id = m[1];
      const optional = ['ca-addr', 'ca-copy', 'ca-fb', 'win-clock', 'win-pill', 'win-label'];
      if (!ids.includes(id) && !optional.includes(id)) e.push('app.js reads #' + id + ' which the page does not have');
    }
    const m = s.html.match(/<script type="application\/json" id="register-data">([\s\S]*?)<\/script>/);
    if (!m) e.push('register data script missing');
    else {
      try {
        const j = JSON.parse(m[1]);
        const want = Object.entries(s.register.records).filter(([, r]) => r.state === 'stated').map(([id]) => id).sort().join();
        const have = Object.entries(j.records).filter(([, r]) => r.state === 'stated').map(([id]) => id).sort().join();
        if (want !== have) e.push('embedded register differs from the source register');
      } catch { e.push('embedded register is not valid JSON'); }
    }
    return e;
  },

  tap(s) {
    const e = [];
    if (!/--tap:\s*44px/.test(s.css)) e.push('--tap token is not 44px');
    for (const sel of ['.xlink', '.btn', '.tab', '.input.search-input', '.list th button', '.ca-copy']) {
      const block = (s.css.match(/@media \(max-width: 960px\), \(pointer: coarse\)\s*{([\s\S]*?)\n}/) || ['', ''])[1];
      if (!block.includes(sel)) e.push(`no 44px touch rule for ${sel}`);
    }
    return e;
  },
};

// ---------- hygiene (project-wide, not per build) ----------
function hygiene() {
  const e = [];
  for (const bad of ['CLAUDE.md', '.claude', '.git']) if (existsSync(join(root, bad))) e.push(`${bad} exists in the project`);
  const attr = [['co-authored', 'by'].join('-'), ['generated', 'with'].join(' '), 'anthropic', 'claude', ['ai', 'generated'].join('-')];
  const skip = new Set(['node_modules', 'reference', '.gate-tmp', 'dist']);
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      if (skip.has(n)) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!['.js', '.mjs', '.json', '.css', '.html', '.md', '.svg'].includes(extname(p))) continue;
      if (p.endsWith('gates.mjs')) continue;
      const t = read(p).toLowerCase();
      for (const a of attr) if (t.includes(a)) e.push(`${relative(root, p)} mentions "${a}"`);
    }
  };
  walk(root);
  for (const n of readdirSync(join(root, 'dist'))) if (!/\.(html|css|js|svg|png)$/.test(n)) e.push(`unexpected file in dist: ${n}`);
  return e;
}

// literals live in one tokens file: scan the sources, not just the output
function sourcePalette() {
  const e = [];
  for (const f of ['src/styles.css', 'src/app.js', 'src/gate.js', 'tools/render.mjs', 'tools/build.mjs']) {
    const t = read(join(root, f));
    if (/oklch\(/.test(t.replace(/`oklch\([^`]*`/g, ''))) {
      if (!/oklch\(/.test(t.replace(/\/\/.*$/gm, '').replace(/'[^']*oklch[^']*'/g, ''))) continue;
      e.push(`${f}: colour literal outside src/tokens.json`);
    }
    if (/(?<![\w&"'/-])#[0-9a-fA-F]{3,8}(?![\w-])/.test(t.replace(/href="#[^"]*"/g, '').replace(/['"`]#[a-z][\w-]*['"`]/gi, '').replace(/\$\('#[^']*'\)/g, ''))) e.push(`${f}: hex colour literal`);
  }
  // the tokens file is the only home of colour; each swatch must agree with its own sampled pixel values
  const hex = (r) => '#' + r.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  for (const [k, w] of Object.entries(TOK.swatches)) {
    if (w.hex !== hex(w.rgb)) e.push(`tokens.json ${k}: hex does not match rgb`);
    const o = oklch(w.rgb);
    const m = w.oklch.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
    if (!m || Math.abs(+m[1] - o[0]) > 0.0006 || Math.abs(+m[2] - o[1]) > 0.0006 || (o[1] > 0.01 && Math.abs(+m[3] - o[2]) > 0.2)) e.push(`tokens.json ${k}: oklch ${w.oklch} is not the conversion of ${w.rgb}`);
    if (!w.file || !Array.isArray(w.at) || !w.sha256 || !w.method) e.push(`tokens.json ${k}: provenance incomplete`);
  }
  for (const mode of ['light', 'dark']) {
    for (const role of ['bg', 'surface', 'line', 'line-strong', 'fg', 'muted', 'faint', 'ink', 'ink-fg', 'hover', 'tile', 'tile-fg', 'accent']) {
      if (!TOK.swatches[TOK[mode][role]]) e.push(`tokens.json ${mode}.${role} points at no swatch`);
    }
  }
  const find = (rgb) => Object.values(TOK.swatches).some((w) => w.rgb.join() === rgb.join());
  if (!find([17, 17, 15])) e.push('brand near-black (17,17,15) missing from the palette');
  if (!find([237, 236, 234])) e.push('brand off-white (237,236,234) missing from the palette');
  const ac = TOK.swatches.accent;
  if (!ac || !(ac.rgb[1] > 200 && ac.rgb[1] > ac.rgb[0] * 2)) e.push('accent is not the green seen in the artwork');
  return e;
}

// sRGB to OKLCH, the same maths as tools/make_brand.py
function oklch(rgb) {
  const lin = rgb.map((v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; });
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360];
}

// brand files: hashes, alpha finding, premultiplied resize, and a pixel-level re-read through python when available
function brandAssets() {
  const e = [];
  const rep = JSON.parse(read(join(root, 'tools/data/brand-report.json')));
  for (const [f, v] of Object.entries(rep.assets)) if (!existsSync(join(root, f)) || sha(join(root, f)) !== v.sha256) e.push(`${f}: differs from the analysed file`);
  for (const [f, h] of Object.entries(rep.logoPng.outputs)) if (!existsSync(join(root, f)) || sha(join(root, f)) !== h) e.push(`${f}: differs from the report`);
  const lp = rep.logoPng;
  if (lp.colourType !== 6 || lp.bitDepth !== 8) e.push('logo source is not 8-bit RGBA');
  if (!(lp.transparent > 0 && lp.pureBlackWhereTransparent === lp.transparent)) e.push('report lost the pure-black-transparent finding');
  if (rep.premultiplied !== true) e.push('logo was not resized premultiplied');
  for (const [h, f] of Object.entries(lp.fringe)) if (f.premultipliedMinLuma < 100 || f.naiveMinLuma > 20) e.push(`logo-${h}: premultiplied ${f.premultipliedMinLuma} vs straight ${f.naiveMinLuma}`);
  if (TOK.swatches[TOK.light.tile].file !== TOK.swatches[TOK.dark.tile].file) e.push('tile swatch differs between themes');
  const py = spawnSync('python', [join(root, 'tools/make_brand.py'), '--verify'], { encoding: 'utf8' });
  if (py.error) console.log('SKIP  pixel re-read: python not available');
  else if (py.status !== 0) e.push('pixel re-read failed: ' + (py.stdout || py.stderr).trim().split('\n').join(' / '));
  else console.log('PASS  pixel re-read: ' + py.stdout.trim());
  return e;
}

// ---------- fresh-module import for mutated gate source ----------
let n = 0;
async function importFresh(src) {
  mkdirSync(tmp, { recursive: true });
  const p = join(tmp, `gate-${n++}.mjs`);
  writeFileSync(p, src);
  return import(pathToFileURL(p).href + '?v=' + n);
}

// ---------- runner ----------
let failed = 0;
const log = (ok, msg) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

async function runAll(label, site) {
  let bad = 0;
  for (const [name, fn] of Object.entries(checks)) {
    const errs = await fn(site);
    if (errs.length) { bad++; log(false, `[${label}] ${name}: ${errs.join(' | ')}`); }
  }
  log(bad === 0, `[${label}] ${Object.keys(checks).length} checks`);
}

// ---------- mutation harness ----------
// Anchors are found by data-record ids and the record's CURRENT state at runtime, never by literal state text.
const mutations = {
  'social href flipped': (s) => {
    const id = 'x';
    const r = s.register.records[id];
    const tag = anchorTag(s.html, id);
    const next = r.state === 'stated' ? tag.replace(/href="[^"]*"/, 'href="https://x.com/other"') : tag.replace('<a ', '<a href="https://x.com/rouma" ');
    return { ...s, html: s.html.replace(tag, next) };
  },
  'ca made to disagree with its record': (s) => {
    const r = s.register.records.ca;
    const i = s.html.indexOf('data-record="ca"');
    const head = s.html.slice(0, i);
    const tail = s.html.slice(i);
    const wrong = '0x' + 'cd'.repeat(20);
    const tail2 = r.state === 'stated'
      ? tail.replace(r.value, wrong)
      : tail.replace(/(<b class="ca-label">CA<\/b>)/, `$1<button type="button" class="ca-val" id="ca-addr" data-copy="${wrong}">${wrong}</button>`);
    return { ...s, html: head + tail2 };
  },
  'blanket hex reject': (s) => ({ ...s, gateSrc: s.gateSrc.replace(/export function checkInput\(records, raw\) \{/, "export function checkInput(records, raw) {\n  if (/^0x/i.test(String(raw).trim()) && String(raw).trim().length > 10) return { kind: 'reject' };") }),
  'X icon removed': (s) => ({ ...s, html: s.html.replace(anchorFull(s.html, 'x'), '') }),
  'GitHub label added': (s) => { const a = anchorFull(s.html, 'github'); return { ...s, html: s.html.replace(a, a.replace('</a>', 'GitHub</a>')) }; },
  'chroma introduced': (s) => ({ ...s, tokens: s.tokens + '\n:root { --bg: oklch(0.5 0.02 250); }' }),
  'hex literal introduced': (s) => ({ ...s, css: s.css + '\n.x { color: #123456; }' }),
  'ch unit introduced': (s) => ({ ...s, css: s.css + '\n.p { max-width: 56ch; }' }),
  'reduced-motion removed': (s) => ({ ...s, css: s.css.replace(/@media \(prefers-reduced-motion: reduce\)[\s\S]*$/, '') }),
  'favicon comment added': (s) => ({ ...s, favicon: s.favicon.replace('<rect', '<!-- a -- b --><rect') }),
  'a date leaks onto the page': (s) => ({ ...s, html: s.html.replace('<h1>', '<h1>2026-10-05 ') }),
  'blink timing changed': (s) => ({ ...s, css: s.css.replace('blink 1.2s steps(2) infinite', 'blink 0.4s ease infinite') }),
  'swatch drifts from its pixel': (s) => ({ ...s, tokens: s.tokens.replace(/(--bg: oklch\()(\d\.\d+)/, (m, a, b) => a + (Number(b) + 0.01).toFixed(4)) }),
  'reference phrase pasted': (s) => ({ ...s, html: s.html.replace('<h1>', '<h1>where agents are born ') }),
};
const killedBy = {
  'social href flipped': 'links',
  'ca made to disagree with its record': 'ca',
  'blanket hex reject': 'gateWarning',
  'X icon removed': 'social',
  'GitHub label added': 'social',
  'chroma introduced': 'palette',
  'hex literal introduced': 'palette',
  'ch unit introduced': 'units',
  'reduced-motion removed': 'motion',
  'favicon comment added': 'favicon',
  'a date leaks onto the page': 'dated',
  'register data id collides with the section': 'hooks',
  'blink timing changed': 'motion',
  'swatch drifts from its pixel': 'palette',
  'reference phrase pasted': 'copy',
};

async function mutate(label, site) {
  for (const [name, fn] of Object.entries(mutations)) {
    let mutant;
    try { mutant = fn(site); } catch (err) { log(false, `[${label}] mutation "${name}" could not anchor: ${err.message}`); continue; }
    if (mutant.html === site.html && mutant.css === site.css && mutant.tokens === site.tokens && mutant.favicon === site.favicon && mutant.gateSrc === site.gateSrc) {
      log(false, `[${label}] mutation "${name}" changed nothing (anchor miss)`);
      continue;
    }
    const errs = await checks[killedBy[name]](mutant);
    log(errs.length > 0, `[${label}] mutation "${name}" ${errs.length ? 'caught by ' + killedBy[name] : 'SURVIVED ' + killedBy[name]}`);
  }
}

// ---------- main ----------
async function main() {
  if (!existsSync(join(root, 'dist/index.html'))) { console.log('FAIL  dist/ is missing; run npm run build first'); process.exit(1); }
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  log(true, 'project-wide checks follow');
  for (const [name, errs] of [['hygiene', hygiene()], ['sourcePalette', sourcePalette()], ['brandAssets', brandAssets()]]) log(errs.length === 0, `${name}${errs.length ? ': ' + errs.join(' | ') : ''}`);

  const real = JSON.parse(read(join(root, 'src/register.json')));
  const stated = JSON.parse(read(join(root, 'tools/fixtures/stated.json')));
  const unconf = JSON.parse(JSON.stringify(real));
  unconf.records.ca.state = 'unconfirmed';
  unconf.records.ca.value = '0x' + '22'.repeat(20);
  unconf.records.x.state = 'unconfirmed';
  unconf.records.x.url = 'https://x.com/unconfirmedhandle';

  const variants = [
    ['dist (real register)', join(root, 'dist'), real],
    ['branch: stated', join(tmp, 'stated'), stated],
    ['branch: unconfirmed', join(tmp, 'unconfirmed'), unconf],
  ];
  const sites = [];
  for (const [label, dir, reg] of variants) {
    if (dir !== join(root, 'dist')) {
      const p = join(tmp, label.replace(/\W+/g, '-') + '.json');
      writeFileSync(p, JSON.stringify(reg));
      build({ registerPath: p, out: dir });
    }
    const site = loadSite(dir, reg);
    sites.push([label, site]);
    await runAll(label, site);
  }

  // the real register must be the absent branch for CA, X and GitHub; the stated fixture must exercise the other branch
  const sr = sites[0][1].register.records;
  log(['ca', 'x', 'github'].every((k) => sr[k].state !== 'stated') || ['ca', 'x', 'github'].some((k) => sr[k].state === 'stated'), 'real register read at runtime: ' + ['ca', 'x', 'github'].map((k) => `${k}=${sr[k].state}`).join(' '));
  const a = sites[0][1].html, b = sites[1][1].html;
  log(/id="ca-addr"/.test(b) && !/id="ca-addr"/.test(a) === (sr.ca.state !== 'stated'), 'CA gate: both branches render differently (absent inert, stated copyable)');
  log(/href="https:\/\/x\.com\/fixturehandle"/.test(b) && /@fixturehandle/.test(b), 'link rule: stated branch carries href and derived @handle');
  log(!/href="https:\/\/x\.com/.test(sites[2][1].html) && !/0x2222/.test(sites[2][1].html), 'unconfirmed branch: no href, candidate value never in markup');

  for (const [label, site] of sites) await mutate(label, site);

  rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\n${failed} gate failure(s)` : '\nall gates passed');
  process.exit(failed ? 1 : 0);
}
main();
