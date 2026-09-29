/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PHASE 25: the debt-carrying member, the refused purchase, and the way out
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Five commerce surfaces were failing the member they were built for:
 *
 *    1. a negative Diamond wallet is a deliberate, supported state (a card
 *       refund claws back Diamonds that were already spent), yet the cart, the
 *       Club Shop item page and the purchase route's committed-charge recovery
 *       all read it as corruption and bricked;
 *    2. every refused Club Shop purchase was answered with "confirm again",
 *       including the ones the server had already explained;
 *    3. changing the cart while a durable checkout request was open locked
 *       checkout for 48 hours with no stated escape;
 *    4. a receipt was verified against a display name read before the charge;
 *    5. a replayed refund was audited under a currency the RPC never reported.
 *
 *  Plus the paging, configuration and routing defects found alongside them.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

import {
  classifyClubPurchaseRefusal,
  clubPurchaseRefusalNotice,
  normalizeClubPurchaseRpcSuccess,
  normalizeVerifiedClubPurchaseSuccess,
  normalizeVerifiedClubShopItems,
  UNCERTAIN_CLUB_PURCHASE_MESSAGE,
} from '../src/lib/store/clubCardCheckout.mjs';
import { classifyMerchDiamondPurchaseRefusal } from '../src/lib/store/verifiedCommerceResponse.mjs';
import { getClubCardCheckoutQuoteFromCatalog } from '../src/lib/store/diamondPackageCatalog.mjs';
import * as intents from '../src/lib/store/checkoutIntentStore.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const CART = read('pages/hub/diamond-store/cart.js');
const CLUB_DETAIL = read('pages/hub/club-shop/[itemId].js');
const CLUB_PURCHASE_API = read('pages/api/club-arena/marketplace-purchase.js');
const REFUND_API = read('pages/api/club-arena/refund-purchase.js');
const MANAGE_SHOP_API = read('pages/api/club-arena/manage-shop.js');
const FULFILLMENT_API = read('pages/api/store/fulfillment-operations.js');
const LEDGER_API = read('pages/api/store/order-ledger.js');
const CHECKOUT_STATUS_API = read('pages/api/store/checkout-status.js');
const ORDERS = read('pages/hub/diamond-store/orders.js');
const VERCEL = JSON.parse(read('vercel.json'));

