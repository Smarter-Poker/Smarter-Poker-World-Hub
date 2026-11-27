import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Open The Stripe Billing Portal
 * POST /api/store/billing-portal
 *
 * Creates a short-lived Stripe Billing Portal session for the signed-in
 * member's OWN Stripe customer, so a member whose renewal failed can replace
 * the card on file. The customer id is read from the member's profile on the
 * server; nothing in the request can name another customer. The portal's
 * features (which include updating the payment method) are configured in the
 * Stripe dashboard.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import Stripe from 'stripe';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
const {
    inspectStripeRuntime,
} = require('../../../src/lib/store/stripeRuntimeMode');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Billing portal database is not configured');
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

const STRIPE_CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9]+$/;
const BILLING_PORTAL_HOST = 'billing.stripe.com';
const RETURN_URL = 'https://smarter.poker/hub/vip-membership/manage';

function verifiedPortalUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' && url.hostname === BILLING_PORTAL_HOST ? url.toString() : null;
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    try {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Vary', 'Authorization');
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method Not Allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Authentication Required' });
        const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
        if (authError || !user?.id) {
            return res.status(401).json({ success: false, error: 'Invalid Authentication Token' });
        }

        const body = req.body || {};
        if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) {
            return res.status(400).json({ success: false, error: 'This Request Takes No Fields' });
        }

        const { data: profile, error: profileError } = await getSupabase()
            .from('profiles')
            .select('stripe_customer_id')
            .eq('id', user.id)
            .maybeSingle();
        if (profileError) {
            console.warn('[billing-portal] billing ownership read failed:', profileError.message);
            return res.status(503).json({
                success: false,
                retryable: true,
                error: 'Your Billing Record Could Not Be Read. Please Try Again.',
            });
        }
        const customerId = typeof profile?.stripe_customer_id === 'string'
            ? profile.stripe_customer_id.trim()
            : '';
        if (!STRIPE_CUSTOMER_ID_PATTERN.test(customerId)) {
            return res.status(404).json({
                success: false,
                code: 'BILLING_CUSTOMER_MISSING',
                error: 'No Card Billing Record Was Found For Your Account.',
            });
        }

        const stripeRuntime = inspectStripeRuntime(process.env, {
            requirePublishable: false,
            requireWebhook: false,
        });
        if (!stripe || !stripeRuntime.ready) {
            return res.status(503).json({
                success: false,
                retryable: true,
                error: 'Payment System Is Unavailable. Please Try Again Later Or Contact Support.',
            });
        }

        let session;
        try {
            session = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: RETURN_URL,
            });
        } catch (portalError) {
            try { reportApiError(portalError, req); } catch (_reportError) { /* response below is the result */ }
            console.warn('[billing-portal] portal session failed:', portalError?.message || portalError);
            return res.status(503).json({
                success: false,
                retryable: true,
                code: 'BILLING_PORTAL_UNAVAILABLE',
                error: 'The Card Update Page Could Not Be Opened. Please Try Again Later Or Contact Support.',
            });
        }

        const url = verifiedPortalUrl(session?.url);
        if (!url || session?.customer !== customerId) {
            console.warn('[billing-portal] portal session failed verification');
            return res.status(503).json({
                success: false,
                retryable: true,
                code: 'BILLING_PORTAL_UNAVAILABLE',
                error: 'The Card Update Page Could Not Be Opened. Please Try Again Later Or Contact Support.',
            });
        }
        return res.status(200).json({ success: true, url });
    } catch (error) {
        try { reportApiError(error, req); } catch (_reportError) { /* telemetry must not shadow the response */ }
        console.warn('[billing-portal] error:', error?.message || error);
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                retryable: true,
                error: 'The Card Update Page Could Not Be Opened. Please Try Again.',
            });
        }
    }
}
