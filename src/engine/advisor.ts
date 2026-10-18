// Turns a table situation into: win chance, pot odds and the EV of every legal move.
// EV is measured in chips relative to folding now, over the current betting round:
//   check  = E · pot
//   call   = E · (pot + call) − call
//   raise  = P(all fold) · pot + P(someone continues) · E[share · final pot − chips put in]
// where folds come from each opponent's fold model and E uses their *continuing* range.
import { COMBO_A, COMBO_B, NCOMBO, classOf, type Card } from './cards';
import { CATEGORY_NAMES, category, evaluate } from './evaluator';
import { equityMC, perComboEquity, rangeEquity } from './equity';
import { ASSUME, buildRange, foldProb, type Opp } from './model';
import { COMBO_PCT, PCT } from './preflop';
import { newRange, pctBand, removeDead, strongestShare, toClassGrid, totalWeight, type Range } from './range';
import { comboStrength } from './strength';

export interface AnalyzeInput {
  hero: Card[]; board: Card[]; street: number;
  pot: number;       // every chip in the middle, current-street bets included
  heroBet: number; heroStack: number; cur: number;
  minTo: number; maxTo: number; canRaise: boolean;
  bb: number;
  opps: Opp[];       // opponents still in the hand
}
export type MoveKind = 'fold' | 'check' | 'call' | 'raise';
export interface Move { kind: MoveKind; to?: number; ev: number; fold?: number; label: string }
export interface OppView { seat: number; eq: number; combos: number; grid: number[]; desc: string; pending: boolean }
export interface Analysis {
  key: string; quick: boolean; exact: boolean;
  win: number; se: number; vsLabel: string;
  toCall: number; need: number; spr: number | null; handPct: number | null; heroHand: string | null;
  moves: Move[]; best: Move | null; curve: { to: number; ev: number; fold: number }[];
  opps: OppView[]; outs: number | null; ms: number;
}

const preStrength = (() => { const s = new Float32Array(NCOMBO); for (let k = 0; k < NCOMBO; k++) s[k] = 1 - COMBO_PCT[k] / 100; return s; })();

