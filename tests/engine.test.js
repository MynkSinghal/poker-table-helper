// Run: node tests/engine.test.js
const E = require('../engine.js');
const C = s => s.split(' ').map(x => '23456789TJQKA'.indexOf(x[0]) * 4 + 'shdc'.indexOf(x[1]));
const cat = h => Math.floor(E.evalCards(C(h), 7) / 1048576);
let fail = 0;
const ok = (name, cond) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) fail++; };
ok('royal flush is a straight flush', cat('As Ks Qs Js Ts 2d 3c') === 8);
ok('wheel straight flush', cat('As 2s 3s 4s 5s Kd Kc') === 8);
ok('wheel straight', cat('Ah 2d 3c 4s 5h Kd Kc') === 4);
ok('quads', cat('9h 9d 9c 9s 2h 3d 4c') === 7);
ok('two trips make a full house', cat('9h 9d 9c 8s 8h 8d 3c') === 6);
ok('flush', cat('2h 5h 8h Th Kh Ad Ac') === 5);
ok('kicker decides two pair', E.evalCards(C('2h 2d 4c 4s 6h 6d 8c'), 7) > E.evalCards(C('2h 2d 4c 4s 6h 6d 3c'), 7));
const aa = E.equity(C('As Ah'), [], [100], 20000);
ok(`AA vs random ≈ 85% (got ${(aa * 100).toFixed(1)})`, Math.abs(aa - 0.852) < 0.015);
const ak = E.equity(C('As Kd'), [], [100], 20000);
ok(`AKo vs random ≈ 65% (got ${(ak * 100).toFixed(1)})`, Math.abs(ak - 0.65) < 0.015);
process.exit(fail ? 1 : 0);
