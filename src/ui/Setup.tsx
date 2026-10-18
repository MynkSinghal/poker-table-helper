// One decision: who deals. You are always the bottom seat; blinds follow from the button.
import { useState } from 'react';
import { seatName, useStore } from '../game/store';
import { fmt } from './format';
import { tick } from './haptics';
import { Sheet } from './Sheet';
import { Table, type SeatView } from './Table';
import { startAwake } from './wakeLock';

const LADDER = [20, 30, 40, 50, 75, 100, 150, 200, 300, 500];
const PRESETS: [number, number][] = [[5, 10], [10, 20], [25, 50], [50, 100]];

export function Setup() {
  const s = useStore();
  const c = s.cfg;
  const [custom, setCustom] = useState(false);
  const [names, setNames] = useState(false);
  const mult = Math.round(c.startStack / c.bbAmt);
  const sb = c.n === 2 ? c.dealer : (c.dealer + 1) % c.n;
  const bb = (sb + 1) % c.n;
  const seats: SeatView[] = Array.from({ length: c.n }, (_, i) => ({
    label: i === 0 ? 'YOU' : String(i + 1), you: i === 0, dealer: i === c.dealer,
    tag: i === sb && i === c.dealer ? 'D · SB' : i === sb ? 'SB' : i === bb ? 'BB' : undefined,
    name: i > 0 && c.names[i]?.trim() ? c.names[i].trim() : undefined,
    state: i === c.dealer ? 'sel' : '',
  }));
  const stepMult = (d: number) => {
    const i = Math.max(0, Math.min(LADDER.length - 1, (LADDER.indexOf(mult) < 0 ? 5 : LADDER.indexOf(mult)) + d));
    s.setCfg({ startStack: LADDER[i] * c.bbAmt });
  };
  const setBlinds = (a: number, b: number) => s.setCfg({ sbAmt: a, bbAmt: b, startStack: mult * b });
  const resumable = s.stacks.length > 0 && s.handNo > 0;
  return (
    <main className="screen">
      <div className="top" style={{ alignItems: 'flex-end', minHeight: 64 }}>
        <div><h1 className="title">New game</h1><div className="sub">Tap the dealer. Blinds follow automatically.</div></div>
        {resumable && <button className="link" onClick={() => useStore.setState({ screen: 'game' })}>Resume</button>}
      </div>
      <Table seats={seats} onSeat={i => { tick(); s.setCfg({ dealer: i }); }}
        center={<><span className="cap">Dealer</span><span className="pot">{seatName(c, c.dealer)}</span><span className="sub">SB {seatName(c, sb)} · BB {seatName(c, bb)}</span></>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
        <div className="panel row"><span style={{ fontWeight: 800 }}>Players</span>
          <div className="stepper"><button onClick={() => { const n = Math.max(2, c.n - 1); s.setCfg({ n, dealer: c.dealer >= n ? 0 : c.dealer }); }} aria-label="Fewer players">−</button>
            <span className="val num">{c.n}</span>
            <button onClick={() => s.setCfg({ n: Math.min(9, c.n + 1) })} aria-label="More players">+</button></div>
        </div>
        <div className="panel row"><span style={{ fontWeight: 800 }}>Stack</span>
          <div className="stepper"><button onClick={() => stepMult(-1)} aria-label="Smaller stack">−</button>
            <span className="val num">{mult}<small>BB · {fmt(c.startStack)}</small></span>
            <button onClick={() => stepMult(1)} aria-label="Bigger stack">+</button></div>
        </div>
        <span className="cap" style={{ marginTop: 4 }}>Blinds</span>
        <div className="chips">
          {PRESETS.map(([a, b]) => <button key={b} className={`chip ${c.sbAmt === a && c.bbAmt === b ? 'on' : ''}`} onClick={() => setBlinds(a, b)}>{a}/{b}</button>)}
          <button className={`chip ${PRESETS.some(([a, b]) => a === c.sbAmt && b === c.bbAmt) ? '' : 'on'}`} onClick={() => setCustom(true)}>
            {PRESETS.some(([a, b]) => a === c.sbAmt && b === c.bbAmt) ? 'Custom' : `${c.sbAmt}/${c.bbAmt}`}</button>
        </div>
      </div>
      <div className="foot">
        <button className="primary" onClick={() => { tick(); startAwake(); s.startGame(); }}>Start hand</button>
        <button className="link" onClick={() => setNames(true)}>Player names (optional)</button>
      </div>

      <Sheet open={custom} onClose={() => setCustom(false)}>
        <h2>Custom blinds</h2>
        {(['sbAmt', 'bbAmt'] as const).map(k => {
          const v = c[k], stp = v < 10 ? 1 : v < 50 ? 5 : v < 200 ? 25 : 50;
          return <div key={k} className="panel row" style={{ marginBottom: 8 }}><span style={{ fontWeight: 800 }}>{k === 'sbAmt' ? 'Small blind' : 'Big blind'}</span>
            <div className="stepper">
              <button onClick={() => k === 'sbAmt' ? setBlinds(Math.max(1, v - stp), Math.max(c.bbAmt, Math.max(1, v - stp))) : setBlinds(c.sbAmt, Math.max(c.sbAmt, v - stp))}>−</button>
              <span className="val num">{fmt(v)}</span>
              <button onClick={() => k === 'sbAmt' ? setBlinds(v + stp, Math.max(c.bbAmt, v + stp)) : setBlinds(c.sbAmt, v + stp)}>+</button>
            </div></div>;
        })}
        <button className="primary" onClick={() => setCustom(false)}>Done</button>
      </Sheet>
      <Sheet open={names} onClose={() => setNames(false)}>
        <h2>Player names</h2>
        <p className="sub" style={{ marginTop: -6, marginBottom: 12 }}>Seats count clockwise from you. Leave blank to keep numbers.</p>
        <div className="names">
          {Array.from({ length: c.n }, (_, i) => (
            <label key={i}><span className="cap">Seat {i + 1}{i === 0 ? ' · you' : ''}</span>
              <input id={`nm${i}`} defaultValue={c.names[i] ?? ''} maxLength={12} placeholder={i === 0 ? 'You' : `Seat ${i + 1}`} autoComplete="off"
                onBlur={e => { const nm = [...c.names]; nm[i] = e.target.value; s.setCfg({ names: nm }); }} />
            </label>
          ))}
        </div>
        <button className="primary" style={{ marginTop: 14 }} onClick={() => setNames(false)}>Done</button>
      </Sheet>
    </main>
  );
}
