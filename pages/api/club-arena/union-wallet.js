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
  const mutationActions = ['send_to_club', 'move_rake_to_chips', 'process_bbj_payout', 'fund_bbj_pool'];
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

      // BBJ UNIFICATION 2026-07-21: the shared jackpot lives in the union's
      // bbj_pools row (engine-fed contributions + manual funding + payouts).
      const { data: pool } = await supabaseAdmin
        .from('bbj_pools')
        .select('id, main_balance, backup_balance, promo_balance, total_contributed, total_paid_out, hit_count, last_hit_at, last_hit_amount')
        .eq('union_id', unionId)
        .eq('status', 'active')
        .maybeSingle();

      const w = wallet || {};
      return res.json({
        success: true,
        bbj_pool: pool
          ? {
              id: pool.id,
              main_balance: Number(pool.main_balance || 0),
              backup_balance: Number(pool.backup_balance || 0),
              promo_balance: Number(pool.promo_balance || 0),
              total_contributed: Number(pool.total_contributed || 0),
              total_paid_out: Number(pool.total_paid_out || 0),
              hit_count: pool.hit_count || 0,
              last_hit_at: pool.last_hit_at,
              last_hit_amount: Number(pool.last_hit_amount || 0),
            }
          : null,
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
      const { payoutAmount, winnerId, loserId, clubId: payoutClubId, poolId, payoutEventId } = payload;
      const payout = payoutAmount; // Validated by Zod

      // Verify club is in this union
      const { data: ucCheck } = await supabaseAdmin
        .from('union_clubs').select('club_id')
        .eq('union_id', unionId).eq('club_id', payoutClubId).maybeSingle();
      if (!ucCheck) return res.status(403).json({ success: false, error: 'Club is not in this union' });

      // BBJ UNIFICATION 2026-07-21: the payout is sourced from the union's
      // shared bbj_pools row (the ledger the engine feeds and the UI displays),
      // NOT from the never-funded union_wallets.bbj_wallet.
      const { data: unionPool } = await supabaseAdmin
        .from('bbj_pools')
        .select('id, main_balance')
        .eq('union_id', unionId)
        .eq('status', 'active')
        .maybeSingle();
      if (!unionPool) {
        return res.status(404).json({ success: false, error: 'No active BBJ pool for this union' });
      }

      // Dedup: claim the payout BEFORE moving money. payoutEventId (a client-
      // generated UUID per payout event) is unique-indexed on
      // (union_id, tx_type='bbj_payout', period_id), so a retry/double-click
      // can never pay the same jackpot twice — across serverless instances too.
      const eventId = payoutEventId || poolId || null;
      let claimRowId = null;
      if (eventId) {
        const { data: claim, error: claimErr } = await supabaseAdmin
          .from('union_wallet_transactions')
          .insert({
            union_id: unionId, wallet: 'bbj_pool', direction: 'debit',
            amount: payout, tx_type: 'bbj_payout', club_id: payoutClubId,
            period_id: eventId,
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

      // Honor the union's configured BBJ split (bbj_main_pct -> loser,
      // bbj_backup_pct -> winner, bbj_promo_pct -> table; validated to total
      // 100 by manage-union). Falls back to 50/25/25 when unset.
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

      // Single atomic RPC: pool debit + player credits + treasury table share.
      const { data: poolRes, error: poolErr } = await supabaseAdmin.rpc('fn_union_bbj_pool_payout', {
        p_union_id: unionId,
        p_pool_id: unionPool.id,
        p_club_id: payoutClubId,
        p_loser_id: loserId,
        p_winner_id: winnerId,
        p_loser_share: loserShare,
        p_winner_share: winnerShare,
        p_table_share: tblShare,
      });
      if (poolErr || poolRes?.success === false) {
        const msg = poolErr?.message || poolRes?.error || 'BBJ payout failed';
        console.warn('[union-wallet] BBJ pool payout failed:', msg);
        await releaseClaim();
        const status = String(msg).includes('insufficient') ? 400 : 500;
        return res.status(status).json({ success: false, error: msg });
      }

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
      // Ledger: finalize the claim row when we made one; otherwise insert fresh.
      const finalNote = `BBJ pool payout: ${payout.toLocaleString()} chips (Loser: ${loserShare}, Winner: ${winnerShare}, Table: ${tblShare}) — pool balance after: ${poolRes?.pool_balance_after ?? 'n/a'}`;
      if (claimRowId) {
        const { error: bbjTxErr } = await supabaseAdmin
          .from('union_wallet_transactions')
          .update({ notes: finalNote })
          .eq('id', claimRowId);
        if (bbjTxErr) console.warn('[union-wallet] Failed to finalize BBJ payout tx:', bbjTxErr.message);
      } else {
        const { error: bbjTxErr } = await supabaseAdmin.from('union_wallet_transactions').insert({
          union_id: unionId, wallet: 'bbj_pool', direction: 'debit',
          amount: payout, tx_type: 'bbj_payout', club_id: payoutClubId,
          notes: finalNote,
          created_by: auth.user.id,
        });
        if (bbjTxErr) console.warn('[union-wallet] Failed to log BBJ payout tx:', bbjTxErr.message);
      }

      return res.json({
        success: true,
        message: `BBJ payout of ${payout.toLocaleString()} chips distributed from the pool`,
        payout: { total: payout, loserShare, winnerShare, tableShare: tblShare },
        poolBalanceAfter: poolRes?.pool_balance_after ?? null,
      });
    }

    // ── FUND_BBJ_POOL — union bank chip_balance -> shared jackpot pool ──────
    // BBJ UNIFICATION 2026-07-21: lets union leads seed/boost the shared
    // jackpot. Single atomic RPC (debit wallet, credit pool per the union's
    // configured split, ledger row inside).
    if (action === 'fund_bbj_pool') {
      const { amount, notes } = payload;
      const { data: fundCfgRow } = await supabaseAdmin
        .from('unions').select('settings').eq('id', unionId).maybeSingle();
      const fundCfg = fundCfgRow?.settings || {};
      const fMain = Number(fundCfg.bbj_main_pct);
      const fBackup = Number(fundCfg.bbj_backup_pct);
      const fPromo = Number(fundCfg.bbj_promo_pct);
      const fundSplitOk =
        Number.isFinite(fMain) && Number.isFinite(fBackup) && Number.isFinite(fPromo) &&
        fMain >= 0 && fBackup >= 0 && fPromo >= 0 && Math.round(fMain + fBackup + fPromo) === 100;

      const { data: fundRes, error: fundErr } = await supabaseAdmin.rpc('fn_union_fund_bbj_pool', {
        p_union_id: unionId,
        p_amount: amount,
        p_main_pct: fundSplitOk ? fMain : 50,
        p_backup_pct: fundSplitOk ? fBackup : 25,
        p_promo_pct: fundSplitOk ? fPromo : 25,
        p_notes: notes || null,
        p_created_by: auth.user.id,
      });
      if (fundErr || fundRes?.success === false) {
        const msg = fundErr?.message || fundRes?.error || 'BBJ pool funding failed';
        console.warn('[union-wallet] fund_bbj_pool failed:', msg);
        const status = String(msg).includes('insufficient') ? 400 : 500;
        return res.status(status).json({ success: false, error: msg });
      }

      return res.json({
        success: true,
        message: `${Number(amount).toLocaleString()} chips moved to the shared BBJ pool`,
        allocation: { main: fundRes.main, backup: fundRes.backup, promo: fundRes.promo },
        unionBalanceAfter: fundRes.union_balance_after,
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
