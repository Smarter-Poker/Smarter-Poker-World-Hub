import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Cancel VIP Subscription
 * POST /api/store/cancel-vip
 *
 * Schedules the authenticated member's exact Stripe VIP subscription to end
 * at the close of its current billing period. Stripe is authoritative for the
 * billing mutation; the local row is an immediately refreshed projection.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import Stripe from 'stripe';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { BLOCKING_RECURRING_VIP_STATUSES } from '../../../src/lib/store/vipPurchaseGuards.mjs';
const {
    inspectStripeRuntime,
} = require('../../../src/lib/store/stripeRuntimeMode');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('VIP cancellation database is not configured');
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

const CANCELLATION_REASONS = new Set([
    'not_using',
    'too_expensive',
    'found_alternative',
    'missing_features',
    'technical_issues',
    'other',
]);
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const STRIPE_SUBSCRIPTION_ID_PATTERN = /^sub_[A-Za-z0-9]+$/;
const CANCELLABLE_SUBSCRIPTION_STATUSES = new Set(BLOCKING_RECURRING_VIP_STATUSES);
const SUPPORTED_VIP_TIERS = new Set(['monthly', 'yearly']);

function stripeObjectId(value) {
    if (typeof value === 'string') return value.trim() || null;
    return typeof value?.id === 'string' ? value.id.trim() || null : null;
}

/**
 * A local row identifies the candidate subscription, but it is not permission
 * to mutate that Stripe object. Confirm provider ownership and exact VIP/user
 * authority every time. The current Price can be archived or grandfathered,
 * and an older subscription can carry an anomalous offer shape; neither may
 * prevent this risk-reducing cancellation after authority is established.
 */
function validateLiveVipSubscription(subscription, {
    expectedCancelAtPeriodEnd = null,
    expectedCustomerId,
    expectedSubscriptionId,
    userId,
}) {
    if (stripeObjectId(subscription) !== expectedSubscriptionId) {
        return { valid: false, reason: 'wrong_subscription' };
    }
    if (!CANCELLABLE_SUBSCRIPTION_STATUSES.has(String(subscription?.status || '').toLowerCase())) {
        return { valid: false, reason: 'wrong_status' };
    }
    if (stripeObjectId(subscription?.customer) !== expectedCustomerId) {
        return { valid: false, reason: 'wrong_customer' };
    }

    const metadata = subscription?.metadata || {};
    const tier = String(metadata.vip_tier || '').trim().toLowerCase();
    if (metadata.type !== 'subscription'
        || String(metadata.user_id || '').trim() !== userId
        || String(metadata.venue_id || '').trim()
        || !SUPPORTED_VIP_TIERS.has(tier)) {
        return { valid: false, reason: 'wrong_authority' };
    }
    if (typeof subscription.cancel_at_period_end !== 'boolean') {
        return { valid: false, reason: 'wrong_cancellation_state' };
    }
    if (expectedCancelAtPeriodEnd !== null
        && subscription.cancel_at_period_end !== expectedCancelAtPeriodEnd) {
        return { valid: false, reason: 'cancellation_not_confirmed' };
    }

    return { valid: true, tier };
}

function sendReconciliationPending(res) {
    return res.status(503).json({
        success: false,
        retryable: true,
        reconciliationPending: true,
        code: 'VIP_CANCELLATION_RECONCILIATION_PENDING',
        error: 'Your Billing Cancellation Could Not Be Confirmed. Retry This Same Request Before Starting Another Change.',
    });
}

function sendCancellationSuccess(res, { idempotent, reconciliationPending, status }) {
    return res.status(200).json({
        success: true,
        idempotent,
        reconciliationPending,
        cancelAtPeriodEnd: true,
        status,
        message: reconciliationPending
            ? 'Billing Cancellation Is Scheduled. Membership Telemetry Is Refreshing.'
            : 'Subscription Will Cancel At The End Of Your Billing Period',
    });
}

