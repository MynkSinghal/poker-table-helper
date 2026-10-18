/* Poker Table Helper — app logic (vanilla JS, no build step) */
'use strict';
const PE = window.PokerEngine;
const app = document.getElementById('app');
const layer = document.getElementById('layer');

/* ---------------- cards ---------------- */
const RANKS = '23456789TJQKA';
const SYM = ['♠', '♥', '♦', '♣'];
const rl = r => (r === 8 ? '10' : RANKS[r]);
const cardHTML = (c, size = 's', attrs = '') => `<span class="card ${size} su${c & 3}" ${attrs}><b>${rl(c >> 2)}</b><i>${SYM[c & 3]}</i></span>`;
const emptyCard = (size = 's', cls = 'empty', inner = '', attrs = '') => `<span class="card ${size} ${cls}" ${attrs}>${inner}</span>`;
const cardTxt = c => rl(c >> 2) + SYM[c & 3];
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const fmt = n => Math.round(n).toLocaleString('en-IN');

/* ---------------- state ---------------- */
const KEY = 'poker-table-helper.v1';
function defaultCfg() { return { n: 6, names: [], me: 0, dealer: 0, sb: 1, bb: 2, sbAmt: 10, bbAmt: 20 }; }
let S = load() || { cfg: defaultCfg(), H: null, hist: [], screen: 'setup' };
const ui = { mode: 'me', sheet: null, kp: null, raise: null, confirmReset: false };

function load() { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && v.cfg ? v : null; } catch (e) { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage off: app still works */ } }

const C = () => S.cfg;
const H = () => S.H;
const name = i => (C().names[i] && C().names[i].trim()) || `Seat ${i + 1}`;
const nextSeat = i => (i + 1) % C().n;
function nextActive(i) {
  const h = H();
  for (let k = 1; k <= C().n; k++) { const j = (i + k) % C().n; if (!h.p[j].folded) return j; }
  return i;
}
const activeSeats = () => H().p.map((p, i) => (p.folded ? -1 : i)).filter(i => i >= 0);
const sumBets = () => H().p.reduce((a, p) => a + p.bet, 0);
const potTotal = () => H().pot + sumBets();
const step = () => Math.max(1, C().sbAmt);
const roundTo = (v, s) => Math.max(s, Math.round(v / s) * s);

function autoBlinds() {
  const c = C();
  if (c.n === 2) { c.sb = c.dealer; c.bb = nextSeat(c.dealer); }
  else { c.sb = nextSeat(c.dealer); c.bb = nextSeat(c.sb); }
}

/* ---------------- hand engine ---------------- */
function newHand(num) {
  const c = C();
  const p = Array.from({ length: c.n }, () => ({ folded: false, bet: 0, acted: false, pre: null, last: '' }));
  p[c.sb].bet = c.sbAmt; p[c.sb].last = 'Blind';
  p[c.bb].bet = c.bbAmt; p[c.bb].last = 'Blind';
  S.H = { num, hole: [], board: [], street: 0, pot: 0, cur: c.bbAmt, minRaise: c.bbAmt, raises: 0, toAct: 0, p, winner: null, showdown: false };
  S.H.toAct = nextActive(c.bb);
  S.hist = [];
}
function snapshot() { S.hist.push(JSON.stringify({ H: S.H, screen: S.screen })); if (S.hist.length > 80) S.hist.shift(); }
function undo() {
  if (!S.hist.length) return;
  const v = JSON.parse(S.hist.pop());
  S.H = v.H; S.screen = v.screen; ui.sheet = v.H.awaitBoard ? 'board' : null;
  if (ui.sheet === 'board') openBoardKeypad();
  save(); render();
}

function act(type, amount) {
  const h = H(), c = C(), i = h.toAct, pl = h.p[i];
  snapshot();
  if (type === 'fold') { pl.folded = true; pl.last = 'Folded'; }
  else if (type === 'check') { pl.last = 'Check'; }
  else if (type === 'call') {
    if (h.street === 0 && !pl.pre) pl.pre = h.cur > c.bbAmt ? 'callraise' : 'limp';
    else if (h.street === 0 && pl.pre === 'limp' && h.cur > c.bbAmt) pl.pre = 'callraise';
    pl.bet = h.cur; pl.last = 'Call';
  } else if (type === 'raise') {
    const to = Math.max(amount, h.cur + 1);
    if (h.street === 0) pl.pre = h.cur > c.bbAmt ? '3bet' : (pl.pre === '3bet' ? '3bet' : 'raise');
    h.minRaise = Math.max(h.minRaise, to - h.cur);
    pl.last = h.cur === 0 ? 'Bet' : 'Raise';
    h.cur = to; pl.bet = to; h.raises++;
    h.p.forEach((q, j) => { if (j !== i && !q.folded) q.acted = false; });
  }
  pl.acted = true;
  advance();
  save(); render();
}

