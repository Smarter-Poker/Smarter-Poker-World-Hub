/**
 * Cancel VIP Subscription
 * POST /api/store/cancel-vip
 * 
 * Cancels the user's VIP subscription at end of billing period via Stripe.
 * Also stores the cancellation reason for analytics.
 */
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
        timeout: 15000,
        maxNetworkRetries: 2,
        telemetry: false
    })
    : null;

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const userId = user.id; // From JWT, NOT body
    const { reason, reasonText } = req.body;

    try {
        // 1. Get the user's active VIP subscription
        const { data: sub, error: subErr } = await supabase
            .from('vip_subscriptions')
            .select('stripe_subscription_id, status')
            .eq('user_id', userId)
            .in('status', ['active', 'trialing'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (subErr || !sub) {
            return res.status(404).json({ error: 'No active VIP subscription found' });
        }

        // 2. Cancel via Stripe (at end of billing period)
        if (stripe && sub.stripe_subscription_id) {
            await stripe.subscriptions.update(sub.stripe_subscription_id, {
                cancel_at_period_end: true,
                metadata: {
                    cancel_reason: reason || 'unspecified',
                    cancel_reason_text: reasonText || '',
                }
            });

        }

        // 3. Update local record — core fields (always exist)
        await supabase
            .from('vip_subscriptions')
            .update({
                cancel_at_period_end: true,
                updated_at: new Date().toISOString()
            })
            .eq('stripe_subscription_id', sub.stripe_subscription_id);

        // 4. Store cancellation reason (columns may not exist if migration not run)
        try {
            await supabase
                .from('vip_subscriptions')
                .update({
                    cancel_reason: reason || 'unspecified',
                    cancel_reason_text: reasonText || '',
                })
                .eq('stripe_subscription_id', sub.stripe_subscription_id);
        } catch (reasonErr) {
            // Non-critical — reason is also stored in Stripe metadata
            console.error('Could not store cancel reason locally:', reasonErr.message);
        }

        // 5. Log the cancellation event

        return res.status(200).json({
            success: true,
            message: 'Subscription will cancel at the end of your billing period'
        });
    } catch (err) {
        console.error('Cancel VIP error:', err);
        return res.status(500).json({ error: 'Failed to cancel subscription' });
    }
}
