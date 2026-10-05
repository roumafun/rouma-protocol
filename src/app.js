import { checkInput, isLive } from './gate.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let register = { records: {} };
try { register = JSON.parse($('#register-data').textContent); } catch { /* page still renders from markup */ }
const R = register.records;

// theme
$('#theme')?.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('rouma-theme', next); } catch { /* storage unavailable */ }
});

// click to copy the contract address (present only when the record is stated)
const addr = $('#ca-addr');
if (addr) {
  const fb = $('#ca-fb');
  let timer;
  const copy = async () => {
    const text = addr.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    fb.textContent = 'copied';
    clearTimeout(timer);
    timer = setTimeout(() => { fb.textContent = ''; }, 1500);
  };
  addr.addEventListener('click', copy);
  $('#ca-copy').addEventListener('click', copy);
}

// exponential backoff: success keeps the base delay, each failure doubles it up to a ceiling, with jitter
function poll(fn, base, max) {
  let delay = base;
  let timer = 0;
  let parked = false;
  const run = async () => {
    parked = false;
    if (document.hidden) { parked = true; timer = setTimeout(run, base); return; }
    try { await fn(); delay = base; } catch { delay = Math.min(max, delay * 2); }
    timer = setTimeout(run, delay * (0.85 + Math.random() * 0.3));
  };
  // a hidden tab does not poll; showing it again refreshes at once instead of waiting out the interval
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && parked) { clearTimeout(timer); run(); }
  });
  run();
}

async function getJson(url, init, ms) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// live pairs board
const body = $('#board-body');
const note = $('#gate-note');
const say = (t) => { note.textContent = t; note.hidden = !t; };
let pairs = [];
let query = '';
const view = { tab: 'vol', col: null, dir: -1 };
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
const money = (v) => (v != null && isFinite(Number(v)) ? usd.format(Number(v)) : '–');
const price = (v) => {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return '–';
  return '$' + (n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n >= 0.0001 ? n.toFixed(6) : n.toExponential(2));
};
const ago = (ms) => {
  if (!ms) return '–';
  const s = (Date.now() - ms) / 1000;
  return s < 3600 ? Math.max(1, Math.floor(s / 60)) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd';
};
const h1 = (p) => ((p.txns && p.txns.h1 && p.txns.h1.buys) || 0) + ((p.txns && p.txns.h1 && p.txns.h1.sells) || 0);
const keyOf = {
  name: (p) => p.baseToken.symbol.toLowerCase(),
  price: (p) => Number(p.priceUsd) || 0,
  vol: (p) => (p.volume && p.volume.h24) || 0,
  liq: (p) => (p.liquidity && p.liquidity.usd) || 0,
  age: (p) => -(p.pairCreatedAt || 0),
};
const tabKey = { vol: [keyOf.vol, -1], new: [keyOf.age, 1], active: [h1, -1] };

const emptyRow = (text, state) => {
  const tr = el('tr');
  const td = el('td', 'empty', text);
  td.colSpan = 5;
  td.dataset.state = state;
  tr.appendChild(td);
  return tr;
};

const logoFor = (p) => {
  const box = el('span', 'logo');
  const letter = () => { box.textContent = p.baseToken.symbol.slice(0, 1).toUpperCase(); };
  let u = null;
  try { u = new URL(p.info && p.info.imageUrl); } catch { /* no logo */ }
  if (u && u.protocol === 'https:') {
    u.searchParams.set('width', '64');
    u.searchParams.set('height', '64');
    const img = new Image(24, 24);
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => { img.remove(); letter(); };
    img.src = u.href;
    box.appendChild(img);
  } else {
    letter();
  }
  return box;
};

const rowFor = (p, i) => {
  const tr = el('tr', 'pair-row');
  tr.style.animationDelay = Math.min(i, 12) * 30 + 'ms';
  const a = el('td');
  const tok = el('div', 'tok');
  tok.appendChild(logoFor(p));
  const sym = p.url && p.url.startsWith('https://dexscreener.com/') ? el('a', 'pair-link', p.baseToken.symbol) : el('b', null, p.baseToken.symbol);
  if (sym.tagName === 'A') { sym.href = p.url; sym.target = '_blank'; sym.rel = 'noopener noreferrer'; }
  tok.appendChild(sym);
  tok.appendChild(el('span', null, '/ ' + p.quoteToken.symbol));
  a.appendChild(tok);
  tr.appendChild(a);
  const num = (cls, text) => { tr.appendChild(el('td', cls, text)); };
  num('r num', price(p.priceUsd));
  num('r num', money(p.volume && p.volume.h24));
  num('r num hide-sm', money(p.liquidity && p.liquidity.usd));
  num('r num muted hide-sm', ago(p.pairCreatedAt));
  return tr;
};

