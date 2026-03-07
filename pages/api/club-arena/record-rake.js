/**
 * POST /api/club-arena/record-rake
 * 
 * Called by the poker engine after each hand to record rake.
 * DELEGATES to Supabase RPCs:
 *   - record_rake() — Dealt method, BBJ routing, union split
 *   - calculate_cascading_commission() — Agent commission chain
 *
 * Body: { clubId, tableId, handId, potSize, rakeAmount, numPlayers,
 *         bbjContribution?, dealtPlayerIds?: string[] }
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const engineKey = req.headers['x-engine-key'];
  const token = req.headers.authorization?.replace('Bearer ', '');

  // Engine-to-engine calls use a shared secret
  const validEngineKey = engineKey && process.env.ENGINE_INTERNAL_SECRET && engineKey === process.env.ENGINE_INTERNAL_SECRET;

  if (!validEngineKey && !token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  if (token && !validEngineKey) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: member } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', req.body.clubId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!['owner', 'admin'].includes(member?.role)) {
      return res.status(403).json({ success: false, error: 'Only owners/admins or the engine can record rake' });
    }
  }

  const { clubId, tableId, handId, potSize, rakeAmount: rawRake, numPlayers, bbjContribution, dealtPlayerIds } = req.body;
  const rakeAmount = Math.floor(Number(rawRake));
  const safePotSize = Math.floor(Number(potSize)) || 0;

  if (!clubId || !Number.isFinite(rakeAmount) || rakeAmount < 0 || rakeAmount > 100_000_000) {
    return res.status(400).json({ success: false, error: 'clubId and valid non-negative rakeAmount required' });
  }

  try {
    // STEP 1: Record rake via RPC (Dealt Method + BBJ routing)
    const { data: rakeResult, error: rakeErr } = await supabaseAdmin.rpc('record_rake', {
      p_hand_id: handId || `hand_${tableId}_${Date.now()}`,
      p_club_id: clubId,
      p_table_id: tableId || null,
      p_rake_amount: rakeAmount,
      p_pot_size: safePotSize,
      p_num_players: numPlayers || (dealtPlayerIds?.length || 0),
      p_bbj_contribution: bbjContribution || 0,
      p_dealt_player_ids: dealtPlayerIds?.length > 0 ? dealtPlayerIds : null,
    });

    if (rakeErr) {
      console.error('[record-rake] RPC error:', rakeErr);
      return res.status(500).json({ success: false, error: 'Rake recording failed', details: rakeErr.message });
    }

    // STEP 2: Calculate cascading commissions per dealt player
    const commissionResults = [];
    if (dealtPlayerIds?.length > 0 && rakeAmount > 0) {
      const perPlayerRake = rakeAmount / dealtPlayerIds.length;

      for (const playerId of dealtPlayerIds) {
        const { data: commResult, error: commErr } = await supabaseAdmin.rpc('calculate_cascading_commission', {
          p_hand_id: handId || `hand_${tableId}_${Date.now()}`,
          p_club_id: clubId,
          p_player_user_id: playerId,
          p_rake_amount: perPlayerRake,
        });

        if (!commErr && commResult?.success) {
          commissionResults.push({ playerId, ...commResult });
        }
      }
    }

    // STEP 3: Increment the open settlement period's counters
    // (record_rake RPC updates clubs.total_rake but NOT settlement_periods)
    if (rakeAmount > 0) {
      await supabaseAdmin.rpc('increment_settlement_counters', {
        p_club_id: clubId,
        p_rake: rakeAmount,
        p_hands: 1,
      }).catch(e => {
        // Non-fatal: settlement close has a fallback that calculates from agents
        console.warn('[record-rake] Settlement counter increment failed:', e.message);
      });
    }

    return res.status(200).json({
      success: true,
      rake: rakeResult,
      commissions: commissionResults,
    });
  } catch (err) {
    console.error('[record-rake]', err);
    return res.status(500).json({ success: false, error: 'Rake recording failed', details: err.message });
  }
}
