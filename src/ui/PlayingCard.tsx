import { SUIT_SYM, rankLabel, type Card } from '../engine/cards';

export function PC({ c, size = 'm', active, rank, onClick, label }: { c?: Card | null; size?: 's' | 'm' | 'l'; active?: boolean; rank?: number | null; onClick?: () => void; label?: string }) {
  const Tag = onClick ? 'button' : 'span';
  if (c === undefined || c === null) {
    return <Tag className={`pc ${size} ${active ? 'active' : 'empty'}`} onClick={onClick} aria-label={label}>{active && rank != null ? <b>{rankLabel(rank)}</b> : null}</Tag>;
  }
  return (
    <Tag className={`pc ${size} su${c & 3}`} onClick={onClick} aria-label={label ?? `${rankLabel(c >> 2)} of ${['spades', 'hearts', 'diamonds', 'clubs'][c & 3]}`}>
      <b>{rankLabel(c >> 2)}</b><i>{SUIT_SYM[c & 3]}</i>
    </Tag>
  );
}