const render = () => {
  if (!body || !pairs.length) return;
  const q = query.toLowerCase();
  let list = q ? pairs.filter((p) => (p.baseToken.symbol + ' ' + p.baseToken.name + ' ' + p.quoteToken.symbol).toLowerCase().includes(q)) : pairs;
  const [kf, dir] = view.col ? [keyOf[view.col], view.dir] : tabKey[view.tab];
  list = [...list].sort((x, y) => { const a = kf(x), b = kf(y); return (a < b ? -1 : a > b ? 1 : 0) * dir; });
  body.replaceChildren(...(list.length ? list.slice(0, 25).map(rowFor) : [emptyRow('No pair matches "' + query + '".', 'empty')]));
};

$$('.tab').forEach((t) => t.addEventListener('click', () => {
  view.tab = t.dataset.tab;
  view.col = null;
  $$('.tab').forEach((o) => { const on = o === t; o.classList.toggle('on', on); o.setAttribute('aria-selected', String(on)); });
  $$('#board th').forEach((o) => { o.classList.remove('on'); o.setAttribute('aria-sort', 'none'); $('.arrow', o).textContent = '↕'; });
  render();
}));

$$('#board th button').forEach((b) => b.addEventListener('click', () => {
  const th = b.parentElement;
  const col = th.dataset.col;
  view.dir = view.col === col ? -view.dir : col === 'name' ? 1 : -1;
  view.col = col;
  $$('.tab').forEach((o) => { o.classList.remove('on'); o.setAttribute('aria-selected', 'false'); });
  $$('#board th').forEach((o) => { o.classList.remove('on'); o.setAttribute('aria-sort', 'none'); $('.arrow', o).textContent = '↕'; });
  th.classList.add('on');
  th.setAttribute('aria-sort', view.dir === 1 ? 'ascending' : 'descending');
  $('.arrow', th).textContent = view.dir === 1 ? '↑' : '↓';
  render();
}));

// address gate: address-shaped input is matched against the stated register, never rejected for being hex
$('#search')?.addEventListener('input', (e) => {
  const res = checkInput(R, e.target.value);
  query = res.kind === 'text' ? res.q : '';
  switch (res.kind) {
    case 'empty': say(''); break;
    case 'match': say(`Match: ${res.label} (${res.id}) is stated in the register.`); break;
    case 'unmatched': say('Address-shaped, but it is not in the stated register. The board does not vouch for it.'); break;
    case 'no-registry': say('No contract address has been stated yet, so there is nothing to match against.'); break;
    case 'partial': say(`Partial 0x value: ${res.have} of 40 hex characters.`); break;
    default: say('');
  }
  render();
});

const dex = R['src.dexscreener'];
if (body) {
  if (dex && dex.state === 'stated' && dex.value) {
    poll(async () => {
      const got = await Promise.allSettled(['ETH', 'USD', 'robinhood'].map((q) => getJson(dex.value + '?q=' + encodeURIComponent(q), {}, 8000)));
      const ok = got.filter((r) => r.status === 'fulfilled');
      if (!ok.length) {
        if (!pairs.length) body.replaceChildren(emptyRow('–  Pairs are unavailable. Retrying.', 'error'));
        throw new Error('pairs');
      }
      const map = new Map();
      for (const r of ok) for (const p of r.value.pairs || []) if (p.chainId === dex.slug && p.baseToken && p.quoteToken) map.set(p.pairAddress, p);
      pairs = [...map.values()];
      if (!pairs.length) body.replaceChildren(emptyRow('No pairs reported for this chain yet.', 'empty'));
      render();
    }, 30000, 240000);
  } else {
    body.replaceChildren(emptyRow('–  No pair source is stated.', 'absent'));
  }
}

