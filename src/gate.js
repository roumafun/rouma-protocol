export const STATES = ['stated', 'absent', 'unconfirmed'];

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PARTIAL = /^0x[0-9a-fA-F]*$/;

export const isAddressShaped = (s) => ADDRESS.test(String(s).trim());

export function statedAddresses(records) {
  return Object.entries(records)
    .filter(([, r]) => r.kind === 'address' && r.state === 'stated' && isAddressShaped(r.value))
    .map(([id, r]) => ({ id, label: r.label, value: r.value }));
}

// Address-shaped input is matched against the stated registry. It is never rejected for being hex.
export function checkInput(records, raw) {
  const q = String(raw).trim();
  if (!q) return { kind: 'empty' };
  if (isAddressShaped(q)) {
    const hit = statedAddresses(records).find((a) => a.value.toLowerCase() === q.toLowerCase());
    if (hit) return { kind: 'match', id: hit.id, label: hit.label };
    const any = Object.values(records).some((r) => r.kind === 'address');
    const stated = statedAddresses(records).length > 0;
    if (any && !stated) {
      const dated = Object.values(records).find((r) => r.kind === 'address');
      return { kind: 'no-registry', dated: dated.dated };
    }
    return { kind: 'unmatched' };
  }
  if (PARTIAL.test(q)) return { kind: 'partial', have: q.length - 2 };
  return { kind: 'text', q };
}

export function deriveHandle(url) {
  if (!url) return null;
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
    return seg ? '@' + seg : null;
  } catch {
    return null;
  }
}

export function isLive(rec, now) {
  if (rec.state !== 'stated' || !rec.value) return false;
  const a = Date.parse(rec.value.start);
  const b = Date.parse(rec.value.end);
  return now >= a && now < b;
}
