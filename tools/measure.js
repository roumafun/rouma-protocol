// Run in the page at each viewport width. Returns one JSON line.
(() => {
  const q = (s) => document.querySelector(s);
  const sel = '.xlink, .btn, .tab, .search-input, .list th button, .ca-copy, button.ca-val, nav.main a';
  const under44 = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).map((e) => { const b = e.getBoundingClientRect(); return [e.className || e.tagName, Math.round(b.width), Math.round(b.height)]; }).filter((o) => o[1] < 44 || o[2] < 44);
  const rail = q('.rail').getBoundingClientRect();
  const ca = q('.ca-val');
  return JSON.stringify({
    vw: innerWidth,
    hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    stackH: Math.round(q('.top-stack').getBoundingClientRect().height),
    caFont: getComputedStyle(ca).fontSize,
    caLines: Math.round(ca.getBoundingClientRect().height / parseFloat(getComputedStyle(ca).lineHeight)),
    caText: ca.textContent.length,
    railGapToEdge: Math.round(innerWidth - rail.right),
    icons: ['x', 'github'].map((id) => { const a = q(`[data-record="${id}"]`); const b = a.getBoundingClientRect(); return [id, Math.round(b.width), Math.round(b.height), a.getAttribute('href')]; }),
    under44,
  });
})();
