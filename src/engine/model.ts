// Opponent model. Every behavioural assumption lives in ASSUME so it can be shown and tuned.
import { NCOMBO, type Card } from './cards';
import { COMBO_PCT } from './preflop';
import { massPercentile, newRange, pctBand, removeDead, type Range } from './range';
import { comboStrength } from './strength';

export interface PlayerStats {
  hands: number;    // hands dealt in
  vpip: number;     // hands where they put chips in voluntarily preflop
  pfr: number;      // hands where they raised preflop
  agg: number;      // postflop bets + raises
  pas: number;      // postflop calls + checks
  foldExp: number;  // sum of game-theory fold shares (alpha) of bets they faced
  folds: number;    // times they actually folded to a bet
}
export const emptyStats = (): PlayerStats => ({ hands: 0, vpip: 0, pfr: 0, agg: 0, pas: 0, foldExp: 0, folds: 0 });

export type OppKind = 'open' | '3bet' | '4bet' | 'limp' | 'callRaise' | 'checkOption' | 'bet' | 'raise' | 'call' | 'check';
export interface OppAction { street: number; kind: OppKind; ratio: number } // ratio = chips added beyond the call / pot before
export interface Opp {
  seat: number;
  stats: PlayerStats;
  actions: OppAction[];
  bet: number;      // chips in front this street
  stack: number;    // chips behind
  allIn: boolean;
  pending: boolean; // preflop and has not acted voluntarily yet
  isBB: boolean;
}

/** Assumptions for a typical home game. Priors are pulled toward each friend's real numbers as hands are logged. */
export const ASSUME = {
  vpipPrior: 0.38, pfrPrior: 0.14, priorHands: 10,    // looser than online: home games see more limps and calls
  aggPrior: 0.3, aggStrength: 8,                     // share of postflop actions that are bets/raises
  foldRhoStrength: 4,                                // fold tendency starts at the game-theory benchmark (rho = 1)
  bluffRho: 0.7,                                     // home players bluff ~70% as often as game theory says they should
  slowplayTop: 0.1,                                  // strongest 10% of a range sometimes just calls/checks
  coldContinue: 0.45,                                // a player yet to act continues vs a 2.5bb raise with ~45% of their VPIP range
};

export function estimates(s: PlayerStats) {
  const n = s.hands + ASSUME.priorHands;
  const vpip = (s.vpip + ASSUME.vpipPrior * ASSUME.priorHands) / n;
  const pfr = Math.min(vpip, (s.pfr + ASSUME.pfrPrior * ASSUME.priorHands) / n);
  const agg = (s.agg + ASSUME.aggPrior * ASSUME.aggStrength) / (s.agg + s.pas + ASSUME.aggStrength);
  const rho = Math.max(0.4, Math.min(2, (s.folds + ASSUME.foldRhoStrength) / (s.foldExp + ASSUME.foldRhoStrength)));
  return { vpip, pfr, agg, rho };
}

const RANK_ORDER: Record<string, number> = { '4bet': 6, '3bet': 5, open: 4, callRaise: 3, limp: 2, checkOption: 1 };

/** preflop range from the strongest thing they did before the flop */
export function preflopRange(o: Opp): { range: Range; desc: string } {
  const { vpip, pfr } = estimates(o.stats);
  const pre = o.actions.filter(a => a.street === 0);
  let top: OppKind | null = null;
  for (const a of pre) if (!top || (RANK_ORDER[a.kind] ?? 0) > (RANK_ORDER[top] ?? 0)) top = a.kind;
  const calledReraise = top === 'open' && pre.some(a => a.kind === 'callRaise');
  const V = vpip * 100, PF = pfr * 100;
  let range: Range, desc: string;
  switch (top) {
    case '4bet': range = pctBand(0, 1.8, 0.5); desc = 'Re-re-raised preflop → top 2%'; break;
    case '3bet': { const t = Math.max(2.5, PF * 0.35); range = pctBand(0, t, 1); desc = `Re-raised preflop → top ${t.toFixed(0)}%`; break; }
    case 'open': {
      const t = calledReraise ? Math.max(3, PF * 0.55) : PF;
      range = pctBand(0, t); desc = calledReraise ? `Raised, then called a re-raise → top ${t.toFixed(0)}%` : `Raised preflop → top ${t.toFixed(0)}% (PFR)`;
      break;
    }
    case 'callRaise': {
      const lo = PF * 0.3, hi = Math.min(V * 0.65, 35);
      range = pctBand(0, hi);
      for (let k = 0; k < NCOMBO; k++) if (COMBO_PCT[k] <= lo) range[k] *= 0.3;
      desc = `Called a raise → mostly ${lo.toFixed(0)}–${hi.toFixed(0)}% hands`;
      break;
    }
    case 'limp': {
      range = pctBand(0, V);
      for (let k = 0; k < NCOMBO; k++) if (COMBO_PCT[k] <= PF * 0.7) range[k] *= 0.25;
      desc = `Limped → hands inside their ${V.toFixed(0)}% VPIP, few premiums`;
      break;
    }
    default: {
      range = newRange(1);
      for (let k = 0; k < NCOMBO; k++) if (COMBO_PCT[k] <= PF) range[k] *= 0.35;
      desc = o.isBB ? 'Checked the big blind → any two, few premiums' : 'Any two cards';
    }
  }
  return { range, desc };
}

