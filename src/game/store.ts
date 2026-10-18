import { create } from 'zustand';
import { emptyStats, type PlayerStats } from '../engine/model';
import { addHand } from './stats';
import { finalStacks, nextDealer, replay, type Config, type Ev, type Hand } from './rules';

export interface Session {
  screen: 'setup' | 'game';
  cfg: Config;
  stacks: number[];
  dealer: number;
  handNo: number;
  events: Ev[];
  stats: PlayerStats[];
  rebuyNext?: boolean;
}
const KEY = 'poker-table-helper.v3';
export const defaultCfg = (): Config => ({ n: 6, names: [], dealer: 0, sbAmt: 10, bbAmt: 20, startStack: 2000, leftHanded: false });
const fresh = (cfg = defaultCfg()): Session => ({ screen: 'setup', cfg, stacks: [], dealer: cfg.dealer, handNo: 0, events: [], stats: [] });

function load(): Session {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.cfg) return v; } catch { /* storage unavailable */ }
  return fresh();
}
function persist(s: Session) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

interface Store extends Session {
  setCfg: (patch: Partial<Config>) => void;
  startGame: () => void;
  dispatch: (e: Ev) => void;
  undo: () => void;
  fixHole: (cards: number[]) => void;
  nextHand: () => void;
  rebuy: () => void;
  toSetup: () => void;
  resetAll: () => void;
}

export const useStore = create<Store>((set, get) => {
  const save = (patch: Partial<Session>) => { set(patch); const g = get(); persist({ screen: g.screen, cfg: g.cfg, stacks: g.stacks, dealer: g.dealer, handNo: g.handNo, events: g.events, stats: g.stats, rebuyNext: g.rebuyNext }); };
  return {
    ...load(),
    setCfg: patch => save({ cfg: { ...get().cfg, ...patch } }),
    startGame: () => {
      const { cfg } = get();
      save({ screen: 'game', stacks: Array(cfg.n).fill(cfg.startStack), dealer: cfg.dealer, handNo: 1, events: [], stats: Array.from({ length: cfg.n }, emptyStats) });
    },
    dispatch: e => save({ events: [...get().events, e] }),
    undo: () => { const ev = get().events; if (ev.length) save({ events: ev.slice(0, -1) }); },
    fixHole: cards => save({ events: get().events.map(e => (e.t === 'hole' ? { t: 'hole', cards } : e)) }),
    nextHand: () => {
      const s = get();
      const h = currentHand(s);
      if (!h || h.phase !== 'done') return;
      const stacks = finalStacks(h).map(x => (s.rebuyNext && x <= 0 ? s.cfg.startStack : x));
      save({ stacks, stats: addHand(s.stats, h), dealer: nextDealer(stacks, h.dealer), handNo: s.handNo + 1, events: [], rebuyNext: false });
    },
    rebuy: () => save({ rebuyNext: true }),
    toSetup: () => save({ screen: 'setup' }),
    resetAll: () => save(fresh(get().cfg)),
  };
});

let memo: { key: string; hand: Hand } | null = null;
export function currentHand(s: Pick<Session, 'cfg' | 'stacks' | 'dealer' | 'handNo' | 'events' | 'screen'>): Hand | null {
  if (s.screen !== 'game' || !s.stacks.length) return null;
  const key = JSON.stringify([s.stacks, s.dealer, s.handNo, s.events, s.cfg.sbAmt, s.cfg.bbAmt]);
  if (memo && memo.key === key) return memo.hand;
  const hand = replay(s.cfg, s.stacks, s.dealer, s.handNo, s.events);
  memo = { key, hand };
  return hand;
}
export const seatName = (cfg: Config, i: number) => (cfg.names[i] && cfg.names[i].trim()) || (i === 0 ? 'You' : `Seat ${i + 1}`);
