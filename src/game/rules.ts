// No-limit hold'em rules as a pure, event-sourced state machine.
// A hand is rebuilt by replaying its events, so undo = drop the last event.
//  - Blinds: heads-up the dealer posts the small blind and acts first preflop.
//  - Min raise = size of the last full raise (min bet = big blind).
//  - An all-in for less than a full raise does not reopen betting for players who already acted
//    (TDA Rule 37-B); short all-ins that add up to a full raise do.
//  - Side pots are layered from what each player committed; uncalled chips come back.
//  - Odd chips go to the first winner clockwise from the dealer.
import type { Card } from '../engine/cards';

export interface Config {
  n: number; names: string[]; dealer: number; sbAmt: number; bbAmt: number; startStack: number; leftHanded: boolean;
}
export type ActKind = 'fold' | 'check' | 'call' | 'raise';
export type Ev =
  | { t: 'hole'; cards: Card[] }
  | { t: 'act'; kind: ActKind; to?: number }
  | { t: 'board'; cards: Card[] }
  | { t: 'award'; winners: number[][] }; // one list of winning seats per contested pot

export interface SeatState {
  inHand: boolean; stack: number; bet: number; committed: number;
  folded: boolean; allIn: boolean; acted: boolean; lastCur: number; last: string;
}
export interface ActRec { seat: number; street: number; kind: ActKind | 'post'; to: number; add: number; potBefore: number; curBefore: number; allIn: boolean; full: boolean }
export interface Pot { amount: number; eligible: number[] }
export type Phase = 'hole' | 'act' | 'board' | 'showdown' | 'done';
export interface Hand {
  no: number; dealer: number; sb: number; bb: number; bbAmt: number;
  seats: SeatState[]; street: number; board: Card[]; hole: Card[]; holeSkipped: boolean;
  cur: number; lastFull: number; toAct: number; phase: Phase;
  actions: ActRec[]; result: number[] | null; // chips won per seat (gross)
}

const live = (s: SeatState) => s.inHand && !s.folded;
const canAct = (s: SeatState) => live(s) && !s.allIn;
export const potTotal = (h: Hand) => h.seats.reduce((a, s) => a + s.committed, 0);

function nextSeat(h: Hand, from: number, pred: (s: SeatState) => boolean): number {
  const n = h.seats.length;
  for (let k = 1; k <= n; k++) { const j = (from + k) % n; if (pred(h.seats[j])) return j; }
  return -1;
}

export function startHand(cfg: Config, stacks: number[], dealer: number, no: number): Hand {
  const seats: SeatState[] = stacks.map(st => ({ inHand: st > 0, stack: st, bet: 0, committed: 0, folded: false, allIn: false, acted: false, lastCur: -1, last: '' }));
  const h: Hand = { no, dealer, sb: -1, bb: -1, bbAmt: cfg.bbAmt, seats, street: 0, board: [], hole: [], holeSkipped: false, cur: 0, lastFull: cfg.bbAmt, toAct: -1, phase: 'hole', actions: [], result: null };
  if (!seats[dealer]?.inHand) h.dealer = dealer = nextSeat(h, dealer, s => s.inHand);
  const inCount = seats.filter(s => s.inHand).length;
  h.sb = inCount === 2 ? dealer : nextSeat(h, dealer, s => s.inHand);
  h.bb = nextSeat(h, h.sb, s => s.inHand);
  post(h, h.sb, cfg.sbAmt, 'SB'); post(h, h.bb, cfg.bbAmt, 'BB');
  h.cur = cfg.bbAmt; h.lastFull = cfg.bbAmt;
  h.toAct = nextSeat(h, h.bb, canAct);
  return h;
}
function post(h: Hand, i: number, amt: number, label: string) {
  const s = h.seats[i], add = Math.min(amt, s.stack);
  const potBefore = potTotal(h);
  s.stack -= add; s.bet += add; s.committed += add; s.last = label;
  if (s.stack === 0) s.allIn = true;
  h.actions.push({ seat: i, street: 0, kind: 'post', to: s.bet, add, potBefore, curBefore: h.cur, allIn: s.allIn, full: false });
}

