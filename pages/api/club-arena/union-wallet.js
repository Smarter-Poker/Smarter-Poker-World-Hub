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
import { validateUnionWallet } from '../../../src/contracts/orb4_syndicate';
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyUnionLead(token, unionId) {
  // UNION AUDIT FIX 2026-07-21: `error` was referenced without being destructured,
  // throwing ReferenceError on EVERY request — the entire union wallet API
  // returned 500 since ORB-4 shipped.
  const { data: authData, error } = await supabaseAdmin.auth.getUser(token);
  const user = authData?.user;
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
  try {

  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  // CONCURRENCY LOCKDOWN: Idempotency guard for mutation actions
  // Read-only actions (get_balances, get_transactions) are exempted
  const mutationActions = ['send_to_club', 'move_rake_to_chips', 'process_bbj_payout'];
  if (mutationActions.includes(req.body?.action)) {
    if (checkIdempotency(req, res)) return;
  }

  // RED TEAM: Payload size check — max 2KB
  if (JSON.stringify(req.body).length > 2048) {
    return res.status(413).json({ success: false, error: 'Request body too large' });
  }

  // RED TEAM: Zod Contract Validation (MANDATE: Reject 100% with 400 Bad Request before hitting Postgres)
  const validation = validateUnionWallet(req.body);
  if (!validation.success) {
    // 400 Bad Request, instantly rejects any hostile, fractional, or oversized payloads
    return res.status(400).json({ success: false, error: validation.error });
  }

  const payload = validation.data;
  const { action, unionId } = payload;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

  const auth = await verifyUnionLead(token, unionId);
  if (auth.error) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    // ── GET_BALANCES ────────────────────────────────────────────────────────
    // UNION AUDIT FIX 2026-07-21: balances were read from the LEGACY wallet
    // columns on `unions` (all zero). Every money RPC (fn_union_debit_wallet,
    // fn_union_credit_wallet, increment_union_wallet, fn_union_send_chips_to_club)
    // operates on the `union_wallets` table — that is the real store. Read it.
    if (action === 'get_balances') {
      const { data: union } = await supabaseAdmin
        .from('unions')
        .select('id, name, backup_bbj_balance')
        .eq('id', unionId)
        .maybeSingle();

      if (!union) return res.status(404).json({ success: false, error: 'Union not found' });

      const { data: wallet } = await supabaseAdmin
        .from('union_wallets')
        .select('chip_balance, rake_wallet, bbj_wallet, promo_wallet, insurance_wallet, total_rake_collected, total_settlements')
        .eq('union_id', unionId)
        .maybeSingle();

      const { data: recentTxns } = await supabaseAdmin
        .from('union_wallet_transactions')
        .select('*, clubs(name)')
        .eq('union_id', unionId)
        .order('created_at', { ascending: false })
        .limit(100);

      const w = wallet || {};
      return res.json({
        success: true,
        wallets: {
          chip_balance: Number(w.chip_balance || 0),
          rake_wallet: Number(w.rake_wallet || 0),
          bbj_wallet: Number(w.bbj_wallet || 0),
          promo_wallet: Number(w.promo_wallet || 0),
          insurance_wallet: Number(w.insurance_wallet || 0),
          backup_bbj_balance: Number(union.backup_bbj_balance || 0),
          total_rake_collected: Number(w.total_rake_collected || 0),
          total_settlements: Number(w.total_settlements || 0),
          total:
            Number(w.chip_balance || 0) +
            Number(w.rake_wallet || 0) +
            Number(w.bbj_wallet || 0) +
            Number(w.promo_wallet || 0) +
            Number(w.insurance_wallet || 0) +
            Number(union.backup_bbj_balance || 0),
        },
        recentTransactions: recentTxns || [],
      });
    }

    // Lead-only actions from here
    if (!auth.isLead) {
      return res.status(403).json({ success: false, error: 'Union Lead access required for fund transfers' });
    }

    // ── SEND_TO_CLUB — chip_balance -> club treasury (CONCURRENCY-HARDENED) ──
    if (action === 'send_to_club') {
      const { clubId, amount, notes } = payload;
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });
      const amt = amount; // Already validated as positive integer <= 1B by Zod

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

      // MANDATE 1: Concurrency-safe debit→credit with rollback on failure.
      // Step 1: Debit union chip_balance (atomic RPC with internal FOR UPDATE lock)
      const { error: debitErr } = await supabaseAdmin.rpc('fn_union_debit_wallet', {
        p_union_id: unionId,
        p_wallet: 'chip_balance',
        p_amount: amt,
      });
      if (debitErr) {
        console.warn('[union-wallet] send_to_club debit failed:', debitErr.message);
        return res.status(400).json({ success: false, error: 'Insufficient union balance' });
      }

      // Step 2: Credit club treasury — ROLLBACK debit if this fails
      const { error: creditErr } = await supabaseAdmin.rpc('fn_credit_treasury', {
        p_club_id: clubId,
        p_amount: amt,
      });
      if (creditErr) {
        console.warn('[union-wallet] send_to_club credit failed, rolling back debit:', creditErr.message);
        await supabaseAdmin.rpc('fn_union_credit_wallet', {
          p_union_id: unionId,
          p_wallet: 'chip_balance',
          p_amount: amt,
        }).catch(rbErr => console.warn('[union-wallet] CRITICAL: rollback failed:', rbErr.message));
        return res.status(500).json({ success: false, error: 'Transfer failed (rolled back)' });
      }

      // Ledger entries (fire-and-forget, transfer already succeeded)
      const txNote = (notes?.trim() || `Union transfer to ${club.name}`).slice(0, 500).replace(/[;'"\\]/g, '');
      const { error: unionTxErr } = await supabaseAdmin.from('union_wallet_transactions').insert({
        union_id: unionId,
        wallet: 'chip_balance',
        direction: 'debit',
        amount: amt,
        tx_type: 'manual_transfer',
        club_id: clubId,
        notes: txNote,
        created_by: auth.user.id,
      });
      if (unionTxErr) console.warn('[union-wallet] Failed to log union wallet tx:', unionTxErr.message);

      const { error: chipTxErr } = await supabaseAdmin.from('chip_transactions').insert({
        club_id: clubId,
        amount: amt,
        transaction_type: 'union_transfer',
        notes: txNote,
        metadata: { union_id: unionId },
      });
      if (chipTxErr) console.warn('[union-wallet] Failed to log chip tx:', chipTxErr.message);

      return res.json({
        success: true,
        message: `${amt.toLocaleString()} chips sent to ${club.name}`,
        amount: amt,
        clubName: club.name,
      });
    }

    // ── MOVE_RAKE_TO_CHIPS — rake_wallet -> chip_balance (CONCURRENCY-HARDENED) ─
    if (action === 'move_rake_to_chips') {
      const { amount, notes } = payload;
      const amt = amount; // Validated by Zod

      // MANDATE 1: Debit first, credit second, rollback on failure.
      const { error: debitErr } = await supabaseAdmin.rpc('fn_union_debit_wallet', {
        p_union_id: unionId,
        p_wallet: 'rake_wallet',
        p_amount: amt,
      });
      if (debitErr) {
        console.warn('[union-wallet] move_rake_to_chips debit failed:', debitErr.message);
        return res.status(400).json({ success: false, error: 'Insufficient rake wallet balance' });
      }

      const { error: creditErr } = await supabaseAdmin.rpc('fn_union_credit_wallet', {
        p_union_id: unionId,
        p_wallet: 'chip_balance',
        p_amount: amt,
      });
      if (creditErr) {
        console.warn('[union-wallet] move_rake_to_chips credit failed, rolling back:', creditErr.message);
        await supabaseAdmin.rpc('fn_union_credit_wallet', {
          p_union_id: unionId,
          p_wallet: 'rake_wallet',
          p_amount: amt,
        }).catch(rbErr => console.warn('[union-wallet] CRITICAL: rollback failed:', rbErr.message));
        return res.status(500).json({ success: false, error: 'Move failed (rolled back)' });
      }

      const txNote = (notes?.trim() || `Moved ${amt.toLocaleString()} from rake wallet to chip balance`).slice(0, 500).replace(/[;'"\\]/g, '');
      const { error: moveTxErr } = await supabaseAdmin.from('union_wallet_transactions').insert([
        { union_id: unionId, wallet: 'rake_wallet', direction: 'debit', amount: amt, tx_type: 'manual_transfer', notes: txNote, created_by: auth.user.id },
        { union_id: unionId, wallet: 'chip_balance', direction: 'credit', amount: amt, tx_type: 'manual_transfer', notes: txNote, created_by: auth.user.id },
      ]);
      if (moveTxErr) console.warn('[union-wallet] Failed to log move rake tx:', moveTxErr.message);

      return res.json({ success: true, message: txNote });
    }

    // ── PROCESS_BBJ_PAYOUT — atomic BBJ jackpot distribution (CONCURRENCY-HARDENED) ─
    if (action === 'process_bbj_payout') {
      const { payoutAmount, winnerId, loserId, tableShare, clubId: payoutClubId, poolId } = payload;
      const payout = payoutAmount; // Validated by Zod

      // Verify club is in this union
      const { data: ucCheck } = await supabaseAdmin
        .from('union_clubs').select('club_id')
        .eq('union_id', unionId).eq('club_id', payoutClubId).maybeSingle();
      if (!ucCheck) return res.status(403).json({ success: false, error: 'Club is not in this union' });

      // UNION AUDIT FIX 2026-07-21 (dedup): claim the payout BEFORE moving money.
      // When poolId is provided, insert the bbj_payout ledger row first —
      // a partial unique index on (union_id, tx_type, period_id) makes a
      // duplicate claim fail atomically, so the same jackpot can never be paid
      // twice even across serverless instances / idempotency-cache expiry.
      let claimRowId = null;
      if (poolId) {
        const { data: claim, error: claimErr } = await supabaseAdmin
          .from('union_wallet_transactions')
          .insert({
            union_id: unionId, wallet: 'bbj_wallet', direction: 'debit',
            amount: payout, tx_type: 'bbj_payout', club_id: payoutClubId,
            period_id: poolId,
            notes: 'BBJ payout claim (pending)',
            created_by: auth.user.id,
          })
          .select('id')
          .maybeSingle();
        if (claimErr) {
          if (claimErr.code === '23505') {
            return res.status(409).json({ success: false, error: 'This BBJ payout was already processed' });
          }
          console.warn('[union-wallet] BBJ claim insert failed:', claimErr.message);
          return res.status(500).json({ success: false, error: 'BBJ payout claim failed' });
        }
        claimRowId = claim?.id || null;
      }
      const releaseClaim = async () => {
        if (claimRowId) {
          await supabaseAdmin.from('union_wallet_transactions').delete().eq('id', claimRowId)
            .then(({ error: relErr }) => {
              if (relErr) console.warn('[union-wallet] BBJ claim release failed:', relErr.message);
            });
        }
      };

      // MANDATE 1: Sequential debit→credits with full rollback chain.
      // Step 1: Debit union bbj_wallet (RPC uses internal FOR UPDATE lock)
      const { error: bbjDebitErr } = await supabaseAdmin.rpc('fn_union_debit_wallet', {
        p_union_id: unionId,
        p_wallet: 'bbj_wallet',
        p_amount: payout,
      });
      if (bbjDebitErr) {
        console.warn('[union-wallet] BBJ payout debit failed:', bbjDebitErr.message);
        await releaseClaim();
        return res.status(400).json({ success: false, error: 'Insufficient BBJ pool balance' });
      }

      // UNION AUDIT FIX 2026-07-21 (split): honor the union's configured BBJ
      // split (manage-union update_settings stores bbj_main_pct/bbj_backup_pct/
      // bbj_promo_pct, validated to total 100: main -> loser, backup -> winner,
      // promo -> table). Previously hardcoded 50/25/25, silently ignoring the
      // admin's configuration. Falls back to 50/25/25 when unset.
      const { data: unionCfg } = await supabaseAdmin
        .from('unions').select('settings').eq('id', unionId).maybeSingle();
      const cfg = unionCfg?.settings || {};
      const mainPct = Number(cfg.bbj_main_pct);
      const backupPct = Number(cfg.bbj_backup_pct);
      const promoPct = Number(cfg.bbj_promo_pct);
      const splitConfigured =
        Number.isFinite(mainPct) && Number.isFinite(backupPct) && Number.isFinite(promoPct) &&
        mainPct >= 0 && backupPct >= 0 && promoPct >= 0 &&
        Math.round(mainPct + backupPct + promoPct) === 100;
      const loserPct = splitConfigured ? mainPct / 100 : 0.5;
      const winnerPct = splitConfigured ? backupPct / 100 : 0.25;
      const loserShare = Math.round(payout * loserPct * 100) / 100;
      const winnerShare = Math.round(payout * winnerPct * 100) / 100;
      // Table share takes the remainder so the three shares always sum to payout.
      const tblShare = Math.round((payout - loserShare - winnerShare) * 100) / 100;
      let credited = 0;

      // Step 2: Credit loser (biggest share)
      const { error: loserErr } = await supabaseAdmin.rpc('fn_credit_chips', {
        p_club_id: payoutClubId, p_user_id: loserId, p_amount: loserShare,
      });
      if (loserErr) {
        console.warn('[union-wallet] BBJ loser credit failed, rolling back:', loserErr.message);
        await supabaseAdmin.rpc('fn_union_credit_wallet', {
          p_union_id: unionId, p_wallet: 'bbj_wallet', p_amount: payout,
        }).catch(rb => console.warn('[union-wallet] CRITICAL BBJ rollback failed:', rb.message));
        await releaseClaim();
        return res.status(500).json({ success: false, error: 'BBJ payout failed (rolled back)' });
      }
      credited += loserShare;

      // Step 3: Credit winner
      const { error: winnerErr } = await supabaseAdmin.rpc('fn_credit_chips', {
        p_club_id: payoutClubId, p_user_id: winnerId, p_amount: winnerShare,
      });
      if (winnerErr) {
        console.warn('[union-wallet] BBJ winner credit failed, partial rollback:', winnerErr.message);
        // Reverse loser credit + return to pool
        await supabaseAdmin.rpc('fn_debit_chips', {
          p_club_id: payoutClubId, p_user_id: loserId, p_amount: loserShare,
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        await supabaseAdmin.rpc('fn_union_credit_wallet', {
          p_union_id: unionId, p_wallet: 'bbj_wallet', p_amount: payout,
        }).catch(rb => console.warn('[union-wallet] CRITICAL BBJ rollback failed:', rb.message));
        await releaseClaim();
        return res.status(500).json({ success: false, error: 'BBJ payout failed (rolled back)' });
      }
      credited += winnerShare;

      // Step 4: Table share → club treasury
      const { error: tableErr } = await supabaseAdmin.rpc('fn_credit_treasury', {
        p_club_id: payoutClubId, p_amount: tblShare,
      });
      if (tableErr) {
        console.warn('[union-wallet] BBJ table share failed (non-fatal):', tableErr.message);
        // Table share failure is logged but not rolled back — players already paid
      } else {
        credited += tblShare;
      }

      // Ledger: finalize the claim row when we made one; otherwise insert fresh.
      const finalNote = `BBJ payout: ${payout.toLocaleString()} chips (Loser: ${loserShare}, Winner: ${winnerShare}, Table: ${tblShare})`;
      if (claimRowId) {
        const { error: bbjTxErr } = await supabaseAdmin
          .from('union_wallet_transactions')
          .update({ notes: finalNote })
          .eq('id', claimRowId);
        if (bbjTxErr) console.warn('[union-wallet] Failed to finalize BBJ payout tx:', bbjTxErr.message);
      } else {
        const { error: bbjTxErr } = await supabaseAdmin.from('union_wallet_transactions').insert({
          union_id: unionId, wallet: 'bbj_wallet', direction: 'debit',
          amount: payout, tx_type: 'bbj_payout', club_id: payoutClubId,
          notes: finalNote,
          created_by: auth.user.id,
        });
        if (bbjTxErr) console.warn('[union-wallet] Failed to log BBJ payout tx:', bbjTxErr.message);
      }

      return res.json({
        success: true,
        message: `BBJ payout of ${payout.toLocaleString()} chips distributed`,
        payout: { total: payout, loserShare, winnerShare, tableShare: tblShare },
      });
    }

    // ── GET_TRANSACTIONS — paginated history ────────────────────────────────
    if (action === 'get_transactions') {
      const filterWallet = payload.wallet; // Validated enum by Zod
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
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[union-wallet]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
