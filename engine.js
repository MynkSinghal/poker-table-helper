// Poker Table Helper — card engine
// Card = int 0..51 : rank = c >> 2 (0 = '2' … 12 = 'A'), suit = c & 3 (0 ♠, 1 ♥, 2 ♦, 3 ♣)
(function (root) {
'use strict';
// Card = int 0..51 ; rank = c>>2 (0='2' .. 12='A'), suit = c&3
const RC = new Int8Array(13), SM = new Int32Array(4), SC = new Int8Array(4);
function straightHigh(mask) {
  for (let h = 12; h >= 4; h--) { const m = 0x1F << (h - 4); if ((mask & m) === m) return h; }
  if ((mask & 0x100F) === 0x100F) return 3; // wheel A-2-3-4-5
  return -1;
}
const B = [1, 16, 256, 4096, 65536, 1048576];
function evalCards(cs, n) {
  RC.fill(0); SM.fill(0); SC.fill(0);
  let all = 0;
  for (let i = 0; i < n; i++) { const c = cs[i], r = c >> 2, s = c & 3; RC[r]++; SM[s] |= 1 << r; SC[s]++; all |= 1 << r; }
  let fs = -1; for (let s = 0; s < 4; s++) if (SC[s] >= 5) fs = s;
  if (fs >= 0) {
    const sf = straightHigh(SM[fs]);
    if (sf >= 0) return 8 * B[5] + sf * B[4];
  }
  let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1, p3 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = RC[r];
    if (k === 4) quad = r;
    else if (k === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else if (p3 < 0) p3 = r; }
  }
  if (quad >= 0) {
    let k = -1; for (let r = 12; r >= 0; r--) if (r !== quad && RC[r]) { k = r; break; }
    return 7 * B[5] + quad * B[4] + k * B[3];
  }
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) { const pr = Math.max(t2, p1); return 6 * B[5] + t1 * B[4] + pr * B[3]; }
  if (fs >= 0) {
    let v = 5 * B[5], m = SM[fs], j = 4;
    for (let r = 12; r >= 0 && j >= 0; r--) if (m & (1 << r)) { v += r * B[j]; j--; }
    return v;
  }
  const st = straightHigh(all);
  if (st >= 0) return 4 * B[5] + st * B[4];
  if (t1 >= 0) {
    let v = 3 * B[5] + t1 * B[4], j = 3;
    for (let r = 12; r >= 0 && j >= 2; r--) if (r !== t1 && RC[r]) { v += r * B[j]; j--; }
    return v;
  }
  if (p1 >= 0 && p2 >= 0) {
    let k = -1; for (let r = 12; r >= 0; r--) if (r !== p1 && r !== p2 && RC[r]) { k = r; break; }
    return 2 * B[5] + p1 * B[4] + p2 * B[3] + k * B[2];
  }
  if (p1 >= 0) {
    let v = 1 * B[5] + p1 * B[4], j = 3;
    for (let r = 12; r >= 0 && j >= 1; r--) if (r !== p1 && RC[r]) { v += r * B[j]; j--; }
    return v;
  }
  let v = 0, j = 4;
  for (let r = 12; r >= 0 && j >= 0; r--) if (RC[r]) { v += r * B[j]; j--; }
  return v;
}
// starting hand class index 0..168: pairs 13*r+r ; suited hi*13+lo (hi>lo) ; offsuit lo*13+hi
function classOf(a, b) {
  const ra = a >> 2, rb = b >> 2;
  const hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  if (hi === lo) return hi * 13 + hi;
  return ((a & 3) === (b & 3)) ? hi * 13 + lo : lo * 13 + hi;
}

