import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

test('Vercel ships every migration consumed by the marketplace build contract', async () => {
  const vercelIgnore = await read('.vercelignore');
  for (const migration of [
    '20260830040000_atomic_diamond_merch_orders.sql',
    '20260830100000_card_commerce_settlement_hardening.sql',
    '20260830120000_commerce_event_ordering_and_subscription_claims.sql',
    '20260830130000_commerce_refund_replay_guards.sql',
  ]) {
    assert.ok(
      vercelIgnore.includes(`!/supabase/migrations/${migration}`),
      `${migration} must be present in the Vercel build bundle`
    );
  }
});

test('Diamond merchandise settlement is atomic, replay-bound, and restores only local stock', async () => {
  const [api, migration] = await Promise.all([
    read('pages/api/store/purchase-with-diamonds.js'),
    read('supabase/migrations/20260830040000_atomic_diamond_merch_orders.sql'),
  ]);
  assert.match(api, /purchase_merch_with_diamonds_atomic/);
  assert.match(api, /p_request_hash: requestHash/);
  assert.match(api, /p_shipping_address: shippingAddress/);
  assert.match(api, /new_balance/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /purchase_reference = p_purchase_reference/);
  assert.match(migration, /metadata ->> 'request_hash' <> p_request_hash/);
  assert.match(migration, /v_line_count <> v_distinct_count/);
  assert.match(migration, /public\.reserve_merch_order\(p_items, false\)/);
  assert.match(migration, /public\.add_diamonds_to_balance/);
  assert.match(migration, /INSERT INTO public\.merchandise_orders/);
  assert.match(migration, /fulfillment_provider' IN \('printful', 'provider_pending'\)/);
});

test('deferred providers remain buyable and enter an audited manual queue', async () => {
  const [catalog, checkout, purchase, operations, consolePage] = await Promise.all([
    read('pages/api/store/merch-catalog.js'),
    read('pages/api/store/create-checkout-session.js'),
    read('pages/api/store/purchase-with-diamonds.js'),
    read('pages/api/store/fulfillment-operations.js'),
    read('pages/hub/merch-store/fulfillment.js'),
  ]);
  assert.match(catalog, /manual_fulfillment_available: true/);
  assert.match(catalog, /const fulfillmentReady = true/);
  assert.match(catalog, /fulfillment_ready: fulfillmentReady/);
  assert.match(checkout, /fulfillmentMode: automaticFulfillment \? 'automatic' : 'manual'/);
  assert.match(purchase, /provider_unknown/);
  assert.match(purchase, /fulfillment_mode: 'automatic'/);
  assert.match(operations, /metadata->>fulfillment_mode\.eq\.manual/);
  assert.match(operations, /is_admin/);
  assert.match(operations, /transition_merchandise_fulfillment/);
  assert.match(operations, /refund_diamond_merch_order_atomic/);
  assert.match(consolePage, /Fulfillment Command Vault/);
  assert.match(consolePage, /const isManual = metadata\.fulfillment_mode === 'manual'/);
  assert.match(consolePage, /Automatic Fulfillment Quarantined/);
  assert.match(consolePage, /Manual Shipping And Refunds Are Locked/);
});

test('card settlement, webhook leases, refunds, and card-funded redemption are durable and atomic', async () => {
  const [checkout, webhook, migration, eventMigration, clubPage, storePage] = await Promise.all([
    read('pages/api/store/create-checkout-session.js'),
    read('pages/api/store/webhooks/stripe.js'),
    read('supabase/migrations/20260830100000_card_commerce_settlement_hardening.sql'),
    read('supabase/migrations/20260830120000_commerce_event_ordering_and_subscription_claims.sql'),
    read('pages/hub/club-shop/[itemId].js'),
    read('pages/hub/diamond-store.js'),
  ]);
  assert.match(checkout, /normalizeRedemptionIntent/);
  assert.match(checkout, /redemption_intent: redemptionIntent/);
  assert.match(checkout, /existingCheckout\?\.resume/);
  assert.match(webhook, /settle_paid_merch_order_atomic/);
  assert.match(webhook, /settle_diamond_card_purchase_atomic/);
  assert.match(webhook, /claim_stripe_webhook_event/);
  assert.match(webhook, /complete_stripe_webhook_event/);
  assert.match(webhook, /review quarantine could not be recorded/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /'stock_reserved', v_stock_taken/);
  assert.match(migration, /'redemption_status'/);
  assert.match(migration, /'needs_review'/);
  assert.doesNotMatch(clubPage, /smarter_poker_pending_club_detail_card_purchase/);
  assert.doesNotMatch(storePage, /smarter_poker_pending_club_card_purchase/);
  assert.doesNotMatch(storePage, /smarter_poker_pending_daily_vip_card/);
  assert.match(storePage, /Item Was Not Purchased/i);
  assert.match(clubPage, /Item Was Not Purchased/i);
  assert.match(webhook, /reconcile_card_merch_refund_atomic/);
  assert.doesNotMatch(webhook, /STOCK NOT RETURNED/);
  assert.match(webhook, /checkout\.sessions\.list\(\{ payment_intent/);
  assert.match(webhook, /purchaseState\.status === 'refunded'/);
  assert.match(eventMigration, /GREATEST\(COALESCE\(v_purchase\.refunded_amount_cents/);
  assert.match(eventMigration, /diamond_balance = COALESCE\(diamonds, diamond_balance, 0\) - v_delta/);
  assert.match(eventMigration, /card-redemption-refund:/);
  assert.match(eventMigration, /stock_restore_pending_return/);
  assert.match(eventMigration, /v_order\.shipped_at IS NULL AND v_order\.delivered_at IS NULL/);
  assert.match(eventMigration, /claim_vip_subscription_checkout/);
});

test('cart ownership, current variant price, and balance broadcasts survive reloads', async () => {
  const [cartStore, cartPage, merchStore, detailPage, storePage, balanceHook] = await Promise.all([
    read('src/stores/cartStore.js'),
    read('pages/hub/diamond-store/cart.js'),
    read('src/components/store/MerchStore.jsx'),
    read('pages/hub/merch-store/[productId].js'),
    read('pages/hub/diamond-store.js'),
    read('src/hooks/useDiamondBalance.js'),
  ]);
  assert.match(cartStore, /ownerId: 'guest'/);
  assert.match(
    cartStore,
    /partialize: \(state\) => \(\{[\s\S]*items: state\.items,[\s\S]*ownerId: state\.ownerId,[\s\S]*syncPending: state\.syncPending/
  );
  assert.match(cartPage, /cartLoadRequestRef/);
  assert.match(cartPage, /isCurrentCartLoad/);
  assert.match(merchStore, /variant\?\.priceUsd, product\.priceUsd/);
  assert.match(merchStore, /if \(!authResolved\) return;[\s\S]*setCartOwner\(user\?\.id \|\| 'guest'\)/);
  assert.match(merchStore, /if \(!authResolved\) return;[\s\S]*setCartOwner\(user\?\.id \|\| 'guest'\);[\s\S]*addCartItem\(/);
  assert.match(merchStore, /disabled=\{!cartReady \|\| soldOut \|\| busy\}/);
  assert.match(detailPage, /authResolved=\{!authLoading\}/);
  assert.match(storePage, /<MerchStore user=\{user\} authResolved=\{authResolved\} \/>/);
  assert.match(cartPage, /broadcastSync\('smarter_poker_diamond_sync', 'refresh'\)/);
  assert.match(balanceHook, /smarter-poker:diamond-balance/);
});

test('lifetime VIP and operator fulfillment remain fail-closed', async () => {
  const [checkout, webhook, statusApi, migration, vipMutex, operations, merchStore] = await Promise.all([
    read('pages/api/store/create-checkout-session.js'),
    read('pages/api/store/webhooks/stripe.js'),
    read('pages/api/store/vip-membership-status.js'),
    read('supabase/migrations/20260830100000_card_commerce_settlement_hardening.sql'),
    read('supabase/migrations/20260906213000_marketplace_phase7_vip_acquisition_mutex.sql'),
    read('pages/api/store/fulfillment-operations.js'),
    read('src/components/store/MerchStore.jsx'),
  ]);
  assert.match(checkout, /LIFETIME_VIP_ALREADY_OWNED/);
  assert.match(vipMutex, /v_profile\.vip_tier = 'lifetime'[\s\S]*v_profile\.vip_expires_at > p_current_period_end/);
  assert.match(vipMutex, /v_preserve_non_card_entitlement/);
  assert.doesNotMatch(webhook, /\.from\('profiles'\)[\s\S]{0,100}\.update\(/);
  assert.match(statusApi, /const tier = isLifetime \? 'lifetime'/);
  assert.match(migration, /<> 'manual'/);
  assert.match(migration, /shipping_address_required/);
  assert.match(operations, /nextCursor/);
  assert.match(merchStore, /Open Protected Fulfillment Command Vault/);
});

test('automatic provider orders cannot be manually shipped or refunded', async () => {
  const migration = await read('supabase/migrations/20260830040000_atomic_diamond_merch_orders.sql');
  assert.match(migration, /error', 'not_manual_order'/);
  assert.match(migration, /error', 'provider_cancellation_required'/);
  assert.match(migration, /p_expected_version <> v_order\.fulfillment_version/);
  assert.match(migration, /error', 'version_conflict'/);
  assert.match(migration, /merchandise_order_events/);
});

test('card checkout idempotency is user-scoped and bound to normalized intent', async () => {
  const checkout = await read('pages/api/store/create-checkout-session.js');
  assert.match(checkout, /computeCheckoutIntentHash/);
  assert.match(checkout, /checkout_intent_hash/);
  assert.match(checkout, /storedHash !== intentHash/);
  assert.match(checkout, /if \(!storedHash \|\| storedHash !== intentHash\) return \{ conflict: true \}/);
  assert.match(checkout, /terminalOrRefunded/);
  assert.match(checkout, /\['refunded', 'canceled', 'cancelled'\]\.includes\(row\.status\)/);
  assert.match(checkout, /if \(!\['pending', 'failed'\]\.includes\(row\.status\)\) return \{ conflict: true \}/);
  assert.match(checkout, /\.in\('status', \['pending', 'failed'\]\)/);
  assert.match(checkout, /\.is\('stripe_checkout_session_id', null\)/);
  assert.match(checkout, /\.\.\.existingCheckout\.metadata/);
  assert.match(checkout, /key, quantity, diamonds, bonus, price/);
  assert.match(checkout, /variantId: variantId \|\| null,[\s\S]*price/);
  assert.match(checkout, /IDEMPOTENCY_CONFLICT/);
  assert.match(checkout, /`commerce:\$\{type\}:\$\{user\.id\}:\$\{checkoutRequestId\}`/);
  assert.match(checkout, /vip-subscription:\$\{user\.id\}/);
  assert.match(checkout, /commerce:customer:\$\{user\.id\}/);
  assert.match(checkout, /CHECKOUT_RECOVERY_PENDING/);
  assert.match(checkout, /entry\.metadata\?\.checkout_intent_hash === checkoutIntentHash/);
  // Recovery now requires both the opaque request identity and the normalized
  // intent hash before an existing Stripe URL can be reattached to the mutex.
  assert.match(checkout, /entry\.metadata\?\.checkout_request_id === checkoutRequestId/);
});

test('refund replay guards keep uncredited Diamonds and shipped stock untouched', async () => {
  const migration = await read(
    'supabase/migrations/20260830130000_commerce_refund_replay_guards.sql'
  );
  assert.match(migration, /refund_before_settlement/);
  assert.match(migration, /'terminal_refund', true/);
  assert.match(migration, /terminal_settlement_acknowledged_at/);
  assert.match(migration, /stock_restore_pending_return/);
  assert.match(migration, /v_order\.shipped_at IS NULL AND v_order\.delivered_at IS NULL/);
  assert.match(migration, /fulfillment_status[\s\S]*NOT IN \('shipped', 'delivered'\)/);
  assert.match(migration, /refunded_diamonds', 0/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.settle_diamond_card_purchase_atomic/);
});

test('Club Shop and VIP Diamond purchases have durable identities and lifetime protection', async () => {
  // purchase-daily-vip.js was deleted on 2026-09-05 with the Daily Pass
  // (Dan: the terms are monthly, yearly and lifetime). Nothing was ever sold
  // on it, so there is no idempotency contract left to pin.
  const [clubApi, clubUi, vipMonthly, migration, hardening, vipUi] = await Promise.all([
    read('pages/api/club-arena/marketplace-purchase.js'),
    read('pages/hub/club-shop/[itemId].js'),
    read('pages/api/store/purchase-vip-with-diamonds.js'),
    read('supabase/migrations/20260830040000_atomic_diamond_merch_orders.sql'),
    read('supabase/migrations/20260830100000_card_commerce_settlement_hardening.sql'),
    read('pages/hub/diamond-store.js'),
  ]);
  assert.match(clubApi, /createHash\('sha256'\)/);
  assert.match(clubApi, /userId/);
  assert.match(clubUi, /diamondPurchaseRequestId/);
  assert.match(vipMonthly, /purchase_vip_with_diamonds_atomic_v3/);
  assert.match(migration, /v_profile\.vip_tier = 'lifetime'/);
  assert.match(migration, /error', 'already_lifetime'/);
  assert.match(vipUi, /vipTier === 'lifetime'/);
  assert.match(vipMonthly, /IDEMPOTENCY_CONFLICT/);
  assert.match(hardening, /vip_diamond_purchase_requests/);
  assert.match(hardening, /v_request\.request_hash <> p_request_hash/);
});

test('all privileged commerce writes fail closed without the service role', async () => {
  for (const path of [
    'pages/api/store/create-checkout-session.js',
    'pages/api/store/purchase-with-diamonds.js',
    'pages/api/store/purchase-vip-with-diamonds.js',
    'pages/api/store/webhooks/stripe.js',
    'pages/api/store/fulfillment-operations.js',
  ]) {
    const source = await read(path);
    assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  }
});