function advance() {
  const h = H();
  const live = activeSeats();
  if (live.length === 1) { endStreetMoney(); h.winner = live[0]; S.screen = 'over'; return; }
  const done = live.every(j => h.p[j].acted && h.p[j].bet === h.cur);
  if (done) {
    endStreetMoney();
    if (h.street === 3) { h.showdown = true; S.screen = 'over'; return; }
    h.awaitBoard = true; ui.sheet = 'board'; openBoardKeypad();
    return;
  }
  let j = h.toAct;
  for (let k = 0; k < C().n; k++) {
    j = nextSeat(j);
    const q = h.p[j];
    if (!q.folded && (!q.acted || q.bet < h.cur)) { h.toAct = j; return; }
  }
}
function endStreetMoney() {
  const h = H();
  h.pot += sumBets();
  h.p.forEach(q => { q.bet = 0; q.acted = false; if (!q.folded) q.last = ''; });
  h.cur = 0; h.minRaise = C().bbAmt; h.raises = 0;
}
function dealBoard(cards) {
  const h = H();
  snapshot();
  h.board.push(...cards);
  h.street++;
  h.awaitBoard = false;
  h.toAct = nextActive(C().dealer);
  ui.sheet = null; ui.kp = null;
  save(); render();
}
function endHandNow() {
  snapshot();
  endStreetMoney();
  const live = activeSeats();
  if (live.length === 1) H().winner = live[0]; else H().showdown = true;
  H().awaitBoard = false;
  S.screen = 'over'; ui.sheet = null; save(); render();
}
function nextHand() {
  const c = C();
  c.dealer = nextSeat(c.dealer); c.sb = nextSeat(c.sb); c.bb = nextSeat(c.bb);
  newHand((H() ? H().num : 0) + 1);
  S.screen = 'hole'; openHoleKeypad(); save(); render();
}

/* ---------------- advice ---------------- */
const RANGE = { raise: 15, '3bet': 6, callraise: 30, limp: 55 };
let eqCache = { key: '', val: 0 };
function winChance() {
  const h = H(), me = C().me;
  const others = activeSeats().filter(i => i !== me);
  let opp;
  if (h.street === 0 && !h.awaitBoard) {
    opp = others.filter(i => h.p[i].pre).map(i => RANGE[h.p[i].pre]);
    if (!opp.length) opp = [100];
  } else opp = others.map(i => RANGE[h.p[i].pre] || 100);
  const key = h.hole.join(',') + '|' + h.board.join(',') + '|' + opp.join(',');
  if (key !== eqCache.key) {
    const iters = opp.length <= 2 ? 6000 : 4000;
    eqCache = { key, val: PE.equity(h.hole, h.board, opp, iters) };
  }
  return { eq: eqCache.val, k: opp.length };
}

function advise() {
  const h = H(), c = C(), me = c.me, hero = h.p[me];
  if (hero.folded) return { verdict: 'FOLDED', reason: 'You’re out of this hand' };
  if (h.hole.length < 2) return { verdict: 'CARDS', reason: 'Tap your cards area to add them' };
  if (h.awaitBoard) return { verdict: 'WAIT', reason: `Enter the ${STREETS[h.street + 1].toLowerCase()} to update` };
  const { eq, k } = winChance();
  const P = potTotal();
  const toCall = Math.max(0, h.cur - hero.bet);
  const need = toCall ? toCall / (P + toCall) : 0;
  const minTo = h.cur + h.minRaise;
  const out = (verdict, to, reason) => ({ verdict, to: to ? Math.max(roundTo(to, step()), minTo) : 0, eq, toCall, need, reason, bet: h.cur === 0 });
  if (k === 0) return out('CHECK', 0, 'Everyone else folded');

  if (h.street === 0) {
    const q = PE.handPct(h.hole[0], h.hole[1]);
    const order = []; let s = c.bb;
    for (let n = 0; n < c.n; n++) { s = nextSeat(s); if (!h.p[s].folded) order.push(s); }
    const behind = Math.max(0, order.length - 1 - order.indexOf(me));
    const limpers = h.p.filter((p, i) => i !== me && p.pre === 'limp').length;
    const callers = h.p.filter((p, i) => i !== me && !p.folded && p.pre === 'callraise').length;
    const qs = `Top ${q < 10 ? q.toFixed(1) : Math.round(q)}% hand`;
    if (h.raises === 0) {
      const base = [40, 32, 24, 19, 15, 12, 10, 9, 8][Math.min(behind, 8)];
      const th = me === c.bb ? Math.max(8, 20 - 2 * limpers) : Math.max(6, base - 2 * limpers);
      const r = `${qs} · ${behind} still to act behind you`;
      if (q <= th) return out('RAISE', c.bbAmt * 3 + c.bbAmt * limpers, r);
      if (toCall === 0) return out('CHECK', 0, r);
      if (q <= 55 && eq >= need + 0.08) return out('CALL', 0, `${qs} · cheap price, need ${Math.round(need * 100)}%`);
      return out('FOLD', 0, r);
    }
    const r = `${qs} · facing ${h.raises > 1 ? 'a re-raise' : 'a raise'} · need ${Math.round(need * 100)}%`;
    if (toCall === 0) return out('CHECK', 0, r);
    if (h.raises === 1) {
      if (q <= 6) return out('RAISE', h.cur * 3 + h.cur * callers, r);
      if (q <= 22 && eq >= need + 0.03) return out('CALL', 0, r);
      return out('FOLD', 0, r);
    }
    if (q <= 1.5) return out('RAISE', h.cur * 2.4, r);
    if (q <= 4 && eq >= need) return out('CALL', 0, r);
    return out('FOLD', 0, r);
  }

  const bt = Math.min(0.55, 1.6 / (k + 1));
  const opp = `${k} opponent${k > 1 ? 's' : ''}`;
  if (toCall === 0) {
    const r = `Pot ${fmt(P)} · ${opp} · bet when win ≥ ${Math.round(bt * 100)}%`;
    return eq >= bt ? out('RAISE', P * 2 / 3, r) : out('CHECK', 0, r);
  }
  const r = `Pot ${fmt(P)} · Call ${fmt(toCall)} · Need ${Math.round(need * 100)}% to call`;
  if (eq >= Math.max(need + 0.2, bt + 0.12)) return out('RAISE', h.cur * 3, r);
  if (eq >= need) return out('CALL', 0, r);
  return out('FOLD', 0, r);
}

