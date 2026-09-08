import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

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

      // PHASE 7 (2026-09-01): A CLUB CANNOT BE DELETED OWING ITS AGENTS.
      //
      // Commission is claimed by the agent from the club bank
      // (fn_agent_claim_commission). Deleting the club deletes the agents rows
      // and the bank the claim draws on, so there would be nothing left to
      // claim and nothing left to claim it from - the debt would not be
      // settled, it would be erased. That is the same defect the GDPR precheck
      // had for a single account, one level up.
      const { data: owedRows, error: owedErr } = await getSupabase()
        .from('agent_commissions')
        .select('user_id, amount')
        .eq('club_id', clubId)
        .is('settled_at', null)
        .limit(50000);

      if (owedErr) {
        // A read that failed is not a club that owes nothing.
        return res.status(500).json({
          success: false,
          error: 'Could Not Check What This Club Owes Its Agents. Nothing Was Deleted.',
        });
      }

      const owedTotal = (owedRows || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      if (owedTotal > 0) {
        const agentsOwed = new Set((owedRows || []).map((r) => r.user_id)).size;
        return res.status(409).json({
          success: false,
          error:
            `This Club Still Owes ${owedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Chips In Unclaimed Commission To ${agentsOwed} Agent${agentsOwed === 1 ? '' : 's'}. They Must Claim It Before The Club Can Be Deleted.`,
          unclaimedCommission: Math.round(owedTotal * 100) / 100,
          agentsOwed,
        });
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
        // PHASE 7 (2026-09-01): commission_records and commission_history were
        // here. Both are dropped in club-arena migration 20260901133348; they
        // never held a row. This loop discards its errors, so naming a table
        // that no longer exists would not have failed loudly - it would just
        // have been a line that did nothing, forever.
        //
        // agent_commissions is deliberately NOT added in their place. It is the
        // record of what this club owes its agents, and the guard above refuses
        // the deletion while any of it is unclaimed rather than deleting the
        // debt along with the club.
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

      // 5. Delete the club's social page.
      //
      // ORPHAN BUG (2026-09-08). The cascade loop above keys every delete on
      // `club_id`, but social_pages links a club through linked_entity_type +
      // linked_entity_id, so it was never matched and every deleted club left
      // its page behind. Those orphans do not sit quietly: social_pages IS the
      // public directory, so each one keeps appearing in /hub/social-pages
      // Discover forever, pointing at a club that no longer exists. 26 of the
      // 37 rows in production were exactly this - every one named by the test
      // fixture that created it ("Crest Cert ...", "probe-own"), every one with
      // zero followers, and not one still resolving to a live club. The newest
      // had been created the same day this was found, so it was an actively
      // leaking path, not a historical mess. Backfill migration:
      // supabase/migrations/20260908140215_delete_orphaned_club_social_pages.sql
      //
      // linked_entity_id is `text`, not uuid, so clubId is compared as-is.
      //
      // Every child of social_pages is ON DELETE CASCADE
      // (social_page_followers, _posts, _reports, _reviews) or SET NULL
      // (commander_home_games.social_page_id, slug_history.page_id), so one
      // delete is sufficient and safe.
      //
      // This one reports instead of joining the silent catch above. A failure
      // here leaves a public page advertising a club that no longer exists,
      // which is user-visible, and a user-visible defect must not disappear
      // into a swallowed exception. It still does not abort the deletion: the
      // club itself is already gone past this point in every meaningful sense,
      // and refusing here would strand it half-deleted.
      const { data: removedPages, error: pageErr } = await getSupabase()
        .from('social_pages')
        .delete()
        .eq('linked_entity_type', 'club')
        .eq('linked_entity_id', String(clubId))
        .select('id, name');

      if (pageErr) {
        console.warn(
          '[delete-club] social page cleanup FAILED for club', clubId,
          '- a page for a deleted club may still be listed publicly:',
          pageErr.message
        );
      } else if ((removedPages || []).length > 0) {
        console.info(
          '[delete-club] removed', removedPages.length,
          'orphaned social page(s) for club', clubId
        );
      }

      // 6. Delete club
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
