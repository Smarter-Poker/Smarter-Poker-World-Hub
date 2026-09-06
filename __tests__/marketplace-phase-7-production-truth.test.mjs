import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BLOCKING_RECURRING_VIP_STATUSES,
  STRIPE_VIP_AUTHORITY,
  classifyStripeCheckoutSessionForVip,
  classifyStripeSubscriptionForVip,
  hasBlockingRecurringCardSubscription,
  resolveStripeSubscriptionVipTier,
} from '../src/lib/store/vipPurchaseGuards.mjs';
import { vipStripePriceMismatch } from '../src/lib/store/vipStripePrice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOYED_SHA = 'a'.repeat(40);
const MARKETPLACE_PHASE7_SCHEMA_MARKER = 'marketplace_phase7_vip_acquisition_mutex:v1';
const VALID_HERO_ASSET = await readFile(path.join(ROOT, 'public/images/store-v3/diamond-vault-hero.webp'));

const read = (file) => readFile(path.join(ROOT, file), 'utf8');

const diamondPackages = [
  ['micro', 100, 100],
  ['small', 500, 500],
  ['medium', 1_000, 1_000],
  ['standard', 2_500, 2_500],
  ['large', 5_000, 5_000],
  ['value', 10_000, 10_000],
  ['premium', 25_000, 25_000],
  ['whale', 50_000, 50_000],
  ['database-only-offer', 1_999, 1_999],
].map(([id, diamonds, priceCents]) => ({
  id,
  diamonds,
  priceCents,
  priceUsd: priceCents / 100,
  cardCheckoutReady: true,
  diamondCheckoutReady: false,
}));

const vipPlans = [
  {
    id: 'vip-monthly',
    planKey: 'monthly',
    checkoutPlan: 'vip-monthly',
    priceUsd: 19.99,
    priceDiamonds: 1_999,
    cardCheckoutReady: true,
    diamondCheckoutReady: true,
  },
  {
    id: 'vip-yearly',
    planKey: 'yearly',
    checkoutPlan: 'vip-yearly',
    priceUsd: 199.99,
    priceDiamonds: 19_999,
    cardCheckoutReady: true,
    diamondCheckoutReady: true,
  },
  {
    id: 'vip-lifetime',
    planKey: 'lifetime',
    checkoutPlan: 'vip-lifetime',
    priceUsd: 499,
    priceDiamonds: 49_900,
    cardCheckoutReady: false,
    diamondCheckoutReady: true,
  },
];

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function privateResponse(res, status) {
  json(res, status, { success: false }, {
    'Cache-Control': 'private, no-store, max-age=0',
    Vary: 'Authorization',
  });
}

function readiness(mode) {
  const partialPrintful = mode === 'partial_printful';
  const mixedFulfillment = mode === 'mixed_fulfillment';
  const staleSchemaMarker = mode === 'stale_schema_marker';
  return {
    success: true,
    ready: !partialPrintful && !staleSchemaMarker,
    status: partialPrintful || staleSchemaMarker ? 'degraded' : 'ready',
    fulfillmentMode: partialPrintful ? 'misconfigured' : mixedFulfillment ? 'mixed' : 'manual',
    checks: { supabase: !staleSchemaMarker, stripe: true, printful: !partialPrintful },
    catalog: {
      total: mixedFulfillment ? 2 : 1,
      variantsTotal: 0,
      printfulItems: mixedFulfillment ? 1 : 0,
      manualItems: 1,
    },
    dependencies: {
      supabase: {
        configured: true,
        reachable: true,
        catalogComplete: true,
        schemaMarker: staleSchemaMarker
          ? 'marketplace_phase7_vip_acquisition_mutex:v0'
          : MARKETPLACE_PHASE7_SCHEMA_MARKER,
        schemaMarkerReady: !staleSchemaMarker,
      },
      stripe: { configured: true, reachable: true, keyMode: 'live', modeAllowed: true },
      printful: {
        configured: mixedFulfillment,
        reachable: mixedFulfillment,
        configurationPresent: partialPrintful || mixedFulfillment,
      },
    },
    capabilities: {
      cardCheckout: !staleSchemaMarker,
      diamondCheckout: !staleSchemaMarker,
      manualMerchFulfillment: !staleSchemaMarker,
      automaticMerchFulfillment: false,
    },
  };
}

function merchCatalog(mode = 'ready') {
  return {
    success: true,
    data: {
      items: [{
        id: 'verified-item',
        price_usd: 19.99,
        price_diamonds: 1_999,
        variants: [],
        has_variants: mode === 'missing_variants',
        fulfillment_ready: true,
        fulfillment_mode: 'manual',
        card_checkout_ready: true,
        diamond_checkout_ready: true,
        payment_methods: ['card', 'diamonds'],
      }],
      count: 1,
      catalog_available: true,
      variants_available: true,
      diamonds_per_dollar: 100,
      manual_fulfillment_available: true,
      print_on_demand_available: false,
    },
  };
}

function strictCatalog(mode) {
  const plans = structuredClone(vipPlans);
  if (mode === 'wrong_vip_capability') plans[2].cardCheckoutReady = true;
  return {
    success: true,
    chipPackages: [],
    diamondPackages,
    diamondCatalogSource: mode === 'fallback_catalog' ? 'fallback' : 'database',
    vipPlans: plans,
    shopCategories: [],
    diamondsPerDollar: 100,
    warnings: [],
  };
}

