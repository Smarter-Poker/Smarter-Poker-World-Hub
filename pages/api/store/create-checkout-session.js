/**
 * Create Stripe Checkout Session
 * POST /api/store/create-checkout-session
 * Creates a Stripe checkout session for diamonds, VIP, or merchandise
 */
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Stripe at module level (not inside handler)
// This ensures proper bundling in Vercel's serverless runtime
const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
        timeout: 15000,
        maxNetworkRetries: 2,
        telemetry: false
    })
    : null;

// ═══════════════════════════════════════════════════════════════
// SERVER-SIDE DIAMOND PACKAGE DEFINITIONS (source of truth)
// Client-submitted prices/amounts are NEVER trusted.
// ═══════════════════════════════════════════════════════════════
const VALID_DIAMOND_PACKAGES = {
    micro:    { diamonds: 100,   price: 1.00,   bonus: 0,    name: 'Micro' },
    small:    { diamonds: 500,   price: 5.00,   bonus: 0,    name: 'Small' },
    medium:   { diamonds: 1000,  price: 10.00,  bonus: 0,    name: 'Medium' },
    standard: { diamonds: 2500,  price: 25.00,  bonus: 0,    name: 'Standard' },
    large:    { diamonds: 5000,  price: 50.00,  bonus: 0,    name: 'Large' },
    value:    { diamonds: 10000, price: 100.00, bonus: 500,  name: 'Value' },
    premium:  { diamonds: 25000, price: 250.00, bonus: 1250, name: 'Premium' },
    whale:    { diamonds: 50000, price: 500.00, bonus: 2500, name: 'Whale' },
};

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

    if (!stripe || !stripePublishableKey) {
        console.error('[Checkout] Missing Stripe keys:', {
            hasStripe: !!stripe,
            hasPublishable: !!stripePublishableKey
        });
        return res.status(503).json({
            success: false,
            error: {
                code: 'PAYMENTS_NOT_CONFIGURED',
                message: 'Payment processing is not yet configured. Please contact support.',
                details: 'Stripe keys are missing from environment variables'
            }
        });
    }

    // Validate key format
    const keyPrefix = stripeSecretKey.substring(0, 7);
    console.log('[Checkout] Stripe key prefix:', keyPrefix, 'length:', stripeSecretKey.length);

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

        // Stripe is initialized at module level above

        // Get or create Stripe customer
        let customerId;
        const { data: profile } = await supabase
            .from('profiles')
            .select('stripe_customer_id, email, username')
            .eq('id', user.id)
            .single();

        if (profile?.stripe_customer_id) {
            customerId = profile.stripe_customer_id;
            console.log('[Checkout] Using existing Stripe customer:', customerId);
        } else {
            console.log('[Checkout] Creating new Stripe customer for:', user.email);
            try {
                const customer = await stripe.customers.create({
                    email: profile?.email || user.email,
                    metadata: {
                        smarter_poker_id: user.id,
                        username: profile?.username
                    }
                });
                customerId = customer.id;
                console.log('[Checkout] Created Stripe customer:', customerId);

                // Save customer ID to profile
                await supabase
                    .from('profiles')
                    .update({ stripe_customer_id: customerId })
                    .eq('id', user.id);
            } catch (customerError) {
                console.error('[Checkout] Failed to create Stripe customer:', {
                    type: customerError.type,
                    code: customerError.code,
                    statusCode: customerError.statusCode,
                    message: customerError.message
                });
                throw customerError;
            }
        }

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://smarter.poker';
        console.log('[Checkout] Using base URL:', baseUrl);

        let sessionConfig = {
            customer: customerId,
            mode: type === 'subscription' ? 'subscription' : 'payment',
            success_url: successUrl || `${baseUrl}/hub/diamond-store?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${baseUrl}/hub/diamond-store?canceled=true`,
            metadata: {
                user_id: user.id,
                type: type
            }
        };

        // Build line items based on type
        if (type === 'diamonds') {
            // Diamond purchase - one-time payment
            // SECURITY: Validate against server-side package definitions
            const clientItem = items[0];
            const packageId = clientItem?.id || clientItem?.packageId;
            const serverPackage = VALID_DIAMOND_PACKAGES[packageId];

            if (!serverPackage) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_PACKAGE', message: `Unknown diamond package: ${packageId}` }
                });
            }

            // Use SERVER-SIDE values only — never trust client amounts
            sessionConfig.line_items = [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: serverPackage.name,
                        description: `${serverPackage.diamonds} Diamonds${serverPackage.bonus ? ` + ${serverPackage.bonus} Bonus` : ''}`,
                        images: ['https://smarter.poker/images/diamond-icon.png']
                    },
                    unit_amount: Math.round(serverPackage.price * 100) // Convert to cents
                },
                quantity: 1
            }];

            // Create pending purchase record with SERVER-SIDE values
            const { data: purchase } = await supabase
                .from('diamond_purchases')
                .insert({
                    user_id: user.id,
                    package_name: serverPackage.name,
                    diamonds_amount: serverPackage.diamonds,
                    bonus_diamonds: serverPackage.bonus,
                    price_usd: serverPackage.price,
                    status: 'pending'
                })
                .select()
                .single();

            if (purchase) {
                sessionConfig.metadata.purchase_id = purchase.id;
            }

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

            if (order) {
                sessionConfig.metadata.order_id = order.id;
            }
            sessionConfig.shipping_address_collection = {
                allowed_countries: ['US', 'CA']
            };
        }

        // Create checkout session
        console.log('[Checkout] Creating Stripe session for type:', type);
        const session = await stripe.checkout.sessions.create(sessionConfig);
        console.log('[Checkout] Session created:', session.id);

        return res.status(200).json({
            success: true,
            data: {
                session_id: session.id,
                url: session.url
            }
        });

    } catch (error) {
        console.error('[Checkout] FATAL ERROR:', {
            type: error.type,
            code: error.code,
            statusCode: error.statusCode,
            message: error.message,
            rawType: error.rawType,
            detail: error.detail
        });

        // Provide user-friendly error messages based on Stripe error type
        let userMessage = error.message || 'Failed to create checkout session';
        let errorCode = 'CHECKOUT_ERROR';

        if (error.type === 'StripeConnectionError') {
            userMessage = 'Unable to connect to payment processor. Please try again in a moment.';
            errorCode = 'STRIPE_CONNECTION_ERROR';
        } else if (error.type === 'StripeAuthenticationError') {
            userMessage = 'Payment system configuration error. Please contact support.';
            errorCode = 'STRIPE_AUTH_ERROR';
        } else if (error.type === 'StripeInvalidRequestError') {
            userMessage = 'Invalid checkout configuration. Please contact support.';
            errorCode = 'STRIPE_INVALID_REQUEST';
        }

        return res.status(500).json({
            success: false,
            error: {
                code: errorCode,
                message: userMessage
            }
        });
    }
}
