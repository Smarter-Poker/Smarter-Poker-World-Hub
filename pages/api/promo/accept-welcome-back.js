/**
 * Welcome-Back Offer Status & Acceptance API (/api/promo/accept-welcome-back)
 *
 * GET  /api/promo/accept-welcome-back?wb=<token> -> check authenticated player's eligibility / claimed status
 * POST /api/promo/accept-welcome-back            -> accept offer & atomically grant 25 Free Chips + 500 Diamonds + 30-Day VIP
 */
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    acceptWelcomeBackOffer,
    inspectWelcomeBackOfferStatus,
} from '../../../src/lib/promoCampaigns/welcomeBackOffer.mjs';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

function createUserScopedClient(accessToken) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    return createSupabaseJsClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');

    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const sb = getSupabase();
    const { user, error: authErr } = await getServerUserWithFallback(req, sb);

    if (authErr || !user?.id) {
        return res.status(401).json({ success: false, error: 'Sign in required to accept your Welcome-Back Offer.' });
    }

    try {
        if (req.method === 'GET') {
            const token = typeof req.query?.wb === 'string' ? req.query.wb : '';
            const status = await inspectWelcomeBackOfferStatus(sb, { user, token });
            return res.status(200).json({
                success: true,
                eligible: status.eligible,
                alreadyClaimed: Boolean(status.alreadyClaimed),
                reason: status.reason || null,
                message: status.message || null,
                reward: status.reward || null,
            });
        }

        const body = typeof req.body === 'object' && req.body ? req.body : {};
        const token = typeof body.wb === 'string' ? body.wb : '';
        const outcome = await acceptWelcomeBackOffer(sb, {
            user,
            accessToken,
            token,
            userSupabaseFactory: createUserScopedClient,
        });

        if (!outcome.success) {
            return res.status(403).json(outcome);
        }
        return res.status(200).json(outcome);
    } catch (error) {
        try { reportApiError(error, req); } catch (_e) { /* noop */ }
        console.warn('[Welcome-Back Offer] error:', error?.message || error);
        return res.status(500).json({
            success: false,
            error: error?.message || 'Unable to process Welcome-Back Offer right now. Please try again.',
        });
    }
}