export function analyze(inp: AnalyzeInput, key: string, quick: boolean): Analysis {
  const t0 = performance.now();
  const { hero, board, bb } = inp;
  const post = board.length >= 3;
  const dead = [...hero, ...board];
  const built = inp.opps.map(o => o.pending ? { o, range: null as Range | null, desc: 'Yet to act' } : { o, ...buildRange(o, board, hero) });
  let active = built.filter(b => b.range && totalWeight(b.range) > 0) as { o: Opp; range: Range; desc: string }[];
  let vsLabel = `vs ${active.length}`;
  if (!active.length) {
    // nobody has entered yet: measure against one typical caller
    const r = removeDead(pctBand(0, ASSUME.vpipPrior * 100 * ASSUME.coldContinue * 1.4), dead);
    active = [{ o: { seat: -1, stats: { hands: 0, vpip: 0, pfr: 0, agg: 0, pas: 0, foldExp: 0, folds: 0 }, actions: [], bet: 0, stack: 1e9, allIn: false, pending: false, isBB: false }, range: r, desc: 'Typical caller' }];
    vsLabel = 'vs 1 likely';
  } else if (!post) vsLabel = `vs ${active.length} in`;

  // ---- win chance
  let win: number, se: number, exact = false;
  let eqArr: Float32Array | null = null;
  if (post && !quick) {
    const union = newRange();
    for (const a of active) for (let k = 0; k < NCOMBO; k++) if (a.range[k] > 0) union[k] = 1;
    eqArr = perComboEquity(hero, board, union);
  }
  if (eqArr && active.length === 1) { win = rangeEquity(eqArr, active[0].range); se = 0; exact = true; }
  else {
    const mc = equityMC(hero, board, active.map(a => a.range), { targetSE: quick ? 0.008 : 0.004, maxIters: quick ? 8000 : 60000 });
    win = mc.eq; se = mc.se;
  }

  // ---- pot odds, SPR, hand rank
  const P = inp.pot;
  const toCall = Math.max(0, Math.min(inp.cur - inp.heroBet, inp.heroStack));
  const need = toCall > 0 ? toCall / (P + toCall) : 0;
  const maxOpp = Math.max(0, ...inp.opps.map(o => o.stack + o.bet));
  const spr = post ? Math.min(inp.heroStack + inp.heroBet, maxOpp) / Math.max(1, P) : null;
  const handPct = hero.length === 2 ? PCT[classOf(hero[0], hero[1])] : null;
  const heroHand = post ? CATEGORY_NAMES[category(evaluate([...hero, ...board], 2 + board.length))] : null;

  // ---- moves
  const moves: Move[] = [];
  if (toCall > 0) moves.push({ kind: 'fold', ev: 0, label: 'Fold' });
  if (toCall === 0) moves.push({ kind: 'check', ev: win * P, label: 'Check' });
  else moves.push({ kind: 'call', ev: win * (P + toCall) - toCall, label: `Call ${toCall}` });

  const heroMax = inp.heroBet + inp.heroStack;
  const strength = post ? comboStrength(board, hero) : preStrength;
  const evAt = (to: number): { ev: number; fold: number } => {
    const A = to - inp.heroBet;
    const people = built.map(b => {
      const o = b.o;
      const call = Math.max(0, Math.min(to - o.bet, o.stack));
      const f = o.allIn ? 0 : foldProb(o, call, P + A - call, bb, to);
      let cont: Range;
      if (b.range) cont = o.allIn ? b.range : strongestShare(b.range, strength, 1 - f);
      else cont = removeDead(pctBand(0, Math.max(0.6, (1 - f) * 100), 0.5), dead); // yet to act: continues with the top (1 − fold)% of hands
      return { o, call, f, cont };
    });
    const pAllFold = people.reduce((p, x) => p * x.f, 1);
    if (people.length === 0 || 1 - pAllFold < 1e-4) return { ev: P, fold: 1 };
    // heads-up after the flop: exact via per-combo equity
    if (eqArr && people.length === 1) {
      const x = people[0];
      const e = rangeEquity(eqArr, x.cont);
      const risk = Math.min(A, x.o.bet + x.call - inp.heroBet);
      const val = e * (P + risk + x.call) - risk;
      return { ev: pAllFold * P + (1 - pAllFold) * (Number.isNaN(val) ? -risk : val), fold: pAllFold };
    }
    // otherwise sample who continues and what they hold
    let sum = 0, n = 0;
    const calls = people.map(x => x.call), bets = people.map(x => x.o.bet);
    equityMC(hero, board, people.map(x => x.cont), {
      include: people.map(x => 1 - x.f), minIters: quick ? 600 : 2500, maxIters: quick ? 600 : 2500, targetSE: 0,
      onSample: (share, mask) => {
        let add = 0, top = 0;
        for (let i = 0; i < people.length; i++) if (mask & (1 << i)) { add += calls[i]; top = Math.max(top, bets[i] + calls[i]); }
        const risk = Math.min(A, top - inp.heroBet);
        sum += share * (P + risk + add) - risk; n++;
      },
    });
    const val = n ? sum / n : 0;
    return { ev: pAllFold * P + (1 - pAllFold) * val, fold: pAllFold };
  };

  const curve: { to: number; ev: number; fold: number }[] = [];
  if (inp.canRaise && inp.heroStack > toCall) {
    const lo = Math.min(inp.minTo, heroMax), hi = heroMax;
    const afterCall = P + toCall;
    const named: [string, number][] = [
      ['Min', lo], ['½ pot', inp.cur + afterCall / 2], ['⅔ pot', inp.cur + afterCall * 2 / 3],
      ['Pot', inp.cur + afterCall], ['2× pot', inp.cur + 2 * afterCall], ['All-in', hi],
    ];
    if (!post) named.splice(1, 4, ['3×', inp.cur === bb ? 3 * bb : 3 * inp.cur], ['4×', inp.cur === bb ? 4 * bb : 4 * inp.cur]);
    const seen = new Set<number>();
    for (const [label, raw] of named) {
      let to = Math.round(raw / Math.max(1, Math.round(bb / 2))) * Math.max(1, Math.round(bb / 2));
      to = Math.max(lo, Math.min(hi, to));
      if (seen.has(to)) continue;
      seen.add(to);
      const r = evAt(to);
      moves.push({ kind: 'raise', to, ev: r.ev, fold: r.fold, label: to === hi ? 'All-in' : label });
    }
    if (!quick) {
      const pts = 14;
      for (let i = 0; i <= pts; i++) {
        const to = Math.round(lo * Math.pow(hi / Math.max(1, lo), i / pts));
        const r = evAt(to);
        curve.push({ to, ev: r.ev, fold: r.fold });
      }
    }
  }

  // best = highest EV; prefer the passive move when within 0.05 bb (less variance for no gain)
  let best: Move | null = null;
  for (const m of moves) if (!best || m.ev > best.ev + 0.05 * bb || (m.kind === best.kind && m.ev > best.ev)) best = m;

  // ---- per-opponent view
  const opps: OppView[] = built.map(b => {
    let eq = NaN;
    if (b.range && eqArr) eq = rangeEquity(eqArr, b.range);
    else if (b.range && !quick) eq = equityMC(hero, board, [b.range], { targetSE: 0.008, maxIters: 12000 }).eq;
    const grid = b.range ? Array.from(toClassGrid(b.range)) : [];
    const mx = Math.max(1e-9, ...grid);
    return { seat: b.o.seat, eq, combos: b.range ? Math.round(totalWeight(b.range)) : 0, grid: grid.map(g => g / mx), desc: b.desc, pending: b.o.pending };
  });

  // ---- outs: next cards that turn a losing made hand into a winning one vs their ranges
  let outs: number | null = null;
  if (post && board.length < 5 && !quick) {
    const union = newRange();
    for (const a of active) for (let k = 0; k < NCOMBO; k++) union[k] += a.range[k];
    const share = (bd: Card[]) => {
      const hv = evaluate([...hero, ...bd], 2 + bd.length);
      let w = 0, s = 0;
      for (let k = 0; k < NCOMBO; k++) {
        const x = union[k]; if (x <= 0) continue;
        const a = COMBO_A[k], b = COMBO_B[k];
        if (bd.includes(a) || bd.includes(b)) continue;
        const vv = evaluate([a, b, ...bd], 2 + bd.length);
        s += x * (hv > vv ? 1 : hv === vv ? 0.5 : 0); w += x;
      }
      return w ? s / w : 0;
    };
    const now = share(board);
    if (now < 0.5) {
      outs = 0;
      for (let c = 0; c < 52; c++) if (!dead.includes(c) && share([...board, c]) >= 0.6) outs++;
    }
  }

  return { key, quick, exact, win, se, vsLabel, toCall, need, spr, handPct, heroHand, moves, best, curve, opps, outs, ms: performance.now() - t0 };
}
