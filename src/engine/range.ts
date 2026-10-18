// A range = weight per two-card combo (1,326 entries, 0..1).
import { CARD_COMBOS, COMBO_A, COMBO_B, COMBO_CLASS, NCOMBO, type Card } from './cards';
import { COMBO_PCT } from './preflop';

export type Range = Float64Array;

export const newRange = (w = 0): Range => new Float64Array(NCOMBO).fill(w);

/** smooth step: 1 below edge, 0 above, linear over `soft` percentage points */
function edge(p: number, cut: number, soft: number) {
  if (p <= cut - soft) return 1;
  if (p >= cut + soft) return 0;
  return (cut + soft - p) / (2 * soft);
}

/** combos whose preflop percentile lies in (lo, hi], soft edges */
export function pctBand(lo: number, hi: number, soft = 1.5): Range {
  const r = newRange();
  for (let k = 0; k < NCOMBO; k++) {
    const p = COMBO_PCT[k];
    r[k] = edge(p, hi, soft) * (lo <= 0 ? 1 : 1 - edge(p, lo, soft));
  }
  return r;
}

export function removeDead(r: Range, dead: Card[]): Range {
  for (const c of dead) { const list = CARD_COMBOS[c]; for (let i = 0; i < list.length; i++) r[list[i]] = 0; }
  return r;
}

export const totalWeight = (r: Range) => { let s = 0; for (let k = 0; k < NCOMBO; k++) s += r[k]; return s; };

/**
 * Keep the strongest `keep` share of the range's weight (0..1), ordered by `strength`
 * (higher = stronger). Soft edge of ±3% of mass so the split isn't knife-edged.
 */
export function strongestShare(r: Range, strength: Float32Array, keep: number): Range {
  const idx: number[] = [];
  for (let k = 0; k < NCOMBO; k++) if (r[k] > 0) idx.push(k);
  idx.sort((a, b) => strength[b] - strength[a]);
  const tot = idx.reduce((s, k) => s + r[k], 0);
  const out = newRange();
  if (tot <= 0) return out;
  let cum = 0;
  const soft = 0.03;
  for (const k of idx) {
    const mid = (cum + r[k] / 2) / tot; // mass percentile of this combo, 0 = strongest
    cum += r[k];
    out[k] = r[k] * edge(mid, keep, soft);
  }
  return out;
}

/** mass percentile (0 = strongest) of each combo inside the range, by strength */
export function massPercentile(r: Range, strength: Float32Array): Float32Array {
  const idx: number[] = [];
  for (let k = 0; k < NCOMBO; k++) if (r[k] > 0) idx.push(k);
  idx.sort((a, b) => strength[b] - strength[a]);
  const tot = idx.reduce((s, k) => s + r[k], 0) || 1;
  const q = new Float32Array(NCOMBO).fill(1);
  let cum = 0;
  for (const k of idx) { q[k] = (cum + r[k] / 2) / tot; cum += r[k]; }
  return q;
}

/** aggregate a range into the 169 starting-hand classes (share of each class's combos) */
export function toClassGrid(r: Range): Float32Array {
  const sum = new Float32Array(169), cnt = new Float32Array(169);
  for (let k = 0; k < NCOMBO; k++) { sum[COMBO_CLASS[k]] += r[k]; cnt[COMBO_CLASS[k]] += 1; }
  for (let i = 0; i < 169; i++) sum[i] = cnt[i] ? sum[i] / cnt[i] : 0;
  return sum;
}

export const comboCards = (k: number): [Card, Card] => [COMBO_A[k], COMBO_B[k]];
