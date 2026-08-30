/**
 * Stripe Webhook Handler for Diamond Store
 * POST /api/store/webhooks/stripe
 * Handles Stripe webhook events for purchases and subscriptions
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import Stripe from 'stripe';
import { reportApiError } from '../../../../src/lib/sentryWrap';
const {
    buildPrintfulItems,
    cancelPrintfulOrder,
    createPrintfulOrder,
    isAutoConfirmEnabled,
    normalizePrintfulRecipient,
    publicShippingAddress,
    sanitizeExternalOrderId,
} = require('../../../../src/lib/store/printfulFulfillment');

// Helper to read raw body from request stream
async function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
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

      let event;

      try {
          // Get raw body for signature verification
          const rawBody = await getRawBody(req);

          // SECURITY: Signature verification is REQUIRED.
          // If webhook secret is not configured, reject all events.
          if (!endpointSecret) {
              console.warn('STRIPE_WEBHOOK_SECRET not configured — rejecting webhook');
              return res.status(500).json({ error: 'Webhook secret not configured' });
          }
          if (!sig) {
              return res.status(400).json({ error: 'Missing stripe-signature header' });
          }
          if (!stripe) {
              return res.status(500).json({ error: 'Stripe not configured' });
          }

          event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
      } catch (err) {
          console.warn('Webhook signature verification failed:', err.message);
          return res.status(400).json({ error: `Webhook Error: ${err.message}` });
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
      // A claim failure is NOT treated as a replay: if the ledger write itself
      // errors we fall through and process the event, because dropping a paid
      // event is far worse than handling one twice through guards that already
      // exist.
      // ═════════════════════════════════════════════════════════════════════
      if (event?.id) {
          const { data: claim, error: claimErr } = await getSupabase().rpc(
              'claim_stripe_webhook_event',
              { p_event_id: event.id, p_event_type: event.type, p_lease_seconds: 300 }
          );
          if (claimErr) {
              console.warn(`[stripe-webhook] could not claim event ${event.id}, processing anyway:`, claimErr.message);
          } else if (!claim?.claimed) {
              if (claim?.state === 'done') {
                  console.info(`[stripe-webhook] duplicate delivery of ${event.id} (${event.type}) — already processed`);
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
                  await handleSubscriptionUpdate(event.data.object);
                  break;

              case 'customer.subscription.deleted':
                  await handleSubscriptionCanceled(event.data.object);
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

              default:
          }

          if (event?.id) {
              const { error: completionError } = await getSupabase().rpc(
                  'complete_stripe_webhook_event',
                  { p_event_id: event.id }
              );
              if (completionError) throw completionError;
          }
          return res.status(200).json({ received: true });
      } catch (error) {
          console.warn('Webhook handler error:', error);
          // Hand the claim back. This event did NOT complete, and Stripe will
          // retry it — if the claim stayed, that retry would be dismissed as a
          // duplicate and the work would never happen. A claim must only
          // outlive a handler that actually succeeded.
          if (event?.id) {
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
                  console.error(`[stripe-webhook] FAILED TO RELEASE claim on ${event.id} — retries will be skipped:`, releaseErr?.message || releaseErr);
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
        // VIP subscription checkout completed

        try {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);

            // Set VIP on profile and link Stripe customer
            if (metadata?.user_id) {
                // ═══════════════════════════════════════════════════════════
                // vip_expires_at MUST be written here.
                //
                // /api/vip/check-status — the platform's single truth function
                // for "is this user VIP" — requires is_vip = true AND
                // (vip_tier = 'lifetime' OR vip_expires_at > now). A NULL
                // expiry on a non-lifetime tier is DELIBERATELY read as
                // expired, because "no end date" is not "never ends".
                //
                // This block previously set is_vip and vip_tier and never the
                // expiry, and nothing downstream backfilled it, so a paying
                // $19.99/mo or $199.99/yr subscriber got isVip:false from every
                // gate and was skipped by the 500 ◆ monthly stipend cron for
                // exactly that reason. Money taken, nothing granted. Nobody has
                // hit it yet only because no Stripe subscription has completed:
                // 0 profiles currently have a paid tier with a null expiry.
                //
                // current_period_end is seconds since epoch. The fallback keeps
                // a paying customer VIP for a period rather than instantly
                // lapsed if Stripe ever omits it.
                // ═══════════════════════════════════════════════════════════
                // .select() so a ZERO-ROW match is distinguishable from a
                // successful grant. This filters on metadata.user_id; if that id
                // is wrong, stale, or belongs to a deleted profile, PostgREST
                // returns { data: null, error: null } -- the error branch below
                // never fires, the handler returns 200, and Stripe NEVER RETRIES.
                // The customer paid and is granted nothing, permanently.
                //
                // This is also the ONLY place profiles.stripe_customer_id gets
                // written from a webhook, so a miss here strands every later
                // renewal and cancellation too: those filter on
                // stripe_customer_id, which stays null forever. As this was
                // written, 0 of 1022 profiles had one.
                const { data: grantedRows, error: err_profiles_yhokl } = await getSupabase()
                  .from('profiles')
                  .update({
                        stripe_customer_id: customer,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', metadata.user_id)
                    .select('id');
                if (err_profiles_yhokl) {
                    // Paid VIP grant must not be silently lost — throw so Stripe retries.
                    console.warn('[stripe-webhook] VIP profile grant failed for user', metadata.user_id, '— Stripe will retry:', err_profiles_yhokl.message);
                    throw err_profiles_yhokl;
                }
                if (!grantedRows || grantedRows.length === 0) {
                    const msg = `[stripe-webhook] VIP GRANT MATCHED ZERO ROWS for user ${metadata.user_id} (customer ${customer}). `
                        + 'Payment succeeded and NOTHING was granted. Throwing so Stripe retries.';
                    console.error(msg);
                    throw new Error(msg);
                }

            }

            // Create/update vip_subscriptions record
            await handleSubscriptionUpdate(subscription);
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

async function handleCheckoutExpired(session) {
    const metadata = session?.metadata || {};

    if (metadata.type === 'diamonds' && metadata.purchase_id) {
        const { data: updatedRows, error } = await getSupabase()
            .from('diamond_purchases')
            .update({ status: 'failed', stripe_checkout_session_id: session.id })
            .eq('id', metadata.purchase_id)
            .eq('status', 'pending')
            .select('id');
        if (error) {
            console.warn('[stripe-webhook] expired diamond checkout cleanup failed:', error.message);
            throw error;
        }
        if (!updatedRows?.length) {
            console.info('[stripe-webhook] expired diamond checkout was already terminal or missing');
        }
    }

    if (metadata.type === 'merchandise' && metadata.order_id) {
        const { data: updatedRows, error } = await getSupabase()
            .from('merchandise_orders')
            .update({
                status: 'canceled',
                stripe_checkout_session_id: session.id,
                updated_at: new Date().toISOString(),
            })
            .eq('id', metadata.order_id)
            .eq('status', 'pending')
            .select('id');
        if (error) {
            console.warn('[stripe-webhook] expired merchandise checkout cleanup failed:', error.message);
            throw error;
        }
        if (!updatedRows?.length) {
            console.info('[stripe-webhook] expired merchandise checkout was already terminal or missing');
        }
    }
}

async function handleSubscriptionUpdate(subscription) {
    const { id, customer, status, metadata, current_period_start, current_period_end, cancel_at_period_end } = subscription;

    if (metadata?.venue_id) {
        return handleCommanderSubscriptionUpdate(subscription);
    }

    // Get user ID from customer
    // `let`, not `const`: the !profile branch below can recover the profile
    // through Stripe customer metadata and reassign it.
    let { data: profile, error: profileLookupError } = await getSupabase()
        .from('profiles')
        // vip_tier is read so a renewal cannot silently downgrade an annual
        // subscriber to 'monthly' when Stripe metadata does not carry the tier.
        .select('id, vip_expires_at, vip_tier')
        .eq('stripe_customer_id', customer)
        .maybeSingle();
    if (profileLookupError) throw profileLookupError;

    if (!profile) {
        // This returned 200 having done nothing, so Stripe never retried and the
        // renewal was lost in silence.
        //
        // The lookup filters profiles.stripe_customer_id, which is written in
        // exactly two places: create-checkout-session and the checkout-completed
        // handler above. If either missed, this is null forever and EVERY
        // renewal for that customer lands here. As this was written, 0 of 1022
        // profiles had a stripe_customer_id, so this branch was the norm rather
        // than the exception.
        //
        // Recover through Stripe itself: customers are created with
        // metadata.smarter_poker_id, so the customer object can identify the
        // user even when our column is empty. Backfill the column while we are
        // here, so the next renewal takes the fast path.
        let recovered = null;
        try {
            const stripeCustomer = await stripe.customers.retrieve(customer);
            const recoveredUserId = stripeCustomer?.metadata?.smarter_poker_id;
            if (recoveredUserId) {
                const { data: backfilled, error: backfillError } = await getSupabase()
                    .from('profiles')
                    .update({ stripe_customer_id: customer, updated_at: new Date().toISOString() })
                    .eq('id', recoveredUserId)
                    .select('id, vip_expires_at, vip_tier');
                if (backfillError) throw backfillError;
                if (backfilled && backfilled.length) {
                    recovered = backfilled[0];
                    console.warn(`[stripe-webhook] recovered customer ${customer} -> profile ${recovered.id} via Stripe metadata and backfilled stripe_customer_id`);
                }
            }
        } catch (recoverErr) {
            console.warn(`[stripe-webhook] customer recovery failed for ${customer}:`, recoverErr?.message || recoverErr);
        }

        if (!recovered) {
            // Genuinely unresolvable. Throw rather than return so the webhook
            // 500s and Stripe retries -- a subscription event that changes a
            // paying customer's entitlement must not be dropped on the floor.
            const msg = `[stripe-webhook] no profile for customer ${customer} and Stripe metadata could not resolve one — subscription update DROPPED.`;
            console.error(msg);
            throw new Error(msg);
        }
        profile = recovered;
    }

    // Upsert subscription record
    const { error: err_vip_subscriptions_1w1zg } = await getSupabase()
      .from('vip_subscriptions')
      .upsert({
            stripe_subscription_id: id,
            user_id: profile.id,
            stripe_customer_id: customer,
            tier: metadata?.vip_tier || 'monthly',
            status: status,
            price_usd: subscription.items.data[0]?.price?.unit_amount / 100 || 0,
            current_period_start: new Date(current_period_start * 1000).toISOString(),
            current_period_end: new Date(current_period_end * 1000).toISOString(),
            cancel_at_period_end: cancel_at_period_end,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'stripe_subscription_id'
        });
    if (err_vip_subscriptions_1w1zg) {
        // Money-tied state transition — throw so Stripe retries instead of dropping it.
        console.warn('[stripe-webhook] vip_subscriptions upsert failed for', id, '— Stripe will retry:', err_vip_subscriptions_1w1zg.message);
        throw err_vip_subscriptions_1w1zg;
    }

    // Keep profiles.is_vip in sync with the subscription status so failed
    // payments (past_due/unpaid) revoke VIP and recovered payments restore it.
    // A separately purchased daily pass (vip_expires_at in the future) is respected.
    const isActiveStatus = status === 'active' || status === 'trialing';
    if (isActiveStatus) {
        // Push vip_expires_at forward on every renewal. is_vip alone is not
        // enough for /api/vip/check-status: it also requires an expiry in the
        // future, so syncing only the flag would leave a paying subscriber
        // reading as lapsed the moment their first period ended. The tier is
        // written too, so a plan change (monthly -> annual) is reflected rather
        // than leaving the profile on a stale tier.
        const renewalExpiry = new Date(current_period_end * 1000).toISOString();
        const existingExpiryMs = profile.vip_expires_at ? Date.parse(profile.vip_expires_at) : 0;
        const renewalExpiryMs = Date.parse(renewalExpiry);
        const preservesLifetime = profile.vip_tier === 'lifetime';
        const preservesPrepaidExtension = Number.isFinite(existingExpiryMs)
            && existingExpiryMs > renewalExpiryMs;
        const tierRank = { daily: 1, monthly: 2, annual: 3, lifetime: 4 };
        const renewalTier = metadata?.vip_tier || 'monthly';
        const effectiveTier = preservesLifetime
            ? 'lifetime'
            : preservesPrepaidExtension
            && (tierRank[profile.vip_tier] || 0) > (tierRank[renewalTier] || 0)
            ? profile.vip_tier
            : renewalTier;
        const { data: vipSyncRows, error: vipSyncErr } = await getSupabase()
            .from('profiles')
            .update({
                is_vip: true,
                vip_tier: effectiveTier,
                vip_expires_at: preservesLifetime || preservesPrepaidExtension
                    ? profile.vip_expires_at
                    : renewalExpiry,
                updated_at: new Date().toISOString(),
            })
            .eq('id', profile.id)
            .select('id');
        if (vipSyncErr) console.warn('[stripe-webhook] Failed to sync is_vip=true for', profile.id, vipSyncErr.message);
        else if (!vipSyncRows || vipSyncRows.length === 0) {
            // A renewal that writes nothing leaves vip_expires_at in the past,
            // and /api/vip/check-status reads that as lapsed. The subscriber is
            // paying and gated out. Throw so Stripe retries rather than 200.
            const msg = `[stripe-webhook] VIP RENEWAL MATCHED ZERO ROWS for profile ${profile.id} — paying subscriber will read as lapsed.`;
            console.error(msg);
            throw new Error(msg);
        }
    } else {
        const hasActiveDailyPass = profile.vip_tier === 'lifetime'
            || (profile.vip_expires_at && new Date(profile.vip_expires_at) > new Date());
        if (!hasActiveDailyPass) {
            const { data: revokedSync, error: vipSyncErr } = await getSupabase()
                .from('profiles')
                .update({ is_vip: false, updated_at: new Date().toISOString() })
                .eq('id', profile.id)
                .select('id');
            if (vipSyncErr) console.warn('[stripe-webhook] Failed to sync is_vip=false for', profile.id, vipSyncErr.message);
            else if (!revokedSync || revokedSync.length === 0) {
                // Not fatal -- the entitlement gate also checks vip_expires_at,
                // so a stale is_vip alone does not grant access. Still logged,
                // because it means the profile vanished mid-handler.
                console.warn('[stripe-webhook] is_vip=false sync matched zero rows for', profile.id);
            }
        }
    }
}

async function handleSubscriptionCanceled(subscription) {
    const { id, customer, canceled_at, metadata } = subscription;

    if (metadata?.venue_id) {
        return handleCommanderSubscriptionCanceled(subscription);
    }

    // Guard: canceled_at can be missing on some payloads — don't write 1970-01-01
    const canceledAtIso = canceled_at ? new Date(canceled_at * 1000).toISOString() : new Date().toISOString();

    const { error: err_vip_subscriptions_s2gv2 } = await getSupabase()

      .from('vip_subscriptions')

      .update({
            status: 'canceled',
            canceled_at: canceledAtIso,
            updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', id);

    if (err_vip_subscriptions_s2gv2) {
        console.warn('[stripe-webhook] vip_subscriptions cancel update failed for', id, '— Stripe will retry:', err_vip_subscriptions_s2gv2.message);
        throw err_vip_subscriptions_s2gv2;
    }

    // Clear VIP on the profile — but NOT if a separately purchased pass is
    // still running.
    //
    // This used to blanket-set is_vip=false and vip_tier=null for the whole
    // stripe_customer_id with no expiry check, so a user who had ALSO bought a
    // VIP pass with diamonds lost the pass they paid for the moment they
    // cancelled an unrelated card subscription. handleSubscriptionUpdate
    // already respects an active vip_expires_at for exactly this reason; the
    // cancel path never got the same treatment.
    if (customer) {
        const { data: profile, error: profileReadError } = await getSupabase()
            .from('profiles')
            .select('id, vip_expires_at, vip_tier')
            .eq('stripe_customer_id', customer)
            .maybeSingle();
        if (profileReadError) throw profileReadError;

        const hasActivePaidPass = profile?.vip_tier === 'lifetime'
            || (profile?.vip_expires_at && new Date(profile.vip_expires_at) > new Date());

        const profileUpdate = hasActivePaidPass
            // Record the cancellation, keep the entitlement they still own.
            ? { vip_canceled_at: canceledAtIso, updated_at: new Date().toISOString() }
            : { is_vip: false, vip_tier: null, vip_expires_at: null, vip_canceled_at: canceledAtIso, updated_at: new Date().toISOString() };

        if (hasActivePaidPass) {
            console.info(`[stripe-webhook] subscription ${id} cancelled but customer ${customer} keeps VIP until ${profile.vip_expires_at || 'lifetime'}`);
        }

        // Filters stripe_customer_id, which is empty on every profile as this
        // was written -- so this revoke matched zero rows every time and a
        // cancelled subscriber kept VIP indefinitely. That is a revenue leak
        // that no log would ever have shown.
        const { data: revokedRows, error: err_profiles_odw9b } = await getSupabase()
          .from('profiles')
          .update(profileUpdate)
            .eq('stripe_customer_id', customer)
            .select('id');
        if (!err_profiles_odw9b && (!revokedRows || revokedRows.length === 0)) {
            const msg = `[stripe-webhook] VIP REVOKE MATCHED ZERO ROWS for customer ${customer} — a cancelled subscriber may still hold VIP. Throwing so Stripe retries.`;
            console.error(msg);
            throw new Error(msg);
        }
        if (err_profiles_odw9b) {
            console.warn('[stripe-webhook] profile VIP revoke failed for customer', customer, '— Stripe will retry:', err_profiles_odw9b.message);
            throw err_profiles_odw9b;
        }

    }
}

async function handleInvoicePaymentSucceeded(invoice) {
    const { subscription } = invoice;

    if (subscription) {
        // Subscription renewal - already handled by subscription.updated event
    }
}

async function handleInvoicePaymentFailed(invoice) {
    const { subscription } = invoice;


    if (subscription) {
        const { data: cmdrSub } = await getSupabase()
            .from('commander_subscriptions')
            .select('id')
            .eq('stripe_subscription_id', subscription)
            .maybeSingle();

        if (cmdrSub) {
            const { error: err_commander_subscriptions_20wa8 } = await getSupabase()
              .from('commander_subscriptions')
              .update({
                    status: 'past_due',
                    updated_at: new Date().toISOString()
                })
                .eq('stripe_subscription_id', subscription);
            // silent-write-ok: bookkeeping record, not the entitlement. The gate
    // that actually grants or revokes access is handled separately above;
    // a miss here leaves the subscription ledger stale, which is worth
    // seeing but must not 500 a webhook and trigger three days of retries.
    if (err_commander_subscriptions_20wa8) console.error('[stripe-webhook] commander_subscriptions past_due write failed:', err_commander_subscriptions_20wa8.message);
            return;
        }

        const { error: err_vip_subscriptions_gg0nj } = await getSupabase()

          .from('vip_subscriptions')

          .update({
                status: 'past_due',
                updated_at: new Date().toISOString()
            })
            .eq('stripe_subscription_id', subscription);

        // silent-write-ok: bookkeeping record, not the entitlement. The gate
    // that actually grants or revokes access is handled separately above;
    // a miss here leaves the subscription ledger stale, which is worth
    // seeing but must not 500 a webhook and trigger three days of retries.
    if (err_vip_subscriptions_gg0nj) console.error('[stripe-webhook] vip_subscriptions past_due write failed:', err_vip_subscriptions_gg0nj.message);
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
            const msg = `[stripe-webhook] Commander enable MATCHED ZERO ROWS for venue ${venueId} — the venue is being billed and the feature was never switched on. Throwing so Stripe retries.`;
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
