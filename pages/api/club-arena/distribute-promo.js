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

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { action, clubId, ...params } = req.body;
  if (!clubId) return res.status(400).json({ error: 'clubId required' });

  // Verify caller is agent (or admin/owner for status/history)
  const { data: member } = await supabaseAdmin
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) return res.status(403).json({ error: 'Not a member of this club' });

  try {
    switch (action) {
      // ═══════════════════════════════════════════════════════
      // SEND — Agent distributes promo to player
      // ═══════════════════════════════════════════════════════
      case 'send': {
        if (!['agent', 'owner', 'admin'].includes(member.role)) {
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

        // ── Pre-check: get player status for better error messages ──
        const { data: playerStatus } = await supabaseAdmin.rpc('get_promo_status', {
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
        const { data: result, error: rpcErr } = await supabaseAdmin.rpc('transfer_promo_agent_to_player', {
          p_club_id: clubId,
          p_agent_user_id: user.id,
          p_player_user_id: targetUserId,
          p_amount: amt,
          p_note: note || 'Agent promo distribution',
        });

        if (rpcErr) {
          return res.status(500).json({ error: 'Distribution failed', details: rpcErr.message });
        }

        if (!result?.success) {
          return res.status(400).json({ error: result?.error || 'Distribution failed', details: result });
        }

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

        const { data: status, error: statusErr } = await supabaseAdmin.rpc('get_promo_status', {
          p_club_id: clubId,
          p_player_user_id: statusTarget,
        });

        if (statusErr) return res.status(500).json({ error: statusErr.message });
        if (!status?.success) return res.status(400).json({ error: status?.error || 'Not found' });

        return res.status(200).json({ success: true, ...status });
      }

      // ═══════════════════════════════════════════════════════
      // HISTORY — Agent's distribution history
      // ═══════════════════════════════════════════════════════
      case 'history': {
        const { data: distributions, error: histErr } = await supabaseAdmin
          .from('promo_distributions')
          .select('id, player_user_id, amount, note, created_at')
          .eq('club_id', clubId)
          .eq('agent_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (histErr) return res.status(500).json({ error: histErr.message });

        // Enrich with player names
        const playerIds = [...new Set((distributions || []).map(d => d.player_user_id))];
        let profiles = {};
        if (playerIds.length > 0) {
          const { data: profs } = await supabaseAdmin
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
    console.error('[distribute-promo]', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}