// PCT[class] = how strong a starting hand is, as "top X% of all 1,326 starting combos",
// ranked by all-in equity against one random hand (precomputed, 40,000 runouts per class).
const PCT = [46.6, 100, 99.1, 97.3, 98.2, 96.4, 91.6, 85.8, 76.8, 68.6, 60.2, 47.5, 33, 92.8, 35.9, 95.5, 93.7, 94.6, 92.5, 90.3, 81.6, 75.9, 64.7, 54.4, 42.8, 29.1, 90.6, 84.9, 25.2, 87.6, 89.1, 86.7, 83.7, 80.7, 70.4, 61.7, 52.6, 41, 26.4, 88.2, 84.6, 77.4, 14.2, 82.8, 79.8, 78.3, 73.8, 69.5, 58.4, 49.6, 36.8, 22, 89.4, 84, 78.6, 71.3, 8.3, 75, 72.2, 67.7, 62.6, 56.6, 45.6, 35.1, 23.8, 87.9, 84.3, 77.1, 71, 65.3, 4.2, 66.2, 63.5, 57.5, 51.4, 44.6, 30.9, 18.4, 81.9, 78.9, 72.9, 66.8, 63.8, 55.7, 3.2, 55.4, 50.5, 43.7, 38.9, 27.3, 15.1, 74.1, 72.5, 70.7, 65, 58.7, 53.2, 47.8, 2.7, 41.9, 38, 31.8, 20.8, 12.5, 66.5, 60.5, 60.8, 59.3, 52.9, 45.9, 39.8, 34.2, 2.3, 30, 24.7, 16, 9.2, 59, 53.5, 51.7, 48.7, 46.2, 39.5, 35.4, 28.2, 21.1, 1.8, 19.6, 13.7, 7.5, 48.4, 48.1, 40.1, 39.2, 33.3, 33.9, 27.9, 22.3, 16.6, 12.8, 1.4, 11.3, 6.3, 37.1, 33.6, 32.1, 27.6, 25.5, 22.9, 18.7, 16.9, 10.1, 9.8, 7.8, 0.9, 5.4, 22.6, 19.9, 17.5, 17.2, 16.3, 11.6, 10.4, 9.5, 6.6, 4.5, 3.8, 3.5, 0.5];

function handPct(a, b) { return PCT[classOf(a, b)]; }

// Monte Carlo win chance for hero vs opponents, each limited to a "top X%" range.
// Ties count as a share of the pot. Returns 0..1.
function equity(hole, board, ranges, iters) {
  const used = new Uint8Array(52);
  for (const c of hole) used[c] = 1;
  for (const c of board) used[c] = 1;
  const d = [];
  for (let c = 0; c < 52; c++) if (!used[c]) d.push(c);
  const D = d.length, k = ranges.length, nb = board.length, need = 5 - nb;
  if (k === 0) return 1;
  const bd = new Array(5), hero = new Array(7), opp = new Array(7), oc = new Array(2 * k);
  for (let i = 0; i < nb; i++) bd[i] = board[i];
  hero[0] = hole[0]; hero[1] = hole[1];
  let total = 0;
  for (let it = 0; it < iters; it++) {
    let pos = 0;
    for (let o = 0; o < k; o++) {
      const lim = ranges[o];
      let i, j, tries = 0;
      for (;;) {
        const span = D - pos;
        i = pos + ((Math.random() * span) | 0);
        j = pos + ((Math.random() * (span - 1)) | 0); if (j >= i) j++;
        if (lim >= 100 || PCT[classOf(d[i], d[j])] <= lim || ++tries > 40) break;
      }
      let t = d[pos]; d[pos] = d[i]; d[i] = t;
      if (j === pos) j = i;
      t = d[pos + 1]; d[pos + 1] = d[j]; d[j] = t;
      oc[2 * o] = d[pos]; oc[2 * o + 1] = d[pos + 1];
      pos += 2;
    }
    for (let b = 0; b < need; b++) {
      const i = pos + ((Math.random() * (D - pos)) | 0);
      const t = d[pos]; d[pos] = d[i]; d[i] = t;
      bd[nb + b] = d[pos]; pos++;
    }
    for (let b = 0; b < 5; b++) { hero[2 + b] = bd[b]; opp[2 + b] = bd[b]; }
    const hs = evalCards(hero, 7);
    let ties = 0, lost = false;
    for (let o = 0; o < k; o++) {
      opp[0] = oc[2 * o]; opp[1] = oc[2 * o + 1];
      const v = evalCards(opp, 7);
      if (v > hs) { lost = true; break; }
      if (v === hs) ties++;
    }
    if (!lost) total += 1 / (ties + 1);
  }
  return total / iters;
}

const api = { evalCards, classOf, handPct, equity, PCT };
root.PokerEngine = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
