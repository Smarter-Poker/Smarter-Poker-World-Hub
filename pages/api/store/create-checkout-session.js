/**
 * Create Stripe Checkout Session
 * POST /api/store/create-checkout-session
 * Creates a Stripe checkout session for diamonds, VIP, or merchandise
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
        });
    }

    // Check if Stripe is configured
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

    if (!stripeSecretKey || !stripePublishableKey) {
        return res.status(503).json({
            success: false,
            error: {
                code: 'PAYMENTS_NOT_CONFIGURED',
                message: 'Payment processing is not yet configured. Please contact support.',
                details: 'Stripe keys are missing from environment variables'
            }
        });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
            });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
            });
        }

        const { type, items, successUrl, cancelUrl } = req.body;

        if (!type || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_FIELDS', message: 'type and items array required' }
            });
        }

        // Initialize Stripe
        const stripe = require('stripe')(stripeSecretKey);

        // Get or create Stripe customer
        let customerId;
        const { data: profile } = await supabase
            .from('profiles')
            .select('stripe_customer_id, email, username')
            .eq('id', user.id)
            .single();

        if (profile?.stripe_customer_id) {
            customerId = profile.stripe_customer_id;
        } else {
            const customer = await stripe.customers.create({
                email: profile?.email || user.email,
                metadata: {
                    smarter_poker_id: user.id,
                    username: profile?.username
                }
            });
            customerId = customer.id;

            // Save customer ID to profile
            await supabase
                .from('profiles')
                .update({ stripe_customer_id: customerId })
                .eq('id', user.id);
        }

        let sessionConfig = {
            customer: customerId,
            mode: type === 'subscription' ? 'subscription' : 'payment',
            success_url: successUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/hub/diamond-store?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/hub/diamond-store?canceled=true`,
            metadata: {
                user_id: user.id,
                type: type
            }
        };

        // Build line items based on type
        if (type === 'diamonds') {
            // Diamond purchase - one-time payment
            sessionConfig.line_items = items.map(item => ({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: item.name,
                        description: `${item.diamonds} Diamonds${item.bonus ? ` + ${item.bonus} Bonus` : ''}`,
                        images: ['https://smarter.poker/images/diamond-icon.png']
                    },
                    unit_amount: Math.round(item.price * 100) // Convert to cents
                },
                quantity: item.quantity || 1
            }));

            // Create pending purchase record
            const { data: purchase } = await supabase
                .from('diamond_purchases')
                .insert({
                    user_id: user.id,
                    package_name: items[0].name,
                    diamonds_amount: items[0].diamonds,
                    bonus_diamonds: items[0].bonus || 0,
                    price_usd: items[0].price,
                    status: 'pending'
                })
                .select()
                .single();

            sessionConfig.metadata.purchase_id = purchase.id;

        } else if (type === 'subscription') {
            // VIP subscription
            const item = items[0];

            if (!item.priceId) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'MISSING_PRICE_ID', message: 'Stripe price ID required for subscriptions' }
                });
            }

            sessionConfig.line_items = [{
                price: item.priceId,
                quantity: 1
            }];

            sessionConfig.metadata.vip_tier = item.tier;

        } else if (type === 'merchandise') {
            // Merchandise order - one-time payment
            sessionConfig.line_items = items.map(item => ({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: item.name,
                        description: item.description,
                        images: item.image ? [item.image] : []
                    },
                    unit_amount: Math.round(item.price * 100)
                },
                quantity: item.quantity || 1
            }));

            // Create pending order record
            const totalUsd = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

            const { data: order } = await supabase
                .from('merchandise_orders')
                .insert({
                    user_id: user.id,
                    items: items,
                    total_usd: totalUsd,
                    status: 'pending'
                })
                .select()
                .single();

            sessionConfig.metadata.order_id = order.id;
            sessionConfig.shipping_address_collection = {
                allowed_countries: ['US', 'CA']
            };
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create(sessionConfig);

        return res.status(200).json({
            success: true,
            data: {
                session_id: session.id,
                url: session.url
            }
        });

    } catch (error) {
        console.error('Checkout session error:', error);
        return res.status(500).json({
            success: false,
            error: {
                code: 'CHECKOUT_ERROR',
                message: error.message || 'Failed to create checkout session'
            }
        });
    }
}
