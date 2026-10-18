// Card = 0..51. rank = c >> 2 (0 = '2' … 12 = 'A'), suit = c & 3 (0 ♠, 1 ♥, 2 ♦, 3 ♣)
export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUIT_CH = 'shdc';
export const SUIT_SYM = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

export const rankOf = (c: Card) => c >> 2;
export const suitOf = (c: Card) => c & 3;
export const makeCard = (rank: number, suit: number): Card => rank * 4 + suit;
export const rankLabel = (r: number) => (r === 8 ? '10' : RANKS[r]);
export const cardText = (c: Card) => rankLabel(c >> 2) + SUIT_SYM[c & 3];
export const cardCode = (c: Card) => RANKS[c >> 2] + SUIT_CH[c & 3];
export function parseCards(s: string): Card[] {
  return s.trim().split(/\s+/).filter(Boolean).map(x => RANKS.indexOf(x[0].toUpperCase()) * 4 + SUIT_CH.indexOf(x[1].toLowerCase()));
}

/* ---- the 1,326 two-card combos ---- */
export const NCOMBO = 1326;
export const COMBO_A = new Uint8Array(NCOMBO);
export const COMBO_B = new Uint8Array(NCOMBO);
const COMBO_IDX = new Int16Array(52 * 52).fill(-1);
/** for each card, the 51 combo indices that contain it */
export const CARD_COMBOS: Int16Array[] = Array.from({ length: 52 }, () => new Int16Array(51));
{
  let k = 0;
  const fill = new Uint8Array(52);
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
    COMBO_A[k] = a; COMBO_B[k] = b; COMBO_IDX[a * 52 + b] = k; COMBO_IDX[b * 52 + a] = k;
    CARD_COMBOS[a][fill[a]++] = k; CARD_COMBOS[b][fill[b]++] = k;
    k++;
  }
}
export const comboIndex = (a: Card, b: Card) => COMBO_IDX[a * 52 + b];

/** starting-hand class 0..168: pair r*13+r, suited hi*13+lo, offsuit lo*13+hi */
export function classOf(a: Card, b: Card): number {
  const ra = a >> 2, rb = b >> 2;
  const hi = ra > rb ? ra : rb, lo = ra > rb ? rb : ra;
  if (hi === lo) return hi * 13 + hi;
  return (a & 3) === (b & 3) ? hi * 13 + lo : lo * 13 + hi;
}
export const COMBO_CLASS = new Uint8Array(NCOMBO);
for (let k = 0; k < NCOMBO; k++) COMBO_CLASS[k] = classOf(COMBO_A[k], COMBO_B[k]);

/** label like "AKs", "QQ", "T9o" for a class */
export function classLabel(cls: number): string {
  const x = Math.floor(cls / 13), y = cls % 13;
  if (x === y) return RANKS[x] + RANKS[x];
  return x > y ? RANKS[x] + RANKS[y] + 's' : RANKS[y] + RANKS[x] + 'o';
}
/** 13×13 grid position (row, col) for a class, AA top-left, suited above the diagonal */
export function classGrid(cls: number): [number, number] {
  // suited (hi*13+lo) lands above the diagonal, offsuit (lo*13+hi) below it
  const x = Math.floor(cls / 13), y = cls % 13;
  return [12 - x, 12 - y];
}
