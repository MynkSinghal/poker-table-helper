// Card entry. Press a rank, slide toward a suit, lift: one stroke per card (a marking menu,
// Kurtenbach & Buxton). A quick tap leaves the suits open so tap-tap works too.
// ♠ up · ♥ right · ♦ down · ♣ left. Cards already in play are disabled.
import { useRef, useState, type PointerEvent as RPE } from 'react';
import { SUIT_SYM, makeCard, rankLabel, type Card } from '../engine/cards';
import { PC } from './PlayingCard';
import { tick } from './haptics';

const ORDER = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // ♠ ♥ ♦ ♣
const GAP = 74;

interface Menu { rank: number; x: number; y: number; fx: number; fy: number; hot: number; sticky: boolean; sx: number; sy: number }

export function CardPicker({ count, value, onChange, used }: { count: number; value: Card[]; onChange: (v: Card[]) => void; used: Set<Card> }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const menuRef = useRef<Menu | null>(null);
  menuRef.current = menu;
  const full = value.length >= count;
  const taken = (c: Card) => used.has(c) || value.includes(c);
  const free = (rank: number, s: number) => !taken(makeCard(rank, s));
  const rankFull = (rank: number) => [0, 1, 2, 3].every(s => !free(rank, s));

  const add = (rank: number, suit: number) => {
    const c = makeCard(rank, suit);
    if (taken(c) || full) return;
    tick();
    onChange([...value, c]);
  };
  const suitAt = (m: Menu, x: number, y: number) => {
    const dx = x - m.sx, dy = y - m.sy;
    if (Math.hypot(dx, dy) < 26) return -1;
    const s = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy < 0 ? 0 : 2);
    return free(m.rank, s) ? s : -1;
  };
  const open = (e: RPE<HTMLButtonElement>, rank: number) => {
    if (full || rankFull(rank)) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const vw = window.innerWidth, vh = window.innerHeight;
    const fx = Math.min(Math.max(x, GAP + 34), vw - GAP - 34);
    const fy = Math.min(Math.max(y, GAP + 40), vh - GAP - 40);
    e.currentTarget.setPointerCapture(e.pointerId);
    setMenu({ rank, x, y, fx, fy, hot: -1, sticky: false, sx: e.clientX, sy: e.clientY });
  };
  const move = (e: RPE) => {
    const m = menuRef.current; if (!m || m.sticky) return;
    const hot = suitAt(m, e.clientX, e.clientY);
    if (hot !== m.hot) { if (hot >= 0) tick(); setMenu({ ...m, hot }); }
  };
  const up = (e: RPE) => {
    const m = menuRef.current; if (!m || m.sticky) return;
    const hot = suitAt(m, e.clientX, e.clientY);
    if (hot >= 0) { add(m.rank, hot); setMenu(null); return; }
    if (Math.hypot(e.clientX - m.sx, e.clientY - m.sy) < 14) setMenu({ ...m, sticky: true, hot: -1 }); // tap → tap-tap mode
    else setMenu(null);
  };

  const slots = [];
  for (let i = 0; i < count; i++) {
    const c = value[i];
    if (c !== undefined) slots.push(<PC key={i} c={c} size="l" onClick={() => onChange(value.filter((_, j) => j !== i))} label={`Remove ${rankLabel(c >> 2)}${SUIT_SYM[c & 3]}`} />);
    else slots.push(<PC key={i} size="l" active={i === value.length} rank={i === value.length && menu ? menu.rank : null} />);
  }
  return (
    <div>
      <div className="slots">{slots}</div>
      <div className="keys">
        {ORDER.map(r => (
          <button key={r} className={`key ${menu?.rank === r ? 'on' : ''}`} disabled={full || rankFull(r)} style={{ opacity: full || rankFull(r) ? 0.3 : 1 }}
            onPointerDown={e => open(e, r)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setMenu(null)}
            aria-label={`Rank ${rankLabel(r)}`}>
            {rankLabel(r)}
          </button>
        ))}
      </div>
      <p className="sub" style={{ textAlign: 'center', marginTop: 12 }}>Press a rank and slide to a suit, or tap rank then suit.</p>
      {menu && (
        <div className="petals" onPointerDown={e => { if (e.target === e.currentTarget) setMenu(null); }}>
          <div className="halo" style={{ left: menu.fx, top: menu.fy }} />
          <div className="center-key" style={{ left: menu.fx, top: menu.fy }}>{rankLabel(menu.rank)}</div>
          {DIRS.map(([dx, dy], s) => (
            <button key={s} className={`petal su${s} ${menu.hot === s ? 'hot' : ''}`} disabled={!free(menu.rank, s)}
              style={{ left: menu.fx + dx * GAP, top: menu.fy + dy * GAP }}
              onClick={() => { add(menu.rank, s); setMenu(null); }} aria-label={`${rankLabel(menu.rank)} of ${['spades', 'hearts', 'diamonds', 'clubs'][s]}`}>
              {SUIT_SYM[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
