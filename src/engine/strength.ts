// Hand strength of every combo on a board, in the spirit of Billings et al.'s
// Effective Hand Strength: current strength (HS, vs every other possible hand)
// blended with strength after the next card (captures draws: positive/negative potential).
import { CARD_COMBOS, COMBO_A, COMBO_B, NCOMBO, type Card } from './cards';
import { evaluate } from './evaluator';

const buf = new Int32Array(7);

/** HS of every combo vs all other combos on a complete-for-now board (3..5 cards). NaN = impossible combo. */
export function handStrengthAll(board: Card[], dead: Uint8Array): Float32Array {
  const n = board.length;
  for (let i = 0; i < n; i++) buf[i] = board[i];
  const rank = new Float64Array(NCOMBO).fill(NaN);
  const vals: number[] = [];
  for (let k = 0; k < NCOMBO; k++) {
    const a = COMBO_A[k], b = COMBO_B[k];
    if (dead[a] || dead[b]) continue;
    buf[n] = a; buf[n + 1] = b;
    const v = evaluate(buf, n + 2);
    rank[k] = v; vals.push(v);
  }
  vals.sort((x, y) => x - y);
  const lower = (x: number) => { let lo = 0, hi = vals.length; while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < x) lo = m + 1; else hi = m; } return lo; };
  const upper = (x: number) => { let lo = 0, hi = vals.length; while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] <= x) lo = m + 1; else hi = m; } return lo; };
  const hs = new Float32Array(NCOMBO).fill(NaN);
  for (let k = 0; k < NCOMBO; k++) {
    const v = rank[k];
    if (Number.isNaN(v)) continue;
    let less = lower(v), eq = upper(v) - less - 1, total = vals.length - 1;
    // remove opponents that share a card with this combo
    for (const c of [COMBO_A[k], COMBO_B[k]]) {
      const list = CARD_COMBOS[c];
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        if (d === k) continue;
        const w = rank[d];
        if (Number.isNaN(w)) continue;
        total--;
        if (w < v) less--; else if (w === v) eq--;
      }
    }
    hs[k] = total > 0 ? (less + eq / 2) / total : 0;
  }
  return hs;
}

const cache = new Map<string, Float32Array>();

/** strength used for ordering ranges: river = HS; flop/turn = ½·HS now + ½·E[HS after next card] */
export function comboStrength(board: Card[], heroDead: Card[] = []): Float32Array {
  const key = board.join(',') + '|' + heroDead.join(',');
  const hit = cache.get(key);
  if (hit) return hit;
  const dead = new Uint8Array(52);
  for (const c of board) dead[c] = 1;
  for (const c of heroDead) dead[c] = 1;
  const now = handStrengthAll(board, dead);
  let out = now;
  if (board.length < 5) {
    const acc = new Float64Array(NCOMBO), cnt = new Float64Array(NCOMBO);
    for (let t = 0; t < 52; t++) {
      if (dead[t]) continue;
      dead[t] = 1;
      const nx = handStrengthAll([...board, t], dead);
      dead[t] = 0;
      for (let k = 0; k < NCOMBO; k++) if (!Number.isNaN(nx[k])) { acc[k] += nx[k]; cnt[k]++; }
    }
    out = new Float32Array(NCOMBO).fill(NaN);
    for (let k = 0; k < NCOMBO; k++) if (!Number.isNaN(now[k]) && cnt[k]) out[k] = 0.5 * now[k] + 0.5 * (acc[k] / cnt[k]);
  }
  if (cache.size > 24) cache.clear();
  cache.set(key, out);
  return out;
}
