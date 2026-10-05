import { deriveHandle, isAddressShaped } from '../src/gate.js';

// Official X mark.
const X_PATH = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
// Official GitHub Octicon mark-github-16 (primer/octicons).
const GH_PATH = 'M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dash = '–';

export function render(register) {
  const R = register.records;
  const stated = (id) => R[id].state === 'stated';
  const dated = (id) => `${R[id].state === 'stated' ? 'Stated' : R[id].state === 'unconfirmed' ? 'Unconfirmed' : 'Not stated'}`;

  const fig = (id) =>
    stated(id)
      ? `<b data-record="${id}" data-state="stated"${R[id].value !== '' && !isNaN(Number(R[id].value)) ? ` data-count="${esc(R[id].value)}"` : ''}>${esc(R[id].value)}</b>`
      : `<b data-record="${id}" data-state="${R[id].state}" title="${dated(id)}">${dash}<span class="sr"> ${dated(id)}</span></b>`;

  // contract slot
  const ca = R.ca;
  const caSlot = ca.state === 'stated' && isAddressShaped(ca.value)
    ? `<section class="ca-bar" aria-label="Token contract slot" data-record="ca" data-state="stated">
  <div class="wrap ca-inner">
    <b class="ca-label">CA</b>
    <button type="button" class="ca-val" id="ca-addr" data-copy="${esc(ca.value)}" title="Click to copy">${esc(ca.value)}</button>
    <button type="button" class="ca-copy" id="ca-copy" aria-label="Copy contract address">copy</button>
    <span class="ca-fb" id="ca-fb" role="status" aria-live="polite"></span>
  </div>
</section>`
    : `<section class="ca-bar" aria-label="Token contract slot" data-record="ca" data-state="${ca.state}">
  <div class="wrap ca-inner">
    <b class="ca-label">CA</b>
    <span class="pill running ca-wait"><i></i>awaiting</span>
    <span class="ca-val inert" aria-disabled="true">${ca.state === 'unconfirmed' ? 'Unconfirmed' : 'Not stated yet'}</span>
  </div>
</section>`;

  // social icons: href only for stated records, handle derived from the stored URL
  const social = (id, name, path, vb) => {
    const r = R[id];
    const svg = `<svg viewBox="${vb}" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="${path}"/></svg>`;
    if (r.state === 'stated' && r.url) {
      const h = deriveHandle(r.url);
      return `<a class="xlink" data-record="${id}" data-state="stated" href="${esc(r.url)}" target="_blank" rel="noreferrer" aria-label="${name}${h ? ' ' + esc(h) : ''}">${svg}</a>`;
    }
    return `<a class="xlink" data-record="${id}" data-state="${r.state}" role="link" aria-disabled="true" aria-label="${name}, ${dated(id).toLowerCase()}" title="${name} · ${dated(id)}">${svg}</a>`;
  };

  // launch window banner
  const win = R.window;
  const winLive = win.state === 'stated' && win.value;
  const nursery = `<div class="nursery" data-record="window" data-state="${win.state}" ${winLive ? `data-start="${esc(win.value.start)}" data-end="${esc(win.value.end)}"` : ''}>
  <span class="n-text"><b>Launch window.</b> ${winLive ? 'Tokens listed while it is open get picked up by the board.' : 'No window has been announced. This slot opens once one is stated.'}</span>
  <span class="n-meta">
    <span class="pill" id="win-pill"><i></i><span id="win-label">${winLive ? 'scheduled' : 'unscheduled'}</span></span>
    <span class="n-clock" id="win-clock">${winLive ? '--:--:--' : '--:--:--'}</span>
    
  </span>
</div>`;

  // board rows: skeletons until the live pairs arrive
  const rows = Array.from({ length: 6 }, () => '<tr class="sk" aria-hidden="true"><td><span class="sk-dot"></span><span class="sk-b w1"></span></td><td class="r"><span class="sk-b w2"></span></td><td class="r"><span class="sk-b w2"></span></td><td class="r hide-sm"><span class="sk-b w2"></span></td><td class="r hide-sm"><span class="sk-b w3"></span></td></tr>').join('');

  const A = R.activity;
  const feed = A.state === 'stated' && Array.isArray(A.value) && A.value.length
    ? A.value.map((f) => `<div class="feed-item"><div class="eyebrow">${esc(f.who)} · ${esc(f.ago)}</div><p>${esc(f.text)}</p></div>`).join('')
    : `<div class="empty" data-record="activity" data-state="${A.state}">Quiet. ${dated('activity')}.</div>`;

  const th = (c, label, cls = '') => `<th class="${cls}" data-col="${c}" aria-sort="none"><button type="button">${label}<span class="arrow" aria-hidden="true">↕</span></button></th>`;

  // register table
  const showValue = (id, r) => {
    if (r.state !== 'stated') return `<span class="muted">${dash}</span>`;
    if (r.kind === 'chain') return `${esc(r.value.name)} · ${r.value.id} · ${esc(r.value.idHex)}<br>${esc(r.value.rpc)}`;
    if (r.kind === 'url') return `<a href="${esc(r.url)}" target="_blank" rel="noreferrer">${esc(deriveHandle(r.url) || r.url)}</a>`;
    if (r.kind === 'window') return 'window set';
    if (r.kind === 'list') return `${r.value.length} entries`;
    return esc(r.value);
  };
  const regRows = Object.entries(R).map(([id, r]) => `<tr data-record-row="${id}"><td>${esc(r.label)}</td><td><span class="state ${r.state}"><i></i>${r.state}</span></td><td class="w">${showValue(id, r)}</td></tr>`).join('\n');

  const chain = R.chain.state === 'stated' ? `<b data-record="chain-foot" data-state="stated">${esc(R.chain.value.name)} · ${R.chain.value.id}</b>` : 'Chain not stated';
  const footCa = ca.state === 'stated' && isAddressShaped(ca.value)
    ? `<span class="mono" data-record="ca-foot">${esc(ca.value)}</span>`
    : `<span class="mono muted" data-record="ca-foot">CA not stated</span>`;

  // values of unstated records never reach the page source
  const clean = { version: register.version, records: Object.fromEntries(Object.entries(R).map(([id, r]) => [id, r.state === 'stated' ? r : { ...r, value: null, url: r.url === undefined ? undefined : null }])) };
  const pre = JSON.stringify(clean).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Rouma</title>
<meta name="description" content="Rouma is a launch board for Robinhood Chain. Figures appear only once they are stated.">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<script>document.documentElement.classList.add('js');try{var t=localStorage.getItem('rouma-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div class="top-stack">
${caSlot}
<header class="top">
  <div class="wrap">
    <a class="brand" href="#" aria-label="Rouma, top of page"><img class="brand-mark" src="logo-20.png" srcset="logo-40.png 2x, logo-60.png 3x" width="16" height="20" alt=""><b>rouma</b></a>
    <span class="spacer"></span>
    <nav class="main" aria-label="Sections">
      <a href="#explore">Board</a>
      <a href="#flow">Flow</a>
      <a href="#register">Register</a>
    </nav>
    <div class="rail">
      ${social('x', 'X', X_PATH, '0 0 24 24')}
      ${social('github', 'GitHub', GH_PATH, '0 0 16 16')}
      <button type="button" class="xlink theme-btn" id="theme" aria-label="Switch light or dark"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg></button>
    </div>
  </div>
</header>
</div>
<main>
<section class="wrap intro">
  <div>
    <h1>rouma <span>— launches, charted</span></h1>
    <p>Watch new tokens arrive on ${R.chain.state === 'stated' ? `<span data-record="chain" data-state="stated">${esc(R.chain.value.name)}</span>` : 'the chain'}, compare how they trade, and see what each one does next. A figure shows up here only once someone has stated it; until then its slot stays marked.</p>
    <div class="ctas"><a class="btn glow" href="#explore">Open the board</a><a class="btn" href="#register">Read the register</a></div>
  </div>
  <div class="split" aria-label="Trade fee split">
    <div><span>Compute share</span>${fig('fee.compute')}</div>
    <div><span>Holder share</span>${fig('fee.holders')}</div>
    <div><span>Maker share</span>${fig('fee.maker')}</div>
    <div><span>Staker share</span>${fig('fee.stakers')}</div>
    <div class="total"><span>Combined take</span>${fig('fee.total')}</div>
  </div>
</section>
<section class="wrap">${nursery}</section>
<section class="wrap">
  <div class="statline" id="live" aria-label="Chain readout">
    <span class="pill" id="rpc-pill"><i></i><span id="rpc-label">Connecting</span></span>
    <span><b id="live-block">–</b> block</span>
    <span><b id="live-gas">–</b> gwei</span>
    <span><b id="live-tvl">–</b> TVL</span>
  </div>
  <div class="statline" aria-label="Board totals" style="border-top:0">
    <span>${fig('stat.listed')} tokens listed</span>
    <span>${fig('stat.trading')} trading now</span>
    <span>${fig('stat.turnover')} turnover</span>
    <span>${fig('stat.rebates')} rebates issued</span>
    <span>${fig('stat.budget')} budget topped up</span>
    <span class="asof">figures shown as ${dash} are unstated</span>
  </div>
</section>
<section class="wrap home-grid" id="explore">
  <div style="min-width:0">
    <div class="explore-h">
      <div class="tabs" role="tablist" aria-label="Board views">
        <button type="button" role="tab" class="tab on" aria-selected="true" data-tab="vol">Volume</button>
        <button type="button" role="tab" class="tab" aria-selected="false" data-tab="new">Newest</button>
        <button type="button" role="tab" class="tab" aria-selected="false" data-tab="active">Active</button>
      </div>
      <label class="sr" for="search">Search the board or paste an address</label>
      <input class="input search-input" id="search" placeholder="Name or 0x address" autocomplete="off" spellcheck="false">
    </div>
    <div class="gate-note" id="gate-note" role="status" aria-live="polite" hidden></div>
    <div class="scroll-x">
      <table class="list" id="board">
        <thead><tr>${th('name', 'Pair')}${th('price', 'Price', 'r')}${th('vol', 'Volume 24h', 'r')}${th('liq', 'Liquidity', 'r hide-sm')}${th('age', 'Age', 'r hide-sm')}</tr></thead>
        <tbody id="board-body">${rows}</tbody>
      </table>
    </div>
    <p class="muted foot-note" id="board-note">Pairs from DexScreener, TVL from DefiLlama, block and gas read directly from a node.</p>
  </div>
  <aside>
    <div class="explore-h"><h2>Activity</h2></div>
    <div class="feed">${feed}</div>
    <p class="muted foot-note">Entries are logged only after they are stated.</p>
  </aside>
</section>
<section class="wrap" id="flow">
  <div class="sec-h"><h2>Path of a single fee</h2><span class="eyebrow">every share is a register slot</span></div>
  <div class="ff panel" aria-label="Fee flow">
    <div class="ff-src"><div class="ff-node ff-fee">${fig('fee.total')}<span>combined take per swap</span></div></div>
    <div class="ff-lanes">
      <div class="ff-lane"><div class="ff-pct">${fig('fee.compute')}</div><svg class="ff-arrow" viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M0 6h22M17 1l5 5-5 5"/></svg><div class="ff-node"><b>Compute</b><span>slot · ${dated('fee.compute').split(' · ')[0].toLowerCase()}</span></div></div>
      <div class="ff-lane"><div class="ff-pct">${fig('fee.holders')}</div><svg class="ff-arrow" viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M0 6h22M17 1l5 5-5 5"/></svg><div class="ff-node"><b>Holders</b><span>slot · ${dated('fee.holders').split(' · ')[0].toLowerCase()}</span></div></div>
      <div class="ff-lane"><div class="ff-pct">${fig('fee.maker')} + ${fig('fee.stakers')}</div><svg class="ff-arrow" viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M0 6h22M17 1l5 5-5 5"/></svg><div class="ff-split"><div class="ff-node"><b>Makers</b><span>slot · ${dated('fee.maker').split(' · ')[0].toLowerCase()}</span></div><div class="ff-node"><b>Stakers</b><span>slot · ${dated('fee.stakers').split(' · ')[0].toLowerCase()}</span></div></div></div>
    </div>
  </div>
</section>
<section class="wrap" id="register">
  <div class="sec-h"><h2>Register</h2><span class="eyebrow">one record per outside fact</span></div>
  <div class="panel">
    <div class="panel-h"><h3>Every outside fact on this page</h3><span class="eyebrow">stated · absent · unconfirmed · <time id="utc-clock">--:--:--</time> utc</span></div>
    <div class="scroll-x">
      <table class="t">
        <thead><tr><th>Record</th><th>State</th><th>Value</th></tr></thead>
        <tbody>
${regRows}
        </tbody>
      </table>
    </div>
  </div>
</section>
</main>
<footer class="foot">
  <div class="wrap">
    <span>Rouma · launch board · ${chain}</span>
    <span class="foot-links">${footCa}</span>
    <span>For information only; it is not a nudge toward any position.</span>
  </div>
</footer>
<script type="application/json" id="register-data">${pre}</script>
<script type="module" src="app.js"></script>
</body>
</html>
`;
}
