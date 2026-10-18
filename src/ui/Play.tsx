// The live hand. Read-only glance info on top (complications), the table in the middle,
// and every tap in the lower band: undo next to the three action buttons.
import { useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import type { Analysis } from '../engine/advisor';
import type { Card } from '../engine/cards';
import { legal, potTotal, type Hand } from '../game/rules';
import { namedSizes, type Size } from '../game/sizes';
import { currentHand, seatName, useStore } from '../game/store';
import { AmountPad } from './AmountPad';
import { CardPicker } from './CardPicker';
import { Complications, type CompItem } from './Complications';
import { DetailSheet } from './DetailSheet';
import { bbs, fmt, pct } from './format';
import { tick } from './haptics';
import { IconMore, IconUndo } from './icons';
import { Menu } from './Menu';
import { PC } from './PlayingCard';
import { Sheet } from './Sheet';
import { Table, type SeatView } from './Table';
import { evAt, useAnalysis } from './useAnalysis';

const STREET = ['Preflop', 'Flop', 'Turn', 'River'];

interface Drag { x: number; y0: number; y1: number; min: number; max: number; sizes: Size[]; to: number; armed: boolean; seat: number }

export function Play() {
  const s = useStore();
  const hand = currentHand(s)!;
  const cfg = s.cfg, bb = cfg.bbAmt, step = Math.max(1, cfg.sbAmt);
  const { analysis, busy } = useAnalysis(hand, s.stats);
  const [sheet, setSheet] = useState<null | 'detail' | 'menu' | 'hole' | 'amount'>(null);
  const [focus, setFocus] = useState(0);
  const [boardPick, setBoardPick] = useState<Card[]>([]);
  const [holePick, setHolePick] = useState<Card[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [amountInit, setAmountInit] = useState(0);
  const compsRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ y: number; moved: boolean } | null>(null);

  const actor = hand.toAct;
  const acting = hand.phase === 'act' && actor >= 0;
  const heroTurn = acting && actor === 0;
  const L = legal(hand);
  const toCall = acting ? Math.max(0, hand.cur - hand.seats[actor].bet) : 0;
  const advice = heroTurn ? analysis : null;
  const bestKind = advice?.best?.kind ?? null;
  const sizes = useMemo(() => (acting ? namedSizes(hand, actor, step) : []), [hand, actor, acting, step]);

  // ----- complications
  const dragEV = drag && heroTurn ? evAt(analysis, drag.to) : null;
  const comps = compItems(analysis, hand, busy, dragEV, drag?.to ?? null, bb);

  // ----- table
  const seats: SeatView[] = hand.seats.map((st, i) => ({
    label: i === 0 ? 'YOU' : String(i + 1), you: i === 0,
    name: i > 0 && cfg.names[i]?.trim() ? cfg.names[i].trim() : undefined,
    stack: st.inHand ? (st.allIn ? 'all-in' : fmt(st.stack)) : 'out',
    tag: st.allIn && !st.folded ? 'ALL-IN' : hand.street === 0 && i === hand.sb ? 'SB' : hand.street === 0 && i === hand.bb ? 'BB' : undefined,
    allIn: st.allIn && !st.folded,
    bet: st.bet > 0 ? fmt(st.bet) : undefined,
    dealer: i === hand.dealer,
    state: !st.inHand || st.folded ? 'out' : i === actor && acting ? 'turn' : '',
  }));
  const board = [];
  for (let i = 0; i < 5; i++) board.push(<PC key={i} c={hand.board[i] ?? null} size="m" />);
  const center = <><span className="cap">Pot</span><span className="pot num">{fmt(potTotal(hand))}</span><div className="cards">{board}</div></>;
  const hero = hand.seats[0].inHand && !hand.seats[0].folded
    ? <button className="cards" onClick={() => { setHolePick([]); setSheet('hole'); }} aria-label="Your cards">
        {hand.hole.length === 2 ? hand.hole.map(c => <PC key={c} c={c} size="s" />) : <><PC size="s" /><PC size="s" /></>}
      </button>
    : undefined;

  // ----- actions
  const act = (kind: 'fold' | 'check' | 'call' | 'raise', to?: number) => { tick(); setDrag(null); s.dispatch({ t: 'act', kind, to }); };
  const geometry = (btn: HTMLElement): Drag => {
    const r = btn.getBoundingClientRect();
    const top = compsRef.current?.getBoundingClientRect().bottom ?? 160;
    const sz = heroTurn && analysis ? analysis.moves.filter(m => m.kind === 'raise').map(m => ({ label: m.label, to: m.to! })) : sizes;
    return { x: r.left + r.width / 2, y0: r.top - 16, y1: top + 34, min: L.minTo, max: L.maxTo, sizes: sz, to: L.minTo, armed: false, seat: actor };
  };
  const yFor = (d: Drag, v: number) => d.max <= d.min ? d.y1 : d.y0 - (d.y0 - d.y1) * (Math.log(v / d.min) / Math.log(d.max / d.min));
  const valueAt = (d: Drag, y: number) => {
    if (d.max <= d.min) return d.max;
    const t = Math.min(1, Math.max(0, (d.y0 - y) / (d.y0 - d.y1)));
    for (const z of d.sizes) if (Math.abs(yFor(d, z.to) - y) < 15) return z.to; // magnetic detents
    const v = d.min * Math.pow(d.max / d.min, t);
    return Math.min(d.max, Math.max(d.min, Math.round(v / step) * step));
  };
  const onRaiseDown = (e: RPE<HTMLButtonElement>) => {
    if (!L.raise) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { y: e.clientY, moved: false };
  };
  const onRaiseMove = (e: RPE<HTMLButtonElement>) => {
    const p = press.current; if (!p) return;
    if (!p.moved && p.y - e.clientY > 10) {
      p.moved = true;
      const g = geometry(e.currentTarget);
      setDrag({ ...g, to: valueAt(g, e.clientY) });
      tick();
      return;
    }
    if (p.moved) setDrag(d => {
      if (!d) return d;
      const to = valueAt(d, e.clientY);
      if (to !== d.to && d.sizes.some(z => z.to === to)) tick();
      return { ...d, to, armed: false };
    });
  };
  const onRaiseUp = () => {
    const p = press.current; press.current = null;
    if (!p) return;
    if (p.moved) { setDrag(d => (d ? { ...d, armed: true } : d)); return; }
    if (drag?.armed) { act('raise', drag.to); return; }
    const best = advice?.best?.kind === 'raise' ? advice.best.to! : L.minTo;
    setAmountInit(L.maxTo <= L.minTo ? L.maxTo : best);
    setSheet('amount');
  };

  const buttons = [
    <button key="f" className={`ab fold ${heroTurn ? (bestKind === 'fold' ? 'best' : 'live') : ''}`} disabled={!acting || !!drag} onClick={() => act('fold')}>
      {heroTurn && bestKind === 'fold' && <span className="badge">BEST</span>}
      <b>FOLD</b>{heroTurn && advice && <small>{bbs(0, bb)} bb</small>}
    </button>,
    <button key="c" className={`ab call ${heroTurn ? (bestKind === 'check' || bestKind === 'call' ? 'best' : 'live') : ''}`} disabled={!acting || !!drag} onClick={() => act(L.check ? 'check' : 'call')}>
      {heroTurn && (bestKind === 'check' || bestKind === 'call') && <span className="badge">BEST</span>}
      <b>{L.check ? 'CHECK' : 'CALL'}</b>
      <small>{L.call ? `${L.callAmt >= hand.seats[actor]?.stack ? 'all-in ' : ''}${fmt(L.callAmt)}` : ''}{heroTurn && advice ? `${L.call ? ' · ' : ''}${bbs(advice.moves.find(m => m.kind === (L.check ? 'check' : 'call'))?.ev ?? 0, bb)}` : ''}</small>
    </button>,
    <button key="r" className={`ab ${L.allInOnly ? 'allin' : 'raise'} ${drag?.armed ? 'armed' : heroTurn ? (bestKind === 'raise' ? 'best' : 'live') : ''}`} disabled={!acting || !L.raise}
      style={{ zIndex: drag ? 36 : undefined }}
      onPointerDown={onRaiseDown} onPointerMove={onRaiseMove} onPointerUp={onRaiseUp} onPointerCancel={() => { press.current = null; }}>
      {heroTurn && bestKind === 'raise' && !drag && <span className="badge">BEST</span>}
      <b>{drag?.armed ? 'CONFIRM' : L.allInOnly ? 'ALL-IN' : hand.cur === 0 ? 'BET' : 'RAISE'}</b>
      <small>{drag?.armed ? `to ${fmt(drag.to)}` : heroTurn && advice?.best?.kind === 'raise' ? `to ${fmt(advice.best.to!)} · ${bbs(advice.best.ev, bb)}` : L.raise ? 'drag ↑ · tap to type' : ''}</small>
    </button>,
  ];
  if (cfg.leftHanded) buttons.reverse();

  const who = hand.phase === 'board' ? `Deal the ${(STREET[hand.street + 1] ?? '').toLowerCase()}` : heroTurn ? 'Your turn' : acting ? `${seatName(cfg, actor)} to act` : '';
  const ctx = acting ? (toCall > 0 ? `to call ${fmt(toCall)}` : hand.cur === 0 ? 'no bet yet' : 'can check') : '';

  const nextName = (STREET[hand.street + 1] ?? '').toLowerCase();
  const usedBoard = new Set<Card>([...hand.hole, ...hand.board]);
  const usedHole = new Set<Card>(hand.board);
  const nBoard = hand.street === 0 ? 3 : 1;

  return (
    <main className="screen">
      <div className="top">
        <span className="cap">{STREET[hand.street]} · Hand {hand.no}</span>
        <button className="round" onClick={() => setSheet('menu')} aria-label="Menu"><IconMore /></button>
      </div>
      <Complications refEl={compsRef} items={comps} onTap={i => { setFocus(i); setSheet('detail'); }} />
      <Table seats={seats} center={center} hero={hero} />
      <div className="actor" style={{ position: 'relative', zIndex: drag ? 36 : undefined }}>
        <button className="round" onClick={() => { setDrag(null); s.undo(); tick(); }} disabled={!s.events.length} aria-label="Undo"><IconUndo /></button>
        <span className="who" style={{ color: heroTurn ? 'var(--white)' : undefined }}>{who}</span>
        <span className="ctx">{drag ? '' : ctx}</span>
      </div>
      <div className="pad" style={{ position: 'relative', zIndex: drag ? 35 : undefined }}>{buttons}</div>

      {drag && <RaiseOverlay d={drag} yFor={yFor} heroEV={dragEV} hero={heroTurn} name={seatName(cfg, drag.seat)} left={cfg.leftHanded} bb={bb}
        onCancel={() => setDrag(null)} onType={() => { setAmountInit(drag.to); setDrag(null); setSheet('amount'); }} />}

      <Sheet open={hand.phase === 'board'} dismissable={false}>
        <span className="cap">{STREET[hand.street]} done · {hand.seats.filter(x => x.inHand && !x.folded).length} players in · Pot {fmt(potTotal(hand))}</span>
        <h2>What came on the {nextName}?</h2>
        <CardPicker count={nBoard} value={boardPick} onChange={setBoardPick} used={usedBoard} />
        <div className="foot" style={{ paddingBottom: 0 }}>
          <button className="primary" disabled={boardPick.length !== nBoard} onClick={() => { tick(); s.dispatch({ t: 'board', cards: boardPick }); setBoardPick([]); }}>
            Deal {nextName}
          </button>
          <button className="link" onClick={() => { setBoardPick([]); s.undo(); }}>Undo last action</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'hole'} onClose={() => setSheet(null)}>
        <h2>Your cards</h2>
        <CardPicker count={2} value={holePick} onChange={setHolePick} used={usedHole} />
        <div className="foot" style={{ paddingBottom: 0 }}>
          <button className="primary" disabled={holePick.length !== 2} onClick={() => { s.fixHole(holePick); setSheet(null); }}>Save cards</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'amount'} onClose={() => setSheet(null)}>
        <AmountPad key={amountInit} hand={hand} L={L} initial={amountInit} sizes={heroTurn && analysis ? analysis.moves.filter(m => m.kind === 'raise').map(m => ({ label: m.label, to: m.to! })) : sizes}
          analysis={heroTurn ? analysis : null} name={seatName(cfg, actor)} hero={heroTurn} bb={bb}
          onConfirm={to => { setSheet(null); act('raise', to); }} />
      </Sheet>

      <Sheet open={sheet === 'detail'} onClose={() => setSheet(null)}>
        <DetailSheet analysis={analysis} hand={hand} cfg={cfg} focus={focus} onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)}>
        <Menu onClose={() => setSheet(null)} inHand />
      </Sheet>
    </main>
  );
}

