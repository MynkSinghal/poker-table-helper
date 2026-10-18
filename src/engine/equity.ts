// Hero equity.
//  - perComboEquity: EXACT. Hero's pot share against each specific opponent combo, averaged over
//    every remaining runout. Used whenever one opponent is left after the flop, and to read off
//    equity against any re-weighted range instantly (calling ranges, per-opponent bars).
//  - equityMC: Monte Carlo against several weighted ranges at once. Samples until the standard
//    error of the estimate is below the target (default 0.4 percentage points).
import { COMBO_A, COMBO_B, NCOMBO, type Card } from './cards';
import { evaluate } from './evaluator';
import type { Range } from './range';

const h7 = new Int32Array(7), v7 = new Int32Array(7);

/** exact equity of hero vs each combo with weight > 0 in `need` (NaN elsewhere). Postflop only. */
export function perComboEquity(hero: Card[], board: Card[], need: Range): Float32Array {
  const dead = new Uint8Array(52);
  for (const c of hero) dead[c] = 1;
  for (const c of board) dead[c] = 1;
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) if (!dead[c]) deck.push(c);
  const list: number[] = [];
  for (let k = 0; k < NCOMBO; k++) if (need[k] > 0 && !dead[COMBO_A[k]] && !dead[COMBO_B[k]]) list.push(k);
  const win = new Float64Array(NCOMBO), cnt = new Float64Array(NCOMBO);
  const nb = board.length;
  h7[0] = hero[0]; h7[1] = hero[1];
  for (let i = 0; i < nb; i++) { h7[2 + i] = board[i]; v7[2 + i] = board[i]; }
  const runOne = (extra: number[]) => {
    for (let i = 0; i < extra.length; i++) { h7[2 + nb + i] = extra[i]; v7[2 + nb + i] = extra[i]; }
    const hv = evaluate(h7, 7);
    for (const k of list) {
      const a = COMBO_A[k], b = COMBO_B[k];
      let clash = false;
      for (const e of extra) if (e === a || e === b) { clash = true; break; }
      if (clash) continue;
      v7[0] = a; v7[1] = b;
      const vv = evaluate(v7, 7);
      win[k] += hv > vv ? 1 : hv === vv ? 0.5 : 0;
      cnt[k]++;
    }
  };
  if (nb === 5) runOne([]);
  else if (nb === 4) for (const r of deck) runOne([r]);
  else if (nb === 3) for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) runOne([deck[i], deck[j]]);
  else throw new Error('perComboEquity needs a flop, turn or river');
  const eq = new Float32Array(NCOMBO).fill(NaN);
  for (const k of list) if (cnt[k]) eq[k] = win[k] / cnt[k];
  return eq;
}

/** weighted average of per-combo equity over a range */
export function rangeEquity(eq: Float32Array, r: Range): number {
  let s = 0, w = 0;
  for (let k = 0; k < NCOMBO; k++) { const x = r[k]; if (x > 0 && !Number.isNaN(eq[k])) { s += x * eq[k]; w += x; } }
  return w > 0 ? s / w : NaN;
}

/** cumulative sampler over a range's weights */
export class Sampler {
  private cum: Float64Array; private idx: Int16Array; total: number;
  constructor(r: Range) {
    const idx: number[] = [];
    for (let k = 0; k < NCOMBO; k++) if (r[k] > 0) idx.push(k);
    this.idx = Int16Array.from(idx);
    this.cum = new Float64Array(idx.length);
    let s = 0;
    idx.forEach((k, i) => { s += r[k]; this.cum[i] = s; });
    this.total = s;
  }
  pick(): number {
    const x = Math.random() * this.total;
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.cum[m] < x) lo = m + 1; else hi = m; }
    return this.idx[lo];
  }
  get size() { return this.idx.length; }
}

export interface MCResult { eq: number; se: number; n: number }

/**
 * Monte Carlo equity vs several opponents. Each iteration deals every opponent a combo from its
 * range (rejecting card clashes), completes the board at random and scores hero's share.
 * `include[i]` (optional) = probability opponent i is in the hand this iteration (used for EV
 * of bets where each opponent continues independently). onSample lets callers accumulate extra
 * per-iteration values (pot size, share).
 */
export function equityMC(
  hero: Card[], board: Card[], ranges: Range[],
  opts: { targetSE?: number; minIters?: number; maxIters?: number; include?: number[]; onSample?: (share: number, inMask: number) => void } = {},
): MCResult {
  const targetSE = opts.targetSE ?? 0.004, minIters = opts.minIters ?? 2000, maxIters = opts.maxIters ?? 60000;
  const samplers = ranges.map(r => new Sampler(r));
  if (samplers.some(s => s.size === 0)) return { eq: NaN, se: NaN, n: 0 };
  const used = new Uint8Array(52);
  for (const c of hero) used[c] = 1;
  for (const c of board) used[c] = 1;
  const base: number[] = [];
  for (let c = 0; c < 52; c++) if (!used[c]) base.push(c);
  const k = ranges.length, nb = board.length, need = 5 - nb;
  const oc = new Int32Array(2 * k);
  const taken = new Uint8Array(52);
  const bd = new Int32Array(5);
  for (let i = 0; i < nb; i++) bd[i] = board[i];
  h7[0] = hero[0]; h7[1] = hero[1];
  let n = 0, sum = 0, sum2 = 0, loops = 0;
  for (; n < maxIters && loops < maxIters * 60; loops++) {
    taken.fill(0);
    let mask = 0, ok = true;
    for (let o = 0; o < k; o++) {
      if (opts.include && Math.random() >= opts.include[o]) continue;
      let tries = 0, combo = -1;
      while (tries++ < 60) {
        const c = samplers[o].pick();
        const a = COMBO_A[c], b = COMBO_B[c];
        if (!taken[a] && !taken[b] && !used[a] && !used[b]) { combo = c; break; }
      }
      if (combo < 0) { ok = false; break; }
      oc[2 * o] = COMBO_A[combo]; oc[2 * o + 1] = COMBO_B[combo];
      taken[oc[2 * o]] = 1; taken[oc[2 * o + 1]] = 1;
      mask |= 1 << o;
    }
    if (!ok) continue;
    if (opts.include && mask === 0) continue; // conditioned on at least one opponent continuing
    for (let b = 0; b < need; b++) {
      let c: number;
      do { c = base[(Math.random() * base.length) | 0]; } while (taken[c]);
      taken[c] = 1; bd[nb + b] = c;
    }
    for (let i = 0; i < 5; i++) { h7[2 + i] = bd[i]; v7[2 + i] = bd[i]; }
    const hv = evaluate(h7, 7);
    let ties = 0, lost = false;
    for (let o = 0; o < k; o++) {
      if (!(mask & (1 << o))) continue;
      v7[0] = oc[2 * o]; v7[1] = oc[2 * o + 1];
      const vv = evaluate(v7, 7);
      if (vv > hv) { lost = true; break; }
      if (vv === hv) ties++;
    }
    const share = lost ? 0 : 1 / (ties + 1);
    opts.onSample?.(share, mask);
    sum += share; sum2 += share * share; n++;
    if (n >= minIters && (n & 255) === 0) {
      const m = sum / n, v = Math.max(0, sum2 / n - m * m);
      if (Math.sqrt(v / n) <= targetSE) break;
    }
  }
  const m = n ? sum / n : NaN;
  const v = n ? Math.max(0, sum2 / n - m * m) : 0;
  return { eq: m, se: n ? Math.sqrt(v / n) : NaN, n };
}
