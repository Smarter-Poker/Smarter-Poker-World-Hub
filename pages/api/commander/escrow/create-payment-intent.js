/**
 * Escrow Payment Intent API
 * POST /api/commander/escrow/create-payment-intent
 * Creates a Stripe payment intent for escrow deposit
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
  if (!stripeSecretKey) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'PAYMENTS_NOT_CONFIGURED',
        message: 'Payment processing is not yet configured. Please contact support.',
        fallback: 'cash'
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

    const { escrow_id, amount } = req.body;

    if (!escrow_id || !amount) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'escrow_id and amount required' }
      });
    }

    // Verify escrow transaction exists and belongs to user
    const { data: escrow, error: escrowError } = await supabase
      .from('commander_escrow_transactions')
      .select('*, commander_home_games!inner(id, name, host_id)')
      .eq('id', escrow_id)
      .eq('player_id', user.id)
      .eq('status', 'pending')
      .single();

    if (escrowError || !escrow) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Escrow transaction not found or not pending' }
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

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      customer: customerId,
      metadata: {
        escrow_id: escrow.id,
        home_game_id: escrow.home_game_id,
        player_id: user.id,
        type: 'commander_escrow'
      },
      description: `Escrow deposit for home game: ${escrow.commander_home_games?.name || 'Poker Game'}`,
      automatic_payment_methods: {
        enabled: true
      }
    });

    // Update escrow with payment intent ID
    await supabase
      .from('commander_escrow_transactions')
      .update({
        payment_reference: paymentIntent.id,
        payment_method: 'stripe'
      })
      .eq('id', escrow_id);

    return res.status(200).json({
      success: true,
      data: {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id
      }
    });
  } catch (error) {
    console.error('Payment intent error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'PAYMENT_ERROR', message: error.message || 'Failed to create payment' }
    });
  }
}