function compItems(a: Analysis | null, h: Hand, busy: boolean, dragEV: { ev: number; fold: number } | null, dragTo: number | null, bb: number): CompItem[] {
  if (!a) {
    const why = h.seats[0].folded ? 'you folded' : h.hole.length < 2 ? 'add your cards' : 'working…';
    return ['WIN', 'NEED', 'EV', h.street === 0 ? 'HAND' : 'SPR'].map(l => ({ label: l, value: '—', frac: null, sub: why, busy }));
  }
  const win: CompItem = { label: 'WIN', value: pct(a.win), frac: a.win, sub: a.exact ? `exact · ${a.vsLabel}` : `±${(a.se * 100).toFixed(1)} · ${a.vsLabel}`, busy };
  let second: CompItem = a.toCall > 0
    ? { label: 'NEED', value: pct(a.need), frac: a.need, sub: `to call ${fmt(a.toCall)}` }
    : { label: 'NEED', value: 'FREE', frac: null, sub: 'no bet to call' };
  const b = a.best;
  let third: CompItem = b ? { label: 'EV', value: bbs(b.ev, bb), frac: 0.5 + 0.5 * Math.tanh(b.ev / bb / 6), sub: `bb · ${b.kind}${b.kind === 'raise' ? ` ${fmt(b.to!)}` : ''}`, busy } : { label: 'EV', value: '—', frac: null, sub: '' };
  if (dragEV && dragTo) {
    second = { label: 'FOLDS', value: pct(dragEV.fold), frac: dragEV.fold, sub: `at ${fmt(dragTo)}` };
    third = { label: 'EV', value: bbs(dragEV.ev, bb), frac: 0.5 + 0.5 * Math.tanh(dragEV.ev / bb / 6), sub: `bb at ${fmt(dragTo)}` };
  }
  const fourth: CompItem = h.street === 0
    ? { label: 'HAND', value: a.handPct !== null ? `${a.handPct < 10 ? a.handPct.toFixed(0) : Math.round(a.handPct)}%` : '—', frac: a.handPct !== null ? 1 - a.handPct / 100 : null, sub: 'top of hands' }
    : { label: 'SPR', value: a.spr !== null ? (a.spr >= 10 ? a.spr.toFixed(0) : a.spr.toFixed(1)) : '—', frac: null, sub: a.spr === null ? '' : a.spr < 3 ? 'shallow' : a.spr < 8 ? 'medium' : 'deep' };
  return [win, second, third, fourth];
}

