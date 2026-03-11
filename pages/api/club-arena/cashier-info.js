/**
 * POST /api/club-arena/cashier-info
 * 
 * Cashier UX Enhancements — Unified data endpoint for the one-screen cashier.
 * 
 * Actions:
 *   'summary'         - Player's complete financial snapshot (balances, pending cashouts, recent txns)
 *   'quick_buyin'     - Fast buy-in with preset amounts (1K, 5K, 10K, 25K, 50K)
 *   'cashout_status'  - Real-time progress tracker for a cashout request
 *   'presets'         - Returns configurable quick-amount presets for the club
 * 
 * Body: { clubId, action, amount?, cashoutId? }
 * Auth: Bearer token
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
const { isUUID, rejectBadPayload } = require('../../../src/lib/club-arena/validate');
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_PRESETS = [1000, 5000, 10000, 25000, 50000];

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
export default async function handler(req, res) {
    // Rate limit
    if (await applyRateLimit(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No auth token' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { clubId, action, amount, cashoutId } = req.body;
    if (!clubId) return res.status(400).json({ error: 'clubId required' });

    // BUG-04 FIX: Strict UUID validation (was missing entirely)
    if (!isUUID(clubId)) return res.status(400).json({ error: 'Invalid clubId format' });

    // ─── SUMMARY: Complete financial snapshot ─────────────────
    if (action === 'summary') {
        try {
            // Player balance (F-04: include promo_balance for visibility)
            const { data: member } = await supabaseAdmin
                .from('club_members')
                .select('chip_balance, promo_balance, role')
                .eq('club_id', clubId)
                .eq('user_id', user.id)
                .maybeSingle();

            if (!member) return res.status(404).json({ error: 'Not a member of this club' });

            // Pending cashouts
            const { data: pendingCashouts } = await supabaseAdmin
                .from('cashout_requests')
                .select('id, amount, status, created_at, updated_at')
                .eq('club_id', clubId)
                .eq('user_id', user.id)
                .in('status', ['pending', 'processing'])
                .order('created_at', { ascending: false });

            // Recent transactions (last 20)
            const { data: recentTxns } = await supabaseAdmin
                .from('chip_transactions')
                .select('id, amount, transaction_type, notes, created_at, from_user_id, to_user_id')
                .eq('club_id', clubId)
                .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
                .order('created_at', { ascending: false })
                .limit(20);

            // Enrich transactions with direction
            const txns = (recentTxns || []).map(t => ({
                ...t,
                direction: t.to_user_id === user.id ? 'in' : 'out',
                displayAmount: t.to_user_id === user.id ? `+${t.amount}` : `-${t.amount}`,
            }));

            // Get quick-amount presets
            const { data: club } = await supabaseAdmin
                .from('clubs')
                .select('settings')
                .eq('id', clubId)
                .maybeSingle();

            const presets = club?.settings?.cashier_presets || DEFAULT_PRESETS;

            return res.status(200).json({
                success: true,
                balance: member.chip_balance || 0,
                promoBalance: member.promo_balance || 0,  // F-04: Promo balance visibility
                role: member.role,
                pendingCashouts: pendingCashouts || [],
                recentTransactions: txns,
                quickAmounts: presets,
                totalPendingCashout: (pendingCashouts || []).reduce((s, c) => s + (c.amount || 0), 0),
            });
        } catch (err) {
            return res.status(500).json({ error: 'Summary failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
        }
    }

    // ─── CASHOUT_STATUS: Real-time progress tracker ───────────
    if (action === 'cashout_status') {
        if (!cashoutId) return res.status(400).json({ error: 'cashoutId required' });

        try {
            const { data: cashout } = await supabaseAdmin
                .from('cashout_requests')
                .select('id, amount, status, created_at, updated_at, notes')
                .eq('id', cashoutId)
                .eq('user_id', user.id)
                .maybeSingle();

            if (!cashout) return res.status(404).json({ error: 'Cashout not found' });

            // Status progression
            const stages = ['pending', 'processing', 'approved', 'completed'];
            const currentStage = stages.indexOf(cashout.status);

            return res.status(200).json({
                success: true,
                cashout,
                progress: {
                    currentStage,
                    totalStages: stages.length,
                    percentage: Math.round(((currentStage + 1) / stages.length) * 100),
                    stages: stages.map((s, i) => ({
                        name: s.charAt(0).toUpperCase() + s.slice(1),
                        completed: i <= currentStage,
                        current: i === currentStage,
                    })),
                },
            });
        } catch (err) {
            return res.status(500).json({ error: 'Status check failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
        }
    }

    // ─── PRESETS: Configure quick-amount buttons ──────────────
    if (action === 'presets') {
        // BUG-09 FIX: Add idempotency guard for settings mutation
        if (checkIdempotency(req, res)) return;

        // Verify owner/admin
        const { data: mem } = await supabaseAdmin
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (!mem || !['owner', 'admin'].includes(mem.role)) {
            return res.status(403).json({ error: 'Owner/admin only' });
        }

        try {
            const { data: club } = await supabaseAdmin
                .from('clubs')
                .select('settings')
                .eq('id', clubId)
                .maybeSingle();

            const amounts = req.body.amounts || DEFAULT_PRESETS;
            const currentSettings = club?.settings || {};

            await supabaseAdmin
                .from('clubs')
                .update({ settings: { ...currentSettings, cashier_presets: amounts } })
                .eq('id', clubId);

            return res.status(200).json({ success: true, presets: amounts });
        } catch (err) {
            return res.status(500).json({ error: 'Presets update failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
        }
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
}
