/**
 * Stripe Webhook Handler for Diamond Store
 * POST /api/store/webhooks/stripe
 * Handles Stripe webhook events for purchases and subscriptions
 */
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

// Helper to read raw body from request stream
async function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

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
            console.error('STRIPE_WEBHOOK_SECRET not configured — rejecting webhook');
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
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    // Handle the event
    try {

        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object);
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

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook handler error:', error);
        return res.status(500).json({ error: 'Webhook handler failed' });
    }
}

async function handleCheckoutCompleted(session) {
    const { id, customer, metadata, mode, amount_total } = session;


    if (mode === 'payment') {
        // One-time payment (diamonds or merchandise)
        if (metadata.type === 'diamonds' && metadata.purchase_id) {
            // IDEMPOTENCY: Only credit diamonds if purchase was still pending
            const { data: purchase } = await supabase
                .from('diamond_purchases')
                .update({
                    status: 'completed',
                    stripe_checkout_session_id: id,
                    stripe_payment_intent_id: session.payment_intent || null,
                    completed_at: new Date().toISOString()
                })
                .eq('id', metadata.purchase_id)
                .eq('status', 'pending') // Only update if still pending — prevents double-credit on retries
                .select()
                .single();

            if (purchase) {
                // Add diamonds to user balance
                const totalDiamonds = purchase.diamonds_amount + (purchase.bonus_diamonds || 0);
                await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: metadata.user_id,
                    p_amount: totalDiamonds,
                    p_type: 'purchase',
                    p_description: `Purchased ${purchase.package_name} (${totalDiamonds} diamonds)`,
                    p_reference_id: metadata.purchase_id
                });

            }
        } else if (metadata.type === 'merchandise' && metadata.order_id) {
            // Update merchandise order
            await supabase
                .from('merchandise_orders')
                .update({
                    status: 'processing',
                    stripe_checkout_session_id: id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', metadata.order_id);

        }
    } else if (mode === 'subscription') {
        // VIP subscription checkout completed

        try {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);

            // Set VIP on profile and link Stripe customer
            if (metadata.user_id) {
                await supabase
                    .from('profiles')
                    .update({
                        stripe_customer_id: customer,
                        is_vip: true,
                        vip_tier: metadata.vip_tier || 'monthly',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', metadata.user_id);

            }

            // Create/update vip_subscriptions record
            await handleSubscriptionUpdate(subscription);
        } catch (subErr) {
            console.error('Error processing VIP subscription checkout:', subErr);
        }
    }
}

async function handleSubscriptionUpdate(subscription) {
    const { id, customer, status, metadata, current_period_start, current_period_end, cancel_at_period_end } = subscription;


    // Get user ID from customer
    const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customer)
        .single();

    if (!profile) {
        console.error(`Profile not found for customer ${customer}`);
        return;
    }

    // Upsert subscription record
    await supabase
        .from('vip_subscriptions')
        .upsert({
            stripe_subscription_id: id,
            user_id: profile.id,
            stripe_customer_id: customer,
            tier: metadata.vip_tier || 'monthly',
            status: status,
            price_usd: subscription.items.data[0]?.price?.unit_amount / 100 || 0,
            current_period_start: new Date(current_period_start * 1000).toISOString(),
            current_period_end: new Date(current_period_end * 1000).toISOString(),
            cancel_at_period_end: cancel_at_period_end,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'stripe_subscription_id'
        });

}

async function handleSubscriptionCanceled(subscription) {
    const { id, customer, canceled_at } = subscription;


    await supabase
        .from('vip_subscriptions')
        .update({
            status: 'canceled',
            canceled_at: new Date(canceled_at * 1000).toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', id);

    // Also clear VIP status on profile
    if (customer) {
        await supabase
            .from('profiles')
            .update({
                is_vip: false,
                vip_tier: null,
                vip_canceled_at: new Date(canceled_at * 1000).toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('stripe_customer_id', customer);

    }
}

async function handleInvoicePaymentSucceeded(invoice) {
    const { subscription, customer } = invoice;

    if (subscription) {
        // Subscription renewal - already handled by subscription.updated event
    }
}

async function handleInvoicePaymentFailed(invoice) {
    const { subscription, customer, attempt_count } = invoice;


    if (subscription) {
        await supabase
            .from('vip_subscriptions')
            .update({
                status: 'past_due',
                updated_at: new Date().toISOString()
            })
            .eq('stripe_subscription_id', subscription);
    }
}

async function handleRefund(charge) {
    const { id, payment_intent, amount_refunded, metadata } = charge;


    // Find and update the purchase/order
    const { data: purchase } = await supabase
        .from('diamond_purchases')
        .select('*')
        .eq('stripe_payment_intent_id', payment_intent)
        .single();

    if (purchase) {
        await supabase
            .from('diamond_purchases')
            .update({
                status: 'refunded',
                refunded_at: new Date().toISOString()
            })
            .eq('id', purchase.id);

        // Deduct diamonds from user balance
        const totalDiamonds = purchase.diamonds_amount + (purchase.bonus_diamonds || 0);
        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: purchase.user_id,
            p_amount: -totalDiamonds,
            p_type: 'refund',
            p_description: `Refund — ${purchase.package_name} (${totalDiamonds} diamonds)`,
            p_reference_id: `refund_${purchase.id}`
        });

    }
}

// Disable default body parser - we need raw body for signature verification
export const config = {
    api: {
        bodyParser: false
    }
};
