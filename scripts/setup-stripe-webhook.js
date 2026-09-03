/**
 * Stripe Webhook Setup Script
 * Creates webhook endpoint for Diamond Store
 */
require('dotenv').config({ path: '.env.local' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const WEBHOOK_URL = 'https://smarter.poker/api/store/webhooks/stripe';

const WEBHOOK_EVENTS = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'charge.refunded',
    // D10 (Diamond Accounting Standard, Lane D). Without these three the
    // endpoint never hears about a chargeback: the money goes back at Stripe
    // and the diamonds it bought stay in the player's balance forever.
    'charge.dispute.created',
    'charge.dispute.funds_withdrawn',
    'charge.dispute.closed'
];

async function setupWebhook() {
    console.log('🔧 Setting up Stripe webhook endpoint...\n');

    try {
        // Check if webhook already exists
        const existingWebhooks = await stripe.webhookEndpoints.list();
        const existing = existingWebhooks.data.find(wh => wh.url === WEBHOOK_URL);

        if (existing) {
            console.log('⚠️  Webhook endpoint already exists!');
            console.log(`   ID: ${existing.id}`);
            console.log(`   URL: ${existing.url}`);
            console.log(`   Secret: ${existing.secret}\n`);

            console.log('Would you like to:');
            console.log('1. Keep existing webhook');
            console.log('2. Delete and recreate\n');

            // For now, just show the existing secret
            console.log('✅ Use this webhook secret in your .env.local:');
            console.log(`STRIPE_WEBHOOK_SECRET="${existing.secret}"`);
            return;
        }

        // Create new webhook endpoint
        const webhook = await stripe.webhookEndpoints.create({
            url: WEBHOOK_URL,
            enabled_events: WEBHOOK_EVENTS,
            description: 'Diamond Store - Handles purchases, subscriptions, and refunds'
        });

        console.log('✅ Webhook endpoint created successfully!\n');
        console.log(`   ID: ${webhook.id}`);
        console.log(`   URL: ${webhook.url}`);
        console.log(`   Events: ${webhook.enabled_events.length} events configured\n`);

        console.log('📝 Add this to your .env.local file:');
        console.log(`STRIPE_WEBHOOK_SECRET="${webhook.secret}"\n`);

        console.log('✅ Stripe configuration complete!');
        console.log('\n🎉 You can now test purchases on your Diamond Store!');

    } catch (error) {
        console.error('❌ Error setting up webhook:', error.message);
        process.exit(1);
    }
}

setupWebhook();