/* ---------------- icons ---------------- */
const ICON = {
  RAISE: '<svg viewBox="0 0 24 24"><path d="M6 15l6-7 6 7"/></svg>',
  CALL: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  CHECK: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  FOLD: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-3"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
};
const VCOL = { FOLD: 'var(--fold)', CHECK: 'var(--check)', CALL: 'var(--call)', RAISE: 'var(--raise)' };

/* ---------------- render ---------------- */
function render() {
  if (S.screen !== 'setup' && !S.H) S.screen = 'setup';
  const v = { setup: renderSetup, hole: renderHole, play: renderPlay, over: renderOver }[S.screen]();
  app.innerHTML = v;
  renderSheet();
  if (S.screen === 'play') {
    const t = app.querySelector('.prow.turn');
    if (t) t.scrollIntoView({ block: 'nearest' });
  }
}

/* setup */
function renderSetup() {
  const c = C(), n = c.n;
  const modes = [['me', 'You'], ['dealer', 'Dealer'], ['sb', 'SB'], ['bb', 'BB']];
  const hint = { me: 'Tap your seat.', dealer: 'Tap the Dealer. SB and BB follow clockwise.', sb: 'Tap the Small Blind seat.', bb: 'Tap the Big Blind seat.' }[ui.mode];
  let seats = '';
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = 50 + 44 * Math.cos(a), y = 50 + 41 * Math.sin(a);
    const tags = (i === c.me ? '<span class="tag you">YOU</span>' : '') + (i === c.dealer ? '<span class="dbtn">D</span>' : '') +
      (i === c.sb ? '<span class="tag role">SB</span>' : '') + (i === c.bb ? '<span class="tag role bb">BB</span>' : '');
    seats += `<button class="seat ${i === c.me ? 'me' : ''}" style="left:${x}%;top:${y}%" data-a="seat" data-v="${i}" aria-label="${esc(name(i))}">${i + 1}<span class="tags">${tags}</span>${c.names[i] ? `<span class="nm">${esc(c.names[i])}</span>` : ''}</button>`;
  }
  const presets = [[5, 10], [10, 20], [25, 50], [50, 100]];
  return `<main class="screen">
  <div class="scroll">
    <header class="top"><h1>New table</h1><p class="sub">Set it once, then just play.</p></header>
    <section class="panel row"><div><div class="lbl">Players</div><div class="hint">2 – 9</div></div>
      <div class="stepper"><button data-a="n-" aria-label="Fewer players">−</button><output>${n}</output><button data-a="n+" aria-label="More players">+</button></div></section>
    <div class="lbl" style="margin:18px 0 10px">Tap a role, then a seat</div>
    <div class="chips">${modes.map(([m, l]) => `<button class="chip ${ui.mode === m ? 'on' : ''}" data-a="mode" data-v="${m}">${l}</button>`).join('')}</div>
    <div class="table-wrap"><div class="rail"></div><div class="felt"><strong>Blinds ${fmt(c.sbAmt)} / ${fmt(c.bbAmt)}</strong><small>Dealer on ${esc(name(c.dealer))}</small></div>${seats}</div>
    <p class="hint center" style="margin:6px 0 16px">${hint}</p>
    <div class="lbl" style="margin-bottom:10px">Blinds</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="panel"><div class="lbl">Small</div><div class="row"><div class="stepper sm"><output>${fmt(c.sbAmt)}</output></div><div class="stepper sm"><button data-a="sb-">−</button><button data-a="sb+">+</button></div></div></div>
      <div class="panel"><div class="lbl">Big</div><div class="row"><div class="stepper sm"><output>${fmt(c.bbAmt)}</output></div><div class="stepper sm"><button data-a="bb-">−</button><button data-a="bb+">+</button></div></div></div>
    </div>
    <div class="chips" style="margin-top:12px">${presets.map(([a, b]) => `<button class="chip ghost ${c.sbAmt === a && c.bbAmt === b ? 'on' : ''}" data-a="preset" data-v="${a},${b}">${a}/${b}</button>`).join('')}</div>
    <button class="panel row" style="width:100%;margin-top:14px;height:46px" data-a="names"><span style="font-weight:600">Player names</span><span class="hint">Optional ›</span></button>
  </div>
  <div class="cta"><button class="big brass" data-a="start">Start hand</button></div>
</main>`;
}

