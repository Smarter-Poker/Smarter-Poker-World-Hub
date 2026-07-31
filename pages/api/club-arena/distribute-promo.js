import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/distribute-promo
 * 
 * Agent → Player promo chip distribution with full restrictions:
 *   1. Agent cannot send to their own account
 *   2. Accounts < 14 days old: max 25 per send
 *   3. Lifetime cap: 100 promo per player per club
 *   4. 3x playthrough required before cashout
 * 
 * Actions:
 *   'send'   — distribute promo from agent to player
 *   'status' — get player's promo status (cap, playthrough progress)
 *   'history' — get agent's distribution history
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
const { logAudit, extractIP } = require('../../../src/lib/club-arena/auditLogger');
import { notifyUser } from '../../../src/lib/club-arena/notify';

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
  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No auth token' });

    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { action, clubId, ...params } = req.body;
    if (!clubId) return res.status(400).json({ error: 'clubId required' });

    // RED TEAM: Payload size + field allowlist
    const ALLOWED = new Set(['action', 'clubId', 'targetUserId', 'amount', 'note']);
    const bodyStr = JSON.stringify(req.body || {});
    if (bodyStr.length > 1024) return res.status(413).json({ error: 'Request body too large' });
    const bad = Object.keys(req.body || {}).filter(k => !ALLOWED.has(k));
    if (bad.length > 0) return res.status(400).json({ error: `Unknown fields: ${bad.join(', ')}` });

    // Idempotency guard on send action
    if (action === 'send') {
      if (checkIdempotency(req, res)) return;
    }

    // Verify caller is agent (or admin/owner for status/history)
    const { data: member } = await getSupabase()
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member) return res.status(403).json({ error: 'Not a member of this club' });

    // Rate limit
    if (!applyRateLimit(req, res, 'club-arena/distribute-promo')) return;

    try {
      switch (action) {
        // ═══════════════════════════════════════════════════════
        // SEND — Agent distributes promo to player
        // ═══════════════════════════════════════════════════════
        case 'send': {
          if (!['agent', 'sub_agent', 'super_agent', 'owner', 'admin'].includes(member.role)) {
            return res.status(403).json({ error: 'Only agents can distribute promo chips' });
          }

          const { targetUserId, amount, note } = params;
          const amt = parseFloat(amount);

          if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
          if (!amt || amt <= 0) return res.status(400).json({ error: 'Positive amount required' });

          // ── RULE 1: Self-send block (enforced both API + DB level) ──
          if (targetUserId === user.id) {
            return res.status(400).json({
              error: 'You cannot send promo chips to your own account',
              rule: 'no_self_send',
            });
          }

          // ── SECURITY FIX 2026-07-19: downline enforcement ──
          // Promo chips credit the recipient's cashable chip_balance, so an
          // agent must only send to players in THEIR OWN downline (mirrors
          // distribute-chips.js). Previously any agent could funnel club-funded
          // promo into any member's cashable balance (collusion vector).
          // Owners/admins may distribute club-wide.
          if (['agent', 'sub_agent', 'super_agent'].includes(member.role)) {
            const { data: targetMember } = await getSupabase()
              .from('club_members')
              .select('agent_id')
              .eq('club_id', clubId)
              .eq('user_id', targetUserId)
              .maybeSingle();
            if (!targetMember || targetMember.agent_id !== user.id) {
              return res.status(403).json({
                error: 'You can only distribute promo chips to players in your own downline',
                rule: 'not_your_downline',
              });
            }
          }

          // ── Pre-check: get player status for better error messages ──
          const { data: playerStatus } = await getSupabase().rpc('get_promo_status', {
            p_club_id: clubId,
            p_player_user_id: targetUserId,
          });

          if (playerStatus && !playerStatus.success) {
            return res.status(400).json({ error: playerStatus.error || 'Player not found' });
          }

          // ── RULE 2: New account cap (pre-check for better UX) ──
          if (playerStatus?.is_new_account && amt > 25) {
            return res.status(400).json({
              error: `New accounts (< 14 days) can receive max 25 promo per distribution. This account is ${playerStatus.account_age_days} days old.`,
              rule: 'new_account_limit',
              account_age_days: playerStatus.account_age_days,
              max_per_send: 25,
            });
          }

          // ── RULE 3: Lifetime cap (pre-check for better UX) ──
          if (playerStatus?.remaining_promo_cap !== undefined && amt > playerStatus.remaining_promo_cap) {
            return res.status(400).json({
              error: `Player can only receive ${playerStatus.remaining_promo_cap} more promo chips (100 lifetime cap). Already received: ${playerStatus.promo_received_total}.`,
              rule: 'lifetime_cap',
              remaining_cap: playerStatus.remaining_promo_cap,
              lifetime_received: playerStatus.promo_received_total,
            });
          }

          // ── Execute via atomic RPC (enforces all rules at DB level too) ──
          const { data: result, error: rpcErr } = await getSupabase().rpc('transfer_promo_agent_to_player', {
            p_club_id: clubId,
            p_agent_user_id: user.id,
            p_player_user_id: targetUserId,
            p_amount: amt,
            p_note: note || 'Agent promo distribution',
          });

          if (rpcErr) {
            return res.status(500).json({ error: 'Distribution failed', details: process.env.NODE_ENV === 'development' ? rpcErr.message : undefined });
          }

          if (!result?.success) {
            return res.status(400).json({ error: result?.error || 'Distribution failed', details: result });
          }

          await notifyUser(supabaseAdmin, {
            userId: targetUserId,
            type: 'promo_received',
            title: 'Promo Chips Received!',
            message: `You received ${amt.toLocaleString()} promo chips.`,
            data: { clubId, amount: amt } // Could add fromAgent: user.id
          });

          logAudit(supabaseAdmin, { actionType: 'promo_send', userId: user.id, targetUserId: targetUserId, clubId, amount: amt, ip: extractIP(req), details: { agentPromoAfter: result.agent_promo_after, playerBalanceAfter: result.player_balance_after, lifetimeReceived: result.lifetime_received, remainingCap: result.remaining_cap } });
          return res.status(200).json({
            success: true,
            amount: amt,
            targetUserId,
            agentPromoAfter: result.agent_promo_after,
            playerBalanceAfter: result.player_balance_after,
            lifetimeReceived: result.lifetime_received,
            remainingCap: result.remaining_cap,
            playthroughRequired: result.playthrough_required,
            playthroughCurrent: result.playthrough_current,
            accountAgeDays: result.account_age_days,
          });
        }

        // ═══════════════════════════════════════════════════════
        // STATUS — Get player's promo status
        // ═══════════════════════════════════════════════════════
        case 'status': {
          const { targetUserId: statusTarget } = params;
          if (!statusTarget) return res.status(400).json({ error: 'targetUserId required' });

          const { data: status, error: statusErr } = await getSupabase().rpc('get_promo_status', {
            p_club_id: clubId,
            p_player_user_id: statusTarget,
          });

          if (statusErr) return res.status(500).json({ error: 'Failed to check promo status' });
          if (!status?.success) return res.status(400).json({ error: status?.error || 'Not found' });

          return res.status(200).json({ success: true, ...status });
        }

        // ═══════════════════════════════════════════════════════
        // HISTORY — Agent's distribution history
        // ═══════════════════════════════════════════════════════
        case 'history': {
          const { data: distributions, error: histErr } = await getSupabase()
            .from('promo_distributions')
            .select('id, player_user_id, amount, note, created_at')
            .eq('club_id', clubId)
            .eq('agent_user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

          if (histErr) return res.status(500).json({ error: 'Failed to load distribution history' });

          // Enrich with player names
          const playerIds = [...new Set((distributions || []).map(d => d.player_user_id))];
          let profiles = {};
          if (playerIds.length > 0) {
            const { data: profs } = await getSupabase()
              .from('profiles')
              .select('id, display_name, username')
              .in('id', playerIds)
              .limit(100);
            (profs || []).forEach(p => { profiles[p.id] = p.display_name || p.username || p.id.slice(0, 8); });
          }

          return res.status(200).json({
            success: true,
            distributions: (distributions || []).map(d => ({
              ...d,
              playerName: profiles[d.player_user_id] || d.player_user_id.slice(0, 8),
            })),
          });
        }

        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }
    } catch (err) {
      console.warn('[distribute-promo]', err);
      return res.status(500).json({ error: 'Internal error', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
