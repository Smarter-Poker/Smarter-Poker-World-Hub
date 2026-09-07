/**
 * Stripe Webhook Handler for Diamond Store
 * POST /api/store/webhooks/stripe
 * Handles Stripe webhook events for purchases and subscriptions
 */
import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import {
    STRIPE_VIP_AUTHORITY,
    classifyStripeCheckoutSessionForVip,
    classifyStripeSubscriptionForVip,
    resolveStripeSubscriptionVipTier,
} from '../../../../src/lib/store/vipPurchaseGuards.mjs';
const {
    buildPrintfulItems,
    cancelPrintfulOrder,
    createPrintfulOrder,
    isAutoConfirmEnabled,
    normalizePrintfulRecipient,
    publicShippingAddress,
    sanitizeExternalOrderId,
} = require('../../../../src/lib/store/printfulFulfillment');
const {
    inspectStripeRuntime,
    stripeEventModeAllowed,
} = require('../../../../src/lib/store/stripeRuntimeMode');

const MAX_STRIPE_WEBHOOK_BODY_BYTES = 1024 * 1024;
const VIP_SUBSCRIPTION_STATUSES = new Set([
    'active',
    'trialing',
    'past_due',
    'unpaid',
    'incomplete',
    'paused',
    'canceled',
    'incomplete_expired',
]);
const VIP_FIRST_SEEN_TERMINAL_STATUSES = new Set(['canceled', 'incomplete_expired']);
const VIP_BLOCKING_SUBSCRIPTION_STATUSES = new Set([
    'active',
    'trialing',
    'past_due',
    'unpaid',
    'incomplete',
    'paused',
]);
const VIP_COMPENSATED_ADMISSION_DENIALS = new Set([
    'vip_entitlement_active',
    'claim_conflict',
    'session_conflict',
    'profile_not_found',
]);
const VIP_PLAN_CONTRACT = Object.freeze({
    monthly: Object.freeze({ amount: 1999, interval: 'month' }),
    yearly: Object.freeze({ amount: 19999, interval: 'year' }),
});
const VIP_SUBSCRIPTION_RECONCILIATION_LIMIT = 2;
const VIP_SUBSCRIPTION_METADATA_KEYS = Object.freeze([
    'venue_id',
    'type',
    'vip_tier',
    'user_id',
    'checkout_request_id',
    'checkout_intent_hash',
    'checkout_session_id',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]{6,255}$/;

// Read only the bounded raw bytes Stripe signs. Signature verification is the
// authentication boundary, but it must not require buffering an unbounded
// attacker-controlled stream first.
async function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let bytes = 0;
        let settled = false;
        const cleanup = () => {
            req.off('data', onData);
            req.off('end', onEnd);
            req.off('error', onError);
            req.off('close', onClose);
        };
        const fail = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };
        const onData = (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > MAX_STRIPE_WEBHOOK_BODY_BYTES) {
                const error = new Error('Stripe webhook payload exceeds the byte limit');
                error.code = 'BODY_TOO_LARGE';
                // Reject immediately, but keep the request error listener until
                // the oversized stream ends or closes. A client can reset the
                // connection while Node is draining it; removing the only
                // listener first would turn that reset into an uncaught
                // EventEmitter error in the serverless invocation.
                settled = true;
                chunks.length = 0;
                req.off('data', onData);
                reject(error);
                req.resume?.();
                return;
            }
            chunks.push(buffer);
        };
        const onEnd = () => {
            if (settled) {
                cleanup();
                return;
            }
            settled = true;
            cleanup();
            resolve(Buffer.concat(chunks, bytes));
        };
        const onError = (error) => {
            if (settled) return;
            fail(error);
        };
        const onClose = () => {
            if (settled) {
                cleanup();
                return;
            }
            const error = new Error('Stripe webhook request closed before the body completed');
            error.code = 'BODY_STREAM_CLOSED';
            fail(error);
        };
        req.on('data', onData);
        req.on('end', onEnd);
        req.on('error', onError);
        req.on('close', onClose);
    });
}

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Stripe webhook database is not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Initialize Stripe at module level
const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
        timeout: 15000,
        maxNetworkRetries: 2,
        telemetry: false
    })
    : null;

