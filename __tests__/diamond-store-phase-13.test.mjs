import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  classifyClubPurchaseRefusal,
  getClubDiamondPurchaseProjection,
  getClubItemEffectivePrice,
  normalizeClubCardQuote,
  normalizeClubPurchaseRpcSuccess,
  normalizeVerifiedClubPurchaseSuccess,
  normalizeVerifiedClubShopAccountId,
  normalizeVerifiedClubShopContext,
  normalizeVerifiedClubShopItems,
  normalizeVerifiedClubShopPurchases,
} from '../src/lib/store/clubCardCheckout.mjs';

test('Club Shop purchase refusals retire keys only when no debit is proven', () => {
  const expected = {
    accountId: 'fade0000-0000-4000-8000-000000000001',
    requestId: 'club-shop-request-000001',
  };
  const bound = (fields) => ({ success: false, ...expected, ...fields });
  assert.equal(
    classifyClubPurchaseRefusal(400, bound({ reason: 'insufficient_diamonds' }), expected)
      .definitive,
    false
  );
  assert.equal(
    classifyClubPurchaseRefusal(409, bound({ reason: 'price_changed' }), expected).definitive,
    false
  );
  assert.equal(
    classifyClubPurchaseRefusal(409, bound({ reason: 'reference_conflict' }), expected).definitive,
    false
  );
  assert.equal(
    classifyClubPurchaseRefusal(409, bound({ code: 'IDEMPOTENCY_CONFLICT' }), expected).definitive,
    false
  );
  assert.equal(
    classifyClubPurchaseRefusal(503, bound({ reason: 'reference_conflict' }), expected).definitive,
    false
  );
  assert.equal(
    classifyClubPurchaseRefusal(409, bound({ error: 'settlement locked' }), expected).definitive,
    false
  );
  assert.equal(
    classifyClubPurchaseRefusal(429, bound({ error: 'rate limited' }), expected).definitive,
    false
  );
  assert.equal(
    classifyClubPurchaseRefusal(503, bound({ error: 'unavailable' }), expected).definitive,
    false
  );
  assert.equal(
    classifyClubPurchaseRefusal(400, { reason: 'insufficient_diamonds' }, expected).definitive,
    false
  );
  assert.equal(
    classifyClubPurchaseRefusal(409, bound({ reason: 'price_changed' }), expected).refreshInventory,
    true
  );
  assert.equal(
    classifyClubPurchaseRefusal(
      400,
      bound({ accountId: 'fade0000-0000-4000-8000-000000000002', reason: 'insufficient_diamonds' }),
      expected
    ).definitive,
    false
  );
});

test('Club Shop shopper items require complete price, fulfillment, and availability proof', () => {
  const verified = {
    id: 'fade0000-0000-4000-8000-000000000001',
    name: 'Time Bank Pack',
    category: 'Time Banks',
    item_type: 'time_bank',
    grant_spec: { type: 'time_bank', qty: 2 },
    stackable: true,
    price: 2000,
    effective_price: 1800,
    list_price: 2000,
    on_sale: true,
    available: true,
    availability_reason: null,
    card_checkout_available: false,
    card_checkout_reason: 'unsupported_item_price',
    card_quote: null,
    purchase_count: 0,
    my_purchase_count: 0,
  };
  assert.equal(normalizeVerifiedClubShopItems([verified], 5000)?.length, 1);
  assert.equal(normalizeVerifiedClubShopItems([{ ...verified, available: undefined }], 5000), null);
  assert.equal(
    normalizeVerifiedClubShopItems([{ ...verified, effective_price: undefined }], 5000),
    null
  );
  assert.equal(normalizeVerifiedClubShopItems([{ ...verified, price: '2000' }], 5000), null);
  assert.equal(normalizeVerifiedClubShopItems([{ ...verified, stackable: false }], 5000), null);
  assert.equal(
    normalizeVerifiedClubShopItems([{ ...verified, name: 'All Throwables Pack (10)' }], 5000),
    null
  );
});

