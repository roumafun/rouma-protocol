import { createHash } from 'node:crypto';

const STOP = new Set(('a an and are as at be but by for from has have i if in into is it its of on or our so than that the their then there these they this to up us was we were what when which who will with you your not no do does can all any each more most other some such only own same too very just about over under again further once here how why out off while both few those them he she him her his hers me my mine am been being did doing had having would should could may might must shall').split(' '));

export const words = (s) => String(s).toLowerCase().replace(/&[a-z]+;/g, ' ').match(/[a-z0-9$]+(?:'[a-z]+)?/g) || [];
export const hash = (a, b) => createHash('sha1').update(a + ' ' + b).digest('hex').slice(0, 10);

// pairs made only of filler words carry no copy; everything else is compared
export function pairs(s) {
  const w = words(s);
  const out = [];
  for (let i = 0; i < w.length - 1; i++) {
    if (STOP.has(w[i]) && STOP.has(w[i + 1])) continue;
    out.push([w[i], w[i + 1]]);
  }
  return out;
}
export const bigrams = (s) => pairs(s).map(([a, b]) => hash(a, b));
