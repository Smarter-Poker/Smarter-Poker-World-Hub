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
            // 2026-09-07 (Diamond Accounting Standard D10): an existing endpoint is brought up to
            // the full event list instead of being left as it was. Before this, the three
            // charge.dispute.* events could never reach a live endpoint that already existed.
            const have = new Set(existing.enabled_events || []);
            const missing = have.has('*') ? [] : WEBHOOK_EVENTS.filter((e) => !have.has(e));
            console.log(`Webhook endpoint exists: ${existing.id} (${existing.url}, ${existing.enabled_events.length} events)`);
            if (missing.length === 0) {
                console.log('Every required event is already enabled. Nothing to change.');
                return;
            }
            const updated = await stripe.webhookEndpoints.update(existing.id, {
                enabled_events: Array.from(new Set([...(existing.enabled_events || []), ...missing]))
            });
            console.log(`Added ${missing.length} event(s): ${missing.join(', ')}`);
            console.log(`Endpoint now enables ${updated.enabled_events.length} events. The signing secret is unchanged.`);
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