export default async function handler(req, res) {
  try {
      // NOTE: No rate limiting here. Stripe delivers webhooks in bursts from a
      // small fixed IP pool — a user-tier limiter would 429 legitimate signed
      // events and delay diamond credits/VIP grants. Signature verification
      // below is the gate for this endpoint.

      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      const sig = req.headers['stripe-signature'];
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const stripeRuntime = inspectStripeRuntime(process.env, {
          requirePublishable: false,
          requireWebhook: true,
      });

      let event;

      if (!endpointSecret || !stripe || !stripeRuntime.ready) {
          console.warn('[stripe-webhook] payment webhook configuration is unavailable');
          return res.status(503).json({ error: 'Webhook unavailable' });
      }
      if (!sig) {
          return res.status(400).json({ error: 'Invalid webhook signature' });
      }

      try {
          // Get raw body for signature verification
          const rawBody = await getRawBody(req);

          event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
      } catch (err) {
          if (err?.code === 'BODY_TOO_LARGE') {
              return res.status(413).json({ error: 'Webhook payload too large' });
          }
          console.warn('Webhook signature verification failed:', err?.message || err);
          return res.status(400).json({ error: 'Invalid webhook signature' });
      }
      if (!stripeEventModeAllowed(event, process.env)) {
          console.warn(`[stripe-webhook] rejected non-live production event ${event?.id || 'without-id'}`);
          return res.status(400).json({ error: 'Webhook mode not accepted' });
      }
      if (!STRIPE_EVENT_ID_PATTERN.test(String(event?.id || ''))
          || typeof event?.type !== 'string'
          || !event.type
          || event.type.length > 200) {
          console.warn('[stripe-webhook] rejected signed event without a valid event identity');
          return res.status(400).json({ error: 'Invalid webhook event' });
      }

      // ═════════════════════════════════════════════════════════════════════
      // EVENT-LEVEL IDEMPOTENCY. Claim the event id before any handler runs.
      //
      // Stripe redelivers events — on 5xx, on timeout, and occasionally
      // at-least-once with no failure at all — so "handled twice" is normal
      // traffic rather than an edge case. Replay protection used to be
      // per-handler compare-and-set only: the diamond credit CASes on
      // status='pending', the refund on status='completed'. Those two are
      // genuinely safe, but every FUTURE handler has to remember to invent its
      // own guard, and one that forgets is a double-credit with nothing
      // external to catch it.
      //
      // INSERT ... ON CONFLICT DO NOTHING returning zero rows means the id was
      // already claimed. The primary key makes that atomic, so two concurrent
      // deliveries of the same event cannot both win the claim.
      //
      // A claim failure is NOT treated as a replay and must never fall through
      // to a paid-event handler. Returning a retryable response lets Stripe
      // deliver the event again after the claim service recovers without
      // allowing an unowned worker to mutate commerce state.
      // ═════════════════════════════════════════════════════════════════════
      let eventClaimAcquired = false;
      if (event.id) {
          let claim;
          let claimErr;
          try {
              ({ data: claim, error: claimErr } = await getSupabase().rpc(
                  'claim_stripe_webhook_event',
                  { p_event_id: event.id, p_event_type: event.type, p_lease_seconds: 300 }
              ));
          } catch (error) {
              claimErr = error;
          }
          if (claimErr) {
              console.warn(
                  `[stripe-webhook] could not claim event ${event.id}:`,
                  claimErr?.message || claimErr
              );
              return res.status(503).json({ error: 'Webhook claim unavailable' });
          }
          eventClaimAcquired = claim?.claimed === true;
          if (!eventClaimAcquired) {
              if (claim?.state === 'done') {
                  console.info(`[stripe-webhook] duplicate delivery of ${event.id} (${event.type}) - already processed`);
                  return res.status(200).json({ received: true, duplicate: true });
              }
              // Another worker owns a live lease. A retryable response ensures
              // a process crash cannot turn that temporary lease into lost
              // paid work; the next delivery may reclaim it after expiry.
              return res.status(409).json({ received: false, processing: true });
          }
      }

      // Handle the event
      try {

          switch (event.type) {
              case 'checkout.session.completed':
                  await handleCheckoutCompleted(event.data.object);
                  break;

              case 'checkout.session.async_payment_succeeded':
                  await handleCheckoutCompleted(event.data.object);
                  break;

              case 'checkout.session.async_payment_failed':
                  await handleCheckoutExpired(event.data.object);
                  break;

              case 'checkout.session.expired':
                  await handleCheckoutExpired(event.data.object);
                  break;

              case 'customer.subscription.created':
              case 'customer.subscription.updated':
                  await handleStripeSubscriptionEvent(event.data.object);
                  break;

              case 'customer.subscription.deleted':
                  await handleStripeSubscriptionEvent(event.data.object, { deletedEvent: true });
                  break;

              case 'invoice.payment_succeeded':
                  await handleInvoicePaymentSucceeded(event.data.object);
                  break;

              case 'invoice.payment_failed':
                  await handleInvoicePaymentFailed(event.data.object);
                  break;

              case 'charge.refunded':
                  await handleRefund(event.data.object);
                  break;

              // D10. A dispute is not a refund and was handled by nothing: a
              // chargeback took the money back at Stripe and the diamonds it
              // bought stayed in the player's balance forever. These three are
              // the whole lifecycle Stripe sends.
              case 'charge.dispute.created':
              case 'charge.dispute.funds_withdrawn':
              case 'charge.dispute.closed':
                  await handleDispute(event.data.object, event.type);
                  break;

              default:
          }

          if (event?.id && eventClaimAcquired) {
              const { data: completion, error: completionError } = await getSupabase().rpc(
                  'complete_stripe_webhook_event',
                  { p_event_id: event.id }
              );
              if (completionError) throw completionError;
              // The deployed RPC has a void contract, which Supabase exposes
              // as null. If a future compatible RPC returns business data,
              // only an explicit success is accepted.
              if (completion !== null
                  && completion !== undefined
                  && completion !== true
                  && !(typeof completion === 'object' && completion?.completed === true)) {
                  throw new Error('Stripe webhook event completion was not confirmed');
              }
          }
          return res.status(200).json({ received: true });
      } catch (error) {
          console.warn('Webhook handler error:', error);
          try {
              reportApiError(error, req);
          } catch (telemetryError) {
              console.warn(
                  '[stripe-webhook] failed to report handler quarantine:',
                  telemetryError?.message || telemetryError
              );
          }
          // Hand the claim back. This event did NOT complete, and Stripe will
          // retry it — if the claim stayed, that retry would be dismissed as a
          // duplicate and the work would never happen. A claim must only
          // outlive a handler that actually succeeded.
          if (event?.id && eventClaimAcquired) {
              try {
                  // silent-write-ok: best-effort claim release inside a failure
                  // path. If the row is already gone the retry proceeds anyway,
                  // which is the outcome this is reaching for; a real failure is
                  // caught and logged as CRITICAL below.
                  const { error: releaseError } = await getSupabase()
                      .from('stripe_webhook_events')
                      .delete()
                      .eq('event_id', event.id);
                  if (releaseError) throw releaseError;
              } catch (releaseErr) {
                  console.error(`[stripe-webhook] FAILED TO RELEASE claim on ${event.id} - retries will be skipped:`, releaseErr?.message || releaseErr);
              }
          }
          return res.status(500).json({ error: 'Webhook handler failed' });
      }

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function handleCheckoutCompleted(session) {
    const { id, customer, metadata, mode } = session;


    if (mode === 'payment') {
        // A completed Checkout Session can still represent a delayed method
        // whose funds are pending. Fulfillment waits for the settled event.
        if (session.payment_status !== 'paid') return;
        // One-time payment (diamonds or merchandise)
        // metadata can be null for sessions created outside this app (e.g. payment links)
        if (metadata?.type === 'diamonds' && metadata.purchase_id) {
            const { data: purchaseState, error: purchaseStateError } = await getSupabase()
                .from('diamond_purchases')
                .select('status, stripe_checkout_session_id')
                .eq('id', metadata.purchase_id)
                .maybeSingle();
            if (purchaseStateError || !purchaseState) {
                throw purchaseStateError || new Error(`Diamond purchase ${metadata.purchase_id} was not found`);
            }
            if (purchaseState.status === 'refunded'
                && purchaseState.stripe_checkout_session_id === id) return;
            const paymentIntentId = typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id || null;
            const { data: settlement, error: settlementError } = await getSupabase().rpc(
                'settle_diamond_card_purchase_atomic',
                {
                    p_purchase_id: metadata.purchase_id,
                    p_session_id: id,
                    p_payment_intent_id: paymentIntentId,
                }
            );
            if (settlementError || !settlement?.success) {
                throw settlementError || new Error(
                    `Diamond card settlement refused: ${settlement?.error || 'unknown_error'}`
                );
            }
        } else if (metadata?.type === 'vip_lifetime' && metadata.purchase_id) {
            /* ADDED 2026-09-05. Until this branch existed there was NO VIP case
               under `mode === 'payment'` at all: a paid one-time VIP session
               fell off the end of this chain, granted nothing, and returned 200
               - which tells Stripe never to retry. The money would have been
               taken and the membership silently never issued. That is why the
               storefront offered no card button for Lifetime until now.

               settle_vip_lifetime_card_purchase_atomic is idempotent on the
               session id: a replay of the same session returns duplicate:true,
               and a DIFFERENT session pointing at the same purchase row is
               refused as settlement_conflict rather than granting twice. */
            const { data: settlement, error: settlementError } = await getSupabase().rpc(
                'settle_vip_lifetime_card_purchase_atomic',
                {
                    p_purchase_id: metadata.purchase_id,
                    p_session_id: id,
                    p_payment_intent_id: typeof session.payment_intent === 'string'
                        ? session.payment_intent
                        : session.payment_intent?.id || null,
                }
            );
            if (settlementError || !settlement?.success) {
                /* Throw rather than swallow. A failure here means a paid
                   customer has no membership, and Stripe's retry is the only
                   thing that will fix it without a human. */
                throw settlementError || new Error(
                    `Lifetime VIP settlement refused: ${settlement?.error || 'unknown_error'}`
                );
            }

        } else if (metadata?.type === 'merchandise' && metadata.order_id) {
            const { data: orderRow, error: orderReadError } = await getSupabase()
                .from('merchandise_orders')
                .select('items, metadata, status')
                .eq('id', metadata.order_id)
                .maybeSingle();
            if (orderReadError || !orderRow) {
                throw orderReadError || new Error(`Paid merchandise order ${metadata.order_id} was not found`);
            }
            if (orderRow.status === 'refunded') return;

            const orderItems = Array.isArray(orderRow.items) ? orderRow.items : [];
            const orderMetadata = orderRow.metadata && typeof orderRow.metadata === 'object'
                ? orderRow.metadata
                : {};
            const paymentIntentId = typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id || null;
            const isPrintfulOrder = orderItems.length > 0
                && orderItems.every(item => item?.fulfillmentProvider === 'printful');
            const fulfillmentMode = orderMetadata.fulfillment_mode === 'automatic'
                ? 'automatic'
                : 'manual';
            const requiresShipping = orderItems.some(
                item => item?.fulfillmentProvider !== 'digital'
            );

            let recipient = null;
            let addressBlocked = false;
            if (requiresShipping) {
                try {
                    recipient = normalizePrintfulRecipient(session);
                } catch (addressError) {
                    addressBlocked = true;
                }
            }
            const settledMode = addressBlocked ? 'manual' : fulfillmentMode;
            const settlementMetadata = {
                ...orderMetadata,
                fulfillment_provider: settledMode === 'automatic'
                    ? (orderMetadata.catalog_provider || 'printful')
                    : 'manual',
                catalog_provider: orderMetadata.catalog_provider
                    || (isPrintfulOrder ? 'printful' : 'manual'),
                fulfillment_mode: settledMode,
                fulfillment_status: addressBlocked
                    ? 'blocked'
                    : settledMode === 'automatic'
                        ? 'submitting'
                        : 'awaiting_manual_fulfillment',
                needs_review: settledMode !== 'automatic',
                ...(addressBlocked
                    ? { reason: 'shipping_address_incomplete', flagged_at: new Date().toISOString() }
                    : settledMode !== 'automatic'
                        ? { reason: 'automatic_fulfillment_deferred' }
                        : {}),
            };
            const { data: settlement, error: settlementError } = await getSupabase().rpc(
                'settle_paid_merch_order_atomic',
                {
                    p_order_id: metadata.order_id,
                    p_session_id: id,
                    p_payment_intent_id: paymentIntentId,
                    p_shipping_address: recipient ? publicShippingAddress(recipient) : null,
                    p_metadata: settlementMetadata,
                }
            );
            if (settlementError || !settlement?.success) {
                throw settlementError || new Error(
                    `Paid merchandise settlement refused: ${settlement?.error || 'unknown_error'}`
                );
            }
            const stockTaken = settlement.stock_taken === true;
            const settledMetadata = settlement.metadata || settlementMetadata;

            if (isPrintfulOrder
                && stockTaken
                && settledMode === 'automatic'
                && settledMetadata.fulfillment_status === 'submitting') {
                try {
                    const providerOrder = await createPrintfulOrder({
                        orderId: metadata.order_id,
                        recipient,
                        items: buildPrintfulItems(orderItems),
                        confirm: isAutoConfirmEnabled(),
                    });
                    const providerStatus = String(providerOrder?.status || 'submitted').slice(0, 80);
                    const completedAt = new Date().toISOString();
                    const { data: fulfilledOrder, error: fulfillmentUpdateError } = await getSupabase()
                        .from('merchandise_orders')
                        .update({
                            status: 'processing',
                            metadata: {
                                ...settledMetadata,
                                fulfillment_provider: 'printful',
                                fulfillment_status: providerStatus,
                                printful_order_id: providerOrder?.id ? String(providerOrder.id).slice(0, 80) : null,
                                printful_external_id: sanitizeExternalOrderId(metadata.order_id),
                                needs_review: false,
                                submitted_at: completedAt,
                            },
                            updated_at: completedAt,
                        })
                        .eq('id', metadata.order_id)
                        .select('id');
                    if (fulfillmentUpdateError || !fulfilledOrder?.length) {
                        throw fulfillmentUpdateError || new Error('Printful submission was not recorded');
                    }
                } catch (fulfillmentError) {
                    const failedAt = new Date().toISOString();
                    const { data: failedOrder, error: failedUpdateError } = await getSupabase()
                        .from('merchandise_orders')
                        .update({
                            status: 'paid',
                            metadata: {
                                ...settledMetadata,
                                fulfillment_provider: 'printful',
                                fulfillment_mode: 'automatic',
                                fulfillment_status: 'provider_unknown',
                                needs_review: true,
                                reason: 'printful_submission_state_unknown',
                                failure_code: String(fulfillmentError?.code || 'PRINTFUL_REQUEST_FAILED').slice(0, 80),
                                flagged_at: failedAt,
                            },
                            updated_at: failedAt,
                        })
                        .eq('id', metadata.order_id)
                        .select('id');
                    if (failedUpdateError || !failedOrder?.length) {
                        throw failedUpdateError || new Error(
                            'Printful submission failed and its review quarantine could not be recorded'
                        );
                    }
                    // The immutable external id is retained for reconciliation.
                    // Do not retry submission blindly: a timeout may mean the
                    // provider accepted the order and only its response was lost.
                }
            }

        }
    } else if (mode === 'subscription') {
        // A Checkout completion can race customer.subscription.created and
        // customer.subscription.updated. All three enter the same admission
        // pipeline so event order cannot bypass the Card/Diamond mutex.
        try {
            const subscriptionId = stripeObjectId(session.subscription);
            if (!subscriptionId) {
                throw new Error('Stripe VIP Checkout Session has no subscription id');
            }
            const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['items.data.price'],
            });
            await handleStripeSubscriptionEvent(subscription, {
                checkoutSession: session,
                authoritative: true,
            });
        } catch (subErr) {
            // Note: this handler has no `req` — pass null so the report actually sends.
            try { reportApiError(subErr, null); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
            console.warn('Error processing VIP subscription checkout:', subErr);
            // Rethrow so the webhook returns 500 and Stripe retries the event —
            // a paid subscription that failed to activate must not be dropped.
            throw subErr;
        }
    }
}

async function closeExpiredPendingRow({ table, id, sessionId, patch, label }) {
    let { data, error } = await getSupabase()
        .from(table)
        .update({ ...patch, stripe_checkout_session_id: sessionId })
        .eq('id', id)
        .eq('status', 'pending')
        .eq('stripe_checkout_session_id', sessionId)
        .select('id');
    if (!error && !data?.length) {
        ({ data, error } = await getSupabase()
            .from(table)
            .update({ ...patch, stripe_checkout_session_id: sessionId })
            .eq('id', id)
            .eq('status', 'pending')
            .is('stripe_checkout_session_id', null)
            .select('id'));
    }
    if (error) {
        console.warn(`[stripe-webhook] expired ${label} checkout cleanup failed:`, error.message);
        throw error;
    }
    if (!data?.length) {
        console.info(`[stripe-webhook] expired ${label} checkout was already terminal, missing, or linked to another session`);
    }
}

async function handleCheckoutExpired(session) {
    const metadata = session?.metadata || {};

    if (metadata.type === 'diamonds' && metadata.purchase_id) {
        await closeExpiredPendingRow({
            table: 'diamond_purchases',
            id: metadata.purchase_id,
            sessionId: session.id,
            patch: { status: 'failed' },
            label: 'Diamond',
        });
    }

    if (metadata.type === 'merchandise' && metadata.order_id) {
        await closeExpiredPendingRow({
            table: 'merchandise_orders',
            id: metadata.order_id,
            sessionId: session.id,
            patch: {
                status: 'canceled',
                updated_at: new Date().toISOString(),
            },
            label: 'Merchandise',
        });
    }

    if (metadata.type === 'vip_lifetime' && metadata.purchase_id) {
        await closeExpiredPendingRow({
            table: 'vip_lifetime_purchases',
            id: metadata.purchase_id,
            sessionId: session.id,
            patch: { status: 'failed' },
            label: 'Lifetime VIP',
        });
    }
}

function stripeObjectId(value) {
    if (typeof value === 'string') return value.trim() || null;
    if (value && typeof value.id === 'string') return value.id.trim() || null;
    return null;
}

function metadataText(metadata, key) {
    const value = metadata?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function consistentText(label, values) {
    const candidates = [...new Set(values.filter(Boolean))];
    if (candidates.length > 1) {
        throw new Error(`Stripe VIP subscription has conflicting ${label}`);
    }
    return candidates[0] || null;
}

function stripeTimestamp(value, label) {
    if (value === null || value === undefined) return null;
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds) || seconds <= 0) {
        throw new Error(`Stripe VIP subscription has invalid ${label}`);
    }
    const iso = new Date(seconds * 1000).toISOString();
    if (!iso) throw new Error(`Stripe VIP subscription has invalid ${label}`);
    return iso;
}