const edge = (q: number, cut: number, soft = 0.04) => (q <= cut - soft ? 1 : q >= cut + soft ? 0 : (cut + soft - q) / (2 * soft));

/**
 * Bayesian re-weighting (Poki-style weight tables): each postflop action multiplies every combo's
 * weight by how likely that combo is to take that action, given where it sits in their range.
 */
export function applyPostflop(range: Range, o: Opp, board: Card[], hero: Card[]): { range: Range; notes: string[] } {
  const { agg, rho } = estimates(o.stats);
  const notes: string[] = [];
  for (const a of o.actions) {
    if (a.street === 0) continue;
    const n = a.street + 2;            // board cards visible when they acted
    const B = board.slice(0, n);
    if (B.length < n) continue;
    const S = comboStrength(B, hero);
    const q = massPercentile(range, S);
    const r = Math.max(0.05, a.ratio);
    const alpha = r / (1 + r);         // bet / (pot + bet): game-theory bluff share
    if (a.kind === 'bet' || a.kind === 'raise') {
      const betShare = Math.min(0.7, Math.max(0.1, agg * 1.2 * (a.kind === 'raise' ? 0.6 : 1)));
      const bluffShare = Math.min(0.45, alpha * ASSUME.bluffRho);
      const value = betShare * (1 - bluffShare);
      const bluffDensity = (betShare * bluffShare) / 0.4;
      for (let k = 0; k < NCOMBO; k++) if (range[k] > 0) {
        const qq = q[k];
        const m = Math.max(edge(qq, value), qq > 0.6 ? bluffDensity : 0.04);
        range[k] *= m;
      }
      notes.push(`${a.kind === 'bet' ? 'Bet' : 'Raised'} ${Math.round(r * 100)}% pot → ~${Math.round(value * 100)}% strongest + some bluffs`);
    } else if (a.kind === 'call') {
      const f = Math.min(0.9, Math.max(0.05, alpha * rho));
      for (let k = 0; k < NCOMBO; k++) if (range[k] > 0) {
        const qq = q[k];
        range[k] *= qq < ASSUME.slowplayTop ? 0.5 : Math.max(0.05, edge(qq, 1 - f));
      }
      notes.push(`Called ${Math.round(r * 100)}% pot → kept the top ~${Math.round((1 - f) * 100)}%`);
    } else if (a.kind === 'check') {
      for (let k = 0; k < NCOMBO; k++) if (range[k] > 0 && q[k] < ASSUME.slowplayTop * 1.2) range[k] *= 0.4;
      notes.push('Checked → fewer very strong hands');
    }
  }
  return { range, notes };
}

export function buildRange(o: Opp, board: Card[], hero: Card[]) {
  const pre = preflopRange(o);
  removeDead(pre.range, [...hero, ...board]);
  const post = applyPostflop(pre.range, o, board, hero);
  return { range: post.range, desc: [pre.desc, ...post.notes].join(' · ') };
}

/** probability an opponent folds when facing `call` more chips into `pot` */
export function foldProb(o: Opp, call: number, potBefore: number, bb: number, to: number): number {
  const { vpip, rho } = estimates(o.stats);
  if (o.pending) {
    const cont = Math.min(vpip, vpip * ASSUME.coldContinue * Math.sqrt((2.5 * bb) / Math.max(to, bb)) * (o.isBB ? 1.5 : 1));
    return 1 - Math.max(0.01, cont);
  }
  const alpha = call / (potBefore + call);
  return Math.min(0.95, Math.max(0.02, alpha * rho));
}
