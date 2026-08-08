/**
 * 💎 SPEND ENDPOINT — POST /api/diamonds/spend
 * ═══════════════════════════════════════════════════════════════════════════
 * Charges a game entry fee. The browser used to do this itself:
 *
 *     supabase.rpc('deduct_diamonds', { ... })   // from src/services/DiamondEngine.js
 *
 * That worked until migration 20260803140000 revoked EXECUTE on
 * deduct_diamonds, add_diamonds_to_balance and award_diamonds from the
 * `authenticated` role — correctly, because a browser-executable balance
 * mutator is a mint. But nothing was migrated to replace it, so every
 * client-side charge started returning 42501, and DiamondEngine.deduct()'s
 * fallback chain (_deductDirect -> add_diamonds_to_balance, also revoked)
 * ended at `{ success: false }`.
 *
 * The user-visible result: every NON-VIP player was locked out of every paid
 * surface — memory games, and trivia in endless / survival / mixed / time
 * attack / [mode] — because the entry charge failed and the pages open the
 * "Out of Diamonds" modal on failure. VIPs were unaffected (they skip the
 * charge), which is why the test account did not surface it.
 *
 * ── SAFETY ──────────────────────────────────────────────────────────────────
 * This endpoint only ever DECREASES a balance, so unlike an award endpoint it
 * cannot mint. Even so:
 *   - identity comes from the bearer token, never the body
 *   - the amount is clamped to a sane range and must be a positive integer
 *   - `source` is checked against an allowlist so the ledger cannot be
 *     polluted with arbitrary transaction_type values (which would also make
 *     the row invisible to the cap accounting in award_diamonds_v2)
 *   - VIP-plays-free is decided HERE, from the profile, not by the client
 *     asserting it
 *
 * @see src/services/DiamondEngine.js — the only caller
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { reportApiError } from '../../../src/lib/sentryWrap';

/** Upper bound on a single charge. Nothing in the app costs more than this. */
const MAX_CHARGE = 1000;

/**
 * Permitted spend sources. Anything not on this list is rejected rather than
 * silently written, so `transaction_type` stays a closed vocabulary.
 */
const ALLOWED_SOURCES = new Set([
    'game_cost',
    'memory_game',
    'trivia_entry',
    'trivia_lifeline',
    'training_entry',
    'video_unlock',
]);

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return null;
        _supabase = createClient(url, key, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }
    return _supabase;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const supabase = getSupabase();
        if (!supabase) {
            console.error('[Spend] SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing');
            return res.status(500).json({ success: false, error: 'Diamond service unavailable' });
        }

        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, supabase);
        const userId = authUser?.id;
        if (authErr || !userId) {
            return res.status(401).json({ success: false, error: 'Auth required' });
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};

        const amount = Number(body.amount);
        if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_CHARGE) {
            return res.status(400).json({
                success: false,
                error: `amount must be a positive integer up to ${MAX_CHARGE}`,
            });
        }

        const source = typeof body.source === 'string' ? body.source.trim() : '';
        if (!ALLOWED_SOURCES.has(source)) {
            return res.status(400).json({ success: false, error: 'Unrecognised spend source' });
        }

        const description = typeof body.description === 'string'
            ? body.description.slice(0, 200)
            : source;

        // Optional idempotency key. Callers that can retry — a PvP stake whose
        // refund is keyed on the same reference, a Double-or-Nothing settlement
        // — pass one so a repeat does not double-charge.
        //
        // ALWAYS namespaced with the authenticated user id. A client-chosen
        // reference is otherwise a cross-user collision primitive: guess
        // another player's key and your charge is silently deduped away as
        // theirs, or theirs as yours.
        let referenceId = null;
        if (body.referenceId !== undefined && body.referenceId !== null) {
            if (typeof body.referenceId !== 'string') {
                return res.status(400).json({ success: false, error: 'referenceId must be a string' });
            }
            const raw = body.referenceId.trim();
            if (!raw || raw.length > 120 || !/^[A-Za-z0-9_:.-]+$/.test(raw)) {
                return res.status(400).json({ success: false, error: 'referenceId contains unsupported characters' });
            }
            referenceId = `spend:${userId}:${raw}`;
        }

        // ── VIP plays free. Decided here, from the row, not from the client. ──
        // Same truth definition as /api/vip/check-status and award_diamonds_v2:
        // is_vip alone is not enough, expiry is enforced, and a non-lifetime
        // tier with no expiry reads as lapsed.
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('diamonds, is_vip, vip_tier, vip_expires_at')
            .eq('id', userId)
            .maybeSingle();

        if (profileErr || !profile) {
            console.warn('[Spend] profile lookup failed:', profileErr?.message);
            return res.status(500).json({ success: false, error: 'Could not read balance' });
        }

        const isVip = profile.is_vip === true && (
            profile.vip_tier === 'lifetime'
                ? true
                : Boolean(profile.vip_expires_at) && new Date(profile.vip_expires_at) > new Date()
        );

        if (isVip) {
            return res.status(200).json({
                success: true, charged: 0, vip: true, balance: profile.diamonds ?? 0,
            });
        }

        if ((profile.diamonds ?? 0) < amount) {
            return res.status(200).json({
                success: false,
                error: 'Insufficient diamonds',
                balance: profile.diamonds ?? 0,
                required: amount,
            });
        }

        // deduct_diamonds is service_role only and does the balance write plus
        // the ledger row atomically.
        const { data, error } = await supabase.rpc('deduct_diamonds', {
            p_user_id: userId,
            p_amount: amount,
            p_description: description,
            p_transaction_type: source,
            p_reference_id: referenceId,
        });

        if (error) {
            console.error('[Spend] deduct_diamonds failed:', error.message);
            try { reportApiError(error, req); } catch { /* noop */ }
            return res.status(500).json({ success: false, error: 'Charge failed' });
        }

        const result = typeof data === 'string' ? JSON.parse(data) : data || {};
        if (result.success === false) {
            return res.status(200).json({
                success: false,
                error: result.error || 'Insufficient diamonds',
                balance: result.balance ?? profile.diamonds ?? 0,
            });
        }

        return res.status(200).json({
            success: true,
            charged: amount,
            balance: result.balance ?? Math.max((profile.diamonds ?? 0) - amount, 0),
        });
    } catch (err) {
        try { reportApiError(err, req); } catch { /* noop */ }
        console.error('[Spend] Unhandled error:', err?.message || err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
        return undefined;
    }
}