function configuredVipPrices() {
    return Object.fromEntries([
        [process.env.STRIPE_VIP_MONTHLY_PRICE_ID, 'monthly'],
        [process.env.STRIPE_VIP_YEARLY_PRICE_ID, 'yearly'],
    ]
        .filter(([priceId]) => typeof priceId === 'string' && priceId.trim())
        .map(([priceId, tier]) => [priceId.trim(), tier]));
}

function fingerprintMetadata(metadata) {
    return Object.fromEntries(VIP_SUBSCRIPTION_METADATA_KEYS.map((key) => [
        key,
        metadataText(metadata, key),
    ]));
}

function fingerprintTransformQuantity(transformQuantity) {
    if (!transformQuantity) return null;
    return {
        divide_by: transformQuantity.divide_by ?? null,
        round: transformQuantity.round ?? null,
    };
}

function vipSubscriptionFingerprint(subscription) {
    const items = (Array.isArray(subscription?.items?.data) ? subscription.items.data : [])
        .map((item) => ({
            id: stripeObjectId(item),
            quantity: item?.quantity ?? null,
            price: {
                id: stripeObjectId(item?.price),
                type: item?.price?.type ?? null,
                active: item?.price?.active ?? null,
                currency: item?.price?.currency ?? null,
                billing_scheme: item?.price?.billing_scheme ?? null,
                unit_amount: item?.price?.unit_amount ?? null,
                transform_quantity: fingerprintTransformQuantity(item?.price?.transform_quantity),
                recurring: item?.price?.recurring ? {
                    interval: item.price.recurring.interval ?? null,
                    interval_count: item.price.recurring.interval_count ?? null,
                    usage_type: item.price.recurring.usage_type ?? null,
                } : null,
                sp_vip_tier: metadataText(item?.price?.metadata, 'sp_vip_tier'),
            },
        }))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const snapshot = {
        id: stripeObjectId(subscription),
        customer: stripeObjectId(subscription?.customer),
        latest_invoice: stripeObjectId(subscription?.latest_invoice),
        status: String(subscription?.status || '').trim().toLowerCase() || null,
        metadata: fingerprintMetadata(subscription?.metadata),
        items,
        current_period_start: subscription?.current_period_start ?? null,
        current_period_end: subscription?.current_period_end ?? null,
        cancel_at_period_end: subscription?.cancel_at_period_end ?? null,
        canceled_at: subscription?.canceled_at ?? null,
    };
    return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function hasExplicitSubscriptionTierEvidence(subscription, knownVipPrices) {
    if (metadataText(subscription?.metadata, 'vip_tier')) return true;
    return (subscription?.items?.data || []).some((item) => (
        metadataText(item?.price?.metadata, 'sp_vip_tier')
        || knownVipPrices[stripeObjectId(item?.price)]
    ));
}

function resolveExactVipTier(
    subscription,
    checkoutSession,
    existingSubscription,
    knownVipPrices,
    { hasPendingAdmission = false } = {}
) {
    const subscriptionTier = resolveStripeSubscriptionVipTier(subscription, { knownVipPrices });
    const checkoutTierText = metadataText(checkoutSession?.metadata, 'vip_tier')?.toLowerCase() || null;
    if (checkoutTierText && !VIP_PLAN_CONTRACT[checkoutTierText]) {
        throw new Error('Stripe VIP Checkout Session has an invalid recurring tier');
    }
    if (!subscriptionTier && hasExplicitSubscriptionTierEvidence(subscription, knownVipPrices)) {
        throw new Error('Stripe VIP subscription tier evidence is conflicting or invalid');
    }
    if (existingSubscription && subscriptionTier) {
        // Checkout Session metadata is an acquisition-time snapshot. Once the
        // exact ledger row exists, a delayed checkout.session.completed can
        // arrive after a legitimate plan switch; the freshly retrieved current
        // Subscription/Price is the authoritative tier in that case.
        return { tier: subscriptionTier, source: 'stripe' };
    }
    if (existingSubscription && hasPendingAdmission && checkoutTierText) {
        // Admission can recycle a terminal one-row-per-user record and crash
        // before projection. The exact admitting fence plus exact Checkout
        // Session makes its tier authoritative over the recycled stale row.
        return { tier: checkoutTierText, source: 'stripe' };
    }
    if (existingSubscription) {
        const ledgerTier = String(existingSubscription.tier || '').trim().toLowerCase();
        if (!VIP_PLAN_CONTRACT[ledgerTier]) {
            throw new Error('Existing VIP subscription has an invalid recurring tier');
        }
        return { tier: ledgerTier, source: 'ledger' };
    }
    const authoritativeTier = consistentText(
        'recurring tier metadata',
        [subscriptionTier, checkoutTierText]
    );
    if (authoritativeTier) return { tier: authoritativeTier, source: 'stripe' };
    throw new Error('Stripe VIP subscription has no exact monthly/yearly tier authority');
}

function validateVipOffer(subscription, tier) {
    const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
    if (items.length !== 1) {
        throw new Error('Stripe VIP subscription must contain exactly one recurring item');
    }
    const item = items[0];
    const price = item?.price;
    const contract = VIP_PLAN_CONTRACT[tier];
    if (!price || !contract
        || price.type !== 'recurring'
        || price.currency !== 'usd'
        || price.billing_scheme !== 'per_unit'
        || price.transform_quantity
        || price.recurring?.interval !== contract.interval
        || Number(price.recurring?.interval_count) !== 1
        || price.recurring?.usage_type !== 'licensed'
        || Number(price.unit_amount) !== contract.amount
        || Number(item.quantity) !== 1) {
        throw new Error('Stripe VIP subscription does not match the exact recurring offer');
    }
    return contract.amount / 100;
}

function syntheticLegacySubscriptionIdentity(subscriptionId, userId) {
    const requestId = `legacy-vip-subscription:${subscriptionId}`;
    return {
        requestId,
        intentHash: createHash('sha256')
            .update(`marketplace-vip-subscription:${subscriptionId}:${userId}`)
            .digest('hex'),
    };
}

function checkoutMatchesSubscription(checkoutSession, subscriptionId) {
    return checkoutSession?.mode === 'subscription'
        && stripeObjectId(checkoutSession.subscription) === subscriptionId;
}

async function discoverInitialSubscriptionPayment(subscription, preferredSession = null) {
    const subscriptionId = subscription.id;
    let checkoutSession = preferredSession;
    let invoice = null;
    let error = null;

    if (checkoutSession && !checkoutMatchesSubscription(checkoutSession, subscriptionId)) {
        throw new Error('Stripe Checkout Session does not match the VIP subscription');
    }

    try {
        if (!checkoutSession) {
            const sessions = await stripe.checkout.sessions.list({
                subscription: subscriptionId,
                limit: 100,
            });
            if (sessions?.has_more) {
                throw new Error('Stripe returned an incomplete initial Checkout Session set');
            }
            const exactSessions = (sessions?.data || []).filter(
                (entry) => checkoutMatchesSubscription(entry, subscriptionId)
            );
            if (exactSessions.length !== 1) {
                throw new Error('Stripe VIP subscription has no unique initial Checkout Session');
            }
            [checkoutSession] = exactSessions;
        }

        const invoiceId = stripeObjectId(checkoutSession.invoice);
        if (!invoiceId) throw new Error('Stripe VIP Checkout Session has no initial invoice');
        invoice = await stripe.invoices.retrieve(invoiceId);
        if (invoice?.id !== invoiceId
            || stripeObjectId(invoice.subscription) !== subscriptionId
            || invoice.billing_reason !== 'subscription_create') {
            throw new Error('Stripe VIP initial invoice does not match its subscription');
        }
    } catch (paymentError) {
        error = paymentError;
    }

    return { checkoutSession, invoice, error, kind: 'initial' };
}

function triggerInvoicePaymentContext(invoice, subscription) {
    const subscriptionId = stripeObjectId(subscription);
    const invoiceId = stripeObjectId(invoice);
    const latestInvoiceId = stripeObjectId(subscription?.latest_invoice);
    const subscriptionCustomerId = stripeObjectId(subscription?.customer);
    const invoiceCustomerId = stripeObjectId(invoice?.customer);
    const amountPaid = Number(invoice?.amount_paid);
    const invoicePeriodStart = Number(invoice?.period_start);
    const invoicePeriodEnd = Number(invoice?.period_end);
    const subscriptionPeriodStart = Number(subscription?.current_period_start);
    const subscriptionPeriodEnd = Number(subscription?.current_period_end);
    const billingReason = String(invoice?.billing_reason || '').trim().toLowerCase();
    const subscriptionStatus = String(subscription?.status || '').trim().toLowerCase();
    if (!invoiceId
        || !latestInvoiceId
        || invoiceId !== latestInvoiceId
        || stripeObjectId(invoice?.subscription) !== subscriptionId
        || !subscriptionCustomerId
        || invoiceCustomerId !== subscriptionCustomerId
        || invoice?.status !== 'paid'
        || invoice?.paid !== true
        || !VIP_BLOCKING_SUBSCRIPTION_STATUSES.has(subscriptionStatus)
        || !Number.isSafeInteger(amountPaid)
        || amountPaid < 0
        || !['subscription_create', 'subscription_cycle', 'subscription_update',
            'subscription_threshold'].includes(billingReason)
        || !Number.isSafeInteger(invoicePeriodStart)
        || !Number.isSafeInteger(invoicePeriodEnd)
        || !Number.isSafeInteger(subscriptionPeriodStart)
        || !Number.isSafeInteger(subscriptionPeriodEnd)
        || invoicePeriodStart > invoicePeriodEnd
        || invoicePeriodEnd < subscriptionPeriodStart
        || invoicePeriodStart > subscriptionPeriodEnd) {
        throw new Error('VIP reactivation has no exact paid trigger invoice');
    }
    if (amountPaid > 0
        && !stripeObjectId(invoice?.payment_intent)
        && !stripeObjectId(invoice?.charge)) {
        throw new Error('VIP reactivation trigger invoice has no refundable payment');
    }
    return {
        checkoutSession: null,
        invoice,
        error: null,
        kind: 'trigger',
        triggerSubscription: subscription,
    };
}

function vipOverlapRefundAttemptKey(subscriptionId, invoiceId, terminalRefunds) {
    const evidence = terminalRefunds.map((refund) => {
        const refundId = stripeObjectId(refund);
        const status = String(refund?.status || '').trim().toLowerCase();
        if (!refundId || !['failed', 'canceled'].includes(status)) {
            throw new Error('Denied VIP subscription has invalid terminal refund evidence');
        }
        return `${refundId}:${status}`;
    }).sort();
    const attempt = createHash('sha256')
        .update(JSON.stringify(evidence))
        .digest('hex')
        .slice(0, 32);
    return `commerce:vip-overlap-refund:${subscriptionId}:${invoiceId}:${attempt}`;
}

async function refundDeniedVipSubscription(subscriptionId, paymentContext, {
    refreshTriggerPaymentContext = null,
} = {}) {
    if (paymentContext?.error) throw paymentContext.error;
    const checkoutSession = paymentContext?.checkoutSession;
    const invoice = paymentContext?.invoice;
    const invoiceId = stripeObjectId(invoice);
    if (paymentContext?.kind === 'trigger') {
        triggerInvoicePaymentContext(invoice, paymentContext.triggerSubscription);
    } else if (!checkoutMatchesSubscription(checkoutSession, subscriptionId)
        || stripeObjectId(checkoutSession.invoice) !== invoiceId
        || stripeObjectId(invoice?.subscription) !== subscriptionId
        || invoice?.billing_reason !== 'subscription_create') {
        throw new Error('Denied VIP subscription has no exact refundable initial invoice');
    }

    const amountPaid = Number(invoice.amount_paid);
    if (!Number.isSafeInteger(amountPaid) || amountPaid < 0) {
        throw new Error('Denied VIP subscription invoice has an invalid paid amount');
    }
    if (amountPaid === 0) return;

    const paymentIntentId = stripeObjectId(invoice.payment_intent);
    const chargeId = stripeObjectId(invoice.charge);
    if (!paymentIntentId && !chargeId) {
        throw new Error('Denied VIP subscription invoice has no refundable payment');
    }

    const listParams = paymentIntentId
        ? { payment_intent: paymentIntentId, limit: 100 }
        : { charge: chargeId, limit: 100 };
    const refunds = await stripe.refunds.list(listParams);
    if (refunds?.has_more) {
        throw new Error('Stripe returned an incomplete VIP overlap refund set');
    }
    const matchingRefunds = (refunds?.data || []).filter((refund) => (
        refund?.metadata?.stripe_subscription_id === subscriptionId
        && refund?.metadata?.stripe_invoice_id === invoiceId
    ));
    for (const existingRefund of matchingRefunds) {
        if (Number(existingRefund?.amount) !== amountPaid) {
            throw new Error('VIP overlap refund does not cover the exact initial payment');
        }
    }
    const succeededRefunds = matchingRefunds.filter(
        (refund) => refund?.status === 'succeeded'
    );
    if (succeededRefunds.length > 1) {
        throw new Error('Denied VIP subscription has duplicate successful overlap refunds');
    }
    if (succeededRefunds.length === 1) return;

    const inFlightRefunds = matchingRefunds.filter(
        (refund) => ['pending', 'requires_action'].includes(refund?.status)
    );
    if (inFlightRefunds.length) {
        throw new Error('VIP overlap refund is still pending; Stripe will retry');
    }
    const terminalRefunds = matchingRefunds.filter(
        (refund) => ['failed', 'canceled'].includes(refund?.status)
    );
    if (terminalRefunds.length !== matchingRefunds.length) {
        throw new Error('Denied VIP subscription has an unsupported overlap refund state');
    }

    if (paymentContext?.kind === 'trigger') {
        if (typeof refreshTriggerPaymentContext !== 'function') {
            throw new Error('VIP reactivation refund is missing fresh subscription authority');
        }
        // Refund listing is a network boundary. Re-read after it so an invoice
        // that became historical during this invocation cannot authorize new
        // money movement.
        await refreshTriggerPaymentContext();
    }

    const refund = await stripe.refunds.create({
        ...(paymentIntentId ? { payment_intent: paymentIntentId } : { charge: chargeId }),
        amount: amountPaid,
        metadata: {
            smarter_poker_reason: paymentContext?.kind === 'trigger'
                ? 'vip_reactivation_overlap'
                : 'vip_acquisition_overlap',
            stripe_subscription_id: subscriptionId,
            stripe_invoice_id: invoiceId,
        },
    }, {
        idempotencyKey: vipOverlapRefundAttemptKey(
            subscriptionId,
            invoiceId,
            terminalRefunds
        ),
    });
    if (Number(refund?.amount) !== amountPaid) {
        throw new Error('VIP overlap refund does not cover the exact initial payment');
    }
    if (refund?.status !== 'succeeded') {
        throw new Error(
            `VIP overlap refund is ${refund?.status || 'unknown'}; Stripe will retry`
        );
    }
}

async function cancelDeniedVipSubscription(subscriptionId) {
    const canceled = await stripe.subscriptions.cancel(subscriptionId, {
        invoice_now: false,
        prorate: false,
    }, {
        idempotencyKey: `commerce:vip-overlap-cancel:${subscriptionId}`,
    });
    if (canceled?.id !== subscriptionId || canceled?.status !== 'canceled') {
        throw new Error('Stripe did not confirm exact VIP subscription cancellation');
    }
}

async function compensateDeniedVipSubscription(subscription, paymentContext) {
    // Refund first. If the process dies after a successful refund, the next
    // authoritative retrieval still sees a blocking subscription and retries
    // cancellation. Canceling first would make that retry look like a benign
    // first-seen terminal event and could strand the captured payment.
    const exactPaymentContext = paymentContext?.checkoutSession
        ? paymentContext
        : await discoverInitialSubscriptionPayment(subscription);
    await refundDeniedVipSubscription(subscription.id, exactPaymentContext);
    await cancelDeniedVipSubscription(subscription.id);
}

async function compensateVipReactivationConflict(subscription, triggerInvoice) {
    if (!triggerInvoice) {
        throw new Error(
            'VIP subscription reactivation conflicts with another entitlement; awaiting exact paid invoice'
        );
    }
    const retrieveCurrentPaymentContext = async () => {
        const currentSubscription = await stripe.subscriptions.retrieve(subscription.id, {
            expand: ['items.data.price'],
        });
        if (!currentSubscription || currentSubscription.id !== subscription.id) {
            throw new Error('Stripe did not return the exact reactivation subscription');
        }
        return triggerInvoicePaymentContext(triggerInvoice, currentSubscription);
    };

    const paymentContext = await retrieveCurrentPaymentContext();
    await refundDeniedVipSubscription(subscription.id, paymentContext, {
        refreshTriggerPaymentContext: retrieveCurrentPaymentContext,
    });

    // A new invoice can become current after the refund. In that case leave
    // the subscription uncanceled and retry from the new invoice event instead
    // of hiding an additional unrefunded charge behind a terminal status.
    await retrieveCurrentPaymentContext();
    await cancelDeniedVipSubscription(subscription.id);
}

async function handleStripeSubscriptionEvent(subscriptionReference, {
    checkoutSession: suppliedCheckoutSession = null,
    triggerInvoice = null,
    authoritative = false,
    reconciliationDepth = 0,
} = {}) {
    const subscriptionId = stripeObjectId(subscriptionReference);
    if (!subscriptionId) throw new Error('Stripe subscription event has no subscription id');

    const subscription = authoritative
        ? subscriptionReference
        : await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['items.data.price'],
        });
    if (!subscription || subscription.id !== subscriptionId) {
        throw new Error('Stripe did not return the exact current subscription');
    }
    if (triggerInvoice
        && stripeObjectId(triggerInvoice.subscription) !== subscriptionId) {
        throw new Error('Stripe invoice event does not match its current subscription');
    }
    const projectedFingerprint = vipSubscriptionFingerprint(subscription);

    const status = String(subscription.status || '').trim().toLowerCase();
    if (!VIP_SUBSCRIPTION_STATUSES.has(status)) {
        throw new Error(`Stripe VIP subscription has unsupported status ${status || 'missing'}`);
    }

    const knownVipPrices = configuredVipPrices();
    const knownVipPriceIds = Object.keys(knownVipPrices);
    const subscriptionAuthority = classifyStripeSubscriptionForVip(subscription, {
        knownVipPriceIds,
    });

    const { data: existingSubscription, error: existingSubscriptionError } = await getSupabase()
        .from('vip_subscriptions')
        .select('id, user_id, stripe_subscription_id, stripe_customer_id, tier, status')
        .eq('stripe_subscription_id', subscriptionId)
        .maybeSingle();
    if (existingSubscriptionError) throw existingSubscriptionError;
    const { data: existingCommander, error: existingCommanderError } = await getSupabase()
        .from('commander_subscriptions')
        .select('id, stripe_subscription_id')
        .eq('stripe_subscription_id', subscriptionId)
        .maybeSingle();
    if (existingCommanderError) throw existingCommanderError;

    let existingClaim = null;
    let existingClaimUserId = null;
    if (existingSubscription?.user_id) {
        const { data, error } = await getSupabase()
            .from('vip_subscription_checkout_claims')
            .select('request_id, intent_hash, state, session_id')
            .eq('user_id', existingSubscription.user_id)
            .maybeSingle();
        if (error) throw error;
        existingClaim = data;
        existingClaimUserId = existingSubscription.user_id;
    }

    let paymentContext = {
        checkoutSession: suppliedCheckoutSession,
        invoice: null,
        error: null,
    };
    if (suppliedCheckoutSession) {
        paymentContext = await discoverInitialSubscriptionPayment(
            subscription,
            suppliedCheckoutSession
        );
    } else if (subscriptionAuthority !== STRIPE_VIP_AUTHORITY.COMMANDER
        && (
            !existingSubscription
            || !hasExplicitSubscriptionTierEvidence(subscription, knownVipPrices)
            || !metadataText(subscription.metadata, 'checkout_request_id')
            || !metadataText(subscription.metadata, 'checkout_intent_hash')
            || Boolean(existingClaim?.session_id)
        )) {
        paymentContext = await discoverInitialSubscriptionPayment(subscription);
    }
    const checkoutSession = paymentContext.checkoutSession;
    const checkoutAuthority = checkoutSession
        ? classifyStripeCheckoutSessionForVip(checkoutSession)
        : null;
    const hasCommanderIdentity = Boolean(
        metadataText(subscription.metadata, 'venue_id')
        || metadataText(checkoutSession?.metadata, 'venue_id')
    );
    const hasVipAuthority = subscriptionAuthority === STRIPE_VIP_AUTHORITY.VIP
        || checkoutAuthority === STRIPE_VIP_AUTHORITY.VIP
        || Boolean(existingSubscription);
    const hasCommanderAuthority = subscriptionAuthority === STRIPE_VIP_AUTHORITY.COMMANDER
        || checkoutAuthority === STRIPE_VIP_AUTHORITY.COMMANDER
        || hasCommanderIdentity
        || Boolean(existingCommander);

    if (hasVipAuthority && hasCommanderAuthority) {
        throw new Error('Stripe subscription conflicts between VIP and Commander authority');
    }
    if (hasCommanderAuthority) {
        return status === 'canceled' || status === 'incomplete_expired'
            ? handleCommanderSubscriptionCanceled(subscription)
            : handleCommanderSubscriptionUpdate(subscription);
    }
    if (!hasVipAuthority) {
        console.info(`[stripe-webhook] subscription ${subscriptionId} has no exact VIP authority; ignored`);
        return;
    }
    const { tier, source: tierSource } = resolveExactVipTier(
        subscription,
        checkoutSession,
        existingSubscription,
        knownVipPrices,
        { hasPendingAdmission: existingClaim?.state === 'admitting' }
    );
    const priceUsd = validateVipOffer(subscription, tier);
    const currentPeriodStart = stripeTimestamp(
        subscription.current_period_start,
        'current_period_start'
    );
    const currentPeriodEnd = stripeTimestamp(
        subscription.current_period_end,
        'current_period_end'
    );
    if (!currentPeriodStart || !currentPeriodEnd) {
        throw new Error('Stripe VIP subscription has an incomplete current period');
    }
    if (typeof subscription.cancel_at_period_end !== 'boolean') {
        throw new Error('Stripe VIP subscription has invalid cancel_at_period_end');
    }
    const canceledAt = status === 'canceled'
        ? stripeTimestamp(subscription.canceled_at, 'canceled_at')
        : null;

    const customerId = consistentText('customer identity', [
        stripeObjectId(subscription.customer),
        stripeObjectId(checkoutSession?.customer),
    ]);
    if (!customerId) throw new Error('Stripe VIP subscription has no customer identity');
    const stripeCustomer = await stripe.customers.retrieve(customerId);

    const { data: customerProfile, error: customerProfileError } = await getSupabase()
        .from('profiles')
        .select('id, stripe_customer_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();
    if (customerProfileError) throw customerProfileError;
    const userId = consistentText('user identity', [
        metadataText(subscription.metadata, 'user_id'),
        metadataText(checkoutSession?.metadata, 'user_id'),
        metadataText(stripeCustomer?.metadata, 'smarter_poker_id'),
        metadataText(stripeCustomer?.metadata, 'user_id'),
        existingSubscription?.user_id || null,
        customerProfile?.id || null,
    ]);
    if (!userId || !UUID_PATTERN.test(userId)) {
        throw new Error('Stripe VIP subscription has no valid profile identity');
    }

    const { data: profile, error: profileError } = customerProfile?.id === userId
        ? { data: customerProfile, error: null }
        : await getSupabase()
            .from('profiles')
            .select('id, stripe_customer_id')
            .eq('id', userId)
            .maybeSingle();
    if (profileError) throw profileError;

    if (existingClaimUserId !== userId) {
        const { data, error } = await getSupabase()
            .from('vip_subscription_checkout_claims')
            .select('request_id, intent_hash, state, session_id')
            .eq('user_id', userId)
            .maybeSingle();
        if (error) throw error;
        existingClaim = data;
        existingClaimUserId = userId;
    }

    let requestId = consistentText('checkout request identity', [
        metadataText(subscription.metadata, 'checkout_request_id'),
        metadataText(checkoutSession?.metadata, 'checkout_request_id'),
    ]);
    let intentHash = consistentText('checkout intent hash', [
        metadataText(subscription.metadata, 'checkout_intent_hash'),
        metadataText(checkoutSession?.metadata, 'checkout_intent_hash'),
    ]);
    if (!requestId && !intentHash) {
        ({ requestId, intentHash } = syntheticLegacySubscriptionIdentity(subscriptionId, userId));
    } else if (!requestId || !intentHash) {
        throw new Error('Stripe VIP subscription has an incomplete checkout identity');
    }
    if (requestId.length > 200 || !/^[a-f0-9]{64}$/.test(intentHash)) {
        throw new Error('Stripe VIP subscription has an invalid checkout identity');
    }
    const sessionId = consistentText('Checkout Session identity', [
        checkoutSession?.id || null,
        metadataText(subscription.metadata, 'checkout_session_id'),
    ]);
    const hasAdmittingClaim = existingClaim?.state === 'admitting';
    const storedClaimSessionMatches = !existingClaim?.session_id
        || existingClaim.session_id === checkoutSession?.id;
    const claimMatchesExactAdmission = hasAdmittingClaim
        && existingClaim.request_id === requestId
        && existingClaim.intent_hash === intentHash
        && storedClaimSessionMatches;

    if (!storedClaimSessionMatches) {
        throw new Error(
            `Stripe VIP subscription ${subscriptionId} conflicts with its claimed Checkout Session`
        );
    }

    if (hasAdmittingClaim && !claimMatchesExactAdmission) {
        throw new Error(
            `Stripe VIP subscription ${subscriptionId} conflicts with an admitting claim`
        );
    }

    if (!existingSubscription && VIP_FIRST_SEEN_TERMINAL_STATUSES.has(status)) {
        if (!hasAdmittingClaim) {
            console.info(`[stripe-webhook] first-seen terminal VIP subscription ${subscriptionId} ignored`);
            return;
        }
        // A matching admitting claim means a prior attempt installed the fence
        // and may have crashed before creating a ledger row. Project terminal
        // state atomically and finalize that exact fence instead of stranding it.
    }

    // A signed invoice event is compensation authority only for the freshly
    // retrieved subscription's current invoice and period. Validate this before
    // admission so a delayed historical event cannot alter a claim or provider.
    if (triggerInvoice) {
        triggerInvoicePaymentContext(triggerInvoice, subscription);
    }

    if (!profile || profile.id !== userId) {
        await compensateDeniedVipSubscription(subscription, paymentContext);
        return;
    }
    if (profile.stripe_customer_id
        && profile.stripe_customer_id !== customerId
        && !claimMatchesExactAdmission) {
        throw new Error('Stripe VIP subscription conflicts with the profile customer');
    }

    // All provider and database reads above finish before this first VIP write.
    // The admission RPC locks the profile and installs/retains the Diamond fence.
    const { data: admission, error: admissionError } = await getSupabase().rpc(
        'admit_vip_subscription_checkout',
        {
            p_user_id: userId,
            p_stripe_subscription_id: subscriptionId,
            p_request_id: requestId,
            p_intent_hash: intentHash,
            p_session_id: sessionId,
        }
    );
    if (admissionError) throw admissionError;

    if (!admission?.success) {
        const denialState = String(admission?.state || 'unknown');
        // Compensation belongs only to a newly paid acquisition that never
        // entered our ledger. A delivery for an already-recorded subscription
        // can encounter an unrelated claim; refunding its historical initial
        // invoice would be destructive, so that case is quarantined instead.
        if (!existingSubscription && VIP_COMPENSATED_ADMISSION_DENIALS.has(denialState)) {
            await compensateDeniedVipSubscription(subscription, paymentContext);
            return;
        }
        throw new Error(`Stripe VIP subscription admission failed: ${denialState}`);
    }
    if (!['admitted', 'replay'].includes(admission.state)) {
        throw new Error(`Stripe VIP subscription admission returned ${admission.state || 'unknown'}`);
    }
    if (tierSource === 'ledger'
        && (admission.state === 'admitted' || admission.finalize_required === true)) {
        throw new Error('A recycled VIP subscription requires authoritative Stripe tier metadata');
    }

    // One database transaction now owns both the exact ledger mutation and the
    // profile projection. Passing every current Stripe field clears stale values
    // left if admission recycled a terminal one-row-per-user record then crashed.
    const { data: projection, error: projectionError } = await getSupabase().rpc(
        'apply_vip_subscription_projection',
        {
            p_user_id: userId,
            p_stripe_subscription_id: subscriptionId,
            p_stripe_customer_id: customerId,
            p_request_id: requestId,
            p_intent_hash: intentHash,
            p_tier: tier,
            p_status: status,
            p_price_usd: priceUsd,
            p_current_period_start: currentPeriodStart,
            p_current_period_end: currentPeriodEnd,
            p_cancel_at_period_end: subscription.cancel_at_period_end,
            p_canceled_at: canceledAt,
        }
    );
    if (projectionError) throw projectionError;
    if (projection?.success !== true) {
        if (projection?.state === 'reactivation_entitlement_conflict') {
            await compensateVipReactivationConflict(subscription, triggerInvoice);
            return;
        }
        throw new Error(
            `Stripe VIP subscription projection failed: ${projection?.state || 'unknown'}`
        );
    }
    if (projection?.projected !== true
        || projection?.state !== 'projected'
        || projection?.stripe_subscription_id !== subscriptionId
        || projection?.status !== status) {
        throw new Error('Stripe VIP subscription projection was not confirmed');
    }

    // Stripe may update the same subscription while this invocation is between
    // its first provider read and the atomic database projection. Re-read after
    // projecting every authoritative field and only finalize a stable snapshot.
    // A changed snapshot re-enters admission with the exact Checkout context;
    // the existing `admitting` fence remains held throughout reconciliation.
    const reconciledSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
    });
    if (!reconciledSubscription || reconciledSubscription.id !== subscriptionId) {
        throw new Error('Stripe did not return the exact reconciled subscription');
    }
    const reconciledFingerprint = vipSubscriptionFingerprint(reconciledSubscription);
    if (reconciledFingerprint !== projectedFingerprint) {
        if (reconciliationDepth >= VIP_SUBSCRIPTION_RECONCILIATION_LIMIT) {
            throw new Error('Stripe VIP subscription changed repeatedly during reconciliation');
        }
        return handleStripeSubscriptionEvent(reconciledSubscription, {
            checkoutSession,
            triggerInvoice,
            authoritative: true,
            reconciliationDepth: reconciliationDepth + 1,
        });
    }

    const finalizeRequired = admission.state === 'admitted'
        || (admission.state === 'replay' && admission.finalize_required === true);
    if (finalizeRequired) {
        const { data: finalized, error: finalizeError } = await getSupabase().rpc(
            'finalize_vip_subscription_admission',
            {
                p_user_id: userId,
                p_stripe_subscription_id: subscriptionId,
                p_request_id: requestId,
                p_intent_hash: intentHash,
            }
        );
        if (finalizeError
            || finalized?.success !== true
            || !['finalized', 'replay'].includes(finalized?.state)) {
            throw finalizeError || new Error('Stripe VIP subscription admission was not finalized');
        }
    }
}

