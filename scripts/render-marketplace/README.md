# render-marketplace

Headless BEFORE/AFTER renders of the marketplace (Diamond Store, Merch Store,
Smarter Rewards, Club Shop, VIP, cart, orders, wishlist and detail pages)
against a local `next dev` server, with every store API and Supabase call
mocked by fixtures. Use it to produce side-by-side review sheets for a branch
against `origin/main`.

| File | What it does |
| --- | --- |
| `shoot.mjs` | Full-page renders of the route list (signed in, empty ledgers). |
| `states.mjs` | Populated and interactive states: owner Manage view, purchase dialogs, help dialog, rewards tabs, populated cart/orders/wishlist, detail pages. Prints `WARN` lines for error copy left on screen. |
| `fixtures.mjs` | Fixture data plus `prep(ctx, opts)`, which seeds the auth session and cart and mocks: store catalog, club shop verified catalog, manage-shop / analytics / purchase ledger, cart sync, order ledger, diamond transactions, wishlist, merch catalog, reward progress, header stats, Supabase auth and REST. |
| `validate-fixtures.mjs` | Checks the fixtures against the repo's own normalizers (`src/lib/store/clubCardCheckout.mjs`, `verifiedCheckoutUrl.mjs`). No server needed. |
| `run.sh` | Fresh dev server per group, render, kill. |
| `pair.py` | Composes a BEFORE / AFTER sheet. |
| `common.mjs` | Arg parsing, Playwright/browser resolution, viewports, pre-shot settle. |

Every screenshot is preceded by: hide `nextjs-portal` (the dev overlay),
switch `img[loading=lazy]` to eager and wait 1.2 s. Without that, full-page
captures show empty frames below the fold.

Outputs are `<outDir>/<tag>-<name>.png`, where tag is `phone` (393x852 @2x),
`desk` (1280x900 @1x), or `w<width>` for other `--widths`.

## Prerequisites

- `npm install` in each repo you render (Playwright comes from the repo's
  `node_modules`; the scripts must be run from the repo root).
- A browser, picked in this order: `CHROME_PATH`, Playwright's bundled
  chromium (`npx playwright install chromium`), `/usr/bin/google-chrome`,
  `/Applications/Google Chrome.app/...`.
- `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` (its origin is the one mocked;
  defaults to `http://127.0.0.1:54399`). No real Supabase is contacted.
- Python 3 with Pillow for `pair.py`.
- Roughly 4 GB free RAM per dev server. Render one repo at a time.

## Validate fixtures first

```bash
npm run render:marketplace:validate
# also check the fixtures fit main:
node scripts/render-marketplace/validate-fixtures.mjs . ../wh-main
```

The same check runs in CI via `__tests__/render-marketplace-fixtures.test.mjs`.

## Local-only dev fix: preflop-ranges conflict

`next dev` refuses to start while both `pages/tools/preflop-ranges.js` and
`pages/tools/preflop-ranges/index.js` exist (duplicate page). For renders
only, move the directory index aside and put it back afterwards. Never commit
the move:

```bash
mv pages/tools/preflop-ranges/index.js /tmp/preflop-ranges-index.js
# ... render ...
mv /tmp/preflop-ranges-index.js pages/tools/preflop-ranges/index.js
```

Running `next dev` also rewrites `next-env.d.ts`. Never commit
`next-env.d.ts`: leave it unstaged and stage files by name, never with
`git add -A` or `git add .`.

## Shoot main vs your branch

```bash
# 1. A worktree of origin/main beside your checkout (BEFORE)
git fetch origin main
git worktree add ../wh-main origin/main
(cd ../wh-main && npm install)

# 2. BEFORE: render main with this branch's harness
#    (the harness is not on main yet, so call it by path)
H=$PWD/scripts/render-marketplace
$H/run.sh ../wh-main 3401 /tmp/shots/before shoot: states:

# 3. AFTER: render your branch
$H/run.sh . 3402 /tmp/shots/after shoot: states:
```

Groups are `shoot:<only>` or `states:<only>`, where `<only>` is a
comma-separated list of name substrings (empty means all). Splitting a long
run into several groups gives each one a fresh server, which keeps dev-mode
memory bounded:

```bash
$H/run.sh . 3402 /tmp/shots/after states:club-shop states:cart,orders,wishlist states:rewards,help
```

`run.sh` env: `WIDTHS` (default `393,1280`), `CHROME_PATH`,
`HEALTH_TRIES` (default 100 checks of `/api/health`, 3 s apart). It refuses to
run if the port is already serving, and only kills the server it started.

Against a server you already run:

```bash
node scripts/render-marketplace/states.mjs --base http://localhost:3000 --out /tmp/shots/after --only help-dialog-diamond-store
node scripts/render-marketplace/shoot.mjs --base http://localhost:3000 --out /tmp/shots/after --only diamond-store,cart --widths 393
```

Remove the worktree when done: `git worktree remove ../wh-main`.

## Compose sheets

```bash
python3 scripts/render-marketplace/pair.py /tmp/shots/before /tmp/shots/after /tmp/shots/pairs club-shop-signed-in phone
# all phone shots:
for f in /tmp/shots/after/phone-*.png; do
  n=$(basename "$f" .png); n=${n#phone-}
  python3 scripts/render-marketplace/pair.py /tmp/shots/before /tmp/shots/after /tmp/shots/pairs "$n" phone 2400
done
```

Arguments: `before_dir after_dir out_dir name tag [max_height]` (default
max height 2400 px). Writes `<out_dir>/<tag>-<name>.jpg`.

## Adding a state

Add an entry to `STATES` in `states.mjs` (`name`, `path`, `ready` selector,
optional `act`, `role`, `auth: false`, `viewport: true` for dialogs). If it
needs new data, add it to `fixtures.mjs`, mock it in `prep()`, and add an
assertion to `validateFixtures()` when a repo normalizer exists for it.
