// Populated and interactive marketplace states (dialogs, tabs, owner views).
// Run from the repo root so Playwright resolves from its node_modules.
import fs from 'node:fs';
import { parseArgs, selected, viewportFor, launchBrowser, supabaseUrl, settleForShot } from './common.mjs';
import * as F from './fixtures.mjs';

const USAGE = 'Usage: node scripts/render-marketplace/states.mjs --base <url> --out <dir> [--only a,b] [--widths 393,1280]';
const opts = parseArgs(process.argv.slice(2), USAGE);
fs.mkdirSync(opts.out, { recursive: true });

const ITEM_ID = F.CLUB_ITEMS[1].id; // the sale item
// name, path, auth (default true), role, ready selector, act (interaction),
// viewport: true = viewport-only shot (dialogs), else full page.
export const STATES = [
  { name: 'club-shop-signed-out', path: '/hub/club-shop', auth: false, ready: 'text=/Club Shop/i' },
  { name: 'club-shop-signed-in', path: '/hub/club-shop', ready: 'text=/Buy With Diamonds/' },
  { name: 'club-shop-manage', path: '/hub/club-shop', role: 'owner', ready: 'text=/Buy With Diamonds/',
    act: async (p) => {
      await p.locator('[aria-label="Club Shop Views"] button', { hasText: 'Manage' }).click();
      await p.waitForSelector('text=/Net Diamond Sales/', { timeout: 30000 }).catch(() => {});
      const ledger = p.getByRole('button', { name: 'Purchase Ledger', exact: true });
      await ledger.first().waitFor({ timeout: 20000 });
      await ledger.first().click();
      await p.waitForSelector('text=/RiverRat/', { timeout: 20000 }).catch(() => {});
    } },
  { name: 'club-shop-purchases', path: '/hub/club-shop', role: 'owner', ready: 'text=/Buy With Diamonds/',
    act: async (p) => { await p.locator('[aria-label="Club Shop Views"] button', { hasText: 'My Purchases' }).click(); } },
  { name: 'club-shop-purchase-dialog', path: '/hub/club-shop', ready: 'text=/Buy With Diamonds/', viewport: true,
    act: async (p) => {
      await p.locator('button', { hasText: /^Buy With Diamonds$/ }).first().click();
      await p.waitForSelector('[role="dialog"]:visible', { timeout: 15000 });
    } },
  { name: 'cart-populated', path: '/hub/diamond-store/cart', ready: 'text=/Diamond Altitude Hoodie|Neural Steel Diamond Hat/' },
  { name: 'orders-populated', path: '/hub/diamond-store/orders', ready: 'text=/Merchandise Order/' },
  { name: 'order-detail', path: `/hub/diamond-store/orders/${F.ORDER_ID}?source=merchandise`, ready: 'text=/Diamond Altitude Hoodie/' },
  { name: 'wishlist-populated', path: '/hub/diamond-store/wishlist', ready: 'text=/500 Piece Chip Set|Premium Playing Cards/' },
  { name: 'merch-purchase-dialog', path: '/hub/merch-store', ready: 'button[aria-label^="Buy Diamond Altitude Hoodie With"]', viewport: true,
    act: async (p) => {
      await p.locator('button[aria-label^="Buy Diamond Altitude Hoodie With"][aria-label$="Diamonds"]').first().click();
      await p.waitForSelector('[role="dialog"]:visible', { timeout: 15000 });
    } },
  { name: 'help-dialog-diamond-store', path: '/hub/diamond-store', ready: 'button[aria-label="Help For Diamond Store"]', viewport: true,
    act: async (p) => {
      await p.locator('button[aria-label="Help For Diamond Store"]').first().click();
      await p.waitForTimeout(800);
    } },
  { name: 'rewards-diamond-rewards', path: '/hub/smarter-rewards', ready: '#rewards-tab-diamonds',
    act: async (p) => { await p.click('#rewards-tab-diamonds'); } },
  { name: 'rewards-easter-eggs', path: '/hub/smarter-rewards', ready: '#rewards-tab-eggs',
    act: async (p) => { await p.click('#rewards-tab-eggs'); } },
  { name: 'club-item-detail', path: `/hub/club-shop/${ITEM_ID}`, ready: 'text=/Time Bank Stack/' },
  { name: 'reward-detail-daily-login', path: '/hub/smarter-rewards/daily_login', ready: 'text=/Ledger Verified|Earned Today|Streak/i' },
  { name: 'vip-membership', path: '/hub/vip-membership', ready: 'text=/VIP Membership/' },
  { name: 'vip-compare', path: '/hub/vip-membership/compare', ready: 'text=/VIP/' },
  { name: 'vip-manage', path: '/hub/vip-membership/manage', ready: 'text=/VIP/' },
  { name: 'vip-gift', path: '/hub/vip-membership/gift/monthly', ready: 'text=/Gift/i' },
  { name: 'merch-fulfillment', path: '/hub/merch-store/fulfillment', ready: 'text=/Merch Fulfillment/' },
  { name: 'wallet-modal', path: '/hub/diamond-store', ready: 'button[aria-label="Diamond Wallet"]', viewport: true,
    act: async (p) => {
      await p.locator('button[aria-label="Diamond Wallet"]').first().click();
      await p.waitForTimeout(3000);
    } },
];

// Error-looking copy left on screen usually means a fixture no longer matches
// the page's contract: printed as WARN lines so it is not missed.
const ERR = /Could Not|Failed|Timed Out|Unverified|Unavailable|Went Wrong|Error/i;
async function visibleErrors(p) {
  const text = await p.evaluate(() => document.body?.innerText || '').catch(() => '');
  return [...new Set(text.split('\n').map((s) => s.trim()).filter((s) => s && s.length < 220 && ERR.test(s) && !/^(Card )?Unavailable$/.test(s) && !s.includes('\t')))].slice(0, 4);
}

const states = STATES.filter((s) => selected(s.name, opts.only));
if (!states.length) { console.error(`No state matches --only ${opts.only}. States: ${STATES.map((s) => s.name).join(', ')}`); process.exit(1); }

const supabase = supabaseUrl();
const browser = await launchBrowser();
for (const width of opts.widths) {
  const vp = viewportFor(width);
  for (const s of states) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, colorScheme: 'dark' });
    await F.prep(ctx, { auth: s.auth !== false, role: s.role || 'player', populated: true, supabase });
    const p = await ctx.newPage();
    let note = '';
    try {
      await p.goto(opts.base + s.path, { waitUntil: 'domcontentloaded', timeout: 240000 });
      await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
      if (s.ready) await p.waitForSelector(s.ready, { timeout: 45000 }).catch(() => { note = ` (ready selector not found: ${s.ready})`; });
      await p.waitForTimeout(1500);
      if (s.act) await s.act(p).catch((e) => { note += ` (action failed: ${e.message.split('\n')[0]})`; });
      await p.waitForTimeout(2000);
    } catch (e) { note += ` ERR ${e.message.split('\n')[0]}`; }
    await settleForShot(p);
    await p.screenshot({ path: `${opts.out}/${vp.tag}-${s.name}.png`, fullPage: !s.viewport, timeout: 60000 }).catch((e) => { note += ` SHOT ${e.message.split('\n')[0]}`; });
    console.log(vp.tag, s.name + note);
    for (const line of await visibleErrors(p)) console.log(`WARN ${s.name}: ${line}`);
    await ctx.close();
  }
}
await browser.close();
