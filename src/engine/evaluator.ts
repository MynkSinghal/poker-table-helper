// Best-5-of-N poker hand evaluator (N = 5..7). Returns a number: higher = stronger.
// value = category * 16^5 + kickers (4 bits each, most significant first).
// Categories: 0 high card, 1 pair, 2 two pair, 3 trips, 4 straight, 5 flush,
// 6 full house, 7 quads, 8 straight flush. Verified against the exact counts of all
// 133,784,560 seven-card hands (scripts/exhaustive-check.mjs).
import type { Card } from './cards';

const RC = new Int8Array(13);
const SM = new Int32Array(4);
const SC = new Int8Array(4);
const B4 = 16, B3 = 256, B2 = 4096, B1 = 65536, CAT = 1048576;
const W5 = [B1, B2, B3, B4, 1], W2 = [B2, B3], W3 = [B2, B3, B4];

function straightHigh(mask: number): number {
  for (let h = 12; h >= 4; h--) {
    const m = 0x1f << (h - 4);
    if ((mask & m) === m) return h;
  }
  return (mask & 0x100f) === 0x100f ? 3 : -1; // wheel A-2-3-4-5
}

export function evaluate(cs: ArrayLike<Card>, n: number): number {
  RC.fill(0); SM.fill(0); SC.fill(0);
  let all = 0;
  for (let i = 0; i < n; i++) {
    const c = cs[i], r = c >> 2, s = c & 3;
    RC[r]++; SM[s] |= 1 << r; SC[s]++; all |= 1 << r;
  }
  let fs = -1;
  for (let s = 0; s < 4; s++) if (SC[s] >= 5) fs = s;
  if (fs >= 0) {
    const sf = straightHigh(SM[fs]);
    if (sf >= 0) return 8 * CAT + sf * B1;
  }
  let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = RC[r];
    if (k === 4) quad = r;
    else if (k === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
  }
  if (quad >= 0) {
    let k = 0;
    for (let r = 12; r >= 0; r--) if (r !== quad && RC[r]) { k = r; break; }
    return 7 * CAT + quad * B1 + k * B2;
  }
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return 6 * CAT + t1 * B1 + Math.max(t2, p1) * B2;
  if (fs >= 0) {
    let v = 5 * CAT, j = 0;
    const m = SM[fs];
    for (let r = 12; r >= 0 && j < 5; r--) if (m & (1 << r)) v += r * W5[j++];
    return v;
  }
  const st = straightHigh(all);
  if (st >= 0) return 4 * CAT + st * B1;
  if (t1 >= 0) {
    let v = 3 * CAT + t1 * B1, j = 0;
    for (let r = 12; r >= 0 && j < 2; r--) if (r !== t1 && RC[r]) v += r * W2[j++];
    return v;
  }
  if (p1 >= 0 && p2 >= 0) {
    let k = 0;
    for (let r = 12; r >= 0; r--) if (r !== p1 && r !== p2 && RC[r]) { k = r; break; }
    return 2 * CAT + p1 * B1 + p2 * B2 + k * B3;
  }
  if (p1 >= 0) {
    let v = CAT + p1 * B1, j = 0;
    for (let r = 12; r >= 0 && j < 3; r--) if (r !== p1 && RC[r]) v += r * W3[j++];
    return v;
  }
  let v = 0, j = 0;
  for (let r = 12; r >= 0 && j < 5; r--) if (RC[r]) v += r * W5[j++];
  return v;
}

export const category = (v: number) => Math.floor(v / CAT);
export const CATEGORY_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