function RaiseOverlay({ d, yFor, heroEV, hero, name, left, bb, onCancel, onType }: {
  d: Drag; yFor: (d: Drag, v: number) => number; heroEV: { ev: number; fold: number } | null; hero: boolean; name: string; left: boolean; bb: number;
  onCancel: () => void; onType: () => void;
}) {
  const ty = yFor(d, d.to);
  const label = d.sizes.find(z => z.to === d.to)?.label;
  const ro = { left: left ? Math.min(window.innerWidth - 236 - 16, d.x + 96) : Math.max(16, d.x - 26 - 236), top: Math.min(Math.max(ty - 150, d.y1 - 20), d.y0 - 130) };
  return (
    <>
      <div className="dragveil" style={{ top: d.y1 - 40 }} onClick={d.armed ? onCancel : undefined} />
      <div className="track" style={{ left: d.x - 1.5, top: d.y1, height: d.y0 - d.y1 }} />
      {d.sizes.map(z => (
        <div key={z.to} className={`det ${z.label === 'All-in' ? 'ai' : ''}`} style={{ left: d.x - 9, top: yFor(d, z.to) }}>
          <i /><span>{z.label}<em className="num">{fmt(z.to)}</em></span>
        </div>
      ))}
      <svg className="band" aria-hidden>
        <defs><filter id="bandglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        <path d={`M${d.x - 24} ${d.y0 + 18} C ${d.x - 10} ${d.y0 - 40}, ${d.x - 4} ${ty + 40}, ${d.x} ${ty}`} fill="none" stroke="var(--raise)" strokeWidth="5" strokeLinecap="round" filter="url(#bandglow)" />
        <path d={`M${d.x + 24} ${d.y0 + 18} C ${d.x + 10} ${d.y0 - 40}, ${d.x + 4} ${ty + 40}, ${d.x} ${ty}`} fill="none" stroke="var(--raise)" strokeWidth="3" strokeLinecap="round" opacity=".55" />
      </svg>
      <div className="thumb" style={{ left: d.x, top: ty }} />
      <button className="readout" style={ro} onClick={onType}>
        <span className="cap" style={{ gridColumn: '1 / -1', marginBottom: 6, textAlign: 'left' }}>{hero ? 'Raise to' : `${name} raises to`}{label ? ` · ${label}` : ''}</span>
        <span className="amt num">{fmt(d.to)}</span>
        <span style={{ textAlign: 'left' }}>
          {hero && heroEV ? <><span className="ev num">{bbs(heroEV.ev, bb)} bb</span><br /><span className="meta">folds ~{pct(heroEV.fold)}</span></> : <span className="meta">{d.armed ? 'Tap CONFIRM to log it' : 'Release to set'}</span>}
        </span>
        <span className="hint">{d.armed ? 'Tap here to type an exact amount · tap outside to cancel' : 'Release to set · then confirm'}</span>
      </button>
    </>
  );
}