/* keypad (hole cards + board) */
function usedCards() {
  const h = H(); const s = new Set();
  if (h) { if (!ui.kp || ui.kp.mode !== 'hole') h.hole.forEach(x => s.add(x)); h.board.forEach(x => s.add(x)); }
  if (ui.kp) ui.kp.cards.forEach(x => s.add(x));
  return s;
}
function openHoleKeypad() { ui.kp = { count: 2, cards: [], rank: null, msg: '', mode: 'hole' }; }
function openBoardKeypad() { ui.kp = { count: H().street === 0 ? 3 : 1, cards: [], rank: null, msg: '', mode: 'board' }; }
function keypadHTML() {
  const kp = ui.kp, used = usedCards();
  let slots = '', lbls = '';
  for (let i = 0; i < kp.count; i++) {
    if (kp.cards[i] !== undefined) { slots += cardHTML(kp.cards[i], 'l', `data-a="kp-rm" data-v="${i}" role="button" aria-label="Remove card"`); lbls += '<span class="lbl">Clear</span>'; }
    else if (i === kp.cards.length) { slots += emptyCard('l', 'active', kp.rank !== null ? `<b>${rl(kp.rank)}</b>` : ''); lbls += `<span class="lbl" style="color:var(--brass)">${kp.rank !== null ? 'Pick suit' : 'Pick rank'}</span>`; }
    else { slots += emptyCard('l'); lbls += '<span class="lbl">&nbsp;</span>'; }
  }
  const ranks = [];
  for (let r = 12; r >= 0; r--) ranks.push(`<button class="${kp.rank === r ? 'on' : ''}" data-a="kp-rank" data-v="${r}">${rl(r)}</button>`);
  const full = kp.cards.length >= kp.count;
  const suits = [0, 1, 2, 3].map(s => {
    const dis = full || (kp.rank !== null && used.has(kp.rank * 4 + s));
    return `<button class="su${s}" data-a="kp-suit" data-v="${s}" ${dis ? 'disabled' : ''} aria-label="${['Spades', 'Hearts', 'Diamonds', 'Clubs'][s]}">${SYM[s]}</button>`;
  }).join('');
  return `<div class="slots">${slots}</div><div class="slotlbl">${lbls}</div>
  <div class="ranks">${ranks.join('')}</div><div class="suits" id="suits">${suits}</div>
  <p class="hint center kp-msg">${esc(kp.msg || 'Four-colour deck: ♠ white · ♥ red · ♦ blue · ♣ green')}</p>`;
}

function renderHole() {
  const h = H(), c = C();
  if (!ui.kp || ui.kp.mode !== 'hole') openHoleKeypad();
  const full = ui.kp.cards.length === 2;
  return `<main class="screen">
  <div class="scroll">
    <div class="row" style="padding-top:14px;justify-content:flex-start;gap:6px"><button class="iconbtn" data-a="to-setup" aria-label="Back to setup">${ICON.back}</button><span class="lbl">Hand ${h.num} · Dealer ${esc(name(c.dealer))}</span></div>
    <header class="top" style="padding-top:12px"><h1>Your cards</h1><p class="sub">Tap a rank, then a suit.</p></header>
    ${keypadHTML()}
  </div>
  <div class="cta"><button class="big brass" data-a="hole-ok" ${full ? '' : 'disabled'}>Deal me in</button><button class="link" data-a="hole-skip">Skip — play without advice</button></div>
</main>`;
}