async function handleInvoicePaymentSucceeded(invoice) {
    if (stripeObjectId(invoice?.subscription)) {
        await handleStripeSubscriptionEvent(invoice.subscription, { triggerInvoice: invoice });
    }
}

async function handleInvoicePaymentFailed(invoice) {
    if (stripeObjectId(invoice?.subscription)) {
        await handleStripeSubscriptionEvent(invoice.subscription);
    }
}

// -------------------------------------------------------------------------
// DISPUTES (Diamond Accounting Standard D10 / Lane D)
//
// `charge.dispute.*` was neither subscribed at Stripe nor handled here, so a
// chargeback took the money back and the diamonds it bought stayed in the
// player's balance forever. Nothing froze, nothing reversed, and nothing even
// recorded that a dispute existed. A dispute lost by silence is a money defect.
//
// The database side is `fn_diamond_purchase_dispute`, which is idempotent on
// (dispute id, event) by primary key and does the work:
//   created          freezes the purchase lot and files a critical incident
//                    carrying the evidence deadline
//   funds_withdrawn  runs the SAME pro-rata reversal a refund runs
//   closed           won unfreezes, lost leaves the reversal standing
//
// Correlation is byte-for-byte the shape `handleRefund` uses: the payment
// intent first, then the Checkout Sessions listing as a fallback, because both
// completed diamond purchases in production carry a NULL payment intent and the
// primary lookup cannot find them.
// -------------------------------------------------------------------------