export interface Legal { fold: boolean; check: boolean; call: boolean; callAmt: number; raise: boolean; minTo: number; maxTo: number; allInOnly: boolean }
export function legal(h: Hand, seat = h.toAct): Legal {
  const s = h.seats[seat];
  const none = { fold: false, check: false, call: false, callAmt: 0, raise: false, minTo: 0, maxTo: 0, allInOnly: false };
  if (h.phase !== 'act' || !s || !canAct(s)) return none;
  const toCall = Math.max(0, h.cur - s.bet);
  const callAmt = Math.min(toCall, s.stack);
  const maxTo = s.bet + s.stack;
  const reopened = s.lastCur < 0 || h.cur - s.lastCur >= h.lastFull;
  const anyoneElse = h.seats.some((o, j) => j !== seat && canAct(o));
  const raise = reopened && maxTo > h.cur && anyoneElse;
  const minFull = h.cur + h.lastFull;
  return { fold: true, check: toCall === 0, call: toCall > 0, callAmt, raise, minTo: Math.min(minFull, maxTo), maxTo, allInOnly: maxTo <= minFull };
}

function clone(h: Hand): Hand {
  return { ...h, seats: h.seats.map(s => ({ ...s })), board: [...h.board], hole: [...h.hole], actions: [...h.actions], result: h.result ? [...h.result] : null };
}

export function apply(h0: Hand, ev: Ev): Hand {
  const h = clone(h0);
  if (ev.t === 'hole') {
    if (h.phase !== 'hole') return h0;
    h.hole = ev.cards; h.holeSkipped = ev.cards.length === 0;
    h.phase = 'act';
    settle(h);
    return h;
  }
  if (ev.t === 'act') {
    if (h.phase !== 'act') return h0;
    const i = h.toAct, s = h.seats[i], L = legal(h, i);
    const potBefore = potTotal(h), curBefore = h.cur;
    let add = 0, full = false, kind = ev.kind;
    if (kind === 'check' && !L.check) kind = 'call';
    if (kind === 'call' && !L.call) kind = 'check';
    if (kind === 'raise' && !L.raise) kind = L.call ? 'call' : 'check';
    if (kind === 'fold') { s.folded = true; s.last = 'Fold'; }
    else if (kind === 'check') { s.last = 'Check'; }
    else if (kind === 'call') { add = L.callAmt; s.last = 'Call'; }
    else {
      const to = Math.max(Math.min(ev.to ?? L.minTo, L.maxTo), Math.min(L.minTo, L.maxTo));
      add = to - s.bet;
      full = to - h.cur >= h.lastFull;
      if (full) h.lastFull = to - h.cur;
      s.last = h.cur === 0 ? 'Bet' : 'Raise';
      h.cur = to;
      for (const o of h.seats) if (o !== s && canAct(o)) o.acted = false;
    }
    s.stack -= add; s.bet += add; s.committed += add;
    if (s.stack === 0 && kind !== 'fold' && kind !== 'check') { s.allIn = true; s.last = 'All-in'; }
    s.acted = true; s.lastCur = h.cur;
    h.actions.push({ seat: i, street: h.street, kind, to: s.bet, add, potBefore, curBefore, allIn: s.allIn, full });
    settle(h);
    return h;
  }
  if (ev.t === 'board') {
    if (h.phase !== 'board') return h0;
    h.board.push(...ev.cards);
    h.street++;
    startStreet(h);
    return h;
  }
  if (ev.t === 'award') {
    if (h.phase !== 'showdown') return h0;
    h.result = award(h, ev.winners);
    h.phase = 'done';
    return h;
  }
  return h0;
}

