// Per-player tendencies, counted from finished hands. They feed the opponent model's priors.
import { emptyStats, type PlayerStats } from '../engine/model';
import type { Hand } from './rules';

export function addHand(stats: PlayerStats[], h: Hand): PlayerStats[] {
  const out = stats.map(s => ({ ...s }));
  while (out.length < h.seats.length) out.push(emptyStats());
  h.seats.forEach((seat, i) => {
    if (!seat.inHand) return;
    const s = out[i];
    s.hands++;
    const mine = h.actions.filter(a => a.seat === i && a.kind !== 'post');
    const pre = mine.filter(a => a.street === 0);
    if (pre.some(a => a.kind === 'call' || a.kind === 'raise')) s.vpip++;
    if (pre.some(a => a.kind === 'raise')) s.pfr++;
    for (const a of mine) {
      if (a.street === 0) continue;
      if (a.kind === 'raise') s.agg++; else if (a.kind === 'call' || a.kind === 'check') s.pas++;
      const prevBet = a.to - a.add;
      const toCall = a.curBefore - prevBet;
      if (toCall > 0 && a.potBefore > 0) {
        s.foldExp += toCall / a.potBefore; // game-theory fold share of the bet they faced
        if (a.kind === 'fold') s.folds++;
      }
    }
  });
  return out;
}
