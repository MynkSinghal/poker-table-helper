import { describe, expect, it } from 'vitest';
import { apply, contested, legal, pots, replay, startHand, type Config, type Ev } from '../src/game/rules';

const cfg = (n: number): Config => ({ n, names: [], dealer: 0, sbAmt: 10, bbAmt: 20, startStack: 2000, leftHanded: false });
const run = (n: number, stacks: number[], dealer: number, evs: Ev[]) => replay(cfg(n), stacks, dealer, 1, [{ t: 'hole', cards: [] }, ...evs]);
const act = (kind: 'fold' | 'check' | 'call' | 'raise', to?: number): Ev => ({ t: 'act', kind, to });

describe('blinds and order', () => {
  it('6-max: SB/BB after dealer, UTG first', () => {
    const h = run(6, Array(6).fill(2000), 2, []);
    expect([h.sb, h.bb, h.toAct]).toEqual([3, 4, 5]);
  });
  it('heads-up: dealer is SB and acts first preflop, last postflop', () => {
    let h = run(2, [2000, 2000], 0, []);
    expect([h.sb, h.bb, h.toAct]).toEqual([0, 1, 0]);
    h = apply(h, act('call')); h = apply(h, act('check'));
    expect(h.phase).toBe('board');
    h = apply(h, { t: 'board', cards: [1, 2, 3] });
    expect(h.toAct).toBe(1);
  });
  it('BB gets the option after limps', () => {
    let h = run(3, [2000, 2000, 2000], 0, []); // SB 1, BB 2, first = 0
    h = apply(h, act('call')); h = apply(h, act('call'));
    expect(h.toAct).toBe(2);
    expect(legal(h).check).toBe(true);
    expect(legal(h).raise).toBe(true);
  });
});

describe('raises', () => {
  it('min raise is the last full raise', () => {
    let h = run(3, [2000, 2000, 2000], 0, []);
    h = apply(h, act('raise', 60)); // raise of 40
    expect(legal(h).minTo).toBe(100);
  });
  it('short all-in does not reopen betting (TDA 37-B)', () => {
    // seat0 opens 100, seat1 (SB) all-in 150 total (raise of 50 < 80), seat2 calls 150, back to seat0
    let h = run(3, [2000, 150, 2000], 2, []); // dealer 2 → SB 0? recompute
    // dealer 2: SB = 0, BB = 1, first = 2
    h = apply(h, act('raise', 100));  // seat2 opens to 100 (raise of 80)
    h = apply(h, act('call'));         // seat0 SB calls 100
    h = apply(h, act('raise', 150));  // seat1 BB all-in 150: raise of 50 < 80
    expect(h.seats[1].allIn).toBe(true);
    expect(h.toAct).toBe(2);
    expect(legal(h).raise).toBe(false); // already acted, not reopened
    expect(legal(h).call).toBe(true);
  });
  it('cumulative short all-ins totaling a full raise reopen', () => {
    let h = run(4, [2000, 150, 190, 2000], 0, []); // SB 1 (150), BB 2 (190), first 3
    h = apply(h, act('raise', 100));  // seat3 opens to 100 (full raise of 80)
    h = apply(h, act('call'));        // seat0 calls 100
    h = apply(h, act('raise', 150));  // seat1 all-in 150 (+50, short)
    h = apply(h, act('raise', 190));  // seat2 all-in 190 (+40, short) → +90 since seat3 acted
    expect(h.toAct).toBe(3);
    expect(legal(h).raise).toBe(true);
  });
  it('single short all-in leaves the earlier caller only call/fold', () => {
    let h = run(4, [2000, 2000, 150, 2000], 0, []);
    h = apply(h, act('raise', 100)); h = apply(h, act('call')); h = apply(h, act('call'));
    h = apply(h, act('raise', 150));  // seat2 short all-in
    expect(h.toAct).toBe(3);
    expect(legal(h).raise).toBe(false);
  });
});

describe('pots', () => {
  it('builds side pots from all-ins and returns uncalled chips', () => {
    let h = run(3, [500, 1000, 2000], 0, []); // SB1 BB2 first 0
    h = apply(h, act('raise', 500));   // seat0 all-in 500
    h = apply(h, act('raise', 1000));  // seat1 all-in 1000
    h = apply(h, act('call'));         // seat2 calls 1000
    const p = pots(h);
    expect(p).toEqual([{ amount: 1500, eligible: [0, 1, 2] }, { amount: 1000, eligible: [1, 2] }]);
    expect(h.phase).toBe('board');     // nobody left to bet: run it out
    h = apply(h, { t: 'board', cards: [0, 1, 2] });
    expect(h.phase).toBe('board');
    h = apply(h, { t: 'board', cards: [3] });
    h = apply(h, { t: 'board', cards: [4] });
    expect(h.phase).toBe('showdown');
    expect(contested(h).length).toBe(2);
    h = apply(h, { t: 'award', winners: [[0], [2]] });
    expect(h.result).toEqual([1500, 0, 1000]);
  });
  it('everyone folds: winner takes it without a showdown', () => {
    let h = run(3, [2000, 2000, 2000], 0, []);
    h = apply(h, act('raise', 60)); h = apply(h, act('fold')); h = apply(h, act('fold'));
    expect(h.phase).toBe('done');
    expect(h.result).toEqual([90, 0, 0]);
  });
  it('odd chip goes to the first winner left of the dealer', () => {
    const c = { ...cfg(3), sbAmt: 5, bbAmt: 10 };
    let h = startHand(c, [2000, 2000, 2000], 0, 1); // SB 1, BB 2, first 0
    h = apply(h, { t: 'hole', cards: [] });
    h = apply(h, act('call')); h = apply(h, act('fold')); h = apply(h, act('check')); // pot 25
    for (let st = 0; st < 3; st++) { h = apply(h, { t: 'board', cards: st === 0 ? [10, 11, 12] : [13 + st] }); h = apply(h, act('check')); h = apply(h, act('check')); }
    expect(h.phase).toBe('showdown');
    h = apply(h, { t: 'award', winners: [[0, 2]] });
    expect(h.result).toEqual([12, 0, 13]); // seat 2 is the first winner left of dealer 0
  });
});