async function projectCancellationLocally({ reason, reasonText, subscriptionId, userId }) {
    try {
        const { data: projection, error: projectionError } = await getSupabase()
            .from('vip_subscriptions')
            .update({
                cancel_at_period_end: true,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('stripe_subscription_id', subscriptionId)
            .in('status', BLOCKING_RECURRING_VIP_STATUSES)
            .select('stripe_subscription_id, cancel_at_period_end')
            .maybeSingle();

        if (projectionError
            || !projection
            || stripeObjectId(projection.stripe_subscription_id) !== subscriptionId
            || projection.cancel_at_period_end !== true) {
            const failure = projectionError || new Error('VIP cancellation projection was not confirmed');
            console.warn('[cancel-vip] local cancellation projection failed:', failure.message);
            try { reportApiError(failure); } catch (_reportError) { /* provider result remains authoritative */ }
            return false;
        }

        // Cancellation telemetry is deliberately non-authoritative. Older
        // environments may not have these optional columns yet.
        try {
            const { error: reasonError } = await getSupabase()
                .from('vip_subscriptions')
                .update({
                    cancel_reason: reason,
                    cancel_reason_text: reasonText,
                })
                .eq('user_id', userId)
                .eq('stripe_subscription_id', subscriptionId);
            if (reasonError) {
                console.warn('[cancel-vip] cancellation telemetry update failed:', reasonError.message);
            }
        } catch (reasonError) {
            console.warn('[cancel-vip] cancellation telemetry update failed:', reasonError?.message || reasonError);
            try { reportApiError(reasonError); } catch (_reportError) { /* telemetry remains non-authoritative */ }
        }
        return true;
    } catch (projectionError) {
        console.warn('[cancel-vip] local cancellation projection failed:', projectionError?.message || projectionError);
        try { reportApiError(projectionError); } catch (_reportError) { /* provider result remains authoritative */ }
        return false;
    }
}

export default async function handler(req, res) {
    let providerMutationAttempted = false;
    let providerCancellationConfirmed = false;
    let confirmedStatus = null;
    try {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Vary', 'Authorization');
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method Not Allowed' });
        }

        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Authentication Required' });
        const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
        if (authError || !user?.id) {
            return res.status(401).json({ success: false, error: 'Invalid Authentication Token' });
        }
        const userId = user.id;

        const clientKey = req.headers['x-idempotency-key'];
        // The previous sentence-case contracts were: A valid X-Idempotency-Key header is required
        // and Unknown fields. Responses remain Title Case for the Marketplace UI.
        if (typeof clientKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(clientKey.trim())) {
            return res.status(400).json({ success: false, error: 'A Valid X-Idempotency-Key Header Is Required' });
        }
        const normalizedClientKey = clientKey.trim();

        const body = req.body || {};
        if (JSON.stringify(body).length > 1_024) {
            return res.status(413).json({ success: false, error: 'Request Body Is Too Large' });
        }
        const unknownFields = Object.keys(body).filter((key) => !['reason', 'reasonText'].includes(key));
        if (unknownFields.length) {
            return res.status(400).json({ success: false, error: `Unknown Fields: ${unknownFields.join(', ')}` });
        }
        const reason = String(body.reason || 'unspecified').trim();
        const reasonText = String(body.reasonText || '').trim();
        if (reason !== 'unspecified' && !CANCELLATION_REASONS.has(reason)) {
            return res.status(400).json({ success: false, error: 'Choose A Valid Cancellation Reason' });
        }
        if (reasonText.length > 500) {
            return res.status(400).json({ success: false, error: 'Cancellation Details Must Be 500 Characters Or Fewer' });
        }

        const { data: sub, error: subError } = await getSupabase()
            .from('vip_subscriptions')
            .select('stripe_subscription_id, stripe_customer_id, status')
            .eq('user_id', userId)
            .in('status', BLOCKING_RECURRING_VIP_STATUSES)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (subError) {
            console.warn('[cancel-vip] VIP subscription read failed:', subError.message);
            return res.status(503).json({
                success: false,
                retryable: true,
                error: 'Your Active VIP Subscription Could Not Be Read. Please Try Again.',
            });
        }
        if (!sub) {
            return res.status(404).json({ success: false, error: 'No Active VIP Subscription Was Found.' });
        }

        const subscriptionId = stripeObjectId(sub.stripe_subscription_id);
        if (subscriptionId?.startsWith('diamond_')) {
            return res.status(400).json({
                success: false,
                error: 'Your Diamond VIP Pass Does Not Renew And Will Expire Automatically. There Is No Card Subscription To Cancel.',
            });
        }
        if (!subscriptionId || !STRIPE_SUBSCRIPTION_ID_PATTERN.test(subscriptionId)) {
            return res.status(409).json({
                success: false,
                code: 'VIP_SUBSCRIPTION_REFERENCE_MISSING',
                error: 'Your Active VIP Record Has No Valid Billing Subscription To Cancel.',
            });
        }

        const stripeRuntime = inspectStripeRuntime(process.env, {
            requirePublishable: false,
            // This route reads and verifies Stripe's mutation result directly.
            // A webhook outage must not trap a member in recurring billing.
            requireWebhook: false,
        });
        if (!stripe || !stripeRuntime.ready) {
            console.warn('[cancel-vip] Stripe runtime is unavailable for subscription mutation', subscriptionId);
            return res.status(503).json({
                success: false,
                retryable: true,
                error: 'Payment System Is Unavailable. Please Try Again Later Or Contact Support.',
            });
        }

        const { data: profile, error: profileError } = await getSupabase()
            .from('profiles')
            .select('stripe_customer_id')
            .eq('id', userId)
            .maybeSingle();
        const profileCustomerId = stripeObjectId(profile?.stripe_customer_id);
        const localCustomerId = stripeObjectId(sub.stripe_customer_id);
        if (profileError || !profileCustomerId) {
            if (profileError) console.warn('[cancel-vip] billing ownership read failed:', profileError.message);
            return res.status(503).json({
                success: false,
                retryable: true,
                code: 'VIP_SUBSCRIPTION_OWNERSHIP_UNAVAILABLE',
                error: 'Your Billing Ownership Could Not Be Verified. Please Try Again.',
            });
        }
        if (localCustomerId && localCustomerId !== profileCustomerId) {
            console.warn('[cancel-vip] local subscription customer conflicts with profile ownership', subscriptionId);
            return res.status(409).json({
                success: false,
                code: 'VIP_SUBSCRIPTION_OWNERSHIP_MISMATCH',
                error: 'This Billing Subscription Does Not Belong To Your Account.',
            });
        }

        // Always read Stripe before deciding whether this request is already
        // complete. This turns a retry after an ambiguous provider commit into
        // a verified idempotent success without issuing a second mutation.
        let live;
        try {
            live = await stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['items.data.price'],
            });
        } catch (retrieveError) {
            console.warn('[cancel-vip] live subscription read failed:', retrieveError?.message || retrieveError);
            return res.status(503).json({
                success: false,
                retryable: true,
                code: 'VIP_SUBSCRIPTION_VERIFICATION_UNAVAILABLE',
                error: 'Your Live Billing Subscription Could Not Be Verified. Please Try Again.',
            });
        }

        const liveValidation = validateLiveVipSubscription(live, {
            expectedCustomerId: profileCustomerId,
            expectedSubscriptionId: subscriptionId,
            userId,
        });
        if (!liveValidation.valid) {
            console.warn('[cancel-vip] live subscription failed verification:', subscriptionId, liveValidation.reason);
            const ownershipMismatch = liveValidation.reason === 'wrong_customer';
            return res.status(409).json({
                success: false,
                code: ownershipMismatch
                    ? 'VIP_SUBSCRIPTION_OWNERSHIP_MISMATCH'
                    : 'VIP_SUBSCRIPTION_CONTRACT_MISMATCH',
                error: ownershipMismatch
                    ? 'This Billing Subscription Does Not Belong To Your Account.'
                    : 'Your Live VIP Subscription Does Not Match A Supported Billing Plan.',
            });
        }

        let confirmed = live;
        const idempotent = live.cancel_at_period_end === true;
        if (!idempotent) {
            providerMutationAttempted = true;
            try {
                confirmed = await stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: true,
                }, { idempotencyKey: `vip-cancel:${userId}:${normalizedClientKey}` });
            } catch (updateError) {
                try { reportApiError(updateError, req); } catch (_reportError) { /* provider result remains ambiguous */ }
                console.warn('[cancel-vip] update result is ambiguous:', updateError?.message || updateError);
                return sendReconciliationPending(res);
            }

            const updatedValidation = validateLiveVipSubscription(confirmed, {
                expectedCancelAtPeriodEnd: true,
                expectedCustomerId: profileCustomerId,
                expectedSubscriptionId: subscriptionId,
                userId,
            });
            if (!updatedValidation.valid) {
                console.warn('[cancel-vip] updated subscription failed verification:', subscriptionId, updatedValidation.reason);
                return sendReconciliationPending(res);
            }
        }

        providerCancellationConfirmed = true;
        confirmedStatus = confirmed.status;
        const localProjectionConfirmed = await projectCancellationLocally({
            reason,
            reasonText,
            subscriptionId,
            userId,
        });
        // A failed exact projection means reconciliationPending = true while
        // the already-confirmed provider cancellation remains successful.

        return sendCancellationSuccess(res, {
            idempotent,
            reconciliationPending: !localProjectionConfirmed,
            status: confirmedStatus,
        });
    } catch (error) {
        try { reportApiError(error, req); } catch (_reportError) { /* telemetry must not shadow the response */ }
        console.warn('[cancel-vip] error:', error?.message || error);
        if (!res.headersSent) {
            if (providerCancellationConfirmed) {
                return sendCancellationSuccess(res, {
                    idempotent: false,
                    reconciliationPending: true,
                    status: confirmedStatus,
                });
            }
            if (providerMutationAttempted) return sendReconciliationPending(res);
            return res.status(500).json({
                success: false,
                retryable: true,
                error: 'Your Billing Cancellation Could Not Be Completed. Please Try Again.',
            });
        }
    }
}
