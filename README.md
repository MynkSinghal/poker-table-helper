# Poker Table Helper

A phone-first web app for home poker games. Mark each player's action with big
buttons; it tracks the pot and turn order, asks for the flop/turn/river, and keeps
a live **what to do** pill (Fold / Check / Call / Raise) plus your **win chance**
pinned at the top.

No build step: plain HTML, CSS and JavaScript.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page shell, fonts |
| `styles.css` | All styling (dark card-room theme) |
| `engine.js` | 7-card hand evaluator, starting-hand ranks, Monte Carlo win chance |
| `app.js` | Screens, hand state machine, advice rules, raise "rubber band" |
| `tests/engine.test.js` | `node tests/engine.test.js` — evaluator and equity sanity checks |
| `mockups/` | Approved SVG screen designs |

## Run locally

Open `index.html` in a browser, or serve the folder: `npx serve .`

## Deploy

It's a static site, so Vercel needs no settings: import the repo (framework
preset **Other**, no build command, output directory `.`) or run `npx vercel`
in this folder. Every push to `main` redeploys.

## How the advice works

- **Win chance**: thousands of simulated runouts against the players still in.
  Opponent ranges come from their preflop action (raised → top 15%,
  re-raised → top 6%, called a raise → top 30%, limped → top 55%, else any two).
  Preflop it only counts players who've put chips in voluntarily.
- **Preflop**: hand rank (top X% of starting hands) vs a threshold that tightens
  with more players left to act; re-raise premium hands, call when the price works.
- **Postflop**: pot odds. Need = call ÷ (pot + call). Call above it, raise when
  well clear, bet ⅔ pot when checked to with a strong hand.
- **Limits**: no stacks, no implied odds or bluffs, no postflop range narrowing.