test('Club Shop context and purchase history reject unverified serialization', () => {
  const clubId = 'fade0000-0000-4000-8000-000000000010';
  const accountId = 'fade0000-0000-4000-8000-000000000013';
  const purchase = {
    id: 'fade0000-0000-4000-8000-000000000011',
    item_id: 'fade0000-0000-4000-8000-000000000012',
    price_paid: 2000,
    currency: 'diamonds',
    created_at: '2026-09-15T12:00:00.000Z',
    refunded_at: null,
    item_name: 'Time Bank Pack',
    item_category: 'Time Banks',
  };
  assert.deepEqual(normalizeVerifiedClubShopContext(clubId, 'player'), {
    clubId,
    role: 'player',
  });
  assert.deepEqual(normalizeVerifiedClubShopContext(null, null), {
    clubId: null,
    role: 'player',
  });
  assert.equal(normalizeVerifiedClubShopContext('not-a-club', 'owner'), null);
  assert.equal(normalizeVerifiedClubShopContext(clubId, 'god'), null);
  assert.equal(normalizeVerifiedClubShopAccountId(accountId, accountId), accountId);
  assert.equal(normalizeVerifiedClubShopAccountId(accountId, clubId), null);
  assert.equal(normalizeVerifiedClubShopPurchases([purchase])?.length, 1);
  assert.equal(normalizeVerifiedClubShopPurchases([{ ...purchase, price_paid: '2000' }]), null);
  assert.equal(normalizeVerifiedClubShopPurchases([{ ...purchase, currency: 'usd' }]), null);
});

test('Club Shop settlement success is bound to the exact confirmed purchase', () => {
  const expected = {
    accountId: 'fade0000-0000-4000-8000-000000000019',
    requestId: 'club-shop-request-000019',
    clubId: 'fade0000-0000-4000-8000-000000000020',
    itemId: 'fade0000-0000-4000-8000-000000000021',
    name: 'Time Bank +60s',
    itemType: 'time_bank',
    price: 2000,
  };
  const success = {
    success: true,
    accountId: expected.accountId,
    requestId: expected.requestId,
    purchaseId: 'fade0000-0000-4000-8000-000000000022',
    clubId: expected.clubId,
    itemId: expected.itemId,
    newBalance: 8000,
    currency: 'diamonds',
    pricePaid: 2000,
    duplicate: false,
    item: { name: expected.name, type: expected.itemType },
  };
  assert.equal(normalizeVerifiedClubPurchaseSuccess(success, expected)?.newBalance, 8000);
  assert.equal(normalizeVerifiedClubPurchaseSuccess({ ...success, pricePaid: 1 }, expected), null);
  assert.equal(
    normalizeVerifiedClubPurchaseSuccess({ ...success, itemId: expected.clubId }, expected),
    null
  );
  assert.equal(
    normalizeVerifiedClubPurchaseSuccess({ ...success, accountId: expected.clubId }, expected),
    null
  );
  assert.equal(
    normalizeVerifiedClubPurchaseSuccess(
      { ...success, requestId: 'club-shop-request-wrong' },
      expected
    ),
    null
  );
  assert.equal(
    normalizeVerifiedClubPurchaseSuccess({ ...success, duplicate: 'false' }, expected),
    null
  );
});

