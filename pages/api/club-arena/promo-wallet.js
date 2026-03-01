/**
 * POST /api/club-arena/promo-wallet
 * 
 * Admin/owner promo wallet management:
 *   action: 'get_balances' — club promo balance + all agent promo balances
 *   action: 'mint_promo'   — owner adds promo chips to club balance
 *   action: 'grant_to_agent' — transfer promo from club → agent
 * 
 * ═══════════════════════════════════════════════════════════════
 * PROMO CHIPS ARE NOT SETTLEMENT DEBTS
 * ═══════════════════════════════════════════════════════════════
 * Promo chips are funded from 30% of the BBJ allocation.
 * They are ALREADY raked and accounted for. They do NOT:
 *   - Count as agent credit (no credit_used bump)
 *   - Create union settlement debts
 *   - Affect weekly_rake_generated or commission calculations
 *   - Touch chip_balance or chip_treasury
 * 
 * They flow through separate promo_balance columns on:
 *   clubs.promo_balance → agents.promo_balance → club_members.promo_balance
 * ═══════════════════════════════════════════════════════════════
 * 
 * Auth: Bearer token (owner/admin only)
 */
import { createClient } from '@supabase/supabase-js';

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

  // Verify caller is owner/admin
  const { data: member } = await supabaseAdmin
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .single();

  if (!member || !['owner', 'admin'].includes(member.role)) {
    return res.status(403).json({ error: 'Only owners and admins can manage promo wallet' });
  }

  try {
    switch (action) {
      // ═══════════════════════════════════════════════════════
      // GET BALANCES — club promo + all agent promo balances
      // ═══════════════════════════════════════════════════════
      case 'get_balances': {
        const { data: club } = await supabaseAdmin
          .from('clubs')
          .select('promo_balance')
          .eq('id', clubId)
          .single();

        const { data: agents } = await supabaseAdmin
          .from('agents')
          .select('user_id, promo_balance, commission_rate, status')
          .eq('club_id', clubId);

        // Get display names for agents
        const agentIds = (agents || []).map(a => a.user_id);
        let profiles = [];
        if (agentIds.length > 0) {
          const { data } = await supabaseAdmin
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', agentIds);
          profiles = data || [];
        }

        const agentList = (agents || []).map(a => {
          const p = profiles.find(pr => pr.id === a.user_id);
          return {
            userId: a.user_id,
            displayName: p?.display_name || p?.username || a.user_id.slice(0, 8),
            avatarUrl: p?.avatar_url,
            promoBalance: Number(a.promo_balance) || 0,
            commissionRate: a.commission_rate,
            status: a.status,
          };
        });

        return res.status(200).json({
          success: true,
          clubPromoBalance: Number(club?.promo_balance) || 0,
          agents: agentList,
          totalAgentPromo: agentList.reduce((sum, a) => sum + a.promoBalance, 0),
        });
      }

      // ═══════════════════════════════════════════════════════
      // MINT PROMO — add promo chips to club balance (owner only)
      // ═══════════════════════════════════════════════════════
      case 'mint_promo': {
        if (member.role !== 'owner') {
          return res.status(403).json({ error: 'Only the club owner can mint promo chips' });
        }

        const amount = parseFloat(params.amount);
        if (!amount || amount <= 0 || amount > 10000000) {
          return res.status(400).json({ error: 'Amount must be between 1 and 10,000,000' });
        }

        const { data: club, error: updateErr } = await supabaseAdmin
          .from('clubs')
          .update({
            promo_balance: supabaseAdmin.rpc ? undefined : 0, // fallback
            updated_at: new Date().toISOString(),
          })
          .eq('id', clubId)
          .select('promo_balance');

        // Use raw SQL to atomically increment
        const { data: result, error: rpcErr } = await supabaseAdmin.rpc('mint_club_promo', {
          p_club_id: clubId,
          p_amount: amount,
        });

        // If RPC doesn't exist, do manual update
        if (rpcErr?.message?.includes('does not exist')) {
          const { data: currentClub } = await supabaseAdmin
            .from('clubs')
            .select('promo_balance')
            .eq('id', clubId)
            .single();

          const newBalance = (Number(currentClub?.promo_balance) || 0) + amount;
          await supabaseAdmin
            .from('clubs')
            .update({ promo_balance: newBalance, updated_at: new Date().toISOString() })
            .eq('id', clubId);

          return res.status(200).json({
            success: true,
            amount,
            newBalance,
          });
        }

        if (rpcErr) {
          return res.status(500).json({ error: 'Mint failed', details: rpcErr.message });
        }

        return res.status(200).json({
          success: true,
          amount,
          ...(result || {}),
        });
      }

      // ═══════════════════════════════════════════════════════
      // GRANT TO AGENT — transfer promo from club → agent
      // ═══════════════════════════════════════════════════════
      case 'grant_to_agent': {
        const { agentUserId, amount: grantAmount, note } = params;
        const amt = parseFloat(grantAmount);

        if (!agentUserId) return res.status(400).json({ error: 'agentUserId required' });
        if (!amt || amt <= 0) return res.status(400).json({ error: 'Positive amount required' });

        const { data: result, error: rpcErr } = await supabaseAdmin.rpc('transfer_promo_club_to_agent', {
          p_club_id: clubId,
          p_agent_user_id: agentUserId,
          p_amount: amt,
          p_note: note || `Admin promo grant by ${user.id.slice(0, 8)}`,
        });

        if (rpcErr) {
          return res.status(500).json({ error: 'Grant failed', details: rpcErr.message });
        }

        if (!result?.success) {
          return res.status(400).json({ error: result?.error || 'Grant failed' });
        }

        return res.status(200).json({
          success: true,
          amount: amt,
          agentUserId,
          clubPromoAfter: result.club_promo_after,
          agentPromoAfter: result.agent_promo_after,
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[promo-wallet]', err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  }
}