function marketplaceServer(state) {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://marketplace.test');
    if (url.pathname.startsWith('/images/')) {
      res.writeHead(200, { 'Content-Type': 'image/webp' });
      return res.end(state.mode === 'fake_asset' ? Buffer.alloc(1_024) : VALID_HERO_ASSET);
    }
    if (url.pathname === '/api/health') {
      return json(res, 200, {
        status: 'ok',
        version: state.mode === 'wrong_sha' ? 'b'.repeat(40) : DEPLOYED_SHA,
        checks: { db: { status: 'ok' } },
      });
    }
    if (url.pathname === '/api/store/readiness') {
      return json(res, 200, readiness(state.mode));
    }
    if (url.pathname === '/api/store/merch-catalog') {
      return json(res, 200, merchCatalog(state.mode));
    }
    if (url.pathname === '/api/club-arena/store-catalog') {
      return json(res, 200, strictCatalog(state.mode));
    }
    if (url.pathname === '/hub/marketplace') {
      res.writeHead(308, {
        Location: state.mode === 'external_redirect'
          ? 'https://attacker.invalid/hub/diamond-store'
          : '/hub/diamond-store',
      });
      return res.end();
    }
    if (url.pathname === '/api/club-arena/purchase-chips') {
      return json(res, 410, { success: false, error: 'retired' });
    }
    if (url.pathname === '/api/store/purchase-daily-vip') {
      return privateResponse(res, 410);
    }
    if (url.pathname === '/api/store/fulfillment-operations' && req.method === 'POST') {
      return privateResponse(res, 405);
    }
    if (url.pathname.startsWith('/api/')) return privateResponse(res, 401);
    if (state.mode === 'page_redirect' && url.pathname === '/hub/diamond-store') {
      res.writeHead(307, { Location: '/auth/login' });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<main data-marketplace-route="${url.pathname}">Verified Marketplace Route</main>`);
  });
}

test('Phase 7 publishes exact route, payment, and cross-method safety contracts', async () => {
  const [
    verifier,
    readinessSource,
    workflow,
    catalog,
    merch,
    compare,
    diamondVip,
    webhook,
    checkout,
    switchPlan,
    detail,
    shell,
    vipMutex,
  ] = await Promise.all([
    read('scripts/verify-marketplace-deployment.mjs'),
    read('src/lib/store/marketplaceReadiness.js'),
    read('.github/workflows/preview-signup-gate.yml'),
    read('pages/api/club-arena/store-catalog.js'),
    read('pages/api/store/merch-catalog.js'),
    read('pages/hub/vip-membership/compare.js'),
    read('pages/api/store/purchase-vip-with-diamonds.js'),
    read('pages/api/store/webhooks/stripe.js'),
    read('pages/api/store/create-checkout-session.js'),
    read('pages/api/store/switch-vip-plan.js'),
    read('src/components/store/MarketplaceDetailExperience.jsx'),
    read('src/components/store/MarketplaceSubpageShell.jsx'),
    read('supabase/migrations/20260906213000_marketplace_phase7_vip_acquisition_mutex.sql'),
  ]);

  assert.match(workflow, /MARKETPLACE_EXPECTED_SHA: \$\{\{ github\.event\.deployment\.sha \}\}/);
  assert.match(workflow, /--require-checkout --require-production-truth/);
  assert.match(verifier, /redirect: 'manual'/);
  assert.match(verifier, /mapWithConcurrency\(privateProbeContracts, 4, probePrivate\)/);
  assert.doesNotMatch(verifier, /marketplace-readiness-invalid-token/);
  assert.match(verifier, /diamondCatalogSource === 'database'/);
  assert.match(verifier, /schemaMarker === MARKETPLACE_PHASE7_SCHEMA_MARKER/);
  assert.match(verifier, /schema_marker_mismatch/);
  assert.match(verifier, /deployment_sha_mismatch/);
  assert.match(verifier, /invalid_webp_signature/);
  assert.match(
    readinessSource,
    /client\.rpc\('marketplace_phase7_vip_acquisition_mutex_version', \{\}\)/
  );
  assert.match(readinessSource, /marker === MARKETPLACE_PHASE7_SCHEMA_MARKER/);
  assert.doesNotMatch(readinessSource, /client\.rpc\('reserve_merch_order'/);
  assert.match(catalog, /cardCheckoutReady: false,[\s\S]*diamondCheckoutReady: true/);
  assert.match(catalog, /cardCheckoutReady: true,[\s\S]*diamondCheckoutReady: false/);
  assert.match(merch, /payment_methods: \['card', 'diamonds'\]/);
  assert.match(merch, /const strict = req\.query\?\.strict === '1'/);
  assert.match(merch, /strict && !variantsAvailable/);
  assert.match(merch, /MAX_ITEMS \+ \(strict \? 1 : 0\)/);
  assert.match(merch, /item\.has_variants === true && \(variantsByItem\[item\.id\] \|\| \[\]\)\.length === 0/);
  assert.match(merch, /strict && payload\.some\(\(item\) => item\.has_variants && item\.variants\.length === 0\)/);
  assert.doesNotMatch(compare, /Stripe Checkout Verifies Every Term, Lifetime Included/);
  assert.match(compare, /Lifetime Card Checkout Remains Safely Paused/);
  assert.match(diamondVip, /classifyStripeSubscriptionForVip/);
  assert.match(diamondVip, /classifyStripeCheckoutSessionForVip/);
  assert.match(diamondVip, /code: 'ACTIVE_SUBSCRIPTION_EXISTS'/);
  assert.match(diamondVip, /\.from\('vip_diamond_purchase_requests'\)/);
  assert.match(diamondVip, /stripe\.subscriptions\.list/);
  assert.match(diamondVip, /stripe\.checkout\.sessions\.list/);
  assert.match(diamondVip, /stripeSubscriptions\?\.has_more \|\| openSessions\?\.has_more/);
  assert.ok(
    diamondVip.indexOf(".from('vip_diamond_purchase_requests')")
      < diamondVip.indexOf('stripe.subscriptions.list'),
    'durable Diamond replay must precede current Stripe eligibility'
  );
  assert.match(webhook, /async function handleStripeSubscriptionEvent/);
  assert.match(webhook, /admit_vip_subscription_checkout/);
  assert.match(webhook, /apply_vip_subscription_projection/);
  assert.match(webhook, /finalize_vip_subscription_admission/);
  assert.doesNotMatch(webhook, /async function handleSubscriptionUpdate/);
  assert.doesNotMatch(webhook, /async function handleSubscriptionCanceled/);
  assert.match(checkout, /vipStripePriceMismatch\(stripePrice, plan\)/);
  assert.match(checkout, /openSessions\?\.has_more/);
  assert.match(checkout, /entry\.metadata\?\.checkout_request_id === checkoutRequestId/);
  assert.match(checkout, /VIP_SUBSCRIPTION_INITIAL_LEASE_SECONDS/);
  assert.match(checkout, /VIP_SUBSCRIPTION_CHECKOUT_TTL_SECONDS/);
  assert.match(checkout, /p_expires_at: vipSubscriptionClaimExpiry/);
  assert.match(checkout, /checkout_request_id: checkoutRequestId,[\s\S]*checkout_intent_hash: checkoutIntentHash/);
  assert.match(checkout, /claim\?\.state !== 'initializing'/);
  assert.match(checkout, /complete_vip_subscription_checkout[\s\S]*matchingSession\.id/);
  assert.match(checkout, /sessionError\.preserveSubscriptionClaim = true/);
  assert.match(checkout, /expireStripeCheckoutSessionConfirmed\(session\.id\)/);
  assert.match(checkout, /recovered\?\.status === 'expired'/);
  assert.match(checkout, /subscriptionClaim && !error\.preserveSubscriptionClaim/);
  assert.doesNotMatch(
    checkout,
    /rpc\('release_vip_subscription_checkout'[\s\S]{0,220}\.catch\(/
  );
  assert.match(switchPlan, /vipStripePriceMismatch\(configuredPrice, target\)/);
  assert.match(detail, /data-marketplace-route=\{canonical\}/);
  assert.match(shell, /data-marketplace-route=\{canonicalRoute\}/);
  assert.match(await read('pages/hub/diamond-store/cart.js'), /data-marketplace-route="\/hub\/diamond-store\/cart"/);
  assert.match(await read('pages/hub/diamond-store/orders/[orderId].js'), /getServerSideProps[\s\S]*routeOrderId/);
  assert.match(await read('pages/hub/club-shop/[itemId].js'), /getServerSideProps[\s\S]*routeItemId/);
  assert.match(await read('pages/api/store/purchase-daily-vip.js'), /status\(410\)/);
  assert.match(vipMutex, /FROM public\.profiles[\s\S]*FOR UPDATE/);
  assert.match(vipMutex, /-- TIER:\s+3/);
  assert.match(vipMutex, /-- ROLLBACK \(Tier 3:/);
  assert.match(vipMutex, /SET search_path = public, extensions/);
  assert.match(vipMutex, /state', 'vip_entitlement_active'/);
  assert.match(vipMutex, /error', 'card_checkout_exists'/);
  assert.match(vipMutex, /error', 'active_card_subscription'/);
  assert.match(vipMutex, /purchase_vip_with_diamonds_atomic_v2/);
  assert.match(
    vipMutex,
    /COMMENT ON FUNCTION public\.claim_vip_subscription_checkout\([\s\S]*marketplace_phase7_vip_acquisition_mutex:v1/
  );
  assert.match(
    vipMutex,
    /COMMENT ON FUNCTION public\.purchase_vip_with_diamonds_atomic_v3\([\s\S]*marketplace_phase7_vip_acquisition_mutex:v1/
  );
  assert.match(
    vipMutex,
    /CREATE FUNCTION public\.marketplace_phase7_vip_acquisition_mutex_version\(\)[\s\S]*pg_catalog\.obj_description/
  );
  assert.match(
    vipMutex,
    /REVOKE ALL ON FUNCTION public\.marketplace_phase7_vip_acquisition_mutex_version\(\)[\s\S]*TO service_role/
  );
  const rollbackStart = vipMutex.indexOf('-- ROLLBACK (Tier 3:');
  const forwardMigration = vipMutex.slice(0, rollbackStart);
  const rollback = vipMutex.slice(rollbackStart);
  const claimStart = forwardMigration.indexOf(
    'CREATE OR REPLACE FUNCTION public.claim_vip_subscription_checkout('
  );
  const completeStart = forwardMigration.indexOf(
    'CREATE OR REPLACE FUNCTION public.complete_vip_subscription_checkout('
  );
  const releaseStart = forwardMigration.indexOf(
    'CREATE OR REPLACE FUNCTION public.release_vip_subscription_checkout('
  );
  const diamondStart = forwardMigration.indexOf(
    'CREATE OR REPLACE FUNCTION public.purchase_vip_with_diamonds_atomic_v3('
  );
  const admissionStart = forwardMigration.indexOf(
    'CREATE FUNCTION public.admit_vip_subscription_checkout('
  );
  const finalizeStart = forwardMigration.indexOf(
    'CREATE FUNCTION public.finalize_vip_subscription_admission('
  );
  const projectionStart = forwardMigration.indexOf(
    'CREATE FUNCTION public.apply_vip_subscription_projection('
  );
  const commentsStart = forwardMigration.indexOf('COMMENT ON FUNCTION', finalizeStart);
  assert.ok([
    rollbackStart,
    claimStart,
    completeStart,
    releaseStart,
    diamondStart,
    admissionStart,
    projectionStart,
    finalizeStart,
    commentsStart,
  ].every((offset) => offset > -1));

  const claimFunction = forwardMigration.slice(claimStart, completeStart);
  const completeFunction = forwardMigration.slice(completeStart, releaseStart);
  const releaseFunction = forwardMigration.slice(releaseStart, diamondStart);
  const admissionFunction = forwardMigration.slice(admissionStart, projectionStart);
  const projectionFunction = forwardMigration.slice(projectionStart, finalizeStart);
  const finalizeFunction = forwardMigration.slice(finalizeStart, commentsStart);
  assert.match(
    claimFunction,
    /v_claim\.state IN \('initializing', 'admitting'\)[\s\S]*expires_at = GREATEST\([\s\S]*make_interval/
  );
  assert.match(completeFunction, /GREATEST\([\s\S]*expires_at[\s\S]*state <> 'admitting'/);
  assert.match(releaseFunction, /DELETE FROM[\s\S]*state <> 'admitting'/);

  const admissionProfileLock = admissionFunction.indexOf('FROM public.profiles');
  const admissionClaimLock = admissionFunction.indexOf(
    'FROM public.vip_subscription_checkout_claims'
  );
  const admissionExactSubscriptionLock = admissionFunction.indexOf(
    'WHERE stripe_subscription_id = p_stripe_subscription_id'
  );
  const admissionReplay = admissionFunction.indexOf("'state', 'replay'");
  const admissionDifferentSubscription = admissionFunction.indexOf(
    'stripe_subscription_id IS DISTINCT FROM p_stripe_subscription_id'
  );
  const admissionProjectedEntitlement = admissionFunction.indexOf('v_profile.vip_tier');
  const admissionReplayBarrierMutation = admissionFunction.indexOf("SET state = 'admitting'");
  const admissionNewBarrierMutation = admissionFunction.lastIndexOf(
    'INSERT INTO public.vip_subscription_checkout_claims('
  );
  assert.ok(
    admissionProfileLock > -1
      && admissionProfileLock < admissionClaimLock
      && admissionClaimLock < admissionExactSubscriptionLock
      && admissionExactSubscriptionLock < admissionReplayBarrierMutation
      && admissionReplayBarrierMutation < admissionReplay
      && admissionExactSubscriptionLock < admissionReplay
      && admissionReplay < admissionDifferentSubscription
      && admissionDifferentSubscription < admissionProjectedEntitlement
      && admissionProjectedEntitlement < admissionNewBarrierMutation,
    'subscription admission must lock profile/claim/ledger, recover exact rows, reject overlap, then fence new rows'
  );
  assert.match(
    admissionFunction,
    /status IN \([\s\S]*'active'[\s\S]*'trialing'[\s\S]*'past_due'[\s\S]*'unpaid'[\s\S]*'incomplete'[\s\S]*'paused'/
  );
  assert.match(admissionFunction, /interval '7 days'/);
  assert.match(admissionFunction, /'admitting',[\s\S]*v_barrier_expires_at/);
  assert.match(
    admissionFunction,
    /'state', 'replay',[\s\S]*'finalize_required',[\s\S]*v_claim_found[\s\S]*v_claim\.request_id = p_request_id[\s\S]*v_claim\.intent_hash = p_intent_hash/
  );
  assert.match(
    admissionFunction,
    /v_claim\.session_id IS NOT NULL[\s\S]*p_session_id IS DISTINCT FROM v_claim\.session_id[\s\S]*'state', 'session_conflict'/
  );
  assert.match(admissionFunction, /'state', 'admitted',[\s\S]*'finalize_required', true/);
  for (const state of [
    'invalid',
    'profile_not_found',
    'subscription_conflict',
    'replay',
    'vip_entitlement_active',
    'session_conflict',
    'claim_conflict',
    'admitted',
  ]) {
    assert.match(admissionFunction, new RegExp(`'state', '${state}'`), state);
  }

  const finalizeProfileLock = finalizeFunction.indexOf('FROM public.profiles');
  const finalizeClaimLock = finalizeFunction.indexOf(
    'FROM public.vip_subscription_checkout_claims'
  );
  const finalizeSubscriptionLock = finalizeFunction.indexOf(
    'FROM public.vip_subscriptions'
  );
  const finalizeLedgerGate = finalizeFunction.indexOf("'state', 'subscription_missing'");
  const finalizeDelete = finalizeFunction.indexOf(
    'DELETE FROM public.vip_subscription_checkout_claims'
  );
  assert.ok(
    finalizeProfileLock > -1
      && finalizeProfileLock < finalizeClaimLock
      && finalizeClaimLock < finalizeSubscriptionLock
      && finalizeSubscriptionLock < finalizeLedgerGate
      && finalizeLedgerGate < finalizeDelete,
    'admission finalization must retain the claim until the exact ledger row exists'
  );
  assert.match(finalizeFunction, /SET search_path = public, extensions/);
  assert.match(finalizeFunction, /request_id <> p_request_id[\s\S]*intent_hash <> p_intent_hash/);
  assert.match(finalizeFunction, /state = 'admitting'/);
  assert.match(forwardMigration, /CHECK \(state IN \('initializing', 'open', 'admitting'\)\)/);
  assert.match(
    projectionFunction,
    /FROM public\.profiles[\s\S]*FOR UPDATE[\s\S]*INSERT INTO public\.vip_subscriptions[\s\S]*UPDATE public\.profiles/
  );
  assert.match(projectionFunction, /p_current_period_start IS NULL[\s\S]*p_current_period_end IS NULL/);
  assert.match(projectionFunction, /'state', 'reactivation_entitlement_conflict'/);
  assert.match(
    projectionFunction,
    /v_profile\.vip_expires_at > v_subscription\.current_period_end/
  );
  assert.match(
    forwardMigration,
    /CONSTRAINT vip_subscriptions_status_check[\s\S]*CHECK \(status IN \([\s\S]*'active'[\s\S]*'trialing'[\s\S]*'past_due'[\s\S]*'unpaid'[\s\S]*'incomplete'[\s\S]*'paused'[\s\S]*'canceled'[\s\S]*'incomplete_expired'/
  );
  assert.match(
    forwardMigration,
    /COMMENT ON CONSTRAINT vip_subscription_checkout_claims_state_check[\s\S]*marketplace_phase7_vip_acquisition_mutex:v1/
  );
  assert.match(
    forwardMigration,
    /COMMENT ON CONSTRAINT vip_subscriptions_status_check[\s\S]*marketplace_phase7_vip_acquisition_mutex:v1/
  );
  for (const signature of [
    'complete_vip_subscription_checkout',
    'release_vip_subscription_checkout',
    'admit_vip_subscription_checkout',
    'apply_vip_subscription_projection',
    'finalize_vip_subscription_admission',
  ]) {
    assert.match(
      forwardMigration,
      new RegExp(`COMMENT ON FUNCTION public\\.${signature}\\([\\s\\S]*marketplace_phase7_vip_acquisition_mutex:v1`),
      signature
    );
    assert.match(
      forwardMigration,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}\\([\\s\\S]*TO service_role`),
      signature
    );
  }
  assert.match(
    forwardMigration,
    /marketplace_phase7_vip_acquisition_mutex_version\(\)[\s\S]*apply_vip_subscription_projection[\s\S]*finalize_vip_subscription_admission[\s\S]*pg_constraint[\s\S]*admitting/
  );
  assert.match(rollback, /WHERE state = 'admitting'[\s\S]*CHECK \(state IN \('initializing', 'open'\)\)/);
  assert.match(rollback, /DROP CONSTRAINT IF EXISTS vip_subscriptions_status_check/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.finalize_vip_subscription_admission/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.apply_vip_subscription_projection/);
  assert.match(rollback, /CREATE OR REPLACE FUNCTION public\.complete_vip_subscription_checkout/);
  assert.match(rollback, /DO \$rollback_postcheck\$/);
  const durableReplay = vipMutex.indexOf('SELECT * INTO v_request');
  const profileMutex = vipMutex.indexOf('PERFORM 1', durableReplay);
  const diamondSettlement = vipMutex.indexOf('v_result := public.purchase_vip_with_diamonds_atomic_v2');
  assert.ok(durableReplay > -1 && durableReplay < profileMutex && profileMutex < diamondSettlement);
});

