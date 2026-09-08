/**
 * POST /api/store/webhooks/stripe-ensure
 *
 * Makes the LIVE Stripe webhook endpoint for this deployment subscribe to every
 * event the handler at /api/store/webhooks/stripe knows how to process, and
 * says what it changed. Idempotent: a second call reports "nothing to add".
 *
 * WHY THIS IS A ROUTE AND NOT A SCRIPT (2026-09-07, Diamond Accounting Standard
 * D10). scripts/setup-stripe-webhook.js only CREATES an endpoint when none
 * exists; when one exists it prints the secret and exits, so it could never add
 * the three charge.dispute.* events to the live endpoint. The live secret key
 * lives in Vercel and nowhere else, so the only place this update can run with
 * the right key is a server route. A dispute lost by silence is a money defect.
 *
 * Auth: x-cron-secret / Authorization: Bearer <CRON_SECRET>, or x-admin-secret
 * matching ADMIN_ROUTE_SECRET. Never returns the endpoint secret.
 *
 * WHY IT LIVES HERE AND NOT UNDER /api/admin (2026-09-07, same day). It was
 * first published as /api/admin/stripe-webhook-ensure and could never be
 * called: middleware.ts guards every /api/admin/* path and answers "Admin
 * routes require authentication." unless x-admin-secret matches
 * ADMIN_ROUTE_SECRET, which is empty in production, so the route's own
 * CRON_SECRET check was never reached. It sits beside the webhook it
 * configures, outside the middleware matcher, and does its own authentication
 * exactly as pages/api/cron/* do.
 */
import Stripe from 'stripe';

export const WEBHOOK_URL = 'https://smarter.poker/api/store/webhooks/stripe';

// Every event the webhook handler processes (pages/api/store/webhooks/stripe.js).
export const REQUIRED_EVENTS = [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'charge.refunded',
    'charge.dispute.created',
    'charge.dispute.funds_withdrawn',
    'charge.dispute.closed',
];

function authorized(req) {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const cronSecret = process.env.CRON_SECRET;
    const adminSecret = process.env.ADMIN_ROUTE_SECRET;
    if (cronSecret && (req.headers['x-cron-secret'] === cronSecret || bearer === cronSecret)) return true;
    if (adminSecret && req.headers['x-admin-secret'] === adminSecret) return true;
    return false;
}

export function missingEvents(enabled) {
    const have = new Set(enabled || []);
    if (have.has('*')) return [];
    return REQUIRED_EVENTS.filter((e) => !have.has(e));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'method_not_allowed' });
    }
    if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(503).json({ error: 'stripe_key_missing' });
    const stripe = new Stripe(key);
    const livemode = key.startsWith('sk_live_');

    const list = await stripe.webhookEndpoints.list({ limit: 50 });
    const endpoint = list.data.find((w) => w.url === WEBHOOK_URL);
    if (!endpoint) {
        return res.status(404).json({
            ok: false,
            livemode,
            error: 'endpoint_missing',
            note: `No webhook endpoint for ${WEBHOOK_URL} in this Stripe mode. Create it with scripts/setup-stripe-webhook.js and set STRIPE_WEBHOOK_SECRET.`,
        });
    }

    const missing = missingEvents(endpoint.enabled_events);
    if (missing.length === 0) {
        return res.status(200).json({
            ok: true, livemode, endpoint: endpoint.id, status: endpoint.status,
            changed: false, enabled_events: endpoint.enabled_events,
        });
    }
    const updated = await stripe.webhookEndpoints.update(endpoint.id, {
        enabled_events: Array.from(new Set([...(endpoint.enabled_events || []), ...missing])),
    });
    return res.status(200).json({
        ok: true, livemode, endpoint: updated.id, status: updated.status,
        changed: true, added: missing, enabled_events: updated.enabled_events,
    });
}
