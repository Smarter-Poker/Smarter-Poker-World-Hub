/**
 * POST /api/club-arena/delete-club
 * 
 * Permanently deletes a club and all related data.
 * Cascade deletes in FK-safe order.
 * 
 * Body: { clubId, confirmName }
 * Auth: Bearer token (must be club owner)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
import { reportApiError } from '../../../src/lib/sentryWrap';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { data: authData, error: authError } = await getSupabase().auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { clubId, confirmName } = req.body;
    if (!clubId || !confirmName) {
      return res.status(400).json({ success: false, error: 'clubId and confirmName required' });
    }

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/delete-club')) return;

    try {
      // 1. Verify club exists and caller is owner
      const { data: club } = await getSupabase()
        .from('clubs')
        .select('id, name, owner_id')
        .eq('id', clubId)
        .maybeSingle();

      if (!club) return res.status(404).json({ success: false, error: 'Club not found' });
      if (club.owner_id !== user.id) {
        return res.status(403).json({ success: false, error: 'Only the club owner can delete the club' });
      }

      // 2. Confirm name matches
      if (confirmName !== club.name) {
        return res.status(400).json({ success: false, error: 'Club name does not match' });
      }

      // SECURITY FIX 2026-07-19: audit-log this destructive cascade BEFORE it
      // runs (was unlogged), capturing a snapshot of members and any non-zero
      // chip balances that will be destroyed, so the deletion is forensically
      // reconstructable. (Balance return-to-treasury sweep is a follow-up.)
      try {
        const { data: memberSnapshot } = await getSupabase()
          .from('club_members')
          .select('user_id, role, chip_balance')
          .eq('club_id', clubId)
          .limit(10000);
        const nonZero = (memberSnapshot || []).filter((m) => Number(m.chip_balance) > 0);
        await logAudit(getSupabase(), {
          actionType: 'club_deleted',
          userId: user.id,
          clubId,
          ip: extractIP(req),
          details: {
            clubName: club.name,
            memberCount: (memberSnapshot || []).length,
            nonZeroBalanceCount: nonZero.length,
            totalChipsDestroyed: nonZero.reduce((s, m) => s + Number(m.chip_balance || 0), 0),
            nonZeroBalances: nonZero.slice(0, 200),
          },
        });
      } catch (auditErr) {
        console.warn('[delete-club] audit log failed (proceeding):', auditErr?.message || auditErr);
      }

      // 3. Cascade delete in FK-safe order
      const tables = [
        'chip_transactions',
        'cashout_requests',
        'commission_records',
        'commission_history',
        'settlement_invoices',
        'settlement_locks',
        'rakeback_distributions',
        'rakeback_payments',
        'rakeback_periods',
        'anti_cheat_flags',
        'rake_records',
        'settlement_periods',
        'club_announcements',
        'bbj_contributions',
        'bbj_winners',
        'bbj_pools',
        'club_shop_purchases',
        'club_shop_items',
        'hand_histories',
        'promo_distributions',
        'promo_transactions',
        'player_notes',
        'union_leave_requests',
        'audit_logs',
        'tables',
        'union_clubs',
        'agents',
        'club_transactions',
      ];

      for (const table of tables) {
        try {
          await getSupabase().from(table).delete().eq('club_id', clubId);
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
      }

      // 4. Delete members
      const { error: err_club_members_bo01p } = await getSupabase().from('club_members').delete().eq('club_id', clubId);
      if (err_club_members_bo01p) console.warn('[Supabase] Silent mutation failed in club_members:', err_club_members_bo01p.message);

      // 5. Delete club
      const { error: deleteErr } = await getSupabase().from('clubs').delete().eq('id', clubId);
      if (deleteErr) throw deleteErr;

      return res.status(200).json({
        success: true,
        message: `Club "${club.name}" has been permanently deleted`,
      });
    } catch (err) {
      console.warn('[delete-club]', err);
      return res.status(500).json({ success: false, error: 'Club deletion failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
