/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE WALLET'S NUMBERS DESCRIBE THE WALLET, AND THE ARENA STAYS IN THE ARENA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two rules, both from Dan on 2026-09-05 after he looked at the World Hub
 * diamond wallet and asked what had ever been done to it.
 *
 * ── 1. A COUNT SHOWN NEXT TO A TOTAL IS A CLAIM ABOUT THE TOTAL ────────────
 *
 * The filter tabs counted the rows the browser happened to have LOADED and
 * printed them beside "416 Total Transactions". Measured on that exact wallet:
 *
 *     tab         showed    truth
 *     All            50       416
 *     Refunds        31       246
 *     Earned         15       390
 *     Spent           2        25
 *     Gifts           0        18
 *     Purchases       0        11
 *
 * Gifts and Purchases told a player with 18 gifts and 11 purchases that they
 * had none. Earned was wrong twice over: counted on one page, and decided by a
 * hand-written allowlist of thirty type names that had fallen ten kinds behind
 * the platform - `reconciliation` (420 rows, 679,549 diamonds), `pvp_refund`
 * (488 rows), `adjustment` (45,645 diamonds) and others: 941 credit rows worth
 * 740,908 diamonds a player had been paid and could not find.
 *
 * So the classification is by the SIGN of the amount and by a regex for
 * refunds - facts about the row, which cannot go stale - it lives in ONE module
 * the API and the browser share, and the counts are computed server-side over
 * the whole ledger.
 *
 * ── 2. CLUB ARENA WALLETS STAY IN CLUB ARENA ───────────────────────────────
 *
 * Dan, verbatim: "CLUB ARENA WALLETS STAY IN CLUB ARENA ONLY, NEVER
 * 'TRANSITION TO THE WORLD HUB PAGES."
 *
 * The two wallets are one diamond economy seen from two places: both read
 * `profiles.diamonds` and `diamond_transactions`, and that is the integration.
 * The CHIP wallets - club member balances, promo, agent/business - are Club
 * Arena's alone and must never surface here. That was already true when this
 * was written; this pins it so it stays true.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The REAL module, not a copy of it. The older DiamondWalletUtils.test.js
// recreates its subjects ("these mirror the implementations"), which passes
// happily on a broken implementation.
const { matchesFilter, applyFilterToQuery, LEDGER_FILTERS } = require(
  join(ROOT, 'src/lib/diamonds/ledgerFilters.js')
);

