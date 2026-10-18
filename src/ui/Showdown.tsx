// Showdown: side pots are already built; tap who won each one, or enter shown cards and let
// the evaluator decide (kickers and splits included). Then the result and the next hand.
import { useMemo, useState } from 'react';
import type { Card } from '../engine/cards';
import { evaluate } from '../engine/evaluator';
import { contested, potTotal } from '../game/rules';
import { currentHand, seatName, useStore } from '../game/store';
import { CardPicker } from './CardPicker';
import { fmt } from './format';
import { tick } from './haptics';
import { IconMore } from './icons';
import { Menu } from './Menu';
import { PC } from './PlayingCard';
import { Sheet } from './Sheet';
import { Table, type SeatView } from './Table';

export function Showdown() {
  const s = useStore();
  const h = currentHand(s)!;
  const cfg = s.cfg;
  const pots = useMemo(() => contested(h), [h]);
  const [win, setWin] = useState<number[][]>(() => pots.map(() => []));
  const [potSel, setPotSel] = useState(0);
  const [menu, setMenu] = useState(false);
  const [shown, setShown] = useState<Record<number, Card[]>>({});
  const [pickSeat, setPickSeat] = useState<number | null>(null);
  const [pick, setPick] = useState<Card[]>([]);
  const done = h.phase === 'done';

  const toggle = (seat: number) => {
    const p = pots[potSel]; if (!p || !p.eligible.includes(seat)) return;
    tick();
    setWin(w => w.map((x, i) => (i === potSel ? (x.includes(seat) ? x.filter(y => y !== seat) : [...x, seat]) : x)));
  };
  // shown cards → winners by the evaluator
  const needCards = useMemo(() => [...new Set(pots.flatMap(p => p.eligible))].filter(i => !(i === 0 && h.hole.length === 2)), [pots, h.hole]);
  const solve = (sh: Record<number, Card[]>) => {
    const hands: Record<number, Card[]> = { ...sh };
    if (h.hole.length === 2) hands[0] = h.hole;
    setWin(pots.map(p => {
      const vals = p.eligible.map(i => (hands[i] ? evaluate([...hands[i], ...h.board], 7) : -1));
      const top = Math.max(...vals);
      return p.eligible.filter((_, k) => vals[k] === top && top >= 0);
    }));
  };
  const nextToShow = needCards.find(i => !shown[i]);
  const used = new Set<Card>([...h.board, ...h.hole, ...Object.values(shown).flat()]);

  if (done) {
    const res = h.result ?? [];
    const winners = res.map((v, i) => [i, v] as const).filter(([, v]) => v > 0);
    const foldWin = h.seats.filter(x => x.inHand && !x.folded).length === 1;
    return (
      <main className="screen">
        <div className="top"><span className="cap">Hand {h.no} · {foldWin ? 'everyone else folded' : 'showdown'}</span><button className="round" onClick={() => setMenu(true)} aria-label="Menu"><IconMore /></button></div>
        <h1 className="title">Hand over</h1>
        <div className="cards" style={{ margin: '14px 0 6px' }}>{Array.from({ length: 5 }, (_, i) => <PC key={i} c={h.board[i] ?? null} size="m" />)}</div>
        <div style={{ marginTop: 10 }}>
          {winners.map(([i, v]) => <div key={i} className="result-row"><span>{seatName(cfg, i)} {i === 0 ? 'win' : 'wins'}</span><b className="num">{fmt(v)}</b></div>)}
        </div>
        <div className="grow" style={{ flex: 1 }} />
        <div className="panel row" style={{ padding: '12px 16px' }}>
          <span><span className="cap">Next hand</span><br /><span style={{ fontWeight: 800 }}>Dealer moves on one seat</span></span>
          <span className="dbtn" style={{ position: 'static', margin: 0, width: 26, height: 26 }}>D</span>
        </div>
        <div className="foot">
          <button className="primary" onClick={() => { tick(); s.nextHand(); }}>Next hand</button>
          <div className="row" style={{ justifyContent: 'center' }}><button className="link" onClick={() => s.undo()}>Undo last action</button><button className="link" onClick={() => s.toSetup()}>Change setup</button></div>
        </div>
        <Sheet open={menu} onClose={() => setMenu(false)}><Menu onClose={() => setMenu(false)} inHand /></Sheet>
      </main>
    );
  }

  const seats: SeatView[] = h.seats.map((st, i) => {
    const eligible = pots[potSel]?.eligible.includes(i);
    return {
      label: i === 0 ? 'YOU' : String(i + 1), you: i === 0,
      stack: st.allIn ? 'all-in' : st.inHand ? fmt(st.stack) : 'out',
      dealer: i === h.dealer,
      state: !st.inHand || st.folded ? 'out' : win[potSel]?.includes(i) ? 'sel' : eligible ? '' : 'out',
    };
  });
  const ready = pots.every((_, i) => (win[i] ?? []).length > 0);
  return (
    <main className="screen">
      <div className="top"><span className="cap">River · hand {h.no}</span><button className="round" onClick={() => setMenu(true)} aria-label="Menu"><IconMore /></button></div>
      <h1 className="title">Who won?</h1>
      <p className="sub">Tap the winner{pots.length > 1 ? ' of the highlighted pot' : ''}. Tap two for a split.</p>
      <Table seats={seats} onSeat={toggle}
        center={<><span className="cap">Total</span><span className="pot num">{fmt(potTotal(h))}</span><div className="cards">{Array.from({ length: 5 }, (_, i) => <PC key={i} c={h.board[i] ?? null} size="m" />)}</div></>}
        hero={h.hole.length === 2 ? <div className="cards">{h.hole.map(c => <PC key={c} c={c} size="s" />)}</div> : undefined} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
        {pots.map((p, i) => (
          <button key={i} className={`potcard ${i === potSel ? 'on' : ''}`} onClick={() => setPotSel(i)}>
            <span><span className="n">{i === 0 ? 'Main pot' : `Side pot ${i}`}</span><br />
              <span className="w">{(win[i] ?? []).length ? `Won by ${win[i].map(x => seatName(cfg, x)).join(' + ')}` : p.eligible.map(x => seatName(cfg, x)).join(' · ')}</span></span>
            <span className="a num">{fmt(p.amount)}</span>
          </button>
        ))}
      </div>
      <div className="foot">
        <button className="ghost" onClick={() => { setShown({}); setPick([]); setPickSeat(needCards[0] ?? null); }}>Enter shown cards instead</button>
        <button className="primary" disabled={!ready} onClick={() => { tick(); s.dispatch({ t: 'award', winners: win }); }}>Award pots</button>
      </div>
      <Sheet open={pickSeat !== null} onClose={() => setPickSeat(null)}>
        <span className="cap">Shown cards</span>
        <h2>{pickSeat !== null ? `${seatName(cfg, pickSeat)}’s cards` : ''}</h2>
        <CardPicker count={2} value={pick} onChange={setPick} used={used} />
        <div className="foot" style={{ paddingBottom: 0 }}>
          <button className="primary" disabled={pick.length !== 2} onClick={() => {
            const sh = { ...shown, [pickSeat!]: pick };
            setShown(sh); setPick([]);
            const nxt = needCards.find(i => !sh[i]);
            if (nxt === undefined) { solve(sh); setPickSeat(null); } else setPickSeat(nxt);
          }}>{nextToShow !== undefined && needCards.filter(i => !shown[i]).length > 1 ? 'Next player' : 'Work out the winner'}</button>
        </div>
      </Sheet>
      <Sheet open={menu} onClose={() => setMenu(false)}><Menu onClose={() => setMenu(false)} inHand /></Sheet>
    </main>
  );
}