// launch window clock (ticks only when a window is stated)
const win = $('[data-record="window"]');
if (win && win.dataset.start && R.window) {
  const rec = R.window;
  const clock = $('#win-clock');
  const pill = $('#win-pill');
  const label = $('#win-label');
  const p2 = (n) => String(n).padStart(2, '0');
  const fmt = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${p2(Math.floor(t / 3600))}:${p2(Math.floor((t % 3600) / 60))}:${p2(t % 60)}`; };
  const tick = () => {
    const now = Date.now();
    const live = isLive(rec, now);
    pill.classList.toggle('running', live);
    label.textContent = live ? 'open' : now < Date.parse(rec.value.start) ? 'scheduled' : 'closed';
    clock.textContent = live ? fmt(Date.parse(rec.value.end) - now) : now < Date.parse(rec.value.start) ? fmt(Date.parse(rec.value.start) - now) : fmt(0);
  };
  tick();
  setInterval(tick, 1000);
}

// scroll reveal and counters; with reduced motion everything lands instantly
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const count = (el) => {
  const end = Number(el.dataset.count);
  if (still || !isFinite(end)) return;
  const dec = (el.dataset.count.split('.')[1] || '').length;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 900);
    el.textContent = (end * (1 - Math.pow(1 - k, 3))).toFixed(dec);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
const targets = $$('main > section, footer.foot');
if (still || !('IntersectionObserver' in window)) {
  targets.forEach((t) => t.classList.add('in'));
} else {
  targets.forEach((t, i) => { t.classList.add('rv'); t.style.transitionDelay = Math.min(i, 4) * 40 + 'ms'; });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    $$('[data-count]', e.target).forEach(count);
    io.unobserve(e.target);
  }), { threshold: 0.08 });
  targets.forEach((t) => io.observe(t));
}

// chain health and block ticker: Connecting, Live or Offline, straight from the stated RPC
const rpc = R.chain && R.chain.state === 'stated' ? R.chain.value : null;
if (rpc && $('#rpc-pill')) {
  const pill = $('#rpc-pill');
  const label = $('#rpc-label');
  const blockEl = $('#live-block');
  const gasEl = $('#live-gas');
  const set = (up, text) => { pill.classList.toggle('running', up); label.textContent = text; };
  const bump = (e) => { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); };
  const rpcBody = JSON.stringify([
    { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
    { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] },
    { jsonrpc: '2.0', id: 3, method: 'eth_gasPrice', params: [] },
  ]);
  const gwei = (wei) => {
    const g = Number(wei) / 1e9;
    return g >= 100 ? g.toFixed(1) : g >= 1 ? g.toFixed(2) : g.toFixed(4);
  };
  let fails = 0;
  let everUp = false;
  poll(async () => {
    try {
      const out = await getJson(rpc.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: rpcBody }, 4000);
      const by = Object.fromEntries(out.map((o) => [o.id, o.result]));
      if (BigInt(by[1]) !== BigInt(rpc.id)) throw new Error('wrong chain');
      const block = BigInt(by[2]).toLocaleString('en-US');
      if (blockEl.textContent !== block) { blockEl.textContent = block; bump(blockEl); }
      const g = gwei(BigInt(by[3]));
      if (gasEl.textContent !== g) { gasEl.textContent = g; bump(gasEl); }
      fails = 0;
      everUp = true;
      set(true, 'Live');
    } catch (err) {
      fails++;
      blockEl.textContent = '–';
      gasEl.textContent = '–';
      set(false, everUp || fails >= 2 ? 'Offline' : 'Connecting');
      throw err;
    }
  }, 2000, 30000);
}

// TVL from DefiLlama, matched on the chain id rather than a name
const llama = R['src.llama'];
if (llama && llama.state === 'stated' && llama.value && R.chain && R.chain.state === 'stated' && $('#live-tvl')) {
  const tvlEl = $('#live-tvl');
  poll(async () => {
    try {
      const chains = await getJson(llama.value, {}, 10000);
      const c = chains.find((x) => Number(x.chainId) === R.chain.value.id);
      if (!c || !isFinite(Number(c.tvl))) throw new Error('no tvl');
      const t = usd.format(Number(c.tvl));
      if (tvlEl.textContent !== t) { tvlEl.textContent = t; tvlEl.classList.remove('bump'); void tvlEl.offsetWidth; tvlEl.classList.add('bump'); }
    } catch (err) {
      tvlEl.textContent = '–';
      throw err;
    }
  }, 300000, 1800000);
}

// register clock: one tick per second
const utc = $('#utc-clock');
if (utc) {
  const stamp = () => { utc.textContent = new Date().toISOString().slice(11, 19); };
  stamp();
  setInterval(stamp, 1000);
}

// active nav link
const links = $$('nav.main a');
const secs = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
const mark = () => {
  const y = scrollY + 160;
  let cur = null;
  secs.forEach((s) => { if (s.offsetTop <= y) cur = s.id; });
  links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
};
addEventListener('scroll', mark, { passive: true });
mark();
