/**
 * Stripe Events Webhook
 * POST /api/commander/webhooks/stripe/events - Handle Stripe webhook events
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
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'charge.refunded':
        await handleRefund(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
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

async function handlePaymentSuccess(paymentIntent) {
  const { id, amount, metadata } = paymentIntent;

  // Update escrow if this is an escrow payment
  if (metadata?.escrow_id) {
    const { error } = await supabase
      .from('commander_escrow_transactions')
      .update({
        status: 'held',
        held_at: new Date().toISOString(),
        payment_reference: id
      })
      .eq('id', metadata.escrow_id);

    if (error) {
      console.error('Update escrow error:', error);
    }
  }

  // Log the payment
  console.log(`Payment succeeded: ${id} for $${amount / 100}`);
}

async function handlePaymentFailed(paymentIntent) {
  const { id, metadata, last_payment_error } = paymentIntent;

  if (metadata?.escrow_id) {
    const { error } = await supabase
      .from('commander_escrow_transactions')
      .update({
        status: 'failed',
        notes: last_payment_error?.message || 'Payment failed'
      })
      .eq('id', metadata.escrow_id);

    if (error) {
      console.error('Update escrow error:', error);
    }
  }

  console.log(`Payment failed: ${id}`);
}

async function handleRefund(charge) {
  const { id, payment_intent, amount_refunded, metadata } = charge;

  if (metadata?.escrow_id) {
    const { error } = await supabase
      .from('commander_escrow_transactions')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString()
      })
      .eq('id', metadata.escrow_id);

    if (error) {
      console.error('Update escrow error:', error);
    }
  }

  console.log(`Refund processed: ${id} for $${amount_refunded / 100}`);
}

async function handleSubscriptionUpdate(subscription) {
  const { id, customer, status, metadata } = subscription;

  // Update venue subscription tier if this is a Commander subscription
  if (metadata?.venue_id) {
    const tierMap = {
      active: metadata.tier || 'pro',
      trialing: metadata.tier || 'pro',
      past_due: metadata.tier || 'pro',
      canceled: 'free',
      unpaid: 'free'
    };

    const { error } = await supabase
      .from('poker_venues')
      .update({
        commander_tier: tierMap[status] || 'free',
        commander_enabled: status === 'active' || status === 'trialing'
      })
      .eq('id', parseInt(metadata.venue_id));

    if (error) {
      console.error('Update venue subscription error:', error);
    }
  }

  console.log(`Subscription updated: ${id} -> ${status}`);
}

async function handleSubscriptionCancelled(subscription) {
  const { id, metadata } = subscription;

  if (metadata?.venue_id) {
    const { error } = await supabase
      .from('poker_venues')
      .update({
        commander_tier: 'free'
      })
      .eq('id', parseInt(metadata.venue_id));

    if (error) {
      console.error('Update venue subscription error:', error);
    }
  }

  console.log(`Subscription cancelled: ${id}`);
}

// Disable default body parser - we need raw body for signature verification
export const config = {
  api: {
    bodyParser: false
  }
};
