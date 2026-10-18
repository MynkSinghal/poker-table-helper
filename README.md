# Poker Table Helper

A phone-first web app for home poker games. Log each player's move with big buttons;
it tracks chips, pots and turn order, asks for the flop / turn / river, and keeps four
Apple-Watch-style complications pinned on top — **Win %, pot odds needed, EV of the best
move, SPR / hand strength** — while the best move glows on the button itself.

Built for iPhone (tested at 402 × 874 pt and Safari's ~700 pt). Add it to the Home Screen
for full-screen, offline use; the screen stays awake during a game.

## The maths (src/engine)

| Piece | How |
| --- | --- |
| Hand evaluator | Bitmask best-5-of-7. Checked against all **133,784,560** seven-card hands (`npm run test:exhaustive`) — every category count matches the published exact totals. |
| Win % | One opponent after the flop: **exact** — every remaining card vs every hand in their range. Otherwise Monte Carlo until the standard error is under ±0.4%. Runs in a Web Worker. |
| Opponent ranges | Start from each player's VPIP / PFR (home-game priors, shrunk toward their real numbers as hands are logged). Every postflop bet / call / check re-weights each possible hand by how likely it is to take that action, using hand strength now plus after the next card — Billings et al.'s Effective Hand Strength idea (Alberta Poki). |
| Folds | Game-theory minimum defence frequency (fold share = bet ÷ (pot + bet)), scaled by each player's observed fold rate. |
| EV | Per action and per raise size, vs folding now, over the current betting round: call = win × (pot + call) − call; raise = P(all fold) × pot + P(called) × (win vs calling ranges × final pot − chips risked). |

All behavioural assumptions live in `ASSUME` in `src/engine/model.ts`.
Limits: single-street EV (later streets aren't simulated); not a solver.

## The rules (src/game/rules.ts)

Event-sourced no-limit hold'em: blinds (heads-up dealer = SB), min-raise = last full raise,
short all-ins don't reopen betting (TDA 37-B; cumulative short raises do), side pots,
uncalled chips returned, odd chip to the first winner left of the button, all-in runouts,
rebuys. Undo = drop the last event.

## Develop

```
npm install
npm run dev            # local
npm test               # unit tests (rules + engine)
npm run test:exhaustive  # 133M-hand evaluator check (~25 s)
npm run build          # production build + PWA service worker
```

Deploys on Vercel as a Vite app (auto-detected, output `dist`).
