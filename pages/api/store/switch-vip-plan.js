import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * SWITCH VIP PLAN — monthly <-> yearly, prorated.
 * POST /api/store/switch-vip-plan   body: { plan: 'monthly' | 'yearly' }
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ═══════════════════════════════════════════════════════════════════════════
 * The VIP FAQ has promised a prorated credit on upgrade for as long as the
 * page has existed, and there was no route behind it: issue #771 item 6 found
 * that `stripe.subscriptions.update` appeared exactly once in this repo, in
 * cancel-vip.js, and `proration_behavior` appeared nowhere at all. Switching
 * was manual — meaning it did not happen, and a member who wanted to upgrade
 * had to cancel and re-subscribe, losing their remaining paid time.
 *
 * Dan 2026-08-27 ruled: "BUILD IN THIS FUNCTIONALITY."
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW THE PRORATION WORKS, AND WHY IT IS `create_prorations`
 * ═══════════════════════════════════════════════════════════════════════════
 * Stripe offers three behaviours. This route uses `create_prorations`, which
 * credits the unused remainder of the current period against the new plan and
 * bills the difference on the NEXT invoice rather than charging immediately:
 *
 *   create_prorations   credit + charge appear as line items on the next
 *                       invoice. An upgrade mid-month is not a surprise
 *                       charge; a downgrade is not a surprise refund request.
 *   always_invoice      bills the difference IMMEDIATELY. Rejected: an
 *                       upgrade would take money the member did not expect to
 *                       be taken today, which is the single most common
 *                       trigger for a chargeback on a subscription product.
 *   none                no credit at all. That is the behaviour the FAQ
 *                       promised we do NOT have. Rejected outright.
 *
 * The subscription's billing anchor is deliberately NOT reset: a member
 * upgrading on day 20 of a month keeps their existing renewal date and the 10
 * unused days become a credit. Resetting the anchor would silently extend or
 * shorten the period they already paid for.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS ROUTE DOES NOT DO
 * ═══════════════════════════════════════════════════════════════════════════
 * It does not write `profiles.is_vip`, `vip_tier` or `vip_expires_at`, and it
 * does not touch the local `vip_subscriptions` tier. THE WEBHOOK OWNS THAT.
 * `customer.subscription.updated` already fires on a plan change and already
 * writes all of it (pages/api/store/webhooks/stripe.js). Writing it here as
 * well would create a second writer racing the first — the exact defect shape
 * this estate has paid for repeatedly. This route changes Stripe and lets the
 * webhook change us.
 *
 * The only local write is an audit row, which is not authoritative state.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import Stripe from 'stripe';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { vipStripePriceMismatch } from '../../../src/lib/store/vipStripePrice.mjs';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn('[switch-vip-plan] SUPABASE_SERVICE_ROLE_KEY missing - falling back to anon key; writes may be silently blocked by RLS');
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
        timeout: 15000,
        maxNetworkRetries: 2,
        telemetry: false,
    })
    : null;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Kept in step with VIP_SUBSCRIPTION_PLANS in create-checkout-session.js.
 * Same amounts, same env vars, same reasoning: the price is resolved SERVER
 * SIDE from a plan key, never read from the request body, so a client can ask
 * to switch plans but can never name a price.
 */
const VIP_PLANS = {
    monthly: {
        tier: 'monthly',
        envVar: 'STRIPE_VIP_MONTHLY_PRICE_ID',
        unitAmount: 1999,
        interval: 'month',
        label: 'Smarter.Poker VIP - Monthly',
    },
    yearly: {
        tier: 'yearly',
        envVar: 'STRIPE_VIP_YEARLY_PRICE_ID',
        unitAmount: 19999,
        interval: 'year',
        label: 'Smarter.Poker VIP - Yearly',
    },
};

