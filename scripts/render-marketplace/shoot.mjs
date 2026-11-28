// Full-page renders of the marketplace route list (signed in, empty ledgers).
// Run from the repo root so Playwright resolves from its node_modules.
import fs from 'node:fs';
import { parseArgs, selected, viewportFor, launchBrowser, supabaseUrl, settleForShot } from './common.mjs';
import { prep } from './fixtures.mjs';

const USAGE = 'Usage: node scripts/render-marketplace/shoot.mjs --base <url> --out <dir> [--only a,b] [--widths 393,1280]';
const opts = parseArgs(process.argv.slice(2), USAGE);
fs.mkdirSync(opts.out, { recursive: true });

export const ROUTES = [
  ['diamond-store', '/hub/diamond-store'],
  ['merch-store', '/hub/merch-store'],
  ['smarter-rewards', '/hub/smarter-rewards'],
  ['club-shop', '/hub/club-shop'],
  ['vip-membership', '/hub/vip-membership'],
  ['cart', '/hub/diamond-store/cart'],
  ['orders', '/hub/diamond-store/orders'],
  ['wishlist', '/hub/diamond-store/wishlist'],
  ['merch-detail', '/hub/merch-store/hoodie-neural'],
  ['reward-detail', '/hub/smarter-rewards/daily_login'],
];

const routes = ROUTES.filter(([name]) => selected(name, opts.only));
if (!routes.length) { console.error(`No route matches --only ${opts.only}. Routes: ${ROUTES.map(([n]) => n).join(', ')}`); process.exit(1); }

const supabase = supabaseUrl();
const browser = await launchBrowser();
for (const width of opts.widths) {
  const vp = viewportFor(width);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, colorScheme: 'dark' });
  await prep(ctx, { populated: false, supabase });
  for (const [name, route] of routes) {
    const p = await ctx.newPage();
    let note = '';
    try {
      await p.goto(opts.base + route, { waitUntil: 'domcontentloaded', timeout: 240000 });
      await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(3500);
    } catch (e) { note += ` ERR ${e.message.split('\n')[0]}`; }
    await settleForShot(p);
    await p.screenshot({ path: `${opts.out}/${vp.tag}-${name}.png`, fullPage: true, timeout: 60000 }).catch((e) => { note += ` SHOT ${e.message.split('\n')[0]}`; });
    console.log(vp.tag, name + note);
    await p.close();
  }
  await ctx.close();
}
await browser.close();
