/**
 * POST /api/club-arena/mint-chips
 * 
 * Union owner or club owner mints new chips into the club treasury.
 * Records the allocation as a club_transaction.
 * 
 * Body: { clubId, amount, notes? }
 * Auth: Bearer token (must be club owner or union admin)
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

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId, amount, notes } = req.body;
  if (!clubId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'clubId and positive amount required' });
  }

  try {
    // 1. Get club details
    const { data: club, error: clubErr } = await supabaseAdmin
      .from('clubs')
      .select('id, name, chip_treasury, union_id, owner_id')
      .eq('id', clubId)
      .single();

    if (clubErr || !club) return res.status(404).json({ error: 'Club not found' });

    // 2. Check authorization: must be club owner or union admin
    let authorized = club.owner_id === user.id;

    if (!authorized && club.union_id) {
      const { data: unionAdmin } = await supabaseAdmin
        .from('union_admins')
        .select('role')
        .eq('union_id', club.union_id)
        .eq('user_id', user.id)
        .single();
      authorized = !!unionAdmin;
    }

    if (!authorized) {
      return res.status(403).json({ error: 'Only club owner or union admin can mint chips' });
    }

    // 3. Update club treasury
    const currentTreasury = club.chip_treasury || 0;
    const { error: updateErr } = await supabaseAdmin
      .from('clubs')
      .update({ chip_treasury: currentTreasury + amount })
      .eq('id', clubId);

    if (updateErr) throw updateErr;

    // 4. Record transaction
    await supabaseAdmin.from('club_transactions').insert({
      club_id: clubId,
      user_id: user.id,
      transaction_type: 'deposit',
      amount,
      description: notes || `Chip mint: ${amount.toLocaleString()} chips added to treasury`,
      metadata: {
        source: club.union_id ? 'union_allocation' : 'owner_mint',
        union_id: club.union_id,
        treasury_before: currentTreasury,
        treasury_after: currentTreasury + amount,
      },
    });

    return res.status(200).json({
      success: true,
      clubId,
      amount,
      treasuryBefore: currentTreasury,
      treasuryAfter: currentTreasury + amount,
    });
  } catch (err) {
    console.error('[mint-chips]', err);
    return res.status(500).json({ error: 'Mint failed', details: err.message });
  }
}
