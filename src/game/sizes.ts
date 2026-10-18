// Named raise sizes (same formulas the engine uses). "Pot" = raise to: current bet + pot after calling.
import { legal, potTotal, type Hand } from './rules';

export interface Size { label: string; to: number }
export function namedSizes(h: Hand, seat: number, step: number): Size[] {
  const L = legal({ ...h, phase: 'act' }, seat);
  if (!L.raise) return [];
  const s = h.seats[seat];
  const toCall = Math.max(0, h.cur - s.bet);
  const after = potTotal(h) + Math.min(toCall, s.stack);
  const lo = L.minTo, hi = L.maxTo;
  const raw: [string, number][] = h.street === 0
    ? [['Min', lo], ['3×', h.cur <= h.bbAmt ? 3 * h.bbAmt : 3 * h.cur], ['4×', h.cur <= h.bbAmt ? 4 * h.bbAmt : 4 * h.cur], ['Pot', h.cur + after], ['All-in', hi]]
    : [['Min', lo], ['½ pot', h.cur + after / 2], ['⅔ pot', h.cur + (after * 2) / 3], ['Pot', h.cur + after], ['2× pot', h.cur + 2 * after], ['All-in', hi]];
  const out: Size[] = [];
  for (const [label, v] of raw) {
    let to = Math.round(v / step) * step;
    to = Math.max(lo, Math.min(hi, to));
    if (!out.some(o => o.to === to)) out.push({ label: to === hi ? 'All-in' : label, to });
  }
  return out;
}
