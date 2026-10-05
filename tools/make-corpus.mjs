// Builds tools/data/ref-2grams.json: hashed word pairs from the reference site's own copy.
// Only hashes are kept, so no reference text lives in the repo.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bigrams } from './copy-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const refDir = resolve(root, 'reference');
if (!existsSync(resolve(refDir, 'ref.js'))) {
  console.error('reference/ref.js missing; keeping the committed corpus');
  process.exit(0);
}
const js = readFileSync(resolve(refDir, 'ref.js'), 'utf8');
const start = Math.max(0, js.indexOf('function jl(') - 60000);
const app = js.slice(start);
const strings = [];
for (const m of app.matchAll(/"([^"\n]{3,})"|`([^`]{3,})`/g)) strings.push(m[1] ?? m[2]);
let html = '';
try { html = readFileSync(resolve(refDir, 'index.html'), 'utf8'); } catch { /* optional */ }
let api = '';
try { api = readFileSync(resolve(refDir, 'api-copy.txt'), 'utf8'); } catch { /* optional */ }

const set = new Set();
for (const s of [...strings, html, api]) for (const h of bigrams(s)) set.add(h);
mkdirSync(resolve(root, 'tools/data'), { recursive: true });
writeFileSync(resolve(root, 'tools/data/ref-2grams.json'), JSON.stringify([...set]));
console.log('hashed 2-grams:', set.size, 'from', strings.length, 'strings');