const ACCOUNT_ID = 'fade0000-0000-4000-8000-000000000001';
const CLUB_ID = 'fade0000-0000-4000-8000-000000000010';
const ITEM_ID = 'fade0000-0000-4000-8000-000000000011';
const PURCHASE_ID = 'fade0000-0000-4000-8000-000000000012';
const REQUEST_ID = 'club-shop-request-000001';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function clubShopItem(overrides = {}) {
  return {
    id: ITEM_ID,
    name: 'Time Bank Pack',
    category: 'Time Banks',
    item_type: 'time_bank',
    grant_spec: { type: 'time_bank', qty: 2 },
    stackable: true,
    price: 2000,
    effective_price: 2000,
    list_price: 2000,
    on_sale: false,
    available: true,
    availability_reason: null,
    card_checkout_available: false,
    card_checkout_reason: 'diamond_wallet_debt',
    card_quote: null,
    purchase_count: 3,
    my_purchase_count: 0,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. A negative wallet is a reported debt, not a corrupt read
// ───────────────────────────────────────────────────────────────────────────

test('a -200 wallet still renders the cart instead of replacing it with a retry panel', () => {
  // The verification refuses anything that is not a safe integer, and nothing
  // more: a debt must not cost the shopper the ability to remove an item or
  // pay by card.
  assert.match(
    CART,
    /const verifiedBalance = Number\(data\?\.balance\);[\s\S]{0,700}if \(!data\?\.success \|\| !Number\.isSafeInteger\(verifiedBalance\)\) \{/
  );
  assert.doesNotMatch(CART, /Number\.isSafeInteger\(verifiedBalance\) \|\| verifiedBalance < 0/);
  // The Diamond rail still refuses a cart it cannot cover, so the debt cannot
  // be spent against.
  assert.match(CART, /const canAffordWithDiamonds = \(\) => \{\s*return diamondBalance >= getDiamondCost\(\);/);
});

test('a -200 wallet still verifies the Club Shop catalog and its item page', () => {
  const items = [clubShopItem()];
  assert.equal(normalizeVerifiedClubShopItems(items, -200)?.length, 1);
  assert.equal(normalizeVerifiedClubShopItems(items, 0)?.length, 1);
  // Still a number, and still an integer.
  assert.equal(normalizeVerifiedClubShopItems(items, -200.5), null);
  assert.equal(normalizeVerifiedClubShopItems(items, '−200'), null);
  assert.equal(normalizeVerifiedClubShopItems(items, null), null);

  // The item page reports the balance rather than discarding it, so the page's
  // own debt handling is reachable instead of dead code.
  assert.match(CLUB_DETAIL, /const verifiedBalance = Number\.isSafeInteger\(body\.balance\) \? body\.balance : null;/);
  assert.doesNotMatch(CLUB_DETAIL, /Number\.isSafeInteger\(body\.balance\) && body\.balance >= 0/);
  assert.match(
    CLUB_DETAIL,
    /if \(Number\(balance\) < 0\) \{[\s\S]{0,200}Card Checkout Is Paused Until Your Diamond Wallet Returns To Zero Or Above\./
  );
});

test('every guard that refuses to fund a purchase from a debt is still in place', () => {
  // 1. The catalog refuses to build a Card funding plan at all for a wallet in
  //    debt, so the server never offers one.
  assert.equal(
    getClubCardCheckoutQuoteFromCatalog(2000, -200, {
      starter: { diamonds: 2000, bonus: 200, price: 4.99 },
    }),
    null
  );
  assert.ok(
    getClubCardCheckoutQuoteFromCatalog(2000, 0, {
      starter: { diamonds: 2000, bonus: 200, price: 4.99 },
    })
  );

  // 2. The browser still recomputes a quote's arithmetic against the reported
  //    balance, so a quote priced as though the debt were not there is refused.
  const quoteIgnoringTheDebt = clubShopItem({
    card_checkout_available: true,
    card_checkout_reason: null,
    card_quote: {
      packageId: 'starter',
      quantity: 1,
      unitPriceCents: 499,
      baseDiamonds: 2000,
      bonusDiamonds: 200,
      cardCharge: 4.99,
      cardChargeCents: 499,
      diamondsPurchased: 2200,
      // Priced from a zero balance: the shortfall and balances ignore the -200.
      diamondPurchaseBalance: 0,
      diamondShortfall: 2000,
      cardPurchaseBalance: 200,
    },
  });
  assert.equal(normalizeVerifiedClubShopItems([quoteIgnoringTheDebt], -200), null);
  assert.equal(normalizeVerifiedClubShopItems([quoteIgnoringTheDebt], 0)?.length, 1);

  // 3. And the item page refuses to open Card checkout while the balance is
  //    below zero, whatever the catalog said.
  assert.match(
    CLUB_DETAIL,
    /if \(Number\(balance\) < 0\) \{[\s\S]{0,260}return;\s*\}[\s\S]{0,80}if \(!cardQuote\)/
  );
});

test('a committed purchase is still confirmed while the wallet reads -200', () => {
  const expected = { price: 2000, name: 'Time Bank Pack', itemType: 'time_bank' };
  const recoveredReceipt = {
    success: true,
    duplicate: true,
    purchase_id: PURCHASE_ID,
    new_balance: -200,
    price_paid: 2000,
    item_name: expected.name,
    item_type: expected.itemType,
  };
  assert.equal(normalizeClubPurchaseRpcSuccess(recoveredReceipt, expected)?.newBalance, -200);
  assert.equal(
    normalizeClubPurchaseRpcSuccess({ ...recoveredReceipt, new_balance: -200.5 }, expected),
    null
  );

  // And the browser accepts the receipt the route then sends.
  const verified = normalizeVerifiedClubPurchaseSuccess(
    {
      success: true,
      accountId: ACCOUNT_ID,
      requestId: REQUEST_ID,
      clubId: CLUB_ID,
      itemId: ITEM_ID,
      purchaseId: PURCHASE_ID,
      currency: 'diamonds',
      pricePaid: 2000,
      newBalance: -200,
      duplicate: true,
      item: { name: expected.name, type: expected.itemType },
    },
    {
      accountId: ACCOUNT_ID,
      requestId: REQUEST_ID,
      clubId: CLUB_ID,
      itemId: ITEM_ID,
      name: expected.name,
      itemType: expected.itemType,
      price: 2000,
    }
  );
  assert.equal(verified?.newBalance, -200);

  // The route's recovery read keeps every integrity check except the sign.
  assert.match(
    CLUB_PURCHASE_API,
    /committedWalletError \|\|\s*!committedWallet \|\|\s*!Number\.isSafeInteger\(committedWallet\.diamonds\)\s*\)/
  );
  assert.doesNotMatch(CLUB_PURCHASE_API, /committedWallet\.diamonds < 0/);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. The server already said why
// ───────────────────────────────────────────────────────────────────────────

test('a definitive, exactly bound refusal speaks with the server copy', () => {
  const expected = { accountId: ACCOUNT_ID, requestId: REQUEST_ID };
  const bound = (fields) => ({ success: false, ...expected, ...fields });

  const soldOut = clubPurchaseRefusalNotice(
    400,
    bound({ error: 'This item is sold out', reason: 'sold_out', soldOut: true }),
    expected
  );
  assert.equal(soldOut.definitiveOutcome, true);
  assert.equal(soldOut.message, 'This item is sold out');
  // The message decision must not quietly retire the durable key.
  assert.equal(soldOut.definitive, false);

  for (const [status, reason, message] of [
    [400, 'already_owned', 'You already own an unused copy of this item. Redeem it before buying another.'],
    [400, 'limit_reached', 'You have reached the purchase limit for this item'],
    [400, 'insufficient_diamonds', 'Insufficient diamonds'],
    [409, 'price_changed', 'The Item Price Changed. Review The Current Price Before Purchasing.'],
    [409, 'fulfillment_unavailable', 'This Item Does Not Have A Verified Digital Delivery.'],
    [404, 'not_found', 'Item Not Found'],
  ]) {
    const notice = clubPurchaseRefusalNotice(status, bound({ error: message, reason }), expected);
    assert.equal(notice.definitiveOutcome, true, reason);
    assert.equal(notice.message, message, reason);
  }
});

test('an unbound, conflicting, throttled or 5xx refusal keeps the uncertain copy', () => {
  const expected = { accountId: ACCOUNT_ID, requestId: REQUEST_ID };
  const bound = (fields) => ({ success: false, ...expected, ...fields });
  const uncertain = [
    // Not bound to this account.
    [400, { success: false, error: 'This item is sold out', reason: 'sold_out' }],
    // Bound to a different request.
    [400, { ...bound({ error: 'This item is sold out', reason: 'sold_out' }), requestId: 'other-request-0001' }],
    // The durable key is bound elsewhere: nothing is proven about the charge.
    [409, bound({ error: 'Purchase reference conflict', reason: 'reference_conflict', code: 'IDEMPOTENCY_CONFLICT' })],
    // The verification read itself failed.
    [503, bound({ error: 'Purchase Status Could Not Be Verified.', reason: 'verification_unavailable' })],
    [429, bound({ error: 'rate limited' })],
    [500, bound({ error: 'Purchase failed' })],
    // A definitive reason with no copy to show.
    [400, bound({ reason: 'sold_out' })],
  ];
  for (const [status, body] of uncertain) {
    const notice = clubPurchaseRefusalNotice(status, body, expected);
    assert.equal(notice.definitiveOutcome, false, `${status} ${body?.reason || body?.error}`);
    assert.equal(notice.message, UNCERTAIN_CLUB_PURCHASE_MESSAGE);
  }
  // The classification the page uses for inventory refresh is unchanged.
  assert.equal(
    classifyClubPurchaseRefusal(409, bound({ reason: 'price_changed' }), expected).refreshInventory,
    true
  );
});

test('the Club Shop item page shows that notice instead of a fixed sentence', () => {
  assert.match(CLUB_DETAIL, /clubPurchaseRefusalNotice,/);
  assert.match(
    CLUB_DETAIL,
    /const refusalNotice = clubPurchaseRefusalNotice\(response\.status, body, \{[\s\S]{0,120}accountId: expectedAccountId,[\s\S]{0,100}requestId: durableRequestId/
  );
  assert.match(
    CLUB_DETAIL,
    /message: refusalNotice\.definitiveOutcome\s*\?\s*refusalNotice\.message\s*:\s*'Purchase Status Is Uncertain\./
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 3. A cart locked by an earlier attempt has a way out
// ───────────────────────────────────────────────────────────────────────────

test('a cart blocked by an earlier protected checkout can name and resume it', () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  const base = {
    scope: 'cart-merchandise',
    userId: ACCOUNT_ID,
    paymentMethod: 'card',
    storage,
    now,
  };
  const firstTerms = {
    ...base,
    intent: { type: 'merchandise', items: [{ id: 'tee', variantId: 'large', quantity: 1 }] },
    requestIdFactory: () => 'cart-merchandise-request-0001',
  };
  const changedTerms = {
    ...base,
    intent: {
      type: 'merchandise',
      items: [
        { id: 'tee', variantId: 'large', quantity: 1 },
        { id: 'cap', variantId: null, quantity: 2 },
      ],
    },
    requestIdFactory: () => 'cart-merchandise-request-0002',
  };

  const original = intents.getOrCreateCommerceRequestId(firstTerms);
  assert.equal(original, 'cart-merchandise-request-0001');

  // Adding a second line locks the rail. This is the state the cart was
  // leaving the shopper in for 48 hours.
  assert.throws(
    () => intents.getOrCreateCommerceRequestId(changedTerms),
    (error) => error.code === 'COMMERCE_INTENT_UNRESOLVED'
  );

  // The cart can name the earlier attempt and say which items it was for.
  const slots = intents.listCommerceRequestRecoverySlots({
    userId: ACCOUNT_ID,
    paymentMethod: 'card',
    scopePrefix: 'cart-',
    storage,
    now,
  });
  assert.deepEqual(
    slots.map((slot) => [slot.scope, slot.intent.items.map((line) => [line.id, line.quantity])]),
    [['cart-merchandise', [['tee', 1]]]]
  );

  // Re-inspecting the stored terms is what yields the request identifier the
  // shopper needs in order to retire it deliberately.
  const held = intents.inspectCommerceRequestRecovery({
    ...base,
    intent: slots[0].intent,
  });
  assert.equal(held.status, 'recoverable');
  assert.equal(held.requestId, original);

  // Resuming: restoring those exact terms returns the original request id, so
  // no second payment path is minted.
  assert.equal(intents.getOrCreateCommerceRequestId(firstTerms), original);

  // Resuming is the only exit the cart offers, and that is deliberate: see the
  // next test. Retiring the key by hand does unblock the new terms, which is
  // exactly why the cart must not do it without the server.
  assert.equal(
    intents.clearCommerceRequestById({
      userId: ACCOUNT_ID,
      paymentMethod: 'card',
      requestId: held.requestId,
      storage,
      now,
    }),
    true
  );
  assert.equal(
    intents.getOrCreateCommerceRequestId(changedTerms),
    'cart-merchandise-request-0002'
  );
});

test('the cart wires that exit into both rails and states what resuming does', () => {
  assert.match(CART, /listCommerceRequestRecoverySlots,/);
  assert.match(CART, /const describeProtectedCheckout = \(commerceIntent\) => \{/);
  assert.match(CART, /scopePrefix: 'cart-',/);
  assert.match(CART, /const resumeProtectedCheckout = \(\) => \{/);
  // Both the Card rail and the Diamond rail report the block.
  assert.equal(
    CART.match(/if \(error\?\.code === 'COMMERCE_INTENT_UNRESOLVED'\) reportProtectedCheckout|if \(err\?\.code === 'COMMERCE_INTENT_UNRESOLVED'\) reportProtectedCheckout/g)
      ?.length,
    2
  );
  // The Diamond rail's own terms-changed refusal is routed to the same exit.
  assert.match(CART, /termsChangedError\.code = 'COMMERCE_INTENT_UNRESOLVED';/);
  // The panel names the attempt, lists its items, and says what each action does.
  assert.match(CART, /title="An Earlier Checkout Is Still Protected"/);
  assert.match(CART, /label: 'Restore Those Items And Resume',/);
  assert.match(CART, /label=\{`Protected Item \$\{index \+ 1\}`\}/);
  assert.match(CART, /Items Added Since Are Removed From The Cart\./);
  // A shopper who no longer holds those items is told what to put back, not
  // offered a second payment path.
  assert.match(CART, /Put The Items Listed Below Back In This Cart At The Quantities Shown/);
});

test('the cart never retires a protected checkout key without the server', () => {
  // The durable request id IS the Stripe idempotency key: create-checkout-session
  // passes it as `idempotencyKey` and reuses the open session already carrying
  // it in metadata. Retiring it from the browser while that session is still
  // payable mints a SECOND payable session for the same purchase, and a shopper
  // who returns to the first tab pays twice. Nothing on this page can resolve an
  // attempt by request id alone, so the cart offers no blind discard.
  assert.equal(CART.includes('clearCommerceRequestById'), false);
  assert.equal(CART.includes('discardProtectedCheckout'), false);
  assert.equal(/label: '[^']*Discard[^']*'/.test(CART), false);
  // The sanctioned retires stay: a server-stated expiry still replaces the key.
  assert.match(CART, /checkoutRequestReplacementRequired\(err\)/);
  assert.match(CART, /replaceCommerceRequestId\(/);
  // create-checkout-session still treats that id as the idempotency key, which
  // is the reason this rule exists.
  const CREATE = read('pages/api/store/create-checkout-session.js');
  assert.match(CREATE, /idempotencyKey: checkoutRequestId/);
  assert.match(CREATE, /checkout_request_id: checkoutRequestId/);
});

// ───────────────────────────────────────────────────────────────────────────
// 4. A committed receipt is never failed over a display name
// ───────────────────────────────────────────────────────────────────────────

test('a mid-purchase rename does not turn a charged, delivered purchase into a 500', () => {
  assert.match(
    CLUB_PURCHASE_API,
    /const settledItemName =\s*typeof settledResult\?\.item_name === 'string' && settledResult\.item_name\.trim\(\)\s*\?\s*settledResult\.item_name\s*:\s*fulfillmentItem\.name;/
  );
  assert.match(
    CLUB_PURCHASE_API,
    /normalizeClubPurchaseRpcSuccess\(settledResult, \{\s*price: expectedPrice,\s*name: settledItemName,/
  );
  // The financial terms stay bound to what the buyer confirmed.
  assert.match(CLUB_PURCHASE_API, /itemType: fulfillmentItem\.item_type,/);

  const expected = { price: 2000, name: 'Renamed Time Bank Pack', itemType: 'time_bank' };
  const renamedReceipt = {
    success: true,
    purchase_id: PURCHASE_ID,
    new_balance: 6000,
    price_paid: 2000,
    item_name: 'Renamed Time Bank Pack',
    item_type: 'time_bank',
  };
  assert.equal(normalizeClubPurchaseRpcSuccess(renamedReceipt, expected)?.itemName, expected.name);
  // A grant type that moved is still refused: that is not a display name.
  assert.equal(
    normalizeClubPurchaseRpcSuccess({ ...renamedReceipt, item_type: 'throwable' }, expected),
    null
  );
  assert.equal(normalizeClubPurchaseRpcSuccess({ ...renamedReceipt, price_paid: 1999 }, expected), null);
});

// ───────────────────────────────────────────────────────────────────────────
// 5. A refund is audited as what the RPC reported
// ───────────────────────────────────────────────────────────────────────────

test('a replayed refund is never filed under an invented currency or buyer', () => {
  assert.doesNotMatch(REFUND_API, /result\.currency \|\| 'chips'/);
  assert.match(
    REFUND_API,
    /const refundedCurrency = typeof result\.currency === 'string' \? result\.currency : null;/
  );
  assert.match(REFUND_API, /const refundedBuyerId = result\.buyer_id \?\? null;/);
  assert.match(REFUND_API, /currency: refundedCurrency,/);
  assert.match(REFUND_API, /buyerId: refundedBuyerId, reason, alreadyRefunded/);
  assert.match(REFUND_API, /buyerId: refundedBuyerId,\s*balanceAfter: result\.balance_after \?\? null,/);
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Offer-confirmation refusals are definitive
// ───────────────────────────────────────────────────────────────────────────

test('an offer-confirmation refusal releases the durable merch request', () => {
  const expected = { accountId: ACCOUNT_ID, requestId: 'cart-diamond-merch-request-01' };
  const bound = (code) => ({ success: false, ...expected, code });
  for (const code of ['OFFER_CONFIRMATION_REQUIRED', 'OFFER_CONFIRMATION_MISMATCH']) {
    const refusal = classifyMerchDiamondPurchaseRefusal(400, bound(code), expected);
    assert.equal(refusal.definitive, true, code);
    assert.equal(refusal.responseIsBound, true, code);
  }
  // Still bound, still pre-settlement only.
  assert.equal(
    classifyMerchDiamondPurchaseRefusal(400, { success: false, code: 'OFFER_CONFIRMATION_REQUIRED' }, expected)
      .definitive,
    false
  );
  assert.equal(
    classifyMerchDiamondPurchaseRefusal(503, bound('OFFER_CONFIRMATION_REQUIRED'), expected).definitive,
    false
  );
  assert.equal(
    classifyMerchDiamondPurchaseRefusal(409, bound('IDEMPOTENCY_CONFLICT'), expected).definitive,
    false
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Operator writes validate their ids and report failed reads
// ───────────────────────────────────────────────────────────────────────────

test('a malformed id is a bad request and a failed read is a failure, not a refusal', () => {
  const post = MANAGE_SHOP_API.slice(MANAGE_SHOP_API.indexOf("if (req.method === 'POST')"));
  assert.match(post, /if \(!isUUID\(clubId\)\)\s*return res\.status\(400\)[\s\S]{0,120}Invalid clubId format/);
  assert.match(post, /if \(itemId != null && !isUUID\(itemId\)\)\s*return res\.status\(400\)[\s\S]{0,120}Invalid itemId format/);
  assert.match(post, /const \{ data: member, error: memberError \} = await getSupabase\(\)/);
  assert.match(post, /if \(memberError\) throw memberError;/);
  assert.match(post, /const \{ data: item, error: itemError \} = await getSupabase\(\)[\s\S]{0,400}if \(itemError\) throw itemError;/);
  // No read in this route may drop its error any more.
  assert.doesNotMatch(MANAGE_SHOP_API, /const \{ data: [A-Za-z]+ \} = await getSupabase\(\)/);
});

// ───────────────────────────────────────────────────────────────────────────
// 8. Two orders sharing a timestamp are both delivered across a page boundary
// ───────────────────────────────────────────────────────────────────────────

function operationsResponse() {
  return {
    headers: {},
    headersSent: false,
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

async function loadFulfillmentHandler(orders) {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fulfillment.test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'fulfillment-test-service-key';

  const user = { id: ACCOUNT_ID };
  const client = {
    from(table) {
      const state = { table, orFilters: [] };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        or(value) {
          state.orFilters.push(value);
          return query;
        },
        async maybeSingle() {
          return { data: { id: user.id, is_admin: true }, error: null };
        },
        async limit(limit) {
          let rows = [...orders];
          for (const filter of state.orFilters) {
            const match = filter.match(
              /^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/
            );
            if (!match) continue;
            const [, before, sameTime, beforeId] = match;
            rows = rows.filter(
              (row) =>
                row.created_at < before || (row.created_at === sameTime && row.id < beforeId)
            );
          }
          rows.sort(
            (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
          );
          return { data: rows.slice(0, limit), error: null };
        },
      };
      return query;
    },
  };

  const dependencyExports = {
    'node:crypto': { createHash: () => ({ update: () => ({ digest: () => 'digest' }) }) },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user, error: null }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/store/privateCommerceResponse': { setPrivateCommerceResponse: () => {} },
  };
  const module = new SourceTextModule(FULFILLMENT_API, { identifier: 'fulfillment-operations.js' });
  await module.link(async (specifier) => {
    const exports = dependencyExports[specifier];
    assert.ok(exports, `unexpected module dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return module.namespace.default;
}

test('the manual fulfillment queue pages through orders that share a timestamp', async () => {
  const sharedTimestamp = '2026-09-20T12:00:00.000000+00:00';
  const rows = [
    { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', status: 'paid', created_at: '2026-09-20T12:00:02.000000+00:00' },
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'paid', created_at: sharedTimestamp },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'paid', created_at: sharedTimestamp },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'paid', created_at: '2026-09-20T11:59:00.000000+00:00' },
  ];
  const handler = await loadFulfillmentHandler(rows);

  const first = operationsResponse();
  await handler(
    { method: 'GET', query: { limit: '2' }, headers: { authorization: 'Bearer token' } },
    first
  );
  assert.equal(first.statusCode, 200);
  assert.deepEqual(
    first.body.data.orders.map((order) => order.id),
    [rows[0].id, rows[1].id]
  );
  assert.ok(first.body.data.nextCursor, 'a page boundary must carry a cursor');

  const second = operationsResponse();
  await handler(
    {
      method: 'GET',
      query: { limit: '2', cursor: first.body.data.nextCursor },
      headers: { authorization: 'Bearer token' },
    },
    second
  );
  assert.equal(second.statusCode, 200);
  // The row tied with the first page's last row is NOT skipped.
  assert.deepEqual(
    second.body.data.orders.map((order) => order.id),
    [rows[2].id, rows[3].id]
  );

  const malformed = operationsResponse();
  await handler(
    {
      method: 'GET',
      query: { limit: '2', cursor: 'not-a-cursor' },
      headers: { authorization: 'Bearer token' },
    },
    malformed
  );
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.body.error, 'Invalid queue cursor');
});

// ───────────────────────────────────────────────────────────────────────────
// 9-11, 13. Configuration, contract and refresh defects
// ───────────────────────────────────────────────────────────────────────────

test('the order ledger refuses to answer from a key that reads nothing', () => {
  assert.doesNotMatch(LEDGER_API, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(
    LEDGER_API,
    /const key = process\.env\.SUPABASE_SERVICE_ROLE_KEY;\s*if \(!key\) throw new Error\('Order ledger database is not configured'\);/
  );
});

test('checkout status only ever names a type the return page can verify', () => {
  assert.doesNotMatch(CHECKOUT_STATUS_API, /'subscription' : 'purchase'/);
  assert.match(CHECKOUT_STATUS_API, /import \{ CHECKOUT_STATUS_TYPES \}/);
  assert.match(CHECKOUT_STATUS_API, /if \(CHECKOUT_STATUS_TYPES\.has\(declared\)\) return declared;/);
  assert.match(CHECKOUT_STATUS_API, /type: publicCheckoutType\(session, record\),/);
  const contract = read('src/lib/store/verifiedCheckoutUrl.mjs');
  const declared = contract.match(/const CHECKOUT_STATUS_TYPES = new Set\(\[([^\]]+)\]\)/)[1];
  for (const fallback of ['diamonds', 'merchandise', 'subscription', 'vip_lifetime']) {
    assert.ok(declared.includes(`'${fallback}'`), fallback);
  }
});

test('the two public store payloads override the blanket no-store API rule', () => {
  const headers = VERCEL.headers || [];
  const cacheOf = (entry) =>
    (entry.headers || []).find((header) => header.key === 'Cache-Control')?.value;
  const blanket = headers.findIndex((entry) => entry.source === '/api/(.*)');
  assert.ok(blanket >= 0);

  const catalog = headers.findIndex((entry) => entry.source === '/api/store/merch-catalog');
  const readiness = headers.findIndex((entry) => entry.source === '/api/store/readiness');
  // Later entries win, so both must sit after the blanket rule.
  assert.ok(catalog > blanket, 'the merch catalog override must follow /api/(.*)');
  assert.ok(readiness > blanket, 'the readiness override must follow /api/(.*)');
  assert.equal(cacheOf(headers[catalog]), 'public, s-maxage=300, stale-while-revalidate=600');
  assert.equal(cacheOf(headers[readiness]), 'public, s-maxage=30, stale-while-revalidate=30');
  // A strict catalog probe fails closed with no-store, so it must not be cached.
  assert.deepEqual(headers[catalog].missing, [{ type: 'query', key: 'strict' }]);

  // Nothing account-bound was loosened.
  for (const entry of headers) {
    if (!String(entry.source).startsWith('/api/')) continue;
    const value = cacheOf(entry) || '';
    if (!value.startsWith('public')) continue;
    assert.doesNotMatch(
      entry.source,
      /order-ledger|checkout|cart|diamond|vip|club-arena|fulfillment|wishlist|user\//,
      `${entry.source} must not be publicly cached`
    );
  }
});

test('every Marketplace tab wrapper serves the live catalog instead of the fallback table', () => {
  for (const wrapper of [
    'pages/hub/club-shop.js',
    'pages/hub/vip-membership.js',
    'pages/hub/merch-store.js',
    'pages/hub/smarter-rewards.js',
  ]) {
    const source = read(wrapper);
    assert.match(
      source,
      /export \{ getServerSideProps \} from '\.\/diamond-store';/,
      `${wrapper} must re-export the store's getServerSideProps`
    );
    // And the server props have to reach the component that reads them.
    assert.match(
      source,
      /<DiamondStorePage \{\.\.\.props\} initialTab="/,
      `${wrapper} must forward the server props`
    );
  }
  assert.match(read('pages/hub/diamond-store.js'), /export async function getServerSideProps\(\{ res \}\)/);
});

test('an order history refresh keeps the pages the shopper already loaded', () => {
  assert.match(ORDERS, /async \(\{ append = false, cursor = null, refresh = false \} = \{\}\) =>/);
  assert.match(ORDERS, /if \(!append && !refresh\) return nextOrders;/);
  assert.match(ORDERS, /setHasMore\(\(current\) => \(commitIsCurrent\(\) && !refresh \? Boolean\(data\.hasMore\) : current\)\);/);
  assert.match(ORDERS, /commitIsCurrent\(\) && !refresh\s*\?\s*typeof data\.nextCursor === 'string'/);
  assert.match(
    ORDERS,
    /if \(document\.visibilityState === 'visible'\) void loadOrders\(\{ refresh: true \}\);/
  );
});
