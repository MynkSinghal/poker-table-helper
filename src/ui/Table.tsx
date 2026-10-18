// The table is drawn like the real one (natural mapping): you at the bottom, seats clockwise.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { IconCheck } from './icons';

export interface SeatView {
  label: string; you?: boolean; name?: string; stack?: string; tag?: string; allIn?: boolean;
  bet?: string; dealer?: boolean; state?: 'turn' | 'out' | 'sel' | ''; empty?: boolean;
}
export function Table({ seats, center, hero, onSeat }: { seats: SeatView[]; center?: ReactNode; hero?: ReactNode; onSeat?: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 370, h: 360 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const n = seats.length;
  const cx = box.w / 2, cy = box.h / 2 - 6;
  const rx = Math.max(60, box.w / 2 - 30), ry = Math.max(60, box.h / 2 - 44);
  const pos = (i: number, k = 1) => { const a = Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)] as const; };
  return (
    <div className="table" ref={ref}>
      <div className="rail" style={{ left: cx - rx - 16, top: cy - ry - 16, width: (rx + 16) * 2, height: (ry + 16) * 2 }} />
      <div className="felt" style={{ left: cx - rx + 28, top: cy - ry + 28, width: (rx - 28) * 2, height: (ry - 28) * 2 }} />
      {seats.map((s, i) => {
        const [x, y] = pos(i);
        const [bx, by] = pos(i, 0.64);
        const [dx, dy] = pos(i, 0.8);
        const Tag = onSeat ? 'button' : 'div';
        return (
          <div key={i}>
            <Tag className={`seat ${s.you ? 'you' : ''} ${s.state ?? ''}`} style={{ left: x, top: y }} onClick={onSeat ? () => onSeat(i) : undefined} aria-label={s.name || s.label}>
              {s.label}
              {s.tag && <span className={`tg ${s.allIn ? 'ai' : ''}`}>{s.tag}</span>}
              {s.stack && <span className="stk num">{s.stack}</span>}
              {s.name && <span className="nm">{s.name}</span>}
              {s.state === 'sel' && <span className="ok"><IconCheck /></span>}
            </Tag>
            {s.dealer && <span className="dbtn" style={{ left: dx + 15, top: dy }}>D</span>}
            {s.bet && <span className="bet num" style={{ left: bx, top: by }}>{s.bet}</span>}
          </div>
        );
      })}
      {center && <div className="center" style={{ left: cx, top: cy - 8 }}>{center}</div>}
      {hero && <div className="center" style={{ left: cx, top: cy + ry - 66 }}>{hero}</div>}
    </div>
  );
}
