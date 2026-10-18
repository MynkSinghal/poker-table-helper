import type { Ref } from 'react';
// Apple-Watch-style complications: one glanceable number each, tap for the maths.
export interface CompItem { label: string; value: string; frac: number | null; sub: string; busy?: boolean; dim?: boolean }
const R = 27, C = 2 * Math.PI * R;
export function Complications({ items, onTap, refEl }: { items: CompItem[]; onTap: (i: number) => void; refEl?: Ref<HTMLDivElement> }) {
  return (
    <div className="comps" ref={refEl}>
      {items.map((it, i) => (
        <button key={i} className={`comp ${it.busy ? 'busy' : ''}`} onClick={() => onTap(i)} aria-label={`${it.label} ${it.value}, ${it.sub}`} style={{ opacity: it.dim ? 0.4 : 1 }}>
          <svg viewBox="0 0 62 62">
            <defs><filter id={`cg${i}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
            <circle cx="31" cy="31" r={R} fill="none" stroke="var(--hair)" strokeWidth="5" />
            {it.frac === null
              ? <circle cx="31" cy="31" r={R} fill="none" stroke="var(--line)" strokeWidth="1.2" strokeDasharray="2 4" />
              : <circle className="ring" cx="31" cy="31" r={R} fill="none" stroke="var(--white)" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${Math.max(0.001, Math.min(1, it.frac)) * C} ${C}`} transform="rotate(-90 31 31)" filter={`url(#cg${i})`} />}
            <text x="31" y="23" textAnchor="middle" className="lab">{it.label}</text>
            <text x="31" y="40" textAnchor="middle" className={`v num ${it.value.length > 4 ? 'sm' : ''}`}>{it.value}</text>
          </svg>
          <span className="s">{it.sub}</span>
        </button>
      ))}
    </div>
  );
}