test('Diamond VIP guard recognizes every recurring Card state without blocking Diamond rows', () => {
  for (const status of BLOCKING_RECURRING_VIP_STATUSES) {
    assert.equal(hasBlockingRecurringCardSubscription([{
      stripe_subscription_id: `sub_${status}`,
      status,
    }]), true, status);
  }
  assert.equal(hasBlockingRecurringCardSubscription([
    { stripe_subscription_id: 'diamond_monthly', status: 'active' },
    { stripe_subscription_id: 'sub_canceled', status: 'canceled' },
    { stripe_subscription_id: null, status: 'active' },
  ]), false);
  assert.equal(hasBlockingRecurringCardSubscription(null), false);
});

test('Stripe VIP webhook admits, atomically projects, reconciles, and only then finalizes', async () => {
  const webhook = await read('pages/api/store/webhooks/stripe.js');
  const pipelineStart = webhook.indexOf('async function handleStripeSubscriptionEvent(');
  const pipelineEnd = webhook.indexOf('async function handleInvoicePaymentSucceeded(', pipelineStart);
  assert.ok(pipelineStart > -1 && pipelineEnd > pipelineStart);
  const pipeline = webhook.slice(pipelineStart, pipelineEnd);

  assert.match(
    webhook,
    /case 'customer\.subscription\.created':[\s\S]*case 'customer\.subscription\.updated':[\s\S]*handleStripeSubscriptionEvent\(event\.data\.object\)/
  );
  assert.match(
    webhook,
    /case 'customer\.subscription\.deleted':[\s\S]*handleStripeSubscriptionEvent\(event\.data\.object/
  );
  assert.match(
    webhook,
    /mode === 'subscription'[\s\S]*subscriptions\.retrieve\(subscriptionId,[\s\S]*handleStripeSubscriptionEvent\(subscription,[\s\S]*authoritative: true/
  );
  assert.match(
    pipeline,
    /authoritative[\s\S]*stripe\.subscriptions\.retrieve\(subscriptionId,[\s\S]*expand: \['items\.data\.price'\]/
  );
  assert.match(pipeline, /classifyStripeSubscriptionForVip/);
  assert.match(pipeline, /classifyStripeCheckoutSessionForVip/);
  assert.match(pipeline, /hasVipAuthority && hasCommanderAuthority/);
  assert.match(pipeline, /return status === 'canceled' \|\| status === 'incomplete_expired'[\s\S]*handleCommanderSubscriptionCanceled/);

  const unknownReturn = pipeline.indexOf('has no exact VIP authority; ignored');
  const terminalDecision = pipeline.indexOf('first-seen terminal VIP subscription');
  const admission = pipeline.indexOf("'admit_vip_subscription_checkout'");
  const claimRead = pipeline.lastIndexOf(".from('vip_subscription_checkout_claims')", admission);
  const projection = pipeline.indexOf("'apply_vip_subscription_projection'");
  const reconciliation = pipeline.indexOf('const reconciledSubscription', projection);
  const reconcileReentry = pipeline.indexOf('return handleStripeSubscriptionEvent(reconciledSubscription', reconciliation);
  const finalizer = pipeline.indexOf("'finalize_vip_subscription_admission'", reconciliation);
  assert.ok(
    unknownReturn > -1
      && claimRead > -1
      && terminalDecision > claimRead
      && admission > terminalDecision
      && projection > admission
      && reconciliation > projection
      && reconcileReentry > reconciliation
      && finalizer > reconcileReentry,
    'VIP writes must follow authority/claim reads, atomic projection, and stable reconciliation'
  );
  assert.equal(
    pipeline.indexOf('getSupabase().rpc('),
    pipeline.lastIndexOf('getSupabase().rpc(', admission),
    'admission must be the first database RPC in the VIP subscription pipeline'
  );
  assert.doesNotMatch(pipeline, /\.from\('vip_subscriptions'\)[\s\S]{0,100}\.upsert\(/);
  assert.doesNotMatch(pipeline, /\.from\('profiles'\)[\s\S]{0,100}\.update\(/);
  assert.doesNotMatch(pipeline, /release_vip_subscription_checkout/);

  assert.match(
    pipeline,
    /existingClaim\?\.state === 'admitting'[\s\S]*existingClaim\.request_id === requestId[\s\S]*existingClaim\.intent_hash === intentHash/
  );
  assert.match(
    pipeline,
    /hasAdmittingClaim && !claimMatchesExactAdmission[\s\S]*throw new Error[\s\S]*!existingSubscription && VIP_FIRST_SEEN_TERMINAL_STATUSES\.has\(status\)[\s\S]*!hasAdmittingClaim[\s\S]*return;/
  );
  assert.match(
    pipeline,
    /!profile \|\| profile\.id !== userId[\s\S]*compensateDeniedVipSubscription\(subscription, paymentContext\)[\s\S]*return;/
  );
  assert.doesNotMatch(
    pipeline.slice(0, admission),
    /stripeCustomer\?\.metadata, 'checkout_(?:request_id|intent_hash|session_id)'/
  );
  const customerIdentityStart = pipeline.indexOf("consistentText('customer identity'");
  const customerIdentityEnd = pipeline.indexOf(']);', customerIdentityStart);
  assert.doesNotMatch(
    pipeline.slice(customerIdentityStart, customerIdentityEnd),
    /existingSubscription\?\.stripe_customer_id/
  );
  assert.match(
    pipeline,
    /Boolean\(existingClaim\?\.session_id\)[\s\S]*discoverInitialSubscriptionPayment\(subscription\)/
  );
  assert.match(
    pipeline,
    /storedClaimSessionMatches = !existingClaim\?\.session_id[\s\S]*existingClaim\.session_id === checkoutSession\?\.id[\s\S]*!storedClaimSessionMatches[\s\S]*throw new Error/
  );
  assert.match(
    pipeline,
    /profile\.stripe_customer_id !== customerId[\s\S]*!claimMatchesExactAdmission/
  );
  assert.match(pipeline, /syntheticLegacySubscriptionIdentity\(subscriptionId, userId\)/);
  assert.match(pipeline, /A recycled VIP subscription requires authoritative Stripe tier metadata/);
  assert.match(pipeline, /!currentPeriodStart \|\| !currentPeriodEnd/);

  const tierResolverStart = webhook.indexOf('function resolveExactVipTier(');
  const tierResolverEnd = webhook.indexOf('function validateVipOffer(', tierResolverStart);
  const tierResolver = webhook.slice(tierResolverStart, tierResolverEnd);
  const existingCurrentTier = tierResolver.indexOf('existingSubscription && subscriptionTier');
  const pendingCheckoutTier = tierResolver.indexOf(
    'existingSubscription && hasPendingAdmission && checkoutTierText'
  );
  const ledgerTier = tierResolver.indexOf('const ledgerTier');
  const firstAdmissionConsistency = tierResolver.indexOf("consistentText(\n        'recurring tier metadata'");
  assert.ok(
    existingCurrentTier > -1
      && existingCurrentTier < pendingCheckoutTier
      && pendingCheckoutTier < ledgerTier
      && ledgerTier < firstAdmissionConsistency,
    'current Subscription tier must supersede historical Checkout metadata for exact-row replay'
  );
  assert.match(
    pipeline,
    /hasPendingAdmission: existingClaim\?\.state === 'admitting'/
  );

  for (const argument of [
    'p_user_id: userId',
    'p_stripe_subscription_id: subscriptionId',
    'p_stripe_customer_id: customerId',
    'p_request_id: requestId',
    'p_intent_hash: intentHash',
    'p_tier: tier',
    'p_status: status',
    'p_price_usd: priceUsd',
    'p_current_period_start: currentPeriodStart',
    'p_current_period_end: currentPeriodEnd',
    'p_cancel_at_period_end: subscription.cancel_at_period_end',
    'p_canceled_at: canceledAt',
  ]) {
    assert.ok(pipeline.includes(argument), argument);
  }
  assert.match(
    pipeline,
    /projection\?\.success !== true[\s\S]*projection\?\.projected !== true[\s\S]*projection\?\.state !== 'projected'[\s\S]*projection\?\.stripe_subscription_id !== subscriptionId[\s\S]*projection\?\.status !== status/
  );
  assert.match(
    pipeline,
    /vipSubscriptionFingerprint\(reconciledSubscription\)[\s\S]*reconciledFingerprint !== projectedFingerprint[\s\S]*reconciliationDepth >= VIP_SUBSCRIPTION_RECONCILIATION_LIMIT[\s\S]*reconciliationDepth: reconciliationDepth \+ 1/
  );
  assert.match(
    pipeline,
    /projection\?\.state === 'reactivation_entitlement_conflict'[\s\S]*compensateVipReactivationConflict\(subscription, triggerInvoice\)[\s\S]*return;/
  );
  assert.match(
    pipeline,
    /handleStripeSubscriptionEvent\(reconciledSubscription,[\s\S]*triggerInvoice,[\s\S]*reconciliationDepth: reconciliationDepth \+ 1/
  );
  assert.match(
    pipeline,
    /admission\.state === 'admitted'[\s\S]*admission\.state === 'replay' && admission\.finalize_required === true/
  );

  const fingerprintStart = webhook.indexOf('function vipSubscriptionFingerprint(');
  const fingerprintEnd = webhook.indexOf('function hasExplicitSubscriptionTierEvidence(', fingerprintStart);
  const fingerprint = webhook.slice(fingerprintStart, fingerprintEnd);
  for (const field of [
    'customer',
    'latest_invoice',
    'status',
    'metadata',
    'quantity',
    'unit_amount',
    'billing_scheme',
    'transform_quantity',
    'recurring',
    'current_period_start',
    'current_period_end',
    'cancel_at_period_end',
    'canceled_at',
  ]) {
    assert.match(fingerprint, new RegExp(`${field}:`), field);
  }
  assert.match(fingerprint, /items,/);

  assert.match(webhook, /invoice\.billing_reason !== 'subscription_create'/);
  assert.match(webhook, /amount: amountPaid/);
  assert.match(webhook, /Number\(refund\?\.amount\) !== amountPaid/);
  assert.match(webhook, /refund\?\.status !== 'succeeded'/);
  assert.match(webhook, /\['pending', 'requires_action'\]\.includes\(refund\?\.status\)/);
  assert.match(
    webhook,
    /vipOverlapRefundAttemptKey\([\s\S]*subscriptionId,[\s\S]*invoiceId,[\s\S]*terminalRefunds/
  );
  assert.match(webhook, /commerce:vip-overlap-refund:\$\{subscriptionId\}/);
  assert.match(webhook, /invoice_now: false,[\s\S]*prorate: false/);
  assert.match(webhook, /commerce:vip-overlap-cancel:\$\{subscriptionId\}/);
  const compensateStart = webhook.indexOf('async function compensateDeniedVipSubscription(');
  const compensateEnd = webhook.indexOf('async function handleStripeSubscriptionEvent(', compensateStart);
  const compensate = webhook.slice(compensateStart, compensateEnd);
  assert.ok(
    compensate.indexOf('refundDeniedVipSubscription')
      < compensate.indexOf('cancelDeniedVipSubscription'),
    'a denied acquisition must confirm the full refund before cancellation'
  );

  assert.match(
    webhook,
    /async function handleInvoicePaymentSucceeded\(invoice\)[\s\S]*handleStripeSubscriptionEvent\(invoice\.subscription, \{ triggerInvoice: invoice \}\)/
  );
  assert.match(
    webhook,
    /async function handleInvoicePaymentFailed\(invoice\)[\s\S]*handleStripeSubscriptionEvent\(invoice\.subscription\)/
  );
  assert.match(
    webhook,
    /triggerInvoicePaymentContext\(triggerInvoice, subscription\)[\s\S]*admit_vip_subscription_checkout/
  );
  assert.match(
    compensate,
    /compensateVipReactivationConflict[\s\S]*subscriptions\.retrieve\(subscription\.id,[\s\S]*triggerInvoicePaymentContext\(triggerInvoice, currentSubscription\)[\s\S]*refundDeniedVipSubscription/
  );
  assert.match(
    webhook,
    /Webhook handler error:[\s\S]*reportApiError\(error, req\)[\s\S]*failed to report handler quarantine/
  );
});

test('terminal Stripe refund attempts rotate a stable idempotency key without duplicating in-flight work', async () => {
  const webhook = await read('pages/api/store/webhooks/stripe.js');
  const objectIdStart = webhook.indexOf('function stripeObjectId(');
  const objectIdEnd = webhook.indexOf('function metadataText(', objectIdStart);
  const attemptStart = webhook.indexOf('function vipOverlapRefundAttemptKey(');
  const attemptEnd = webhook.indexOf('async function refundDeniedVipSubscription(', attemptStart);
  assert.ok(objectIdStart > -1 && objectIdEnd > objectIdStart);
  assert.ok(attemptStart > -1 && attemptEnd > attemptStart);
  const attemptKey = new Function(
    'createHash',
    `${webhook.slice(objectIdStart, objectIdEnd)}\n${webhook.slice(attemptStart, attemptEnd)}\nreturn vipOverlapRefundAttemptKey;`
  )(createHash);

  const initial = attemptKey('sub_exact', 'in_exact', []);
  assert.equal(initial, attemptKey('sub_exact', 'in_exact', []));
  assert.match(initial, /^commerce:vip-overlap-refund:sub_exact:in_exact:[a-f0-9]{32}$/);

  const failures = [
    { id: 're_2', status: 'canceled' },
    { id: 're_1', status: 'failed' },
  ];
  const retry = attemptKey('sub_exact', 'in_exact', failures);
  assert.equal(retry, attemptKey('sub_exact', 'in_exact', [...failures].reverse()));
  assert.notEqual(retry, initial);
  assert.notEqual(retry, attemptKey('sub_exact', 'in_other', failures));
  assert.notEqual(
    retry,
    attemptKey('sub_exact', 'in_exact', [{ id: 're_1', status: 'canceled' }, failures[0]])
  );
  assert.throws(
    () => attemptKey('sub_exact', 'in_exact', [{ id: 're_pending', status: 'pending' }]),
    /invalid terminal refund evidence/
  );
});

test('reactivation compensation accepts only the latest exact paid invoice shape', async () => {
  const webhook = await read('pages/api/store/webhooks/stripe.js');
  const objectIdStart = webhook.indexOf('function stripeObjectId(');
  const objectIdEnd = webhook.indexOf('function metadataText(', objectIdStart);
  const contextStart = webhook.indexOf('function triggerInvoicePaymentContext(');
  const contextEnd = webhook.indexOf('function vipOverlapRefundAttemptKey(', contextStart);
  const validate = new Function(
    'VIP_BLOCKING_SUBSCRIPTION_STATUSES',
    `${webhook.slice(objectIdStart, objectIdEnd)}\n${webhook.slice(contextStart, contextEnd)}\nreturn triggerInvoicePaymentContext;`
  )(new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']));
  const exact = {
    id: 'in_exact',
    subscription: 'sub_exact',
    customer: 'cus_exact',
    status: 'paid',
    paid: true,
    amount_paid: 1999,
    payment_intent: 'pi_exact',
    billing_reason: 'subscription_cycle',
    period_start: 1_800_000_000,
    period_end: 1_802_592_000,
  };
  const subscription = {
    id: 'sub_exact',
    customer: 'cus_exact',
    latest_invoice: 'in_exact',
    status: 'active',
    current_period_start: 1_800_000_000,
    current_period_end: 1_802_592_000,
  };
  assert.deepEqual(validate(exact, subscription), {
    checkoutSession: null,
    invoice: exact,
    error: null,
    kind: 'trigger',
    triggerSubscription: subscription,
  });
  assert.throws(() => validate({ ...exact, subscription: 'sub_other' }, subscription), /exact paid/);
  assert.throws(() => validate({ ...exact, paid: false }, subscription), /exact paid/);
  assert.throws(() => validate({ ...exact, status: 'open' }, subscription), /exact paid/);
  assert.throws(() => validate({ ...exact, customer: 'cus_other' }, subscription), /exact paid/);
  assert.throws(
    () => validate({ ...exact, id: 'in_old' }, subscription),
    /exact paid/,
    'a signed historical invoice must not authorize compensation for the current subscription'
  );
  assert.throws(
    () => validate({ ...exact, payment_intent: null, charge: null }, subscription),
    /no refundable payment/
  );
  assert.doesNotThrow(() => validate({
    ...exact,
    amount_paid: 0,
    payment_intent: null,
  }, subscription));
});

test('Stripe authority distinguishes VIP, Commander, and unknown recurring commerce', () => {
  assert.equal(classifyStripeSubscriptionForVip({
    metadata: { vip_tier: 'monthly' },
  }), STRIPE_VIP_AUTHORITY.VIP);
  assert.equal(classifyStripeSubscriptionForVip({
    metadata: {},
    items: { data: [{ price: { id: 'price_vip_yearly' } }] },
  }, { knownVipPriceIds: ['price_vip_yearly'] }), STRIPE_VIP_AUTHORITY.VIP);
  assert.equal(classifyStripeSubscriptionForVip({
    metadata: {},
    items: { data: [{ price: { metadata: { sp_vip_tier: 'yearly' } } }] },
  }), STRIPE_VIP_AUTHORITY.VIP);
  assert.equal(classifyStripeSubscriptionForVip({
    metadata: { venue_id: 'venue-123' },
  }), STRIPE_VIP_AUTHORITY.COMMANDER);
  assert.equal(classifyStripeSubscriptionForVip({
    metadata: { venue_id: 'venue-123', vip_tier: 'monthly' },
  }), STRIPE_VIP_AUTHORITY.UNKNOWN);
  assert.equal(classifyStripeSubscriptionForVip({
    metadata: { vip_tier: 'lifetime' },
  }), STRIPE_VIP_AUTHORITY.UNKNOWN);
  assert.equal(classifyStripeSubscriptionForVip({ metadata: {} }), STRIPE_VIP_AUTHORITY.UNKNOWN);

  assert.equal(resolveStripeSubscriptionVipTier({
    metadata: { vip_tier: 'monthly' },
  }), 'monthly');
  assert.equal(resolveStripeSubscriptionVipTier({
    metadata: {},
    items: { data: [{ price: { id: 'price_yearly' } }] },
  }, { knownVipPrices: { price_yearly: 'yearly' } }), 'yearly');
  assert.equal(resolveStripeSubscriptionVipTier({
    metadata: { vip_tier: 'monthly' },
    items: { data: [{ price: { metadata: { sp_vip_tier: 'yearly' } } }] },
  }), null);
  assert.equal(resolveStripeSubscriptionVipTier({
    metadata: { vip_tier: 'lifetime' },
  }), null);

  assert.equal(classifyStripeCheckoutSessionForVip({
    mode: 'subscription',
    metadata: { type: 'subscription' },
  }), STRIPE_VIP_AUTHORITY.VIP);
  assert.equal(classifyStripeCheckoutSessionForVip({
    mode: 'subscription',
    metadata: { venue_id: 'venue-123' },
  }), STRIPE_VIP_AUTHORITY.COMMANDER);
  assert.equal(classifyStripeCheckoutSessionForVip({
    mode: 'subscription',
    metadata: { venue_id: 'venue-123', type: 'subscription' },
  }), STRIPE_VIP_AUTHORITY.UNKNOWN);
  assert.equal(classifyStripeCheckoutSessionForVip({
    mode: 'subscription',
    metadata: {},
  }), STRIPE_VIP_AUTHORITY.UNKNOWN);
  assert.equal(classifyStripeCheckoutSessionForVip({
    mode: 'payment',
    metadata: { type: 'vip_lifetime' },
  }), STRIPE_VIP_AUTHORITY.VIP);
  assert.equal(classifyStripeCheckoutSessionForVip({
    mode: 'payment',
    metadata: { type: 'merchandise' },
  }), STRIPE_VIP_AUTHORITY.IRRELEVANT);
});

test('configured VIP Stripe Prices cannot change the advertised offer or entitlement tier', () => {
  const plan = { tier: 'monthly', unitAmount: 1_999, interval: 'month' };
  const valid = {
    active: true,
    type: 'recurring',
    billing_scheme: 'per_unit',
    transform_quantity: null,
    currency: 'usd',
    unit_amount: 1_999,
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
    metadata: { sp_vip_tier: 'monthly' },
  };
  assert.equal(vipStripePriceMismatch(valid, plan), null);

  const mutations = [
    ['inactive_price', { active: false }],
    ['wrong_currency', { currency: 'cad' }],
    ['wrong_amount', { unit_amount: 99 }],
    ['wrong_type', { type: 'one_time' }],
    ['wrong_billing_scheme', { billing_scheme: 'tiered' }],
    ['transformed_quantity', { transform_quantity: { divide_by: 10, round: 'up' } }],
    ['wrong_interval', { recurring: { ...valid.recurring, interval: 'year' } }],
    ['wrong_interval_count', { recurring: { ...valid.recurring, interval_count: 2 } }],
    ['wrong_usage_type', { recurring: { ...valid.recurring, usage_type: 'metered' } }],
    ['missing_tier', { metadata: {} }],
    ['wrong_tier', { metadata: { sp_vip_tier: 'yearly' } }],
  ];
  for (const [reason, mutation] of mutations) {
    const candidate = {
      ...valid,
      ...mutation,
      recurring: mutation.recurring || valid.recurring,
      metadata: mutation.metadata || valid.metadata,
    };
    assert.equal(vipStripePriceMismatch(candidate, plan), reason);
  }
});

async function runVerifier(baseUrl, expectedSha = DEPLOYED_SHA) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      'scripts/verify-marketplace-deployment.mjs',
      baseUrl,
      '--require-commerce',
      '--require-checkout',
      '--require-production-truth',
    ], {
      cwd: ROOT,
      env: {
        ...process.env,
        ...(expectedSha ? { MARKETPLACE_EXPECTED_SHA: expectedSha } : { MARKETPLACE_EXPECTED_SHA: '' }),
        MARKETPLACE_PROBE_TIMEOUT_MS: '3000',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('production truth certifies exact routes, assets, catalogs, fulfillment, and SHA', async (t) => {
  const state = { mode: 'ready' };
  const server = marketplaceServer(state);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const result = await runVerifier(`http://127.0.0.1:${address.port}`);

  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS 200 \/api\/health \(deployment truth\)/);
  assert.match(result.stdout, /PASS 200 \/api\/club-arena\/store-catalog\?strict=1/);
  assert.match(result.stdout, /PASS 308 \/hub\/marketplace \(get, contract\)/);
  assert.match(result.stdout, /Merchandise fulfillment mode: manual/);
  assert.match(result.stdout, /Authoritative catalog: 9 Diamond packages/);
  assert.match(result.stdout, new RegExp(`Deployment SHA: ${DEPLOYED_SHA}`));

  state.mode = 'mixed_fulfillment';
  const mixedResult = await runVerifier(`http://127.0.0.1:${address.port}`);
  assert.equal(mixedResult.code, 0, `${mixedResult.stdout}\n${mixedResult.stderr}`);
  assert.match(mixedResult.stdout, /Merchandise fulfillment mode: mixed/);
});

test('production truth rejects every former false-positive class', async (t) => {
  const state = { mode: 'ready' };
  const server = marketplaceServer(state);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const missingExpectedSha = await runVerifier(baseUrl, '');
  assert.equal(missingExpectedSha.code, 1);
  assert.match(missingExpectedSha.stderr, /requires MARKETPLACE_EXPECTED_SHA/);
  const cases = [
    ['wrong_sha', /deployment_sha_mismatch/],
    ['fallback_catalog', /catalog_not_authoritative/],
    ['wrong_vip_capability', /vip_payment_contract_mismatch/],
    ['fake_asset', /invalid_webp_signature/],
    ['page_redirect', /unexpected_redirect/],
    ['external_redirect', /unexpected_location/],
    ['partial_printful', /fulfillment_contract_incomplete/],
    ['missing_variants', /invalid_catalog_capabilities/],
    ['stale_schema_marker', /schema_marker_mismatch/],
  ];

  for (const [mode, expectedFailure] of cases) {
    state.mode = mode;
    const result = await runVerifier(baseUrl);
    assert.equal(result.code, 1, `${mode} unexpectedly passed\n${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, expectedFailure, mode);
  }
});