test('Club Shop RPC receipts normalize both fresh commits and exact durable replays', () => {
  const expected = {
    price: 2000,
    name: 'Time Bank +60s',
    itemType: 'time_bank',
  };
  const fresh = {
    success: true,
    purchase_id: 'fade0000-0000-4000-8000-000000000022',
    new_balance: 8000,
    price_paid: 2000,
    item_name: expected.name,
    item_type: expected.itemType,
  };
  const replay = {
    success: true,
    duplicate: true,
    purchase_id: fresh.purchase_id,
    new_balance: 8000,
    price_paid: 2000,
  };
  assert.equal(normalizeClubPurchaseRpcSuccess(fresh, expected)?.duplicate, false);
  assert.deepEqual(normalizeClubPurchaseRpcSuccess(replay, expected), {
    purchaseId: fresh.purchase_id,
    newBalance: 8000,
    pricePaid: 2000,
    duplicate: true,
    itemName: expected.name,
    itemType: expected.itemType,
  });
  assert.equal(normalizeClubPurchaseRpcSuccess({ ...fresh, duplicate: 'false' }, expected), null);
  assert.equal(
    normalizeClubPurchaseRpcSuccess({ ...fresh, item_name: 'Wrong Item' }, expected),
    null
  );
  assert.equal(normalizeClubPurchaseRpcSuccess({ ...replay, price_paid: 1999 }, expected), null);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const merchDetail = read('pages/hub/merch-store/[productId].js');
const clubDetail = read('pages/hub/club-shop/[itemId].js');
const receipt = read('pages/hub/diamond-store/orders/[orderId].js');
const vipManage = read('pages/hub/vip-membership/manage.js');
const store = read('pages/hub/diamond-store.js');
const detailShell = read('src/components/store/MarketplaceDetailExperience.jsx');
const accountShell = read('src/components/store/MarketplaceSubpageShell.jsx');
const cart = read('pages/hub/diamond-store/cart.js');
const cartCss = read('pages/hub/diamond-store/cart.module.css');
const cartStore = read('src/stores/cartStore.js');
const verifier = read('scripts/verify-marketplace-deployment.mjs');
const clubPurchaseApi = read('pages/api/club-arena/marketplace-purchase.js');

test('Club Shop API does not coerce an unverified settlement receipt', () => {
  assert.match(clubPurchaseApi, /normalizeClubPurchaseRpcSuccess\(settledResult/);
  assert.match(clubPurchaseApi, /name: fulfillmentItem\.name/);
  assert.match(clubPurchaseApi, /itemType: fulfillmentItem\.item_type/);
  assert.match(
    clubPurchaseApi,
    /from\('club_shop_purchases'\)[\s\S]*eq\('charge_reference', chargeReference\)/
  );
  assert.match(clubPurchaseApi, /committedPurchase\.price_paid !== expectedPrice/);
  assert.match(clubPurchaseApi, /duplicate: true,[\s\S]*purchase_id: committedPurchase\.id/);
  assert.match(
    clubPurchaseApi,
    /accountId: user\.id,[\s\S]*requestId,[\s\S]*clubId,[\s\S]*itemId,[\s\S]*newBalance: verifiedResult\.newBalance/
  );
  assert.doesNotMatch(clubPurchaseApi, /newBalance: Number\(/);
});

test('live catalog additions receive an ISR product detail page without a code deployment', () => {
  assert.match(merchDetail, /fallback:\s*['"]blocking['"]/);
  assert.match(merchDetail, /from\(['"]merchandise_items['"]\)/);
  assert.match(merchDetail, /eq\(['"]is_active['"],\s*true\)/);
  assert.match(merchDetail, /revalidate:\s*300/);
  assert.match(merchDetail, /fulfillmentReady/);
  assert.match(merchDetail, /https:\/\/schema\.org\/(?:InStock|OutOfStock)/);
  assert.match(merchDetail, /candidate\.startsWith\(['"]\/['"]\)/);
  assert.match(merchDetail, /url\.protocol === ['"]https:['"]/);
  assert.match(merchDetail, /initialProduct=\{product\}/);
  assert.match(merchDetail, /catalogCategory=\{product\.category\}/);
  assert.match(merchDetail, /openGraphType="product"/);
});

test('marketplace carts persist JSON and expose mobile-safe payment controls', () => {
  assert.match(cartStore, /createJSONStorage\(\(\) => getStorage\(\)\)/);
  assert.match(cart, /role="radiogroup"/);
  assert.match(cart, /role="radio"/);
  assert.match(cart, /aria-checked=\{usingDiamonds\}/);
  assert.match(cart, /handlePaymentChoiceKeyDown/);
  assert.match(cart, /tabIndex=\{usingDiamonds \? 0 : -1\}/);
  assert.match(cart, /className=\{cartStyles\.quantityButton\}/);
  assert.match(
    cartCss,
    /\.quantityButton\s*\{[\s\S]*?width:\s*68px;[\s\S]*?min-width:\s*68px;[\s\S]*?height:\s*45px;[\s\S]*?min-height:\s*45px;/
  );
  assert.match(cart, /cartItemMobile/);
});

test('account rails reveal the current destination and retain shared cart context', () => {
  assert.match(accountShell, /activeRouteRef/);
  assert.match(accountShell, /rail\.scrollTo\(/);
  assert.match(accountShell, /aria-current=\{active === id \? ['"]page['"]/);
  assert.match(accountShell, /useCartStore/);
  assert.match(accountShell, /Items In Cart/);
});

test('marketplace JSON-LD cannot terminate its script element', () => {
  assert.match(detailShell, /function serializeStructuredData/);
  assert.match(detailShell, /\\u003c/);
  assert.match(detailShell, /\\u003e/);
  assert.match(detailShell, /\\u0026/);
  assert.match(
    detailShell,
    /serializeStructuredData\(marketplaceStructuredData\(structuredData\)\)/
  );
});

test('club item detail closes double-submit windows and persists card intent server-side', () => {
  assert.match(clubDetail, /const loadRequestRef = useRef\(0\)/);
  assert.match(clubDetail, /requestId !== loadRequestRef\.current/);
  assert.match(clubDetail, /const processingRef = useRef\(false\)/);
  assert.match(clubDetail, /if \(processingRef\.current\) return/);
  assert.match(clubDetail, /processingRef\.current = true/);
  assert.match(clubDetail, /processingRef\.current = false/);
  assert.match(clubDetail, /redemptionIntent:\s*\{[\s\S]*?kind: 'club_shop'/);
  assert.doesNotMatch(clubDetail, /smarter_poker_pending_club_detail_card_purchase/);
  assert.match(clubDetail, /Sign In To Buy This Item/);
  assert.match(clubDetail, /Retry Live Inventory/);
  assert.match(clubDetail, /Review Diamond Purchase/);
  assert.match(clubDetail, /Confirm Diamond Purchase/);
  assert.match(clubDetail, /ref=\{diamondReviewTitleRef\}/);
  assert.match(clubDetail, /router\.query\.canceled === ['"]true['"]/);
  assert.match(
    clubDetail,
    /Card Checkout Canceled\. Your Diamonds And Club Inventory Were Not Changed\./
  );
  assert.match(clubDetail, /Card Checkout Is Unavailable For This Item Price\./);
  assert.match(clubDetail, /Sign In Again Before Authorizing A Diamond Purchase\./);
  assert.match(clubDetail, /const diamondReviewTriggerRef = useRef\(null\)/);
  assert.match(clubDetail, /normalizeClubCardQuote\(item\?\.card_quote\)/);
  assert.match(clubDetail, /expectedPrice: Number\(item\.price\)/);
  assert.match(clubDetail, /expectedCardChargeCents: cardQuote\.cardChargeCents/);
  assert.match(clubDetail, /Card Checkout Charges/);
  assert.match(clubDetail, /diamondPurchaseBalance\.toLocaleString\(\)/);
  assert.match(clubDetail, /cardPurchaseBalance\.toLocaleString\(\)/);
  assert.match(clubDetail, /noindex/);
});

test('Club Shop card projections retain the member balance that existed before checkout', () => {
  const quote = normalizeClubCardQuote({
    packageId: 'standard',
    quantity: 6,
    unitPriceCents: 2500,
    baseDiamonds: 2500,
    bonusDiamonds: 0,
    cardCharge: 150,
    cardChargeCents: 15000,
    diamondsPurchased: 15000,
    diamondPurchaseBalance: 479405,
    diamondShortfall: 0,
    cardPurchaseBalance: 494405,
  });

  assert.deepEqual(quote, {
    packageId: 'standard',
    quantity: 6,
    unitPriceCents: 2500,
    baseDiamonds: 2500,
    bonusDiamonds: 0,
    cardCharge: 150,
    cardChargeCents: 15000,
    diamondsPurchased: 15000,
    diamondPurchaseBalance: 479405,
    diamondShortfall: 0,
    cardPurchaseBalance: 494405,
  });
  assert.equal(quote?.diamondPurchaseBalance, 479405);
  assert.equal(quote?.cardPurchaseBalance, 494405);
  assert.equal(normalizeClubCardQuote(null), null);
  assert.equal(normalizeClubCardQuote({ ...quote, cardChargeCents: 14999 }), null);
  assert.equal(normalizeClubCardQuote({ ...quote, cardChargeCents: '15000' }), null);
  assert.equal(normalizeClubCardQuote({ ...quote, cardPurchaseBalance: -500 }), null);
  assert.deepEqual(getClubDiamondPurchaseProjection(15000, 10000), {
    itemPrice: 15000,
    walletBalance: 10000,
    hasDebt: false,
    shortfall: 5000,
    remainingBalance: 0,
  });
  assert.equal(getClubDiamondPurchaseProjection(15000, -500)?.hasDebt, true);
  assert.match(store, /normalizeClubCardQuote\(item\.card_quote\)/);
  assert.match(
    store,
    /const currentItem = visibleClubShopItems\.find\([\s\S]{0,120}?candidate\.id === item\.id\)/
  );
  assert.match(store, /currentItem\.price !== item\.price/);
  assert.match(store, /expectedPrice: Number\(currentItem\.price\)/);
  assert.match(store, /expectedCardChargeCents: cardQuote\.cardChargeCents/);
  assert.match(store, /Diamonds Leave \$\{diamondPurchaseBalance\.toLocaleString\(\)\}/);
  assert.match(store, /Leaves \$\{cardPurchaseBalance\.toLocaleString\(\)\}/);
  assert.doesNotMatch(read('src/lib/store/clubCardCheckout.mjs'), /DIAMOND_PACKAGES/);
});

test('Club Shop sale prices match the atomic price used by checkout and purchase controls', () => {
  assert.equal(getClubItemEffectivePrice(15000, 9000), 9000);
  assert.equal(getClubItemEffectivePrice(15000, 0), 0);
  assert.equal(getClubItemEffectivePrice(15000, null), 15000);
  assert.equal(getClubItemEffectivePrice(15000, 16000), 15000);
  assert.match(
    read('pages/api/club-arena/marketplace-items.js'),
    /effective_price: effectivePrice/
  );
  assert.match(store, /price: effectivePrice/);
  assert.match(store, /on_sale: i\.on_sale === true \|\| effectivePrice < listPrice/);
  assert.match(clubDetail, /price: effectivePrice/);
  assert.match(
    clubDetail,
    /Card Checkout Is Paused Until Your Diamond Wallet Returns To Zero Or Above\./
  );
});

test('catalog normalization comments describe the deployed defensive contract', () => {
  const merchStore = read('src/components/store/MerchStore.jsx');
  assert.doesNotMatch(merchStore, /owned by another agent|not deployed yet/i);
  assert.match(merchStore, /catalog API and database schema/i);
});

test('VIP management closes synchronous duplicate plan and cancellation requests', () => {
  assert.match(vipManage, /const actionBusyRef = useRef\(false\)/);
  assert.match(
    vipManage,
    /if \(\s*actionBusyRef\.current[\s\S]{0,260}getAuthUser\(\)\?\.id !== expectedAccountId/
  );
  assert.match(vipManage, /actionBusyRef\.current = true/);
  assert.match(vipManage, /actionBusyRef\.current = false/);
  // THE PLAN IS 'yearly', NOT 'annual' (corrected 2026-09-05). Dan's terms are
  // monthly, yearly and lifetime, and the rename went all the way through:
  // /api/store/switch-vip-plan accepts { plan: 'monthly' | 'yearly' } and
  // nothing in the store sends 'annual' any more. This assertion was the half
  // that did not move, and because Global Footer E2E is not a required check
  // it sat red on main instead of stopping the rename.
  assert.match(vipManage, /setPendingPlan\(['"]monthly['"]\)/);
  assert.match(vipManage, /setPendingPlan\(['"]yearly['"]\)/);
  // An old client may still POST 'annual'; purchase-vip-with-diamonds maps it
  // rather than refusing it, and that mapping is a money path, so pin it here.
  assert.match(read('pages/api/store/purchase-vip-with-diamonds.js'), /planKey === ['"]annual['"]/);
  assert.match(vipManage, /Confirm Plan Switch/);
  assert.match(vipManage, /switchPlan\(pendingPlan\)/);
});

test('VIP FAQ and private receipts point at their now-live management context', () => {
  assert.match(store, /Switch Plans From The VIP Command Center/);
  assert.doesNotMatch(store, /Not Automatically From This Page Yet/);
  assert.match(receipt, /const authReturnPath/);
  assert.match(receipt, /source=\$\{encodeURIComponent\(source\)\}/);
  assert.match(receipt, /useRequireAuth\(authReturnPath\)/);
  assert.match(receipt, /commerceActive="orders"/);
  assert.match(detailShell, /openGraphType = ['"]website['"]/);
  assert.match(detailShell, /MarketplaceCommerceNav active=\{commerceActive\}/);
});

test('deployment verification distinguishes checkout readiness from deferred fulfillment', () => {
  assert.match(verifier, /--require-checkout/);
  assert.match(verifier, /cardCheckout/);
  assert.match(verifier, /diamondCheckout/);
  assert.match(verifier, /automaticMerchFulfillment/);
  assert.match(verifier, /checkout configuration is incomplete/i);
});
