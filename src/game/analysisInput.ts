// Translate the live hand into what the engine needs (hero = seat 0).
import type { AnalyzeInput } from '../engine/advisor';
import { emptyStats, type Opp, type OppAction, type PlayerStats } from '../engine/model';
import { legal, potTotal, type Hand } from './rules';

export function oppActions(h: Hand, seat: number): OppAction[] {
  const out: OppAction[] = [];
  let preRaises = 0;
  for (const a of h.actions) {
    if (a.kind === 'post') continue;
    const isMe = a.seat === seat;
    const prevBet = a.to - a.add;
    const toCall = Math.max(0, a.curBefore - prevBet);
    if (a.street === 0) {
      if (isMe) {
        if (a.kind === 'raise') out.push({ street: 0, kind: preRaises === 0 ? 'open' : preRaises === 1 ? '3bet' : '4bet', ratio: (a.to - a.curBefore) / Math.max(1, a.potBefore + toCall) });
        else if (a.kind === 'call') out.push({ street: 0, kind: a.curBefore <= h.bbAmt ? 'limp' : 'callRaise', ratio: toCall / Math.max(1, a.potBefore - toCall) });
        else if (a.kind === 'check') out.push({ street: 0, kind: 'checkOption', ratio: 0 });
      }
      if (a.kind === 'raise') preRaises++;
      continue;
    }
    if (!isMe) continue;
    if (a.kind === 'raise') out.push({ street: a.street, kind: a.curBefore === 0 ? 'bet' : 'raise', ratio: (a.to - a.curBefore) / Math.max(1, a.potBefore + toCall) });
    else if (a.kind === 'call') out.push({ street: a.street, kind: 'call', ratio: toCall / Math.max(1, a.potBefore - toCall) });
    else if (a.kind === 'check') out.push({ street: a.street, kind: 'check', ratio: 0 });
  }
  return out;
}

export function buildInput(h: Hand, stats: PlayerStats[]): AnalyzeInput | null {
  const me = h.seats[0];
  if (!me?.inHand || me.folded || h.hole.length !== 2) return null;
  if (h.phase !== 'act' && h.phase !== 'board') return null;
  const L = legal({ ...h, phase: 'act' }, 0);
  const opps: Opp[] = [];
  h.seats.forEach((s, i) => {
    if (i === 0 || !s.inHand || s.folded) return;
    const acts = oppActions(h, i);
    opps.push({
      seat: i, stats: stats[i] ?? emptyStats(), actions: acts, bet: s.bet, stack: s.stack, allIn: s.allIn,
      pending: h.street === 0 && !acts.some(a => a.street === 0), isBB: i === h.bb,
    });
  });
  return {
    hero: h.hole, board: h.board, street: h.street, pot: potTotal(h),
    heroBet: me.bet, heroStack: me.stack, cur: h.cur,
    minTo: L.minTo || h.cur + h.lastFull, maxTo: L.maxTo || me.bet + me.stack, canRaise: L.raise,
    bb: h.bbAmt, opps,
  };
}
