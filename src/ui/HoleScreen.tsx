import { useState } from 'react';
import type { Card } from '../engine/cards';
import { currentHand, seatName, useStore } from '../game/store';
import { CardPicker } from './CardPicker';
import { tick } from './haptics';
import { IconBack, IconUndo } from './icons';

export function HoleScreen() {
  const s = useStore();
  const h = currentHand(s)!;
  const [cards, setCards] = useState<Card[]>([]);
  return (
    <main className="screen">
      <div className="top">
        <button className="round" onClick={() => s.toSetup()} aria-label="Back to setup"><IconBack /></button>
        <span className="cap">Hand {h.no} · dealer {seatName(s.cfg, h.dealer)}</span>
        <button className="round" onClick={() => s.undo()} disabled={!s.events.length} aria-label="Undo"><IconUndo /></button>
      </div>
      <h1 className="title" style={{ marginTop: 10 }}>Your cards</h1>
      <div className="sub" style={{ marginBottom: 18 }}>{h.seats[0].inHand ? 'Needed for the odds and advice.' : 'You have no chips this hand.'}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <CardPicker count={2} value={cards} onChange={setCards} used={new Set()} />
      </div>
      <div className="foot">
        <button className="primary" disabled={cards.length !== 2} onClick={() => { tick(); s.dispatch({ t: 'hole', cards }); }}>Deal me in</button>
        <button className="link" onClick={() => s.dispatch({ t: 'hole', cards: [] })}>Skip — play without advice</button>
      </div>
    </main>
  );
}
