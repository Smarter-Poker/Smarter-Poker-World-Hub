/**
 * POST /api/club-arena/mint-chips
 * 
 * Mints new chips into club treasury via atomic RPC.
 * Body: { clubId, amount, notes? }
 * Auth: Bearer token (club owner or union admin)
 */
import { createClient } from '@supabase/supabase-js';
import { checkSettlementLock, sendLockedResponse } from '../../../src/lib/settlement-lock';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

  const { clubId, amount, notes } = req.body;
  if (!clubId || !amount || amount <= 0) {
    return res.status(400).json({ success: false, error: 'clubId and positive amount required' });
  }

  // BUG #153 FIX: Verify caller is club owner or union admin
  // Without this, ANY authenticated user could mint chips into ANY club's treasury.
  try {
    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id, owner_id, union_id')
      .eq('id', clubId)
      .single();

    if (!club) return res.status(404).json({ success: false, error: 'Club not found' });

    let authorized = club.owner_id === user.id;
    if (!authorized && club.union_id) {
      const { data: ua } = await supabaseAdmin
        .from('union_admins')
        .select('role')
        .eq('union_id', club.union_id)
        .eq('user_id', user.id)
        .single();
      authorized = !!ua;
    }

    if (!authorized) {
      return res.status(403).json({ success: false, error: 'Only club owner or union admin can mint chips' });
    }
  } catch (authCheckErr) {
    return res.status(500).json({ success: false, error: 'Authorization check failed' });
  }

  // Rate limit
  if (!applyRateLimit(req, res, 'club-arena/mint-chips')) return;

  // Settlement lock check
  const lockCheck = await checkSettlementLock(supabaseAdmin, clubId);
  if (lockCheck.locked) return sendLockedResponse(res, lockCheck);

  try {
    // Call atomic RPC — handles FOR UPDATE locking, auth check, and transaction logging
    const { data: result, error: rpcErr } = await supabaseAdmin.rpc('mint_club_chips', {
      p_club_id: clubId,
      p_amount: amount,
      p_minted_by: user.id,
    });

    if (rpcErr) {
      console.error('[mint-chips] RPC error:', rpcErr);
      return res.status(500).json({ success: false, error: 'Mint failed', details: rpcErr.message });
    }

    if (!result?.success) {
      return res.status(400).json({ success: false, error: result?.error || 'Mint failed' });
    }

    return res.status(200).json({
      success: true,
      clubId,
      amount,
      treasuryBefore: result.old_treasury,
      treasuryAfter: result.new_treasury,
    });
  } catch (err) {
    console.error('[mint-chips]', err);
    return res.status(500).json({ success: false, error: 'Mint failed', details: err.message });
  }
}
