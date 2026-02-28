/**
 * POST /api/club-arena/buyin
 * 
 * Player converts diamonds → club chips (buy-in).
 * Atomic: deduct diamonds from profile, add chips to club_members,
 * record chip_transaction — all server-side with service_role.
 * 
 * Rate: 38 diamonds = 100 chips (75% Cheaper Law)
 * 
 * Body: { clubId, chipAmount }
 * Auth: Bearer token
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

  const { clubId, chipAmount } = req.body;
  if (!clubId || !chipAmount || chipAmount <= 0) {
    return res.status(400).json({ error: 'clubId and positive chipAmount required' });
  }

  const amount = Math.floor(chipAmount);
  // 75% Cheaper Law: 38 diamonds = 100 chips
  const diamondCost = Math.ceil((amount / 100) * 38);

  try {
    // 1. Read fresh balances
    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('diamonds')
      .eq('id', user.id)
      .single();

    if (profErr || !profile) return res.status(404).json({ error: 'Profile not found' });

    const currentDiamonds = profile.diamonds || 0;
    if (diamondCost > currentDiamonds) {
      return res.status(400).json({
        error: 'Insufficient diamonds',
        needed: diamondCost,
        available: currentDiamonds,
        chipAmount: amount,
      });
    }

    const { data: member, error: memErr } = await supabaseAdmin
      .from('club_members')
      .select('chip_balance')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .single();

    if (memErr || !member) return res.status(404).json({ error: 'Not a member of this club' });

    const currentChips = member.chip_balance || 0;

    // 2. Deduct diamonds
    const { error: deductErr } = await supabaseAdmin
      .from('profiles')
      .update({ diamonds: currentDiamonds - diamondCost })
      .eq('id', user.id);

    if (deductErr) throw deductErr;

    // 3. Add chips
    const { error: addErr } = await supabaseAdmin
      .from('club_members')
      .update({ chip_balance: currentChips + amount })
      .eq('club_id', clubId)
      .eq('user_id', user.id);

    if (addErr) {
      // Rollback diamonds
      await supabaseAdmin
        .from('profiles')
        .update({ diamonds: currentDiamonds })
        .eq('id', user.id);
      throw addErr;
    }

    // 4. Record transaction
    await supabaseAdmin.from('chip_transactions').insert({
      from_user_id: user.id,
      to_user_id: user.id,
      club_id: clubId,
      transaction_type: 'buyin',
      amount,
      notes: `Buy-in: ${amount.toLocaleString()} chips for ${diamondCost} 💎`,
    });

    return res.status(200).json({
      success: true,
      chipAmount: amount,
      diamondCost,
      newChipBalance: currentChips + amount,
      newDiamondBalance: currentDiamonds - diamondCost,
    });
  } catch (err) {
    console.error('[buyin]', err);
    return res.status(500).json({ error: 'Buy-in failed', details: err.message });
  }
}