export default async function handler(req, res) {
    try {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Vary', 'Authorization');
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // ── Auth: identity comes from the JWT, never the body ──
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
        const userId = user.id;

        const clientKey = req.headers['x-idempotency-key'];
        if (typeof clientKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(clientKey.trim())) {
            return res.status(400).json({ success: false, error: 'A valid X-Idempotency-Key header is required' });
        }

        const body = req.body || {};
        if (JSON.stringify(body).length > 512) {
            return res.status(413).json({ success: false, error: 'Request body too large' });
        }
        const unknownFields = Object.keys(body).filter((key) => key !== 'plan');
        if (unknownFields.length) {
            return res.status(400).json({ success: false, error: `Unknown fields: ${unknownFields.join(', ')}` });
        }
        const requested = String(body.plan || '').toLowerCase();
        const target = VIP_PLANS[requested];
        if (!target) {
            return res.status(400).json({
                success: false,
                error: 'Choose either the monthly or the yearly plan',
            });
        }

        if (!stripe) {
            // Never claim a plan changed while billing is untouched.
            console.warn('[switch-vip-plan] STRIPE_SECRET_KEY missing - cannot switch plans');
            return res.status(503).json({
                success: false,
                error: 'Payment system unavailable. Please try again later or contact support.',
            });
        }

        // ── 1. The member's live subscription ──
        const { data: sub, error: subErr } = await getSupabase()
            .from('vip_subscriptions')
            .select('stripe_subscription_id, status, tier')
            .eq('user_id', userId)
            .in('status', ['active', 'trialing'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (subErr) {
            console.warn('[switch-vip-plan] vip_subscriptions read failed:', subErr.message);
            return res.status(500).json({ success: false, error: 'Could not read your subscription' });
        }
        if (!sub || !sub.stripe_subscription_id) {
            return res.status(404).json({
                success: false,
                error: 'No active VIP subscription to switch. Start a subscription first.',
            });
        }
        // A diamond-bought VIP has no Stripe subscription to reprice — the
        // placeholder id ('diamond_<uid>_<ts>') is not a Stripe object, and
        // handing it to the API would 404 in a way that reads as our bug.
        if (String(sub.stripe_subscription_id).startsWith('diamond_')) {
            return res.status(400).json({
                success: false,
                error: 'Your VIP was bought with diamonds, so there is no billing plan to switch. It runs to its end date.',
            });
        }
        if (sub.tier === target.tier) {
            return res.status(400).json({ success: false, error: `You are already on the ${target.tier} plan` });
        }

        // ── 2. Read the live subscription to find the item being repriced ──
        const live = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
        if (!live || live.status === 'canceled') {
            return res.status(404).json({ success: false, error: 'That subscription is no longer active' });
        }
        const item = live.items?.data?.[0];
        if (!item?.id) {
            console.warn('[switch-vip-plan] subscription has no items:', sub.stripe_subscription_id);
            return res.status(500).json({ success: false, error: 'Could not read your plan details' });
        }

        const currentInterval = item.price?.recurring?.interval;
        if (currentInterval === target.interval) {
            return res.status(200).json({
                success: true,
                idempotent: true,
                tier: target.tier,
                status: live.status,
                nextInvoiceTotalCents: null,
                nextInvoiceDate: null,
                message: `You Are Already On The ${target.tier === 'yearly' ? 'Yearly' : 'Monthly'} Plan.`,
            });
        }

        // ── 3. The new price: a managed price object if one is configured,
        //       otherwise an inline one built from server constants. Same
        //       fallback create-checkout-session.js uses, and for the same
        //       reason: neither VIP price id has ever been set in any
        //       environment, and refusing the switch over a missing env var
        //       would reproduce the outage that fallback was written to end.
        const configuredPriceId = process.env[target.envVar];
        if (configuredPriceId) {
            let configuredPrice;
            try {
                configuredPrice = await stripe.prices.retrieve(configuredPriceId);
            } catch (priceError) {
                console.warn('[switch-vip-plan] configured price could not be read:', priceError?.message || priceError);
                return res.status(503).json({
                    success: false,
                    error: 'The Selected VIP Billing Plan Is Not Available Right Now.',
                });
            }
            const priceMismatch = vipStripePriceMismatch(configuredPrice, target);
            if (priceMismatch) {
                console.warn('[switch-vip-plan] configured price failed verification:', priceMismatch);
                return res.status(503).json({
                    success: false,
                    error: 'The Selected VIP Billing Plan Is Not Available Right Now.',
                });
            }
        }
        const priceField = configuredPriceId
            ? { price: configuredPriceId }
            : {
                price_data: {
                    currency: 'usd',
                    product: live.items.data[0].price?.product,
                    unit_amount: target.unitAmount,
                    recurring: { interval: target.interval },
                },
            };

        // ── 4. Switch, prorated. See the header for why create_prorations. ──
        const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
            items: [{ id: item.id, ...priceField }],
            proration_behavior: 'create_prorations',
            // A member who had scheduled a cancellation and then upgrades is
            // telling us they are staying. Honour that rather than switching
            // the plan of a subscription that is still set to expire.
            cancel_at_period_end: false,
            metadata: {
                ...(live.metadata || {}),
                vip_tier: target.tier,
                plan_switched_at: new Date().toISOString(),
                plan_switched_from: sub.tier || 'unknown',
            },
        }, { idempotencyKey: `vip-switch:${userId}:${clientKey.trim()}` });

        // ── 5. Tell the member what actually happens, in their terms ──
        //       The upcoming invoice is the truth about the credit. If it
        //       cannot be read the switch has still happened, so this must
        //       never fail the request.
        let nextInvoiceTotalCents = null;
        let nextInvoiceDate = null;
        try {
            const upcoming = await stripe.invoices.retrieveUpcoming({
                customer: live.customer,
                subscription: sub.stripe_subscription_id,
            });
            nextInvoiceTotalCents = typeof upcoming?.total === 'number' ? upcoming.total : null;
            nextInvoiceDate = upcoming?.next_payment_attempt
                ? new Date(upcoming.next_payment_attempt * 1000).toISOString()
                : null;
        } catch (invErr) {
            console.warn('[switch-vip-plan] upcoming invoice unreadable:', invErr?.message || invErr);
        }

        // ── 6. Audit only. The WEBHOOK owns is_vip / vip_tier /
        //       vip_expires_at and the vip_subscriptions tier — see the header.
        try {
            await getSupabase().from('vip_plan_switches').insert({
                user_id: userId,
                stripe_subscription_id: sub.stripe_subscription_id,
                from_tier: sub.tier || null,
                to_tier: target.tier,
                proration_behavior: 'create_prorations',
                next_invoice_total_cents: nextInvoiceTotalCents,
            });
        } catch (auditErr) {
            // An audit row is not worth failing a completed billing change.
            console.warn('[switch-vip-plan] audit insert failed:', auditErr?.message || auditErr);
        }

        return res.status(200).json({
            success: true,
            tier: target.tier,
            status: updated?.status || live.status,
            nextInvoiceTotalCents,
            nextInvoiceDate,
            message:
                target.tier === 'yearly'
                    ? 'You Are On The Yearly Plan. Your Unused Monthly Time Is Credited To Your Next Invoice.'
                    : 'You Are On The Monthly Plan. Your Unused Yearly Time Is Credited To Your Next Invoice.',
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
        console.warn('[switch-vip-plan] error:', err?.message || err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Could not switch your plan. Nothing was charged.' });
        }
    }
}
