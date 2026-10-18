// The maths behind the complications, shown rather than hidden.
import { useState } from 'react';
import type { Analysis } from '../engine/advisor';
import { RANKS } from '../engine/cards';
import { ASSUME } from '../engine/model';
import type { Config, Hand } from '../game/rules';
import { potTotal } from '../game/rules';
import { seatName } from '../game/store';
import { bbs, fmt, pct } from './format';

export function DetailSheet({ analysis: a, hand, cfg, focus, onDone }: { analysis: Analysis | null; hand: Hand; cfg: Config; focus: number; onDone: () => void }) {
  const [sel, setSel] = useState(0);
  const [how, setHow] = useState(false);
  if (!a) return <><p className="sub">Add your cards to see the numbers.</p><button className="primary" onClick={onDone}>Done</button></>;
  const bb = cfg.bbAmt;
  const opps = a.opps.filter(o => !o.pending);
  const pending = a.opps.filter(o => o.pending);
  const cur = opps[Math.min(sel, opps.length - 1)];
  const P = potTotal(hand);
  const best = a.best;
  const titles = ['Win chance', 'Pot odds', 'Expected value', hand.street === 0 ? 'Hand strength' : 'Stack to pot'];
  return (
    <div>
      <span className="cap">{titles[focus]}</span>
      <div className="row" style={{ alignItems: 'flex-end', margin: '6px 0 4px' }}>
        <span className="num" style={{ fontSize: 'clamp(34px, 5.2dvh, 44px)', fontWeight: 900, lineHeight: 1 }}>{(a.win * 100).toFixed(1)}%</span>
        <span style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700 }}>
          {a.exact ? 'exact · every remaining card' : `± ${(a.se * 100).toFixed(1)}% · sampled`}<br />
          <span className="muted">{a.vsLabel}{a.heroHand ? ` · you have ${a.heroHand.toLowerCase()}` : ''}{a.outs !== null ? ` · ${a.outs} outs` : ''}</span>
        </span>
      </div>
      <div className="bars">
        {opps.map((o, i) => (
          <button key={o.seat} className={`barrow ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)}>
            <span className="who">{o.seat < 0 ? 'Typical caller' : seatName(cfg, o.seat)}<span>{o.combos} combos</span></span>
            <span className="pct num">{Number.isNaN(o.eq) ? '…' : pct(o.eq)}</span>
            <span className="bar"><i style={{ width: `${Number.isNaN(o.eq) ? 0 : o.eq * 100}%` }} /></span>
          </button>
        ))}
        {pending.length > 0 && <span className="sub">Yet to act: {pending.map(o => seatName(cfg, o.seat)).join(', ')}. Counted in raise EVs by how often they’d fold.</span>}
      </div>
      {cur && <>
        <span className="cap">{cur.seat < 0 ? 'Typical caller' : seatName(cfg, cur.seat)} — likely hands</span>
        <p className="sub" style={{ margin: '4px 0 10px' }}>{cur.desc}</p>
      </>}
      <div className="split">
        {cur && <div className="grid13">
          {Array.from({ length: 169 }, (_, idx) => {
            const r = Math.floor(idx / 13), c = idx % 13;
            const hi = 12 - Math.min(r, c), lo = 12 - Math.max(r, c);
            const cls = r === c ? hi * 13 + hi : r < c ? hi * 13 + lo : lo * 13 + hi;
            const w = cur.grid[cls] ?? 0;
            return <div key={idx} style={{ background: w > 0.02 ? `rgba(255,255,255,${(0.1 + 0.85 * w).toFixed(2)})` : undefined, color: w > 0.55 ? '#000' : undefined }}>{r === c ? RANKS[hi] : ''}</div>;
          })}
        </div>}
        <div className="evlist">
          <span className="cap">EV per move</span>
          {a.moves.map((m, i) => (
            <div key={i} className={best && m === best ? 'best' : ''}><span>{m.kind === 'raise' ? `${m.label} ${fmt(m.to!)}` : m.label}</span><b className="num">{bbs(m.ev, bb)}</b></div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 13, fontWeight: 800 }}>
        {a.toCall > 0
          ? <>Need to call: {fmt(a.toCall)} ÷ ({fmt(P)} + {fmt(a.toCall)}) = {(a.need * 100).toFixed(1)}%. You have {(a.win * 100).toFixed(1)}%.</>
          : <>No bet to call: checking is free.</>}
        <p className="sub">{best ? `Best: ${best.kind}${best.kind === 'raise' ? ` to ${fmt(best.to!)}` : ''} (${bbs(best.ev, bb)} bb, measured against folding now).` : ''}{a.spr !== null ? ` SPR ${a.spr.toFixed(1)}.` : ''}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <button className="ghost" style={{ height: 52 }} onClick={() => setHow(h => !h)}>{how ? 'Hide method' : 'How it works'}</button>
        <button className="primary" style={{ height: 52 }} onClick={onDone}>Done</button>
      </div>
      {how && <div className="how">
        <p><b>Win chance.</b> One opponent left after the flop: exact, every remaining card against every hand in their range. Otherwise simulated until the error is under ±0.4%.</p>
        <p><b>Their range.</b> Starts from each player’s own VPIP / PFR (priors {pct(ASSUME.vpipPrior)} / {pct(ASSUME.pfrPrior)} worth {ASSUME.priorHands} hands until real hands are logged). Each bet, call or check re-weights every possible hand by how likely it is to take that action, using hand strength now plus after the next card (Billings et al.’s Effective Hand Strength idea, as in the Alberta Poki bot).</p>
        <p><b>Folds.</b> A balanced player folds bet ÷ (pot + bet) of the time (minimum defence frequency). Each friend’s real fold rate moves this up or down. Assumed bluffing: {pct(ASSUME.bluffRho)} of the game-theory amount.</p>
        <p><b>EV.</b> Chips gained versus folding now, for this betting round: call = win × (pot + call) − call; raise = P(all fold) × pot + P(called) × (win vs calling hands × final pot − chips risked). Future streets are not simulated.</p>
      </div>}
    </div>
  );
}
