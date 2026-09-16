/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GET /api/store/diamond-transactions
 *  Returns the authenticated user's diamond transaction history
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';
const { LEDGER_FILTERS, applyFilterToQuery } = require('../../../src/lib/diamonds/ledgerFilters');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
      console.warn(
        '[diamond-transactions] SUPABASE_SERVICE_ROLE_KEY missing - falling back to anon key; reads may be blocked by RLS'
      );
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export default async function handler(req, res) {
  try {
    setPrivateCommerceResponse(res);
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // ENH-H: Rate limit to prevent abuse
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    try {
      // Auth: local HMAC verify first, GoTrue network fallback if JWT secret missing
      const { user: localUser } = await getServerUserWithFallback(req, getSupabase());
      if (!localUser) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
      }
      const userId = localUser.id;

      // Parse query params
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = parseInt(req.query.offset) || 0;
      const filter = LEDGER_FILTERS.includes(req.query.filter) ? req.query.filter : 'all';

      /*
       * THE FILTER IS APPLIED HERE NOW, NOT IN THE BROWSER.
       *
       * This block used to carry the comment "Always fetch all types,
       * client filters locally - no server-side type filter". That is why
       * the wallet's tabs lied: the browser can only filter the page it
       * has, so on a 416-row ledger the tabs were computed over 50 rows and
       * read All (50) / Refunds (31) / Earned (48) / Spent (2) against a
       * truth of 416 / 246 / 390 / 25. Selecting a tab also paged through
       * raw rows rather than through that tab's own set, so Load More under
       * Refunds fetched mostly things that were not refunds.
       *
       * `applyFilterToQuery` is the same predicate the browser renders with
       * (src/lib/diamonds/ledgerFilters.js), so the count, the query and the
       * visible list cannot drift apart.
       */
      const base = () =>
        getSupabase()
          .from('diamond_transactions')
          .select('*', { count: 'exact' })
          .eq('user_id', userId);

      const query = applyFilterToQuery(base(), filter)
        .order('created_at', { ascending: false })
        .order('id')
        .range(offset, offset + limit - 1);

      /*
       * Every badge counted over the WHOLE ledger, in parallel, with
       * `head: true` so nothing but the count crosses the wire. Six cheap
       * index-backed counts is the price of six numbers that are true.
       * Counting the loaded page was free, and wrong by 8x.
       */
      const countsPromise = Promise.all(
        LEDGER_FILTERS.map(async (name) => {
          const counted = getSupabase()
            .from('diamond_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);
          const { count: c, error: countErr } = await applyFilterToQuery(counted, name);
          if (countErr) throw countErr;
          return [name, c || 0];
        })
      );

      /*
       * LIFETIME TOTALS, OVER THE WHOLE LEDGER.
       *
       * The Stats tab summed the LOADED rows and labelled the result
       * "Total Earned" - its own comment said "computed from loaded
       * transactions". On a 416-row wallet showing 50, that headline was
       * built from 12% of the ledger and presented as a lifetime figure.
       *
       * Only on the first page, because a lifetime total does not change
       * as you page. The 5,000 ceiling and the sign rule are Club Arena's
       * (DiamondService.getLifetimeStats), copied deliberately so the two
       * wallets cannot report different lifetimes for one ledger.
       */
      const statsPromise =
        offset === 0
          ? getSupabase()
              .from('diamond_transactions')
              .select('amount, transaction_type, type, created_at, description')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .order('id')
              .limit(5000)
          : Promise.resolve({ data: null, error: null });

      const { data, count, error } = await query;

      if (error) {
        console.warn('Transaction fetch error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
      }

      // Also get current balance
      const { data: profile } = await getSupabase()
        .from('profiles')
        .select('diamonds, vip_expires_at, is_vip, vip_tier')
        .eq('id', userId)
        .maybeSingle();

      // Response includes the LIVE balance — never let the browser serve a
      // cached pre-transaction balance right after a purchase/transfer.

      /*
       * A failed COUNT must not blank the wallet. The rows are what the
       * player came for; if the badges cannot be counted the list still
       * renders and the badges simply say nothing, rather than the whole
       * modal erroring on a number nobody asked for.
       */
      let counts = null;
      try {
        counts = Object.fromEntries(await countsPromise);
      } catch (countErr) {
        console.warn(
          '[diamond-transactions] badge counts unavailable:',
          countErr?.message || countErr
        );
      }

      /*
       * Same rule as the badges: a total nobody could compute is reported
       * as `null` so the client can say nothing, never as 0 - which would
       * tell a player who has earned 740,908 diamonds that they have
       * earned none.
       */
      let lifetime = null;
      try {
        const { data: allRows, error: statsErr } = await statsPromise;
        if (statsErr) throw statsErr;
        if (allRows) {
          const now = new Date();
          const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
          const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

          let earned = 0,
            spent = 0,
            weekEarned = 0,
            weekSpent = 0;
          let thisMonthEarned = 0,
            thisMonthSpent = 0;
          let lastMonthEarned = 0,
            lastMonthSpent = 0;
          let giftsSent = 0,
            giftsReceived = 0,
            giftCount = 0;
          const bySource = {};
          const recipients = {};

          for (const row of allRows) {
            const amt = Number(row.amount) || 0;
            const kind = row.transaction_type || row.type || 'adjustment';
            const at = new Date(row.created_at).getTime();

            // The SIGN decides the bucket, never a list of type names.
            if (amt >= 0) {
              earned += amt;
              if (at >= weekAgo) weekEarned += amt;
              if (at >= thisMonth) thisMonthEarned += amt;
              else if (at >= lastMonth) lastMonthEarned += amt;
            } else {
              spent += -amt;
              if (at >= weekAgo) weekSpent += -amt;
              if (at >= thisMonth) thisMonthSpent += -amt;
              else if (at >= lastMonth) lastMonthSpent += -amt;
            }
            bySource[kind] = (bySource[kind] || 0) + Math.abs(amt);

            if (kind === 'diamond_gift_sent') {
              giftsSent += Math.abs(amt);
              giftCount += 1;
              const match = (row.description || '').match(/to (.+?)\s*\[/);
              if (match) recipients[match[1]] = (recipients[match[1]] || 0) + Math.abs(amt);
            } else if (kind === 'diamond_gift_received') {
              giftsReceived += Math.abs(amt);
            }
          }

          lifetime = {
            earned,
            spent,
            weekEarned,
            weekSpent,
            thisMonthEarned,
            thisMonthSpent,
            lastMonthEarned,
            lastMonthSpent,
            giftsSent,
            giftsReceived,
            giftCount,
            rowsCounted: allRows.length,
            // Whether the 5,000 ceiling was reached, so the client can
            // say "5,000 most recent" instead of implying "all time".
            truncated: allRows.length >= 5000,
            bySource,
            recipients,
          };
        }
      } catch (statsErr) {
        console.warn(
          '[diamond-transactions] lifetime stats unavailable:',
          statsErr?.message || statsErr
        );
      }

      return res.status(200).json({
        success: true,
        transactions: data || [],
        // The size of the ACTIVE filter's set, so Load More pages that
        // set rather than the raw ledger.
        total: count || 0,
        // Every tab's size, over the whole ledger, regardless of filter.
        counts,
        // Lifetime earned/spent over the whole ledger; null on the
        // paged requests that do not recompute it, and on failure.
        lifetime,
        filter,
        balance: profile?.diamonds ?? 0,
        vip_expiration_date: profile?.vip_expires_at || null,
        is_vip: profile?.is_vip || false,
        vip_tier: profile?.vip_tier || null,
        limit,
        offset,
      });
    } catch (err) {
      console.warn('Diamond transactions error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_reportError) {
      console.warn('[App] Handled exception:', _reportError?.message || _reportError);
    }
    console.warn('[API Error]', err);
    if (!res.headersSent)
      return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
