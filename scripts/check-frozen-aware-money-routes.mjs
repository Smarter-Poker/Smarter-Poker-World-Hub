#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CHECK 18 — A NEW MONEY ROUTE MUST KNOW ABOUT THE PLATFORM FREEZE
 *  (Dan 2026-09-01, club-arena to-do #2563 item 11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Club Arena platform freezes for five minutes at :55 of every hour while
 * the engine restarts inside an announced break: no buy-ins, no chip
 * movement, nothing. In Postgres that freeze is enforced by BEFORE triggers
 * that refuse browser (anon/authenticated) writes to the seven money/seat
 * tables — but requests made with SUPABASE_SERVICE_ROLE_KEY are EXEMPT,
 * because the engine must keep its shutdown flush and boot bookkeeping
 * working while every table is parked.
 *
 * Every API route in this repo uses the service key. That means every money-
 * moving route here inherits the exemption SILENTLY: a route written next
 * month can move chips at :57 while every player watches a countdown that
 * says nothing is happening, and no trigger will refuse it. The exemption is
 * correct for the engine; for a user-triggered API route it is a hole that
 * grows one route at a time.
 *
 * So: a NEW route under pages/api/club-arena/ that touches money must either
 *   (a) consult the freeze  — call `fn_platform_frozen` and refuse with 503
 *       while it is true, or
 *   (b) declare itself exempt — carry the marker comment
 *       `freeze-exempt: <reason>` so the exemption is a decision a reviewer
 *       can see, not an accident of which key the server happens to hold.
 *
 * The BASELINE below lists the routes that existed before this check did.
 * They are grandfathered, not endorsed: remove a name from the baseline in
 * the same PR that makes its route freeze-aware, and never add to it — a
 * growing baseline is this check deleting itself politely.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE_DIR = 'pages/api/club-arena';

/** What counts as touching money: the seven guarded tables and the RPC
 *  families that write them. Widen with care - false positives teach people
 *  to sprinkle the exempt marker, which defeats the check. */
const MONEY_RE =
  /chip_balance|chip_transactions|wallet_transactions|chip_ledger|\.from\(['"`]table_seats['"`]\)|\.from\(['"`]wallets['"`]\)|atomic_table_|atomic_chip_|fn_credit_|fn_transfer_|fn_agent_wallet_|fn_club_bank_|fn_promo_wallet_|distribute_chips|distribute_promo|mass_fund|mint_chips|increment_club_chip_pool/;

/**
 * What counts as knowing about the freeze. Three sanctioned answers:
 *
 *   fn_platform_frozen   the route asks the database itself
 *   refuseWhileFrozen    the route uses the shared helper, which asks and
 *                        answers 503 - added 2026-09-04, because the check
 *                        previously recognised only the literal RPC name and
 *                        so would have pushed three routes into copy-pasting
 *                        the same call instead of sharing one place to get
 *                        "fails closed" right
 *   freeze-exempt:       a human declared, in writing, why this one must run
 *                        during the break (see record-rake.js)
 */
const FREEZE_AWARE_CALL_RE = /fn_platform_frozen|refuseWhileFrozen/;
const FREEZE_EXEMPT_RE = /freeze-exempt:/;

/** Routes that predate the check. Shrink only. */
const BASELINE = new Set([
  'agent-analytics.js',
  'agent-dashboard.js',
  'auto-close-tables.js',
  'cashier-info.js',
  'clawback-chips.js',
  'club-analytics.js',
  'club-leaderboard.js',
  'create-club.js',
  'delete-club.js',
  'distribute-chips.js',
  'distribute-promo.js',
  'horse-launch.js',
  'join-club.js',
  'leave-club.js',
  'manage-union.js',
  'mint-chips.js',
  'player-chip-flow.js',
  'player-sessions.js',
  'rakeback.js',
  'request-cashout.js',
  'settle-period.js',
  'smart-recommendations.js',
  'spin-activation.js',
  'table-chips.js',
  'transfer-chips.js',
  'union-wallet.js',
]);

if (!existsSync(ROUTE_DIR)) {
  console.log(`CHECK 18: ${ROUTE_DIR} does not exist - nothing to check.`);
  process.exit(0);
}

/**
 * CODE ONLY - COMMENTS ARE NOT A MONEY ROUTE (2026-09-03).
 *
 * MONEY_RE was tested against the raw file, so a route whose comment merely
 * NAMES a table or an RPC counted as calling it. A retirement notice saying
 * "this used to write chip_balance; it no longer touches money" therefore
 * failed CHECK 18 as a new, freeze-unaware money route - the guard reading
 * prose as behaviour.
 *
 * That is corrosive rather than merely annoying: the quickest way to satisfy
 * it is to DELETE the explanation, so the codebase loses the record of why a
 * route was retired in order to quiet a check that misread it.
 *
 * WHAT THIS IS NOT: a JavaScript parser. It tracks strings and comments, not
 * regex literals, so `const re = /don't/` flips it into string state and the
 * remainder is copied verbatim instead of stripped.
 *
 * That failure direction is the safe one, which is why this is acceptable: a
 * mis-parse PRESERVES text, so the worst case is a surviving comment causing a
 * FALSE POSITIVE - never a real money call being hidden. Verified both ways,
 * and verified that the three club-arena routes which do contain a quote
 * inside a regex literal (house-ads, manage-shop, shop-purchases) strip
 * cleanly today, with zero leftover comment lines.
 *
 * If that stops being true, replace this with a real tokenizer rather than
 * adding another special case.
 *
 * String literals are preserved - `supabase.rpc('fn_credit_and_log')` is a
 * real call and the name lives in a string. Only comments are blanked, to
 * spaces, so every reported line number still matches the file.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code';
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") state = 'sq';
      else if (c === '"') state = 'dq';
      else if (c === '`') state = 'tpl';
      out += c; i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; } else out += ' ';
      i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? c : ' '; i++; continue;
    }
    if (c === '\\') { out += c + (c2 ?? ''); i += 2; continue; }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) state = 'code';
    out += c; i++;
  }
  return out;
}

/**
 * SIXTEEN MONEY RPCs THE PATTERN COULD NOT SEE (2026-09-04).
 *
 * MONEY_RE names PREFIXES - fn_credit_, fn_transfer_, atomic_chip_ - and every
 * RPC spelled differently fell straight through this check as though the route
 * touched nothing. A route calling fn_debit_chips, mint_club_chips,
 * fn_approve_cashout_atomic or fn_refund_shop_purchase was never asked whether
 * it respects the platform freeze, which is the one question this file exists
 * to ask.
 *
 * Found by accident: distribute-promo.js and promo-wallet.js were being
 * counted as money routes ONLY because the words `chip_balance` and
 * `chip_treasury` appear in their comments. Fixing that false positive removed
 * the accident and left them uncounted - which is what exposed the real hole.
 *
 * Arming this turned up five routes with no freeze check at all. Four are
 * fixed in the same change (three refuse with 503, record-rake declares itself
 * exempt because it books a hand that already finished); the fifth, buyin.js,
 * was already a retired 410 with a marker.
 */
const EXTRA_MONEY_RPCS = [
  'fn_debit_',
  'fn_add_prepaid_credit',
  'fn_union_credit_wallet',
  'fn_request_cashout',
  'fn_approve_cashout',
  'fn_cancel_cashout',
  'fn_refund_shop_purchase',
  'mint_club_chips',
  'mint_club_promo',
  'transfer_chips_',
  'transfer_promo_',
  'orb1_buyin_transaction',
  'increment_settlement_counters',
];

const failures = [];
let checked = 0;
for (const file of readdirSync(ROUTE_DIR).sort()) {
  if (!/\.(js|ts)$/.test(file)) continue;
  const raw = readFileSync(join(ROUTE_DIR, file), 'utf8');

  // THE TWO QUESTIONS READ DIFFERENT THINGS, AND THAT IS DELIBERATE.
  //
  // "Does this move money?" is asked of CODE ONLY. A comment naming an RPC is
  // prose, not a call, and accusing it made the fastest fix "delete the
  // retirement notice" - losing the record of why a route was retired.
  //
  // "Is it freeze-aware?" is asked of the RAW FILE, comments included, because
  // ONE OF THE TWO SANCTIONED ANSWERS IS A COMMENT. This script's own
  // instructions say: add `// freeze-exempt: <why>`. Stripping comments for
  // this question would have quietly deleted that entire remedy - buyin.js
  // carries exactly such a marker today - so a route could declare an
  // exemption in the documented way and still be failed for it.
  const code = stripComments(raw);
  const movesMoney = MONEY_RE.test(code) || EXTRA_MONEY_RPCS.some((r) => code.includes(r));
  if (!movesMoney) continue;
  checked++;
  if (BASELINE.has(file)) continue;
  // A CALL has to be in CODE; a DECLARATION may be a comment.
  //
  // Reading both from the raw file looked harmless and was not: record-rake's
  // exemption paragraph EXPLAINS the difference between itself and the routes
  // that use refuseWhileFrozen(), so merely naming the helper in prose made
  // the file look guarded. Deleting its actual marker then changed nothing,
  // which a mutation test caught - the check would have kept passing a route
  // whose exemption had been removed.
  //
  // So: the two mechanical answers must appear in code, and the human
  // declaration - the one the instructions below tell you to write as a
  // comment - is read from the raw file.
  if (FREEZE_AWARE_CALL_RE.test(code)) continue;
  if (FREEZE_EXEMPT_RE.test(raw)) continue;
  failures.push(file);
}

if (failures.length > 0) {
  console.error(
    `CHECK 18 FAILED - ${failures.length} new money-moving route(s) do not know about the platform freeze:\n`
  );
  for (const f of failures) console.error(`  pages/api/club-arena/${f}`);
  console.error(`
Every route here runs with the service key, which is EXEMPT from the :55
platform-freeze triggers - so a money route that ignores the freeze moves
chips while every player watches a countdown that says nothing is happening.

Fix one of two ways:
  1. Consult the freeze: call supabase.rpc('fn_platform_frozen') and answer
     503 with a retry-after-the-break message while it returns true.
  2. If the route genuinely must run during the break (engine-style recovery
     bookkeeping), add the marker comment
        // freeze-exempt: <one line saying why>
     so the exemption is a visible decision, not an accident of the key.

Never add a route to the baseline in this script - it exists only for the
routes that predate the check, and it only shrinks.`);
  process.exit(1);
}

console.log(
  `CHECK 18: OK - ${checked} money-moving club-arena route(s); every one newer than the baseline is freeze-aware.`
);