/** decide what happens after an action: next player, next street, runout or showdown */
function settle(h: Hand) {
  const alive = h.seats.filter(live);
  if (alive.length === 1) { h.result = award(h, []); h.phase = 'done'; h.toAct = -1; return; }
  const pending = h.seats.findIndex((s, j) => canAct(s) && (!s.acted || s.bet < h.cur) && j >= 0);
  if (pending >= 0) {
    // next to act clockwise from the last actor
    const from = h.phase === 'act' && h.actions.length ? h.actions[h.actions.length - 1].seat : h.toAct;
    h.toAct = nextSeat(h, from, s => canAct(s) && (!s.acted || s.bet < h.cur));
    if (h.toAct < 0) h.toAct = pending;
    return;
  }
  // betting round complete
  for (const s of h.seats) { s.bet = 0; s.acted = false; s.lastCur = -1; if (live(s) && !s.allIn) s.last = ''; }
  h.cur = 0; h.lastFull = h.bbAmt; h.toAct = -1;
  if (h.street === 3) { h.phase = 'showdown'; return; }
  h.phase = 'board';
}
function startStreet(h: Hand) {
  const actors = h.seats.filter(canAct).length;
  if (actors <= 1) { // everyone else all-in: run the board out, no betting
    if (h.street === 3) h.phase = 'showdown'; else h.phase = 'board';
    return;
  }
  h.phase = 'act';
  h.toAct = nextSeat(h, h.dealer, canAct);
}

export function pots(h: Hand): Pot[] {
  const contrib = h.seats.map(s => s.committed);
  const levels = [...new Set(h.seats.filter(live).map(s => s.committed))].filter(x => x > 0).sort((a, b) => a - b);
  const out: Pot[] = [];
  let prev = 0;
  for (const L of levels) {
    let amount = 0;
    for (const c of contrib) amount += Math.max(0, Math.min(c, L) - prev);
    const eligible = h.seats.map((s, i) => (live(s) && s.committed >= L ? i : -1)).filter(i => i >= 0);
    if (amount > 0) {
      const last = out[out.length - 1];
      if (last && last.eligible.join() === eligible.join()) last.amount += amount; else out.push({ amount, eligible });
    }
    prev = L;
  }
  // chips from folded players above the top live level (rare) join the last pot
  const rest = contrib.reduce((a, c) => a + Math.max(0, c - prev), 0);
  if (rest && out.length) out[out.length - 1].amount += rest;
  return out;
}
/** pots that need a decision (2+ eligible players) */
export const contested = (h: Hand) => pots(h).filter(p => p.eligible.length > 1);

function award(h: Hand, winners: number[][]): number[] {
  const won = h.seats.map(() => 0);
  let ci = 0;
  for (const p of pots(h)) {
    let ws = p.eligible.length === 1 ? p.eligible : (winners[ci++] ?? []).filter(w => p.eligible.includes(w));
    if (!ws.length) ws = p.eligible;
    // order clockwise from the dealer for the odd chip
    const n = h.seats.length;
    ws = [...ws].sort((a, b) => ((a - h.dealer - 1 + n) % n) - ((b - h.dealer - 1 + n) % n));
    const share = Math.floor(p.amount / ws.length);
    let odd = p.amount - share * ws.length;
    for (const w of ws) { won[w] += share + (odd > 0 ? 1 : 0); odd--; }
  }
  return won;
}

/** stacks after a finished hand */
export function finalStacks(h: Hand): number[] {
  return h.seats.map((s, i) => s.stack + (h.result ? h.result[i] : 0));
}

export function replay(cfg: Config, stacks: number[], dealer: number, no: number, events: Ev[]): Hand {
  let h = startHand(cfg, stacks, dealer, no);
  for (const e of events) h = apply(h, e);
  return h;
}

/** next dealer: the next seat clockwise that still has chips */
export function nextDealer(stacks: number[], dealer: number): number {
  const n = stacks.length;
  for (let k = 1; k <= n; k++) { const j = (dealer + k) % n; if (stacks[j] > 0) return j; }
  return dealer;
}
