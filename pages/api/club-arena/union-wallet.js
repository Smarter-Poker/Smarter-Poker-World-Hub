/**
 * POST /api/club-arena/union-wallet
 *
 * Union wallet management — view balances, send chips to clubs, manual transfers.
 *
 * Actions:
 *   get_balances        — Wallet balances + recent transactions
 *   send_to_club        — Transfer from union chip_balance to a club treasury
 *   move_rake_to_chips  — Move accumulated rake_wallet into chip_balance for distribution
 *   get_transactions    — Paginated wallet transaction history
 *
 * Auth: Bearer token (union_lead or platform admin)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyUnionLead(token, unionId) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: 'Not authenticated', status: 401 };

  // Union lead check
  const { data: admin } = await supabaseAdmin
    .from('union_admins')
    .select('role')
    .eq('union_id', unionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (admin?.role === 'union_lead') return { user, isLead: true };

  // Platform admin fallback
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (['admin', 'superadmin'].includes(profile?.role)) return { user, isLead: true, isPlatformAdmin: true };

  // Union admins can view but not move funds
  if (admin) return { user, isLead: false };

  return { error: 'Not a union admin', status: 403 };
}

export default async function handler(req, res) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

  const { action, unionId, clubId, amount, wallet, notes } = req.body;
  if (!unionId) return res.status(400).json({ success: false, error: 'unionId required' });
  if (!action) return res.status(400).json({ success: false, error: 'action required' });

  const auth = await verifyUnionLead(token, unionId);
  if (auth.error) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    // ── GET_BALANCES ────────────────────────────────────────────────────────
    if (action === 'get_balances') {
      const { data: union } = await supabaseAdmin
        .from('unions')
        .select('id, name, chip_balance, rake_wallet, bbj_wallet, promo_wallet')
        .eq('id', unionId)
        .maybeSingle();

      if (!union) return res.status(404).json({ success: false, error: 'Union not found' });

      const { data: recentTxns } = await supabaseAdmin
        .from('union_wallet_transactions')
        .select('*, clubs(name)')
        .eq('union_id', unionId)
        .order('created_at', { ascending: false })
        .limit(20);

      return res.json({
        success: true,
        wallets: {
          chip_balance: Number(union.chip_balance || 0),
          rake_wallet: Number(union.rake_wallet || 0),
          bbj_wallet: Number(union.bbj_wallet || 0),
          promo_wallet: Number(union.promo_wallet || 0),
          total: Number(union.chip_balance || 0) + Number(union.rake_wallet || 0) + Number(union.bbj_wallet || 0) + Number(union.promo_wallet || 0),
        },
        recentTransactions: recentTxns || [],
      });
    }

    // Lead-only actions from here
    if (!auth.isLead) {
      return res.status(403).json({ success: false, error: 'Union Lead access required for fund transfers' });
    }

    // ── SEND_TO_CLUB — chip_balance -> club treasury ────────────────────────
    if (action === 'send_to_club') {
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) return res.status(400).json({ success: false, error: 'amount must be positive' });

      // Verify club is in this union
      const { data: uc } = await supabaseAdmin
        .from('union_clubs')
        .select('club_id')
        .eq('union_id', unionId)
        .eq('club_id', clubId)
        .maybeSingle();
      if (!uc) return res.status(403).json({ success: false, error: 'Club is not in this union' });

      const { data: club } = await supabaseAdmin
        .from('clubs').select('id, name').eq('id', clubId).maybeSingle();
      if (!club) return res.status(404).json({ success: false, error: 'Club not found' });

      // Debit union chip_balance (throws if insufficient)
      await supabaseAdmin.rpc('fn_union_debit_wallet', {
        p_union_id: unionId,
        p_wallet: 'chip_balance',
        p_amount: amt,
      });

      // Credit club treasury
      await supabaseAdmin.rpc('fn_credit_treasury', {
        p_club_id: clubId,
        p_amount: amt,
      });

      // Ledger entries
      const txNote = notes?.trim() || `Union transfer to ${club.name}`;
      await supabaseAdmin.from('union_wallet_transactions').insert({
        union_id: unionId,
        wallet: 'chip_balance',
        direction: 'debit',
        amount: amt,
        tx_type: 'manual_transfer',
        club_id: clubId,
        notes: txNote,
        created_by: auth.user.id,
      }).catch(() => {});

      await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        amount: amt,
        transaction_type: 'union_transfer',
        notes: txNote,
        metadata: { union_id: unionId },
      }).catch(() => {});

      return res.json({
        success: true,
        message: `${amt.toLocaleString()} chips sent to ${club.name}`,
        amount: amt,
        clubName: club.name,
      });
    }

    // ── MOVE_RAKE_TO_CHIPS — rake_wallet -> chip_balance ────────────────────
    if (action === 'move_rake_to_chips') {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) return res.status(400).json({ success: false, error: 'amount must be positive' });

      await supabaseAdmin.rpc('fn_union_debit_wallet', {
        p_union_id: unionId,
        p_wallet: 'rake_wallet',
        p_amount: amt,
      });

      await supabaseAdmin.rpc('fn_union_credit_wallet', {
        p_union_id: unionId,
        p_wallet: 'chip_balance',
        p_amount: amt,
      });

      const txNote = notes?.trim() || `Moved ${amt.toLocaleString()} from rake wallet to chip balance`;
      await supabaseAdmin.from('union_wallet_transactions').insert([
        { union_id: unionId, wallet: 'rake_wallet', direction: 'debit', amount: amt, tx_type: 'manual_transfer', notes: txNote, created_by: auth.user.id },
        { union_id: unionId, wallet: 'chip_balance', direction: 'credit', amount: amt, tx_type: 'manual_transfer', notes: txNote, created_by: auth.user.id },
      ]).catch(() => {});

      return res.json({ success: true, message: txNote });
    }

    // ── GET_TRANSACTIONS — paginated history ────────────────────────────────
    if (action === 'get_transactions') {
      const filterWallet = req.body.wallet;
      let query = supabaseAdmin
        .from('union_wallet_transactions')
        .select('*, clubs(name)')
        .eq('union_id', unionId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (filterWallet) query = query.eq('wallet', filterWallet);
      const { data: txns, error: txnErr } = await query;
      if (txnErr) throw txnErr;
      return res.json({ success: true, transactions: txns || [] });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[union-wallet]', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error' });
  }
}