/**
 * Find the diamond purchase behind a Stripe payment intent, or null.
 * Payment intent first, Checkout Sessions listing second.
 */
async function correlateDiamondPurchase(paymentIntent) {
    if (!paymentIntent) return null;

    const { data: purchase, error: purchaseReadError } = await getSupabase()
        .from('diamond_purchases')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntent)
        .maybeSingle();
    if (purchaseReadError) throw purchaseReadError;
    if (purchase) return purchase.id;

    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 10 });
    const checkoutSession = sessions.data.find((entry) => entry.metadata?.purchase_id);
    if (checkoutSession?.metadata?.type === 'diamonds' && checkoutSession.metadata.purchase_id) {
        const { data: recovered, error: recoveredError } = await getSupabase()
            .from('diamond_purchases')
            .select('id')
            .eq('id', checkoutSession.metadata.purchase_id)
            .maybeSingle();
        if (recoveredError) throw recoveredError;
        if (recovered) return recovered.id;
    }
    return null;
}

async function handleDispute(dispute, eventType) {
    const paymentIntent = typeof dispute?.payment_intent === 'string'
        ? dispute.payment_intent
        : dispute?.payment_intent?.id;
    const disputeId = String(dispute?.id || '');
    if (!disputeId) {
        throw new Error('Stripe dispute arrived without an id');
    }

    const purchaseId = await correlateDiamondPurchase(paymentIntent);
    if (!purchaseId) {
        // Disputes are raised against merchandise, VIP and subscription charges
        // as well, and those are not this handler's business. Not correlating is
        // a normal outcome, not a failure: throwing here would make Stripe retry
        // a merchandise dispute forever.
        console.warn(`[stripe-webhook] ${eventType} ${disputeId} did not correlate to a diamond purchase; nothing frozen, nothing reversed`);
        return;
    }

    // `closed` carries its outcome in `status`. The RPC takes it as part of the
    // event name so won and lost are separate rows under the idempotency key.
    // Anything that is not explicitly 'won' is treated as lost, which leaves the
    // reversal standing: the safe direction.
    const eventName = eventType === 'charge.dispute.closed'
        ? `charge.dispute.closed:${dispute?.status === 'won' ? 'won' : 'lost'}`
        : eventType;

    const rawAmount = Number(dispute?.amount);
    const amountCents = Number.isSafeInteger(rawAmount) && rawAmount >= 0 ? rawAmount : null;

    const { data: result, error: disputeError } = await getSupabase()
        .rpc('fn_diamond_purchase_dispute', {
            p_purchase_id: purchaseId,
            p_dispute_id: disputeId,
            p_event: eventName,
            p_amount_cents: amountCents,
        });
    if (disputeError) throw disputeError;
    if (!result?.success) {
        throw new Error(`Diamond dispute handling failed: ${result?.error || 'unknown_error'}`);
    }
}

