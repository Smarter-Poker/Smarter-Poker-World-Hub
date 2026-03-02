/**
 * VIP Diamond Stipend — Monthly Cron
 * ═══════════════════════════════════════════════════════════════════════════
 * Grants 500 diamonds to all active VIP members on the 1st of each month.
 *
 * Cron: Runs on the 1st of every month at 00:05 UTC
 * Schedule: 5 0 1 * *
 *
 * Logic:
 * 1. Find all profiles where is_vip = true AND vip_expires_at > now
 * 2. For each VIP user, credit 500 diamonds to user_diamond_balance
 * 3. Log the stipend in diamond_transactions for audit trail
 * 4. Skip users who already received their stipend this month
 */

import { createClient } from '@supabase/supabase-js';

const VIP_MONTHLY_STIPEND = 500;

export const config = {
    maxDuration: 60
};

export default async function handler(req, res) {
    // Verify cron secret
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // 1. Get all active VIP users
        const { data: vipUsers, error: fetchErr } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('is_vip', true)
            .gt('vip_expires_at', now.toISOString());

        if (fetchErr) {
            console.error('[VIP Stipend] Error fetching VIP users:', fetchErr);
            return res.status(500).json({ error: fetchErr.message });
        }

        if (!vipUsers || vipUsers.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No active VIP users found',
                credited: 0
            });
        }

        let credited = 0;
        let skipped = 0;
        const errors = [];

        for (const user of vipUsers) {
            try {
                // 2. Check if stipend already granted this month
                //    Uses unique reference_id per user per month for reliable idempotency
                const stipendRefId = `vip_stipend_${user.id}_${monthKey}`;

                const { data: existing } = await supabase
                    .from('diamond_transactions')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('reference_id', stipendRefId)
                    .limit(1);

                if (existing && existing.length > 0) {
                    skipped++;
                    continue;
                }

                // 3. Credit diamonds atomically via RPC with unique reference_id
                const { error: rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: user.id,
                    p_amount: VIP_MONTHLY_STIPEND,
                    p_type: 'bonus',
                    p_description: `VIP Monthly Stipend — ${monthKey}`,
                    p_reference_id: stipendRefId
                });

                if (rpcErr) {
                    console.error(`[VIP Stipend] RPC error for ${user.id}:`, rpcErr.message);
                    errors.push({ userId: user.id, error: rpcErr.message });
                    continue;
                }

                credited++;
                console.log(`[VIP Stipend] ✅ Credited ${VIP_MONTHLY_STIPEND} 💎 to ${user.username || user.id}`);

            } catch (userErr) {
                console.error(`[VIP Stipend] Error for user ${user.id}:`, userErr);
                errors.push({ userId: user.id, error: userErr.message });
            }
        }

        console.log(`[VIP Stipend] Complete: ${credited} credited, ${skipped} skipped, ${errors.length} errors`);

        return res.status(200).json({
            success: true,
            month: monthKey,
            totalVipUsers: vipUsers.length,
            credited,
            skipped,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('[VIP Stipend] Cron error:', error);
        return res.status(500).json({ error: error.message });
    }
}
