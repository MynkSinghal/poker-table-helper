// Every one of the C(52,7) = 133,784,560 seven-card hands, counted by category.
// Published exact counts (e.g. Wikipedia "Poker probability", 7-card table).
import { expect, it } from 'vitest';
import { category, evaluate } from '../src/engine/evaluator';

it('matches the exact 7-card category counts', () => {
  const counts = new Array(9).fill(0);
  const h = new Int32Array(7);
  for (let a = 0; a < 46; a++) { h[0] = a;
    for (let b = a + 1; b < 47; b++) { h[1] = b;
      for (let c = b + 1; c < 48; c++) { h[2] = c;
        for (let d = c + 1; d < 49; d++) { h[3] = d;
          for (let e = d + 1; e < 50; e++) { h[4] = e;
            for (let f = e + 1; f < 51; f++) { h[5] = f;
              for (let g = f + 1; g < 52; g++) { h[6] = g; counts[category(evaluate(h, 7))]++; } } } } } } }
  expect(counts).toEqual([23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584]);
}, 900000);