async function handleRefund(charge) {
    const { payment_intent, amount_refunded } = charge;
    const chargeAmount = Number(charge.amount);
    const cumulativeRefund = Number(amount_refunded);
    if (!Number.isSafeInteger(chargeAmount) || chargeAmount <= 0
        || !Number.isSafeInteger(cumulativeRefund) || cumulativeRefund < 0) {
        throw new Error('Stripe refund carried invalid cumulative amounts');
    }

    const { data: purchase, error: purchaseReadError } = await getSupabase()
        .from('diamond_purchases')
        .select('id')
        .eq('stripe_payment_intent_id', payment_intent)
        .maybeSingle();
    if (purchaseReadError) throw purchaseReadError;

    if (purchase) {
        const { data: result, error: reconcileError } = await getSupabase()
            .rpc('reconcile_diamond_purchase_refund', {
                p_purchase_id: purchase.id,
                p_charge_amount_cents: chargeAmount,
                p_refunded_amount_cents: cumulativeRefund,
            });
        if (reconcileError) throw reconcileError;
        if (!result?.success) {
            throw new Error(`Diamond refund reconciliation failed: ${result?.error || 'unknown_error'}`);
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MERCHANDISE refunds. handleRefund only ever looked at diamond_purchases,
    // so a refunded merch order kept its 'processing' status forever and would
    // still have been picked, packed and shipped — the customer got their money
    // back AND the goods. The stock taken at payment was never returned either.
    // ═══════════════════════════════════════════════════════════════════════
    let { data: order, error: orderReadError } = await getSupabase()
        .from('merchandise_orders')
        .select('id, items, status, metadata, refunded_amount_cents')
        .eq('stripe_payment_intent_id', payment_intent)
        .maybeSingle();
    if (orderReadError) throw orderReadError;

    if (!order) {
        const sessions = await stripe.checkout.sessions.list({ payment_intent, limit: 10 });
        const checkoutSession = sessions.data.find((entry) => (
            entry.metadata?.purchase_id || entry.metadata?.order_id
        ));
        if (checkoutSession?.metadata?.type === 'diamonds' && checkoutSession.metadata.purchase_id) {
            const { data: pendingPurchase, error: pendingReadError } = await getSupabase()
                .from('diamond_purchases')
                .select('id')
                .eq('id', checkoutSession.metadata.purchase_id)
                .maybeSingle();
            if (pendingReadError || !pendingPurchase) {
                throw pendingReadError || new Error('Refunded Diamond checkout could not be correlated');
            }
            const { data: result, error: reconcileError } = await getSupabase()
                .rpc('reconcile_diamond_purchase_refund', {
                    p_purchase_id: pendingPurchase.id,
                    p_charge_amount_cents: chargeAmount,
                    p_refunded_amount_cents: cumulativeRefund,
                });
            if (reconcileError || !result?.success) {
                throw reconcileError || new Error(`Diamond refund reconciliation failed: ${result?.error || 'unknown_error'}`);
            }
            return;
        }
        if (checkoutSession?.metadata?.type === 'merchandise' && checkoutSession.metadata.order_id) {
            const recovered = await getSupabase()
                .from('merchandise_orders')
                .select('id, items, status, metadata, refunded_amount_cents')
                .eq('id', checkoutSession.metadata.order_id)
                .maybeSingle();
            if (recovered.error || !recovered.data) {
                throw recovered.error || new Error('Refunded merchandise checkout could not be correlated');
            }
            order = recovered.data;
        } else {
            throw new Error('Stripe refund could not be correlated to a commerce record');
        }
    }
    const previousRefund = Number(order.refunded_amount_cents) || 0;
    const effectiveRefund = Math.max(previousRefund, Math.min(chargeAmount, cumulativeRefund));
    const fullyRefunded = effectiveRefund >= chargeAmount;
    const existingMetadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    const isPrintfulOrder = existingMetadata.fulfillment_provider === 'printful'
        || (Array.isArray(order.items) && order.items.length > 0
            && order.items.every((item) => item?.fulfillmentProvider === 'printful'));

    let cancellation = null;
    let cancellationError = null;
    if (fullyRefunded && isPrintfulOrder && !existingMetadata.refund_provider_canceled) {
        try {
            cancellation = await cancelPrintfulOrder({
                orderId: order.id,
                providerOrderId: existingMetadata.printful_order_id,
            });
        } catch (error) {
            cancellationError = error;
            try { reportApiError(error, null); } catch (_) { /* best effort */ }
        }
    }

    const now = new Date().toISOString();
    const metadataPatch = {
            ...existingMetadata,
            refund_status: fullyRefunded ? 'full' : 'partial',
            refunded_amount_cents: effectiveRefund,
            ...(cancellation ? {
                refund_provider_canceled: true,
                refund_provider_canceled_at: now,
                refund_provider_result: cancellation,
                needs_review: false,
            } : {}),
            ...(cancellationError ? {
                refund_provider_canceled: false,
                needs_review: true,
                reason: 'printful_cancellation_failed_after_refund',
                flagged_at: now,
            } : {}),
    };
    const { data: refundResult, error: orderErr } = await getSupabase()
        .rpc('reconcile_card_merch_refund_atomic', {
            p_order_id: order.id,
            p_charge_amount_cents: chargeAmount,
            p_refunded_amount_cents: cumulativeRefund,
            p_metadata_patch: metadataPatch,
        });
    if (orderErr || !refundResult?.success) {
        throw orderErr || new Error(
            `Merchandise refund reconciliation failed: ${refundResult?.error || 'unknown_error'}`
        );
    }

    // Retry transient provider failures after recording the refunded state and
    // review flag. Permanent 4xx responses need human recovery, not webhook churn.
    if (cancellationError && (!cancellationError.status || cancellationError.status >= 500)) {
        throw cancellationError;
    }
}

async function handleCommanderSubscriptionUpdate(subscription) {
    const { id, status, metadata, current_period_end } = subscription;
    const venueId = metadata?.venue_id;

    if (!venueId) return;

    // 2026-08-15 CHECK 13 fix: this UPDATE wrote current_period_start,
    // current_period_end and cancel_at_period_end — none of which exist on
    // commander_subscriptions — so the WHOLE update 42703'd and was swallowed
    // by the warn below. Net effect: no Stripe subscription change (renewal,
    // cancellation, tier change, past_due) EVER propagated to
    // commander_subscriptions; venues kept whatever status/tier they started
    // with. The real schema stores the period end as next_billing_date.
    // current_period_start had no reader anywhere and is not persisted;
    // cancel_at_period_end likewise has no DB reader (the settings UI reads it
    // from the live Stripe object) — if a future UI needs it from the DB,
    // that is an additive migration then, not a phantom write now.
    const periodEnd = Number(current_period_end);
    const updatePayload = {
        status: status,
        tier: metadata.tier || 'home_game',
        updated_at: new Date().toISOString()
    };
    if (Number.isFinite(periodEnd) && periodEnd > 0) {
        updatePayload.next_billing_date = new Date(periodEnd * 1000).toISOString();
    }

    const { error: err_commander_subscriptions_0z48c } = await getSupabase()

      .from('commander_subscriptions')

      .update(updatePayload)
        .eq('stripe_subscription_id', id);

    // silent-write-ok: bookkeeping record, not the entitlement. The gate
    // that actually grants or revokes access is handled separately above;
    // a miss here leaves the subscription ledger stale, which is worth
    // seeing but must not 500 a webhook and trigger three days of retries.
    if (err_commander_subscriptions_0z48c) console.error('[stripe-webhook] commander_subscriptions update write failed:', err_commander_subscriptions_0z48c.message);

    if (status === 'active' || status === 'trialing') {
        // This is the paid feature gate itself. A zero-row match means the
        // venue is being billed and Commander was never switched on.
        const { data: enabledVenue, error: err_poker_venues_egixx } = await getSupabase()
          .from('poker_venues')
          .update({
                commander_enabled: true,
                commander_tier: metadata.tier || 'home_game'
            })
            .eq('id', venueId)
            .select('id');
        if (err_poker_venues_egixx) {
            console.error('[stripe-webhook] Commander enable FAILED for venue', venueId, '- venue is billed but the feature is off:', err_poker_venues_egixx.message);
            throw err_poker_venues_egixx;
        }
        if (!enabledVenue || enabledVenue.length === 0) {
            const msg = `[stripe-webhook] Commander enable MATCHED ZERO ROWS for venue ${venueId} - the venue is being billed and the feature was never switched on. Throwing so Stripe retries.`;
            console.error(msg);
            throw new Error(msg);
        }
    }
}

async function handleCommanderSubscriptionCanceled(subscription) {
    const { id, canceled_at, metadata } = subscription;
    const venueId = metadata?.venue_id;

    const { error: err_commander_subscriptions_d4cvb } = await getSupabase()

      .from('commander_subscriptions')

      .update({
            status: 'canceled',
            canceled_at: canceled_at ? new Date(canceled_at * 1000).toISOString() : new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', id);

    // silent-write-ok: bookkeeping record, not the entitlement. The gate
    // that actually grants or revokes access is handled separately above;
    // a miss here leaves the subscription ledger stale, which is worth
    // seeing but must not 500 a webhook and trigger three days of retries.
    if (err_commander_subscriptions_d4cvb) console.error('[stripe-webhook] commander_subscriptions cancellation write failed:', err_commander_subscriptions_d4cvb.message);

    if (venueId) {
        // Mirror of the enable above. A miss here leaves a cancelled venue
        // holding a paid feature indefinitely, which no log would have shown.
        const { data: disabledVenue, error: err_poker_venues_27pnr } = await getSupabase()
          .from('poker_venues')
          .update({ commander_enabled: false })
            .eq('id', venueId)
            .select('id');
        if (err_poker_venues_27pnr) {
            console.error('[stripe-webhook] Commander disable FAILED for venue', venueId, '- cancelled venue may retain the paid feature:', err_poker_venues_27pnr.message);
            throw err_poker_venues_27pnr;
        }
        if (!disabledVenue || disabledVenue.length === 0) {
            console.error('[stripe-webhook] Commander disable MATCHED ZERO ROWS for venue', venueId, '- a cancelled venue may still hold the paid feature.');
        }
    }
}

// Disable default body parser - we need raw body for signature verification
export const config = {
    api: {
        bodyParser: false
    }
};
