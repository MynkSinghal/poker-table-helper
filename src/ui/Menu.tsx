import { useState } from 'react';
import { estimates } from '../engine/model';
import { currentHand, seatName, useStore } from '../game/store';
import { fmt, pct } from './format';

export function Menu({ onClose, inHand }: { onClose: () => void; inHand?: boolean }) {
  const s = useStore();
  const [confirm, setConfirm] = useState(false);
  const [stats, setStats] = useState(false);
  const h = currentHand(s);
  return (
    <div className="menu">
      <h2>Menu</h2>
      <button className="mi" onClick={() => s.setCfg({ leftHanded: !s.cfg.leftHanded })}>Left-handed layout<span className={`toggle ${s.cfg.leftHanded ? 'on' : ''}`} /></button>
      <button className="mi" onClick={() => setStats(x => !x)}>Players & stats<span className="muted">{stats ? '−' : '+'}</span></button>
      {stats && <div style={{ margin: '-2px 0 10px' }}>
        {s.stacks.map((st, i) => {
          const e = estimates(s.stats[i] ?? { hands: 0, vpip: 0, pfr: 0, agg: 0, pas: 0, foldExp: 0, folds: 0 });
          const n = s.stats[i]?.hands ?? 0;
          return <div key={i} className="result-row" style={{ fontSize: 13 }}><span>{seatName(s.cfg, i)}<span className="muted"> · {n} hands</span></span><span className="num">{fmt(h ? h.seats[i].stack + h.seats[i].committed : st)} · VPIP {pct(e.vpip)} · PFR {pct(e.pfr)}</span></div>;
        })}
        <p className="sub">VPIP / PFR start at a typical home-game value and move toward each player’s real numbers as hands are logged.</p>
      </div>}
      {inHand && <button className="mi" onClick={() => { s.rebuy(); onClose(); }}>Rebuy busted players<span className="muted">next hand</span></button>}
      <button className="mi" onClick={() => { s.toSetup(); onClose(); }}>Table setup<span className="muted">new game</span></button>
      <button className="mi danger" onClick={() => { if (!confirm) { setConfirm(true); return; } s.resetAll(); onClose(); }}>{confirm ? 'Tap again to erase this game' : 'Erase game & stats'}</button>
    </div>
  );
}