const MODAL = readFileSync(join(ROOT, 'src/components/store/DiamondWalletModal.jsx'), 'utf8');
const API = readFileSync(join(ROOT, 'pages/api/store/diamond-transactions.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'src/components/store/DiamondWalletModal.module.css'), 'utf8');

test('a credit is a positive amount, never a name on a list', () => {
  // Each of these is a real production kind the old allowlist omitted. If
  // someone reintroduces an allowlist, these go red.
  for (const kind of [
    'reconciliation', 'pvp_refund', 'adjustment', 'live_gift_received',
    'easter_egg', 'training_reward', 'trivia_run', 'credit',
  ]) {
    assert.equal(
      matchesFilter({ transaction_type: kind, amount: 500 }, 'earned'),
      true,
      `${kind} is a credit and must appear under Earned`
    );
  }
  // And a debit is not earnings, whatever it is called.
  assert.equal(matchesFilter({ transaction_type: 'game_cost', amount: -5 }, 'earned'), false);
});

test('a refund is money coming back, so it is not spending', () => {
  for (const kind of ['refund', 'pvp_refund', 'tournament_refund', 'diamond_gift_refund']) {
    assert.equal(matchesFilter({ transaction_type: kind, amount: -10 }, 'refund'), true);
    assert.equal(
      matchesFilter({ transaction_type: kind, amount: -10 }, 'spent'),
      false,
      `${kind} returned diamonds; counting it as spending overstates what was spent`
    );
  }
  // `diamond_gift_refund` is the one the old three-name array missed entirely.
  assert.equal(matchesFilter({ transaction_type: 'diamond_gift_refund', amount: 20 }, 'refund'), true);
});

test('the kind is read from either column, because older rows only have `type`', () => {
  assert.equal(matchesFilter({ type: 'diamond_gift_sent', amount: -50 }, 'gifts'), true);
  assert.equal(matchesFilter({ transaction_type: 'diamond_gift_sent', amount: -50 }, 'gifts'), true);
});

test('a refunded gift belongs to BOTH Gifts and Refunds', () => {
  // The tabs are views, not a partition. Making them exclusive is what dropped
  // refunded gifts out of every tab before.
  const row = { transaction_type: 'diamond_gift_refund', amount: 20 };
  assert.equal(matchesFilter(row, 'gifts'), true);
  assert.equal(matchesFilter(row, 'refund'), true);
});

test('every tab has a server-side query, so a badge can be counted over the ledger', () => {
  // A fake PostgREST builder that records calls rather than making them.
  const calls = [];
  const stub = new Proxy({}, { get: () => (...args) => { calls.push(args); return stub; } });
  for (const f of LEDGER_FILTERS) {
    calls.length = 0;
    const out = applyFilterToQuery(stub, f);
    assert.ok(out, `${f} returned no query`);
    if (f !== 'all') {
      assert.ok(
        calls.length > 0,
        `${f} added no server-side condition, so its count would be the whole ledger`
      );
    }
  }
});

test('the API counts the tabs and sums the lifetime itself', () => {
  assert.match(API, /applyFilterToQuery/, 'the API must use the shared predicate');
  assert.match(API, /count: 'exact', head: true/, 'badges are counted server-side');
  assert.match(API, /counts,/, 'the response carries the per-tab counts');
  assert.match(API, /lifetime,/, 'the response carries whole-ledger lifetime totals');
  // The comment that described the defect must not come back with it.
  assert.doesNotMatch(
    API,
    /client handles all filtering/,
    'server-side filtering was removed again; the badges will start describing the page'
  );
});

test('the browser does not recount the badges from the loaded page', () => {
  assert.match(MODAL, /const filterCounts = serverCounts;/, 'badges must come from the server');
  assert.doesNotMatch(MODAL, /counts\.earned\+\+/, 'counting loaded rows made every badge wrong');
  assert.doesNotMatch(
    MODAL,
    /const EARNED_TYPES = \[/,
    'the hand-maintained allowlist is gone and must stay gone'
  );
});

test('Buy and Send are real buttons, reachable without a mouse', () => {
  // They were bare <div onClick> over buttons painted into the JPEG: no role,
  // no tabIndex, no key handler. These are the wallet's two money controls.
  const hitboxes = MODAL.match(/className=\{styles\.artHitbox\}/g) || [];
  assert.equal(hitboxes.length, 2, 'expected exactly two artwork buttons (Buy, Send)');
  assert.match(MODAL, /<button\n?\s*type="button"\n?\s*className=\{styles\.artHitbox\}/);
  assert.match(MODAL, /srOnly[^>]*>Buy Diamonds</, 'Buy needs an accessible name');
  assert.match(MODAL, /srOnly[^>]*>Send Diamonds To A Friend</, 'Send needs an accessible name');
});

test('a lifetime tier outranks any expiry date on the row', () => {
  // 692 of 1,021 lifetime members carry a future vip_expires_at, so testing the
  // date first showed two thirds of them a countdown on a membership that does
  // not expire.
  const tierBranch = MODAL.indexOf("vipTier === 'lifetime'");
  const dateBranch = MODAL.indexOf('} else if (vipExpirationDate) {');
  assert.ok(tierBranch > -1 && dateBranch > -1, 'the VIP branches moved');
  assert.ok(tierBranch < dateBranch, 'the lifetime branch must be tested BEFORE the expiry date');
});

test('the readouts are placed by measurement, not by pixel nudges', () => {
  // A percentage plus a fixed pixel count aligns at exactly one width.
  assert.doesNotMatch(MODAL, /calc\(28\.5% \+ 18px\)/);
  assert.doesNotMatch(MODAL, /calc\(66\.6% - 15px\)/);
  assert.doesNotMatch(MODAL, /translateX\(2px\)/);
  // Measured from the 796x1024 artwork: the plate bay centres.
  assert.match(CSS, /left: 30\.5%/);
  assert.match(CSS, /left: 69\.7%/);
  assert.match(CSS, /container-type: inline-size/);
});

test("the artwork's baked-in 30-day claim is covered by live text", () => {
  assert.match(MODAL, /styles\.artCaption/, 'the caption strip must be rendered');
  assert.match(MODAL, /vipCaption/, "and it must carry the viewer's real tier");
  assert.match(MODAL, /Lifetime VIP\. Your Membership Never Expires\./);
});

test('no hover, and not in JavaScript either', () => {
  /*
   * Dan 2026-08-29: no hover anywhere in this platform; a press is the
   * feedback. The rule was being followed in CSS and routed around in JS -
   * SIX `onMouseEnter`/`onMouseLeave` pairs assigning
   * `e.currentTarget.style.background` on the close button, the friend rows,
   * both send buttons and every ledger row. A hover written in JavaScript is
   * still a hover, and on touch - where this wallet mostly lives - it is a
   * dead handler that fires never.
   */
  assert.doesNotMatch(MODAL, /onMouseEnter/, 'a hover effect written in JS is still a hover');
  assert.doesNotMatch(MODAL, /onMouseLeave/);
  assert.doesNotMatch(MODAL, /onMouseOver/);
});

test('#SMARTERCASINOREALISM: the wallet uses the shared vault vocabulary', () => {
  assert.match(CSS, /#SMARTERCASINOREALISM/);
  assert.match(CSS, /--vault-cyan: #00d4ff/);
  assert.match(CSS, /--vault-gunmetal: #27313c/);
  /* No hover anywhere in this platform (Dan 2026-08-29); a press is the
     feedback. Asserted against the CODE, not the file: the stylesheet's own
     header states the rule, and a bare match on the whole file finds that
     sentence and fails on the comment that forbids the thing. */
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(rules, /:hover/);
});

test('the cache is stamped with whose ledger it is', () => {
  /*
   * `sp-cached-wallet-txns` held rows, balance and VIP tier under a key the
   * sign-out sweep does not clear (HamburgerMenu clears six others) and with no
   * record of the owner. Sign out, sign in as someone else on the same device
   * inside the 60s TTL, open the wallet: the previous account's ledger
   * rendered until the fetch landed.
   */
  assert.match(MODAL, /function getCachedTransactions\(userId\)/);
  assert.match(MODAL, /if \(!uid \|\| !userId \|\| uid !== userId\) return null;/);
  assert.match(MODAL, /if \(!userId\) return;/, 'never write an unattributable ledger');
  assert.match(MODAL, /getCachedTransactions\(getAuthUser\(\)\?\.id\)/);
});

test('a filter change is never silently dropped', () => {
  // The mutex used to `return` outright, so selecting a tab while any refresh
  // was running cleared the rows and never replaced them - the exact defect the
  // server-side filter exists to remove, arriving by another route.
  assert.match(
    MODAL,
    /if \(fetchInFlightRef\.current\) \{\s*pendingRefetchRef\.current = true;\s*return;/,
    'an in-flight fetch must DEFER the new request, not discard it'
  );
  // And a response must belong to the tab that asked for it.
  assert.match(MODAL, /const requestedFilter = filterRef\.current;/);
  assert.match(MODAL, /if \(filterRef\.current !== requestedFilter\)/);
});

test('a failed refresh does not erase rows that are on screen', () => {
  // fetchTransactions(0) is the BACKGROUND refresh path too, and the render
  // checks `error` first - so one dropped request replaced 50 rendered rows
  // with an error panel.
  assert.match(MODAL, /if \(offset === 0 && rowCountRef\.current === 0\)/);
});

test('an empty view says WHICH narrowing emptied it, and offers a way out', () => {
  // Search and date range are page-local; only the tab is a server query. A
  // player who left "Last 7 Days" selected was told "No transactions yet" over
  // a wallet holding hundreds, then advised how to earn their first diamond.
  assert.match(MODAL, /No Loaded Transactions Match/);
  assert.match(MODAL, /Nothing In The \$\{DATE_RANGE_OPTIONS/);
  assert.match(MODAL, /Show Everything/, 'the empty state must offer to clear the filters');
  assert.match(
    MODAL,
    /filter === 'all' && !searchQuery && dateRange === 'all'/,
    'the "earn your first diamonds" advice may only show when nothing is filtered'
  );
});

test('the balance counter cannot stick on NaN or restart from a value never shown', () => {
  // The same three defects Club Arena's counter was audited for on 2026-08-25.
  assert.match(MODAL, /const safeTarget = Number\.isFinite\(target\) \? target : 0;/);
  assert.match(MODAL, /currentRef/, 'the counter must track what was drawn, not the last target');
  assert.match(MODAL, /prefers-reduced-motion: reduce/);
});

test('every timer this component starts is cleared on unmount', () => {
  assert.match(MODAL, /if \(copyTimerRef\.current\) clearTimeout\(copyTimerRef\.current\);/);
  assert.match(MODAL, /if \(deferredFetchRef\.current\) clearTimeout\(deferredFetchRef\.current\);/);
  // A bare setTimeout for the receipt reset or the deferred refetch is the bug.
  assert.doesNotMatch(MODAL, /\n\s*setTimeout\(\(\) => setCopiedTxId\(null\), 2000\);/);
});

test('an interrupted touch does not wedge the pull-to-refresh banner', () => {
  // iOS fires touchcancel with no touchend when the system takes the gesture.
  assert.match(MODAL, /onTouchCancel=\{handleTouchCancel\}/);
});

test('closing the wallet disarms the Send panel', () => {
  // transferRecipient and transferAmount survived a close, so reopening found
  // the panel one tap from re-sending to the last recipient.
  assert.match(MODAL, /setTransferRecipient\(null\);\s*\n\s*setTransferAmount\(''\);/);
});

test('the Spent filter is NULL-safe, so a legacy-typed debit cannot vanish', () => {
  // Two chained .not(...ilike...) are ANDed, and NOT(NULL ILIKE x) is NULL, so
  // a row with a NULL transaction_type failed the filter and disappeared from
  // both the Spent list and its badge - while the browser predicate, which
  // falls back to `type`, would have counted it.
  const FILTERS = readFileSync(join(ROOT, 'src/lib/diamonds/ledgerFilters.js'), 'utf8');
  assert.match(FILTERS, /transaction_type\.is\.null,transaction_type\.not\.ilike/);
  assert.match(FILTERS, /type\.is\.null,type\.not\.ilike/);
});

test('CLUB ARENA WALLETS STAY IN CLUB ARENA (Dan, 2026-09-05)', () => {
  // The chip wallets are the Arena's. Diamonds are shared; chips are not.
  for (const token of [
    'club_members',
    'chip_balance',
    'agent_wallet_balance',
    'wallet_transactions',
    'chip_ledger',
    'fn_wallet_type_transfer',
  ]) {
    assert.equal(
      MODAL.includes(token),
      false,
      `${token} is a Club Arena chip wallet and must never surface in the World Hub wallet`
    );
    assert.equal(API.includes(token), false, `${token} must not be read by the World Hub wallet API`);
  }
});

test('and the two wallets remain ONE diamond ledger', () => {
  // The other half of Dan's rule: separate surfaces, integrated economy.
  assert.match(API, /from\('diamond_transactions'\)/);
  assert.match(API, /diamonds, vip_expires_at, is_vip, vip_tier/);
});
