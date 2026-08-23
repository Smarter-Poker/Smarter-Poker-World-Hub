/**
 * POST /api/club-arena/union-wallet
 *
 * Union wallet management — view balances, send chips to clubs, manual transfers.
 *
 * Actions:
 *   get_balances        — Wallet balances + recent transactions
 *   send_to_club        — Transfer from union chip_balance to a club treasury
 *   move_rake_to_chips  — Move accumulated rake_wallet into chip_balance for distribution
 *   fund_spin_reserve   — Move chips into the union's Spin reserve wallet
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
  const mutationActions = ['send_to_club', 'move_rake_to_chips', 'process_bbj_payout', 'fund_bbj_pool', 'fund_spin_reserve'];
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
        .select('chip_balance, rake_wallet, bbj_wallet, promo_wallet, insurance_wallet, spin_reserve_wallet, total_rake_collected, total_settlements')
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

      // SPIN TREASURY 2026-08-23: union_wallets.spin_reserve_wallet is the
      // *unallocated* reserve column and it reads 0 — every chip ever seeded
      // (20,000 taken out of promo_wallet on 2026-08-20) went straight into the
      // pool row and never sat in the column. Reporting only the column told the
      // union it had no Spin capital while 24,932 was live in the pool. Report
      // both: the idle column, the deployed pool balance, and the sum.
      const { data: unionClubRows } = await supabaseAdmin
        .from('union_clubs')
        .select('club_id')
        .eq('union_id', unionId);
      // The union-owned pool is keyed by the union id itself (owner_kind='union');
      // club-owned pools by their club id. Cover both.
      const spinOwnerIds = [unionId, ...(unionClubRows || []).map((r) => r.club_id)];
      const { data: spinPools } = await supabaseAdmin
        .from('spin_bonus_pools')
        .select(
          'id, club_id, owner_kind, balance, seeded_amount, total_deposited, total_drawn, is_active'
        )
        .in('club_id', spinOwnerIds)
        .eq('is_active', true);
      const spinDeployed = (spinPools || []).reduce(
        (sum, sp) => sum + Number(sp.balance || 0),
        0
      );

      const w = wallet || {};
      return res.json({
        success: true,
        spin_treasury: {
          // Idle capital in the union wallet, not yet seeded into a pool.
          unallocated: Number(w.spin_reserve_wallet || 0),
          // Live balance across every active Spin pool this union owns.
          deployed: spinDeployed,
          total: Number(w.spin_reserve_wallet || 0) + spinDeployed,
          pools: (spinPools || []).map((sp) => ({
            id: sp.id,
            owner_id: sp.club_id,
            owner_kind: sp.owner_kind,
            balance: Number(sp.balance || 0),
            seeded_amount: Number(sp.seeded_amount || 0),
            total_deposited: Number(sp.total_deposited || 0),
            total_drawn: Number(sp.total_drawn || 0),
          })),
        },
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
          // The capital every Spin bonus pool this union owns is seeded from.
          // It shipped on 2026-08-22 and nothing returned it, so the union that
          // owned it could not see it: the 20,000 seeding the live pool had come
          // out of promo_wallet instead, because promo_wallet was the only
          // balance anyone could actually look at.
          spin_reserve_wallet: Number(w.spin_reserve_wallet || 0),
          backup_bbj_balance: Number(union.backup_bbj_balance || 0),
          total_rake_collected: Number(w.total_rake_collected || 0),
          total_settlements: Number(w.total_settlements || 0),
          total:
            Number(w.chip_balance || 0) +
            Number(w.rake_wallet || 0) +
            Number(w.bbj_wallet || 0) +
            Number(w.promo_wallet || 0) +
            Number(w.insurance_wallet || 0) +
            Number(w.spin_reserve_wallet || 0) +
            // Deployed Spin capital is union money too — it was debited out of
            // promo_wallet, so leaving it out understated the union by 24,932.
            spinDeployed +
            Number(union.backup_bbj_balance || 0),
        },
        recentTransactions: recentTxns || [],
      });
    }

    // Lead-only actions from here
    if (!auth.isLead) {
      return res.status(403).json({ success: false, error: 'Union Lead access required for fund transfers' });
    }

    // MONEY-OPS HARDENING 2026-07-21: every transfer below is a single atomic
    // RPC (debit + credit + ledgers in one transaction) with DB-level replay
    // protection. The client's X-Idempotency-Key header doubles as the stable
    // operation id — a retry of the same submission is rejected by a unique
    // index inside the transaction, across serverless instances and cache
    // expiry. No more compensating-rollback chains.
    const opId = req.headers['x-idempotency-key'] || null;

    // ── SEND_TO_CLUB — chip_balance -> club treasury (atomic) ───────────────
    if (action === 'send_to_club') {
      const { clubId, amount, notes } = payload;
      if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });
      const amt = amount; // Already validated as positive integer <= 1B by Zod

      const { data: club } = await supabaseAdmin
        .from('clubs').select('id, name').eq('id', clubId).maybeSingle();
      if (!club) return res.status(404).json({ success: false, error: 'Club not found' });

      const txNote = (notes?.trim() || `Union transfer to ${club.name}`).slice(0, 500).replace(/[;'"\\]/g, '');
      const { data: sendRes, error: sendErr } = await supabaseAdmin.rpc('fn_union_send_to_club_atomic', {
        p_union_id: unionId,
        p_club_id: clubId,
        p_amount: amt,
        p_notes: txNote,
        p_created_by: auth.user.id,
        p_op_id: opId,
      });
      if (sendErr || sendRes?.success === false) {
        const msg = sendErr?.message || sendRes?.error || 'Transfer failed';
        if (sendRes?.duplicate) {
          return res.status(409).json({ success: false, error: 'This transfer was already processed' });
        }
        console.warn('[union-wallet] send_to_club failed:', msg);
        const status = String(msg).includes('insufficient') || String(msg).includes('not in this union') ? 400 : 500;
        return res.status(status).json({ success: false, error: msg });
      }

      return res.json({
        success: true,
        message: `${amt.toLocaleString()} chips sent to ${club.name}`,
        amount: amt,
        clubName: club.name,
        unionBalanceAfter: sendRes.union_balance_after,
      });
    }

    // ── MOVE_RAKE_TO_CHIPS — rake_wallet -> chip_balance (atomic) ───────────
    if (action === 'move_rake_to_chips') {
      const { amount, notes } = payload;
      const amt = amount; // Validated by Zod

      const txNote = (notes?.trim() || `Moved ${amt.toLocaleString()} from rake wallet to chip balance`).slice(0, 500).replace(/[;'"\\]/g, '');
      const { data: moveRes, error: moveErr } = await supabaseAdmin.rpc('fn_union_move_rake_to_chips_atomic', {
        p_union_id: unionId,
        p_amount: amt,
        p_notes: txNote,
        p_created_by: auth.user.id,
        p_op_id: opId,
      });
      if (moveErr || moveRes?.success === false) {
        const msg = moveErr?.message || moveRes?.error || 'Move failed';
        if (moveRes?.duplicate) {
          return res.status(409).json({ success: false, error: 'This move was already processed' });
        }
        console.warn('[union-wallet] move_rake_to_chips failed:', msg);
        const status = String(msg).includes('insufficient') ? 400 : 500;
        return res.status(status).json({ success: false, error: msg });
      }

      return res.json({
        success: true,
        message: txNote,
        rakeAfter: moveRes.rake_after,
        chipAfter: moveRes.chip_after,
      });
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
    // ── FUND_SPIN_RESERVE — union wallet -> Spin reserve wallet ────────────
    //
    // The Spin reserve is the capital every Spin bonus pool is seeded from, and
    // a 100x is paid out of it. Until now the only way to put money in was to
    // type the RPC by hand, so the live pool had been seeded 20,000 out of
    // promo_wallet - money earmarked for promotions - because that was the only
    // wallet with a control attached to it.
    //
    // fn_spin_reserve_wallet_fund_op, NOT fn_spin_reserve_wallet_fund. The
    // wrapper is the one with replay protection: it claims p_op_id on the
    // ledger row and rolls the whole move back if that id was already used.
    // The bare function has none, and a fund button is retried - by an
    // impatient operator, by a cold start, by a browser resending the POST.
    //
    // It also refuses a null source wallet. The bare function reads that as an
    // operator deposit and MINTS the chips; nothing reachable over HTTP should
    // be able to do that, so the source wallet is required here, in the Zod
    // contract, and again inside the function.
    if (action === 'fund_spin_reserve') {
      const { amount, fromWallet, notes } = payload;

      // Without an op id the RPC refuses outright rather than moving money it
      // cannot make idempotent. Say so plainly instead of letting the caller
      // read 'op_id_required' out of a 500.
      if (!opId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opId)) {
        return res.status(400).json({
          success: false,
          error: 'X-Idempotency-Key header must be a UUID for this action',
        });
      }

      const reserveNote = (notes?.trim() || `Spin reserve funded from ${fromWallet}`)
        .slice(0, 500)
        .replace(/[;'"\\]/g, '');

      const { data: fundRes, error: fundErr } = await supabaseAdmin.rpc(
        'fn_spin_reserve_wallet_fund_op',
        {
          p_union_id: unionId,
          p_amount: amount,
          p_from_wallet: fromWallet,
          p_note: reserveNote,
          p_op_id: opId,
          p_created_by: auth.user.id,
        }
      );

      // This RPC returns { ok } - NOT { success } like its neighbours. Reading
      // the wrong key here would treat every refusal as a completed transfer,
      // which is the exact shape tests/unchecked-money-rpc.test.mjs exists to
      // catch. `error` alone is null on a refusal.
      if (fundErr || fundRes?.ok !== true) {
        if (fundRes?.duplicate) {
          return res.status(409).json({ success: false, error: 'This funding was already processed' });
        }
        const reason = fundErr?.message || fundRes?.reason || 'Spin reserve funding failed';
        if (reason === 'insufficient_union_funds') {
          return res.status(400).json({
            success: false,
            error: `Not enough in ${fundRes?.wallet || fromWallet}: ${Number(fundRes?.available || 0).toLocaleString()} available, ${Number(fundRes?.requested || amount).toLocaleString()} requested`,
          });
        }
        console.warn('[union-wallet] fund_spin_reserve failed:', reason);
        return res.status(400).json({ success: false, error: reason });
      }

      // No cacheResponse() call here on purpose: checkIdempotency has already
      // wrapped res.json to cache anything under 500 against this key.
      return res.json({
        success: true,
        spin_reserve_wallet: Number(fundRes.spin_reserve_wallet || 0),
        amount,
        fromWallet,
      });
    }

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
        p_op_id: opId,
      });
      if (fundErr || fundRes?.success === false) {
        const msg = fundErr?.message || fundRes?.error || 'BBJ pool funding failed';
        if (fundRes?.duplicate) {
          return res.status(409).json({ success: false, error: 'This funding was already processed' });
        }
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

    // ── GET_TRANSACTIONS — cursor-paginated history ─────────────────────────
    // IMPROVE 2026-07-21: cursor pagination (pass `before` = the oldest
    // created_at from the previous page to fetch the next page). hasMore lets
    // the client render a Load More control.
    if (action === 'get_transactions') {
      const filterWallet = payload.wallet; // Validated enum by Zod
      const before = typeof req.body.before === 'string' ? req.body.before : null;
      const PAGE = 100;
      let query = supabaseAdmin
        .from('union_wallet_transactions')
        .select('*, clubs(name)')
        .eq('union_id', unionId)
        .order('created_at', { ascending: false })
        .limit(PAGE + 1);
      if (filterWallet) query = query.eq('wallet', filterWallet);
      if (before) query = query.lt('created_at', before);
      const { data: txns, error: txnErr } = await query;
      if (txnErr) throw txnErr;
      const page = (txns || []).slice(0, PAGE);
      return res.json({
        success: true,
        transactions: page,
        hasMore: (txns || []).length > PAGE,
        nextBefore: page.length > 0 ? page[page.length - 1].created_at : null,
      });
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