/* play */
function renderPlay() {
  const h = H(), c = C(), me = c.me;
  const a = advise();
  const yourTurn = h.toAct === me && !h.p[me].folded && !h.awaitBoard;
  const toCallActor = Math.max(0, h.cur - h.p[h.toAct].bet);

  // pills
  let pill;
  if (a.verdict === 'FOLDED' || a.verdict === 'CARDS' || a.verdict === 'WAIT') {
    const t = { FOLDED: ['FOLDED', 'Watching'], CARDS: ['NO CARDS', 'Tap to add'], WAIT: ['NEXT CARD', 'Waiting'] }[a.verdict];
    pill = `<div class="pill adv" style="--c:var(--dim)" data-a="${a.verdict === 'CARDS' ? 'edit-hole' : ''}"><div><div class="v">${t[0]}</div><div class="z" style="color:var(--muted)">${t[1]}</div></div></div>`;
  } else {
    const size = a.verdict === 'RAISE' ? (a.bet ? `bet ${fmt(a.to)}` : `to ${fmt(a.to)}`) : a.verdict === 'CALL' ? fmt(a.toCall) : a.verdict === 'CHECK' ? 'free card' : 'save chips';
    pill = `<div class="pill adv ${yourTurn ? 'glow' : ''}" style="--c:${VCOL[a.verdict]}"><span class="dot">${ICON[a.verdict]}</span><div><div class="v">${a.verdict}</div><div class="z">${size}</div></div></div>`;
  }
  const winPct = a.eq === undefined ? null : Math.round(a.eq * 100);
  const win = `<div class="pill win"><span class="lbl">Win chance</span><div class="wr"><span class="num">${winPct === null ? '—' : winPct + '%'}</span><span class="bar"><i style="width:${winPct || 0}%"></i></span></div></div>`;

  // cards row
  const hole = h.hole.length ? h.hole.map(x => cardHTML(x)).join('') : emptyCard() + emptyCard();
  let board = '';
  for (let i = 0; i < 5; i++) board += h.board[i] !== undefined ? cardHTML(h.board[i]) : emptyCard();

  // players
  const rows = h.p.map((p, i) => {
    const turn = i === h.toAct && !h.awaitBoard;
    const st = p.folded ? 'Folded' : turn ? (i === me ? 'Your turn' : 'To act') : p.last || 'Waiting';
    const tags = (i === me ? '<span class="tag you">YOU</span>' : '') + (i === c.dealer ? '<span class="dbtn">D</span>' : '') +
      (h.street === 0 && i === c.sb ? '<span class="tag role">SB</span>' : '') + (h.street === 0 && i === c.bb ? '<span class="tag role bb">BB</span>' : '');
    return `<div class="prow ${turn ? 'turn' : ''} ${p.folded ? 'out' : ''}"><span class="pn">${esc(name(i))}</span>${tags}<span class="st">${st}</span><span class="bt num">${p.bet ? fmt(p.bet) : '—'}</span></div>`;
  }).join('');

  const ring = yourTurn ? a.verdict : '';
  const btn = (cls, label, sub, enabled, v) => `<button class="ab ${cls} ${ring === v ? 'ring' : ''}" data-a="act" data-v="${cls}" ${enabled ? '' : 'disabled'}>${ring === v ? '<span class="advised">ADVISED</span>' : ''}<b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
  const raiseSub = ring === 'RAISE' ? `advised ${fmt(a.to)}` : h.cur === 0 ? 'bet · drag to size' : 'drag to size';
  const facing = toCallActor ? `To call ${fmt(toCallActor)}` : 'No bet yet';
  const actor = h.toAct === me ? 'Your turn' : `${name(h.toAct)} to act`;

  return `<main class="screen">
  <div class="ph"><div><div class="lbl">Hand ${h.num}</div><h1>${STREETS[h.street].toUpperCase()}</h1></div>
    <div style="display:flex;gap:8px"><button class="iconbtn" data-a="undo" ${S.hist.length ? '' : 'disabled'} aria-label="Undo">${ICON.undo}</button><button class="iconbtn" data-a="menu" aria-label="Menu">${ICON.more}</button></div></div>
  <section class="pills" aria-live="polite">
    <div class="pillhead">${yourTurn ? '<span class="yt">YOUR TURN</span>' : `<span class="lbl">${h.p[me].folded ? 'You folded' : 'If it’s on you'}</span>`}</div>
    <div class="pillrow">${pill}${win}</div>
    <div class="reason">${esc(a.reason)}</div>
  </section>
  <div class="crow">
    <div class="grp"><span class="lbl">You</span><button class="holebtn" data-a="edit-hole" aria-label="Edit your cards">${hole}</button></div>
    <div class="grp"><span class="lbl">Board</span><div class="cs">${board}</div></div>
    <div class="pot"><div class="lbl">Pot</div><div class="num">${fmt(potTotal())}</div></div>
  </div>
  <div class="plist">${rows}</div>
  <div class="pad">
    <div class="padhead"><b class="${h.toAct === me ? 'mine' : ''}">${esc(actor)}</b><span>${facing}</span></div>
    <div class="btns">
      ${btn('fold', 'FOLD', '', true, 'FOLD')}
      ${btn('check', 'CHECK', '', toCallActor === 0, 'CHECK')}
      ${btn('call', 'CALL', toCallActor ? fmt(toCallActor) : '', toCallActor > 0, 'CALL')}
      ${btn('raise', 'RAISE', raiseSub, true, 'RAISE')}
    </div>
  </div>
</main>`;
}

/* over */
function renderOver() {
  const h = H(), c = C();
  let board = h.board.map(x => cardHTML(x, 'm')).join('');
  for (let i = h.board.length; i < 5; i++) board += emptyCard('m');
  const live = activeSeats();
  const head = h.winner !== null && h.winner !== undefined
    ? `<div class="lbl">${h.winner === c.me ? 'You win' : 'Everyone else folded'}</div><div class="row" style="margin-top:6px"><span style="font-size:20px;font-weight:600">${esc(name(h.winner))} wins</span><span class="num potbig">${fmt(h.pot)}</span></div>`
    : `<div class="lbl">Showdown</div><div class="row" style="margin-top:6px"><span style="font-size:20px;font-weight:600">${live.length} players left</span><span class="num potbig">${fmt(h.pot)}</span></div>`;
  const rows = live.map(i => `<div class="prow"><span class="pn">${esc(name(i))}</span>${i === c.me ? '<span class="tag you">YOU</span>' : ''}<span class="st">${i === c.me && h.hole.length ? h.hole.map(cardTxt).join(' ') : 'In at the end'}</span></div>`).join('');
  const nd = nextSeat(c.dealer), ns = nextSeat(c.sb), nb = nextSeat(c.bb);
  return `<main class="screen">
  <div class="scroll">
    <header class="top"><div class="lbl">Hand ${h.num} · ${STREETS[h.street]}</div><h1 style="margin-top:6px">Hand over</h1></header>
    <section class="result">${head}<div class="cs">${board}</div></section>
    <div class="lbl" style="margin:20px 0 10px">Still in at the end</div>
    <div class="stack" style="gap:6px">${rows}</div>
    <section class="nexthand row" style="margin-top:18px"><div><div class="lbl">Next hand</div><div style="font-weight:600;margin-top:4px">Dealer moves to ${esc(name(nd))}</div><div class="hint">SB → ${esc(name(ns))} · BB → ${esc(name(nb))}</div></div><span class="dbtn" style="width:28px;height:28px;line-height:28px;font-size:14px">D</span></section>
  </div>
  <div class="cta"><button class="big brass" data-a="next">Next hand</button><div class="row"><button class="link" data-a="undo">Undo last action</button><button class="link" data-a="to-setup">Change setup</button></div></div>
</main>`;
}

/* ---------------- sheets ---------------- */
function renderSheet() {
  if (!ui.sheet) { layer.innerHTML = ''; return; }
  const closable = ui.sheet !== 'board';
  let body = '';
  if (ui.sheet === 'board') body = boardSheet();
  else if (ui.sheet === 'hole') body = holeSheet();
  else if (ui.sheet === 'raise') body = raiseSheet();
  else if (ui.sheet === 'menu') body = menuSheet();
  else if (ui.sheet === 'names') body = namesSheet();
  else if (ui.sheet === 'how') body = howSheet();
  layer.innerHTML = `<div class="backdrop" ${closable ? 'data-a="close"' : ''}></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${body}</div>`;
  if (ui.sheet === 'raise') bindBand();
}

function boardSheet() {
  const h = H(), next = STREETS[h.street + 1].toLowerCase();
  const full = ui.kp.cards.length === ui.kp.count;
  const meOut = h.p[C().me].folded;
  return `<div class="lbl">${STREETS[h.street]} done · ${activeSeats().length} players in · Pot ${fmt(h.pot)}</div>
  <h2>What came on the ${next}?</h2>${keypadHTML()}
  <button class="big brass" data-a="board-ok" ${full ? '' : 'disabled'}>Deal ${next}</button>
  <div class="row"><button class="link" data-a="undo">Undo last action</button>${meOut ? '<button class="link" data-a="board-skip">Skip cards</button>' : ''}</div>`;
}
function holeSheet() {
  const full = ui.kp.cards.length === 2;
  return `<div class="lbl">Hand ${H().num}</div><h2>Your cards</h2>${keypadHTML()}
  <button class="big brass" data-a="hole-ok" ${full ? '' : 'disabled'}>Save cards</button><button class="link" data-a="close">Cancel</button>`;
}

/* raise sheet with rubber band */
function raiseBounds() {
  const h = H(), pl = h.p[h.toAct];
  const min = h.cur + h.minRaise;
  const afterCall = potTotal() + (h.cur - pl.bet);
  const potTo = h.cur + afterCall;
  const max = Math.max(roundTo(h.cur + 3 * afterCall, step()), min * 5);
  const snaps = [
    ['Min', min], ['½ pot', h.cur + afterCall / 2], ['⅔ pot', h.cur + afterCall * 2 / 3], ['Pot', potTo], ['2× pot', h.cur + 2 * afterCall],
  ].map(([l, v]) => [l, Math.max(min, roundTo(v, step()))]).filter((s, i, arr) => i === 0 || s[1] !== arr[i - 1][1]);
  return { min, max, snaps };
}
const EXP = 2.2;
const tToV = (t, b) => Math.max(b.min, Math.min(b.max, roundTo(b.min + (b.max - b.min) * Math.pow(t, EXP), step())));
const vToT = (v, b) => Math.pow(Math.max(0, Math.min(1, (v - b.min) / (b.max - b.min || 1))), 1 / EXP);

function openRaise() {
  const b = raiseBounds();
  const a = H().toAct === C().me ? advise() : null;
  const start = a && a.verdict === 'RAISE' ? a.to : b.min;
  ui.raise = { b, v: Math.min(b.max, Math.max(b.min, start)) };
  ui.sheet = 'raise'; renderSheet();
}
function raiseSheet() {
  const h = H(), r = ui.raise, b = r.b;
  const word = h.cur === 0 ? 'Bet' : 'Raise to';
  return `<div class="row"><span class="lbl">${h.cur === 0 ? 'Bet' : 'Raise'} · ${esc(name(h.toAct))}${h.toAct === C().me ? ' (You)' : ''}</span><span class="hint">${h.cur ? `Current bet ${fmt(h.cur)}` : 'No bet yet'}</span></div>
  <div class="readout"><button class="nud" data-a="nudge" data-v="-1" aria-label="Less">−</button>
    <div class="mid"><div class="lbl">${word}</div><span class="num" id="rv">${fmt(r.v)}</span><div class="hint" id="rsub">${rsub(r.v)}</div></div>
    <button class="nud" data-a="nudge" data-v="1" aria-label="More">+</button></div>
  <div class="band" id="band" aria-label="Drag to set amount" role="slider" aria-valuemin="${b.min}" aria-valuemax="${b.max}" aria-valuenow="${r.v}" tabindex="0"><svg id="bandsvg"></svg></div>
  <div class="ticks"><span>Min ${fmt(b.min)}</span><span>Max ${fmt(b.max)}</span></div>
  <div class="snaps" id="snaps">${b.snaps.map(([l, v]) => `<button data-a="snap" data-v="${v}" class="${v === r.v ? 'on' : ''}">${l} ${fmt(v)}</button>`).join('')}</div>
  <button class="big green" data-a="raise-ok" id="rok">Confirm ${h.cur === 0 ? 'bet' : 'raise to'} ${fmt(r.v)}</button>
  <button class="link" data-a="close">Cancel</button>`;
}
function rsub(v) {
  const h = H(), pl = h.p[h.toAct];
  const over = v - h.cur;
  return h.cur ? `+${fmt(over)} over the current bet · puts in ${fmt(v - pl.bet)}` : `${Math.round(v / Math.max(1, potTotal()) * 100)}% of the pot`;
}
function drawBand() {
  const el = document.getElementById('band'); if (!el) return;
  const r = ui.raise, b = r.b, w = el.clientWidth, hgt = el.clientHeight;
  const t = vToT(r.v, b);
  const x0 = 18, x1 = w - 26, cy = hgt / 2, hx = x0 + (x1 - x0) * t;
  const sag = 12 * (1 - t) + 3, thick = 6 - 3 * t;
  const mid = (x0 + hx) / 2;
  const ticks = b.snaps.map(([, v]) => { const tx = x0 + (x1 - x0) * vToT(v, b); return `<line x1="${tx}" y1="${cy + 30}" x2="${tx}" y2="${cy + 38}" stroke="var(--dim)" stroke-width="2"/>`; }).join('');
  document.getElementById('bandsvg').innerHTML =
    `<line x1="${x0}" y1="${cy}" x2="${x1}" y2="${cy}" stroke="var(--line)" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>${ticks}
    <path d="M${x0} ${cy - 9} Q${mid} ${cy - 9 + sag} ${hx} ${cy - 6}" fill="none" stroke="var(--raise)" stroke-width="${thick}" stroke-linecap="round"/>
    <path d="M${x0} ${cy + 9} Q${mid} ${cy + 9 - sag} ${hx} ${cy + 6}" fill="none" stroke="var(--raise)" stroke-width="${thick}" stroke-linecap="round" opacity=".55"/>
    <rect x="${x0 - 8}" y="${cy - 24}" width="16" height="48" rx="6" fill="var(--surf2)" stroke="var(--muted)" stroke-width="1.5"/>
    <circle cx="${hx}" cy="${cy}" r="30" fill="var(--raise)" opacity=".18"/>
    <circle cx="${hx}" cy="${cy}" r="24" fill="var(--raise)"/><circle cx="${hx}" cy="${cy}" r="9" fill="var(--surf)"/>`;
}
function setRaise(v, haptic) {
  const r = ui.raise, b = r.b;
  const nv = Math.max(b.min, Math.min(b.max, v));
  if (nv === r.v) return;
  if (haptic && b.snaps.some(([, s]) => (r.v < s) !== (nv < s))) { try { navigator.vibrate && navigator.vibrate(8); } catch (e) { /* no haptics */ } }
  r.v = nv;
  const word = H().cur === 0 ? 'bet' : 'raise to';
  document.getElementById('rv').textContent = fmt(nv);
  document.getElementById('rsub').textContent = rsub(nv);
  document.getElementById('rok').textContent = `Confirm ${word} ${fmt(nv)}`;
  document.getElementById('band').setAttribute('aria-valuenow', nv);
  document.querySelectorAll('#snaps button').forEach(bt => bt.classList.toggle('on', +bt.dataset.v === nv));
  drawBand();
}
function bindBand() {
  const el = document.getElementById('band');
  drawBand();
  let drag = false;
  const fromX = ev => {
    const rc = el.getBoundingClientRect(), x0 = 18, x1 = rc.width - 26;
    const t = Math.max(0, Math.min(1, (ev.clientX - rc.left - x0) / (x1 - x0)));
    setRaise(tToV(t, ui.raise.b), true);
  };
  el.addEventListener('pointerdown', ev => { drag = true; el.setPointerCapture(ev.pointerId); fromX(ev); });
  el.addEventListener('pointermove', ev => { if (drag) fromX(ev); });
  el.addEventListener('pointerup', () => { drag = false; });
  el.addEventListener('pointercancel', () => { drag = false; });
  el.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { setRaise(ui.raise.v + step()); ev.preventDefault(); }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { setRaise(ui.raise.v - step()); ev.preventDefault(); }
  });
}

function menuSheet() {
  const inHand = S.screen === 'play';
  return `<div class="menu"><h2 style="margin-bottom:16px">Menu</h2>
  ${inHand ? '<button class="mi" data-a="end-hand">End this hand now</button>' : ''}
  <button class="mi" data-a="how">How the advice works</button>
  <button class="mi" data-a="to-setup">Change table setup</button>
  <button class="mi danger" data-a="reset">${ui.confirmReset ? 'Tap again to erase everything' : 'Start over (clear table)'}</button>
  <button class="link" data-a="close">Close</button></div>`;
}
function namesSheet() {
  let f = '';
  for (let i = 0; i < C().n; i++) f += `<label class="lbl" for="nm${i}" style="display:block;margin:12px 0 6px">Seat ${i + 1}${i === C().me ? ' · You' : ''}</label><input id="nm${i}" data-name="${i}" maxlength="14" placeholder="Seat ${i + 1}" value="${esc(C().names[i] || '')}" autocomplete="off">`;
  return `<div class="names"><h2>Player names</h2><p class="hint">Optional. Leave blank to keep seat numbers.</p>${f}<button class="big brass" style="margin-top:18px" data-a="names-ok">Done</button></div>`;
}
function howSheet() {
  return `<div class="how"><h2>How the advice works</h2>
  <p><b>Win chance</b> plays out the rest of the hand 4,000–6,000 times against everyone still in. Before the flop it only counts players who have put chips in voluntarily (at least one opponent), because most of the rest will fold. Each opponent is given a range from what they did preflop: raised → top 15% of hands, re-raised → top 6%, called a raise → top 30%, limped → top 55%, otherwise any two cards.</p>
  <p><b>Preflop</b> compares your hand’s rank (top X% of starting hands) with a threshold that gets tighter the more players are left to act behind you. Unopened: raise to 3 BB (+1 BB per limper). Facing a raise: re-raise only premium hands, call when your hand is decent and the price is right.</p>
  <p><b>Flop, turn, river</b> use pot odds. To call you need a win chance of at least call ÷ (pot + call). Well above that → raise to about 3×. Checked to you → bet ⅔ pot when your win chance is strong for the number of opponents, otherwise check.</p>
  <p><b>Limits:</b> stacks aren’t tracked, there are no implied odds or bluffs, and betting after the flop doesn’t narrow opponents’ ranges. Treat it as a solid baseline, not a solver.</p>
  <button class="big brass" data-a="close">Got it</button></div>`;
}

/* ---------------- events ---------------- */
function flash(msg) {
  ui.kp.msg = msg; const el = document.querySelector('.kp-msg');
  if (el) { el.textContent = msg; const s = document.getElementById('suits'); if (s) { s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); } }
}
function rerenderKeypadHost() { if (ui.sheet) renderSheet(); else render(); }

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-a]'); if (!t || t.disabled) return;
  const a = t.dataset.a, v = t.dataset.v, c = C();
  if (a !== 'reset') ui.confirmReset = false;
  switch (a) {
    case 'n-': case 'n+': {
      c.n = Math.max(2, Math.min(9, c.n + (a === 'n+' ? 1 : -1)));
      if (c.me >= c.n) c.me = 0;
      if (c.dealer >= c.n) c.dealer = 0;
      autoBlinds(); break;
    }
    case 'mode': ui.mode = v; break;
    case 'seat': {
      const i = +v;
      if (ui.mode === 'me') { c.me = i; ui.mode = 'dealer'; }
      else if (ui.mode === 'dealer') { c.dealer = i; autoBlinds(); }
      else if (ui.mode === 'sb') { if (c.bb === i) c.bb = c.sb; c.sb = i; }
      else if (ui.mode === 'bb') { if (c.sb === i) c.sb = c.bb; c.bb = i; }
      break;
    }
    case 'sb-': case 'sb+': {
      const s = c.sbAmt < 10 ? 1 : c.sbAmt < 50 ? 5 : 25;
      c.sbAmt = Math.max(1, c.sbAmt + (a === 'sb+' ? s : -s)); c.bbAmt = c.sbAmt * 2; break;
    }
    case 'bb-': case 'bb+': {
      const s = c.bbAmt < 20 ? 1 : c.bbAmt < 100 ? 5 : 25;
      c.bbAmt = Math.max(c.sbAmt, c.bbAmt + (a === 'bb+' ? s : -s)); break;
    }
    case 'preset': { const [x, y] = v.split(',').map(Number); c.sbAmt = x; c.bbAmt = y; break; }
    case 'names': ui.sheet = 'names'; break;
    case 'names-ok': {
      document.querySelectorAll('[data-name]').forEach(inp => { c.names[+inp.dataset.name] = inp.value.trim(); });
      ui.sheet = null; break;
    }
    case 'start': newHand((S.H && S.H.num ? S.H.num : 0) + 1); S.screen = 'hole'; openHoleKeypad(); break;
    case 'to-setup': S.screen = 'setup'; ui.sheet = null; ui.mode = 'dealer'; break;

    case 'kp-rank': { const r = +v; ui.kp.rank = ui.kp.rank === r ? null : r; ui.kp.msg = ''; save(); rerenderKeypadHost(); return; }
    case 'kp-suit': {
      if (ui.kp.rank === null) { flash('Pick a rank first'); return; }
      const card = ui.kp.rank * 4 + +v;
      if (!usedCards().has(card) && ui.kp.cards.length < ui.kp.count) ui.kp.cards.push(card);
      ui.kp.rank = null; ui.kp.msg = ''; rerenderKeypadHost(); return;
    }
    case 'kp-rm': ui.kp.cards.splice(+v, 1); ui.kp.rank = null; rerenderKeypadHost(); return;
    case 'hole-ok': H().hole = ui.kp.cards.slice(); ui.kp = null; ui.sheet = null; S.screen = 'play'; eqCache.key = ''; break;
    case 'hole-skip': H().hole = []; ui.kp = null; S.screen = 'play'; break;
    case 'edit-hole': ui.kp = { count: 2, cards: [], rank: null, msg: '', mode: 'hole' }; ui.sheet = 'hole'; renderSheet(); return;
    case 'board-ok': dealBoard(ui.kp.cards.slice()); return;
    case 'board-skip': dealBoard([]); return;

    case 'act': {
      if (v === 'raise') { openRaise(); return; }
      act(v); return;
    }
    case 'nudge': setRaise(ui.raise.v + (+v) * step()); return;
    case 'snap': setRaise(+v); return;
    case 'raise-ok': { const amt = ui.raise.v; ui.sheet = null; ui.raise = null; act('raise', amt); return; }
    case 'undo': undo(); return;
    case 'menu': ui.sheet = 'menu'; break;
    case 'how': ui.sheet = 'how'; break;
    case 'end-hand': endHandNow(); return;
    case 'reset':
      if (!ui.confirmReset) { ui.confirmReset = true; renderSheet(); return; }
      ui.confirmReset = false; S = { cfg: defaultCfg(), H: null, hist: [], screen: 'setup' }; ui.sheet = null; ui.mode = 'me'; break;
    case 'next': nextHand(); return;
    case 'close': ui.sheet = null; if (ui.kp && ui.kp.mode === 'hole' && S.screen === 'play') ui.kp = null; break;
    default: return;
  }
  save(); render();
});
window.addEventListener('resize', () => { if (ui.sheet === 'raise') drawBand(); });

/* ---------------- boot ---------------- */
if (S.H && S.H.awaitBoard && S.screen === 'play') { ui.sheet = 'board'; openBoardKeypad(); }
if (S.screen === 'hole') openHoleKeypad();
render();
