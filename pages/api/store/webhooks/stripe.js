/**
 * Stripe Webhook Handler for Diamond Store
 * POST /api/store/webhooks/stripe
 * Handles Stripe webhook events for purchases and subscriptions
 */
import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        // Get raw body for signature verification
        const rawBody = await getRawBody(req);

        // If Stripe is configured, verify signature
        if (endpointSecret && sig) {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
        } else {
            // For testing without signature verification
            event = JSON.parse(rawBody.toString());
            console.warn('⚠️  Webhook signature verification skipped - configure STRIPE_WEBHOOK_SECRET');
        }
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    // Handle the event
    try {
        console.log(`📨 Received Stripe event: ${event.type}`);

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
                console.log(`Unhandled event type: ${event.type}`);
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook handler error:', error);
        return res.status(500).json({ error: 'Webhook handler failed' });
    }
}

async function handleCheckoutCompleted(session) {
    const { id, customer, metadata, mode, amount_total } = session;

    console.log(`✅ Checkout completed: ${id} (${mode})`);

    if (mode === 'payment') {
        // One-time payment (diamonds or merchandise)
        if (metadata.type === 'diamonds' && metadata.purchase_id) {
            // Complete diamond purchase
            const { data: purchase } = await supabase
                .from('diamond_purchases')
                .update({
                    status: 'completed',
                    stripe_checkout_session_id: id,
                    completed_at: new Date().toISOString()
                })
                .eq('id', metadata.purchase_id)
                .select()
                .single();

            if (purchase) {
                // Add diamonds to user balance
                const totalDiamonds = purchase.diamonds_amount + (purchase.bonus_diamonds || 0);
                await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: metadata.user_id,
                    p_amount: totalDiamonds
                });

                console.log(`💎 Added ${totalDiamonds} diamonds to user ${metadata.user_id}`);
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

            console.log(`📦 Merchandise order ${metadata.order_id} is processing`);
        }
    }
}

async function handleSubscriptionUpdate(subscription) {
    const { id, customer, status, metadata, current_period_start, current_period_end, cancel_at_period_end } = subscription;

    console.log(`🔄 Subscription updated: ${id} -> ${status}`);

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

    console.log(`👑 VIP subscription updated for user ${profile.id}`);
}

async function handleSubscriptionCanceled(subscription) {
    const { id, canceled_at } = subscription;

    console.log(`❌ Subscription canceled: ${id}`);

    await supabase
        .from('vip_subscriptions')
        .update({
            status: 'canceled',
            canceled_at: new Date(canceled_at * 1000).toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', id);
}

async function handleInvoicePaymentSucceeded(invoice) {
    const { subscription, customer } = invoice;

    if (subscription) {
        console.log(`💰 Invoice paid for subscription ${subscription}`);
        // Subscription renewal - already handled by subscription.updated event
    }
}

async function handleInvoicePaymentFailed(invoice) {
    const { subscription, customer, attempt_count } = invoice;

    console.log(`⚠️  Invoice payment failed for subscription ${subscription} (attempt ${attempt_count})`);

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

    console.log(`💸 Refund processed: ${id} for $${amount_refunded / 100}`);

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
            p_amount: -totalDiamonds
        });

        console.log(`💎 Removed ${totalDiamonds} diamonds from user ${purchase.user_id}`);
    }
}

// Disable default body parser - we need raw body for signature verification
export const config = {
    api: {
        bodyParser: false
    }
};
