import { useEffect, useMemo, useState } from 'react';
import type { Analysis } from '../engine/advisor';
import { onAnalysis, requestAnalysis } from '../engine/client';
import type { PlayerStats } from '../engine/model';
import { buildInput } from '../game/analysisInput';
import type { Hand } from '../game/rules';

export function useAnalysis(hand: Hand | null, stats: PlayerStats[]) {
  const input = useMemo(() => (hand ? buildInput(hand, stats) : null), [hand, stats]);
  const key = useMemo(() => (input ? JSON.stringify(input) : ''), [input]);
  const [res, setRes] = useState<Analysis | null>(null);
  useEffect(() => { onAnalysis(a => setRes(a)); }, []);
  useEffect(() => { if (input) requestAnalysis(key, input); }, [key, input]);
  const analysis = res && res.key === key ? res : null;
  return { analysis, busy: !!input && (!analysis || analysis.quick), active: !!input };
}

/** EV + fold chance at any raise size: exact for computed sizes, interpolated (log scale) between them */
export function evAt(a: Analysis | null, to: number): { ev: number; fold: number } | null {
  if (!a) return null;
  const exact = a.moves.find(m => m.kind === 'raise' && m.to === to);
  if (exact) return { ev: exact.ev, fold: exact.fold ?? 0 };
  const pts = [...a.curve, ...a.moves.filter(m => m.kind === 'raise').map(m => ({ to: m.to!, ev: m.ev, fold: m.fold ?? 0 }))].sort((x, y) => x.to - y.to);
  if (!pts.length) return null;
  if (to <= pts[0].to) return { ev: pts[0].ev, fold: pts[0].fold };
  for (let i = 1; i < pts.length; i++) if (to <= pts[i].to) {
    const p = pts[i - 1], q = pts[i];
    const t = (Math.log(to) - Math.log(p.to)) / Math.max(1e-9, Math.log(q.to) - Math.log(p.to));
    return { ev: p.ev + (q.ev - p.ev) * t, fold: p.fold + (q.fold - p.fold) * t };
  }
  const l = pts[pts.length - 1];
  return { ev: l.ev, fold: l.fold };
}
