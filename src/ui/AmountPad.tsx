// Exact amount. Illegal sizes are blocked with the reason, never silently changed.
import { useState } from 'react';
import type { Analysis } from '../engine/advisor';
import type { Hand, Legal } from '../game/rules';
import type { Size } from '../game/sizes';
import { bbs, fmt, pct } from './format';
import { tick } from './haptics';
import { evAt } from './useAnalysis';

export function AmountPad({ hand, L, initial, sizes, analysis, name, hero, bb, onConfirm }: {
  hand: Hand; L: Legal; initial: number; sizes: Size[]; analysis: Analysis | null; name: string; hero: boolean; bb: number; onConfirm: (to: number) => void;
}) {
  const [str, setStr] = useState(String(initial || ''));
  const [fresh, setFresh] = useState(true); // first keypress replaces the suggested amount
  const v = parseInt(str || '0', 10);
  let err = '';
  if (!v) err = 'Type an amount';
  else if (v > L.maxTo) err = `Only ${fmt(L.maxTo)} available (all-in)`;
  else if (v <= hand.cur) err = `Must be more than the current bet ${fmt(hand.cur)}`;
  else if (v < L.minTo && v !== L.maxTo) err = `Minimum raise is to ${fmt(L.minTo)}`;
  const e = hero && !err ? evAt(analysis, v) : null;
  const press = (k: string) => {
    tick();
    if (k === '⌫') setStr(x => (fresh ? '' : x.slice(0, -1)));
    else setStr(x => ((fresh ? '' : x) + k).replace(/^0+/, '').slice(0, 7));
    setFresh(false);
  };
  const word = hand.cur === 0 ? 'Bet' : 'Raise to';
  const potNow = hand.seats.reduce((a, x) => a + x.committed, 0);
  return (
    <div>
      <div className="row"><span className="cap">{hero ? word : `${name} · ${word.toLowerCase()}`}</span><span className="muted num" style={{ fontSize: 12 }}>min {fmt(L.minTo)} · all-in {fmt(L.maxTo)}</span></div>
      <div className="amt-head">
        <span className={`big num ${err && str ? 'bad' : ''}`}>{str ? fmt(v) : '0'}</span>
        <span className="side">
          {e ? <><b className="num">{bbs(e.ev, bb)} bb</b>folds ~{pct(e.fold)}</> : null}
          <span className="num">{v > 0 ? `${(v / Math.max(1, potNow)).toFixed(2)}× pot` : ''}</span>
        </span>
      </div>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {sizes.map(z => (
          <button key={z.to} className={`chip ${v === z.to ? 'on' : ''}`} style={{ flex: '1 0 22%', color: z.label === 'All-in' ? 'var(--allin)' : undefined, borderColor: z.label === 'All-in' ? 'var(--allin)' : undefined }}
            onClick={() => { tick(); setStr(String(z.to)); setFresh(true); }}>{z.label} {z.label === 'All-in' ? '' : fmt(z.to)}</button>
        ))}
      </div>
      <div className="numpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'].map(k => <button key={k} onClick={() => press(k)} aria-label={k === '⌫' ? 'Delete' : k}>{k}</button>)}
      </div>
      <p className="sub" style={{ textAlign: 'center', minHeight: 18, marginBottom: 8, color: err && str ? 'var(--fold)' : undefined }}>{err && str ? err : ''}</p>
      <button className="go" disabled={!!err} onClick={() => onConfirm(v)}>{v === L.maxTo ? `All-in ${fmt(v)}` : `${word} ${fmt(v)}`}</button>
    </div>
  );
}
