import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/engine/cards';
import { category, evaluate } from '../src/engine/evaluator';
import { equityMC, perComboEquity, rangeEquity } from '../src/engine/equity';
import { newRange, removeDead, pctBand } from '../src/engine/range';
import { handStrengthAll } from '../src/engine/strength';
import { analyze } from '../src/engine/advisor';
import { emptyStats } from '../src/engine/model';

const C = parseCards;
const cat = (s: string) => category(evaluate(C(s), 7));

describe('evaluator', () => {
  it('ranks categories', () => {
    expect(cat('As Ks Qs Js Ts 2d 3c')).toBe(8);
    expect(cat('As 2s 3s 4s 5s Kd Kc')).toBe(8);
    expect(cat('Ah 2d 3c 4s 5h Kd Kc')).toBe(4);
    expect(cat('9h 9d 9c 9s 2h 3d 4c')).toBe(7);
    expect(cat('9h 9d 9c 8s 8h 8d 3c')).toBe(6);
    expect(cat('2h 5h 8h Th Kh Ad Ac')).toBe(5);
    expect(cat('2h 2d 4c 4s 6h 6d 8c')).toBe(2);
  });
  it('uses kickers', () => {
    expect(evaluate(C('2h 2d 4c 4s 6h 6d 8c'), 7)).toBeGreaterThan(evaluate(C('2h 2d 4c 4s 6h 6d 3c'), 7));
    expect(evaluate(C('Ah Kd 4c 4s 6h 9d 8c'), 7)).toBeGreaterThan(evaluate(C('Ah Qd 4c 4s 6h 9d 8c'), 7));
    // board plays: split
    expect(evaluate(C('2c 3d As Ks Qs Js Ts'), 7)).toBe(evaluate(C('4c 5d As Ks Qs Js Ts'), 7));
  });
});

describe('equity', () => {
  it('AA vs a random hand ≈ 85.2%', () => {
    const hero = C('As Ah');
    const r = removeDead(newRange(1), hero);
    const m = equityMC(hero, [], [r], { targetSE: 0.002, maxIters: 120000 });
    expect(Math.abs(m.eq - 0.852)).toBeLessThan(0.008);
  });
  it('exact per-combo equity on the river is 0 / 0.5 / 1', () => {
    const hero = C('As Ad'), board = C('Ac 7d 2s Kh 9c');
    const eq = perComboEquity(hero, board, removeDead(newRange(1), [...hero, ...board]));
    const vals = new Set(Array.from(eq).filter(x => !Number.isNaN(x)));
    for (const v of vals) expect([0, 0.5, 1]).toContain(v);
  });
  it('exact flop equity matches sampling', () => {
    const hero = C('Ah Kh'), board = C('Qh 7h 2c');
    const r = removeDead(pctBand(0, 20), [...hero, ...board]);
    const ex = rangeEquity(perComboEquity(hero, board, r), r);
    const mc = equityMC(hero, board, [r], { targetSE: 0.003, maxIters: 100000 });
    expect(Math.abs(ex - mc.eq)).toBeLessThan(0.012);
  });
  it('nut hand has hand strength ~1', () => {
    const board = C('Ks Qs Js 2d 3c');
    const dead = new Uint8Array(52); board.forEach(c => (dead[c] = 1));
    const hs = handStrengthAll(board, dead);
    // As Ts = royal flush
    const k = 1326 - 1; void k;
    let max = 0; for (const v of hs) if (!Number.isNaN(v)) max = Math.max(max, v);
    expect(max).toBeGreaterThan(0.999);
  });
});

describe('advisor', () => {
  it('raises AA and folds 72o facing a big bet on the river', () => {
    const opp = { seat: 3, stats: emptyStats(), actions: [{ street: 0, kind: 'open' as const, ratio: 1 }], bet: 0, stack: 1900, allIn: false, pending: false, isBB: false };
    const pre = analyze({ hero: C('As Ah'), board: [], street: 0, pot: 90, heroBet: 0, heroStack: 2000, cur: 60, minTo: 100, maxTo: 2000, canRaise: true, bb: 20, opps: [{ ...opp, bet: 60 }] }, 'k', false);
    expect(pre.best?.kind).toBe('raise');
    const riv = analyze({ hero: C('7c 2d'), board: C('As Kd 9h 4s Jc'), street: 3, pot: 600, heroBet: 0, heroStack: 1500, cur: 400, minTo: 800, maxTo: 1500, canRaise: true, bb: 20,
      opps: [{ ...opp, actions: [...opp.actions, { street: 3, kind: 'bet' as const, ratio: 2 }], bet: 400, stack: 1000 }] }, 'k', false);
    expect(riv.best?.kind).toBe('fold');
  });
});
