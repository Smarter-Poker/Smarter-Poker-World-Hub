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
      /* `player_line` is the ledger's own player-facing line (phase 6, the
         computed column over fn_diamond_ledger_line): the description when
         it is player copy, cleaned, else the kind's row label. A computed
         column is not part of `*`, so it is asked for by name. */
      const base = () =>
        getSupabase()
          .from('diamond_transactions')
          .select('*, player_line', { count: 'exact' })
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

      /*
       * THE HEADLINE IS SUMMED IN SQL (2026-09-13). The 5,000-row window above
       * still feeds the week/month/gift breakdowns, which need the rows, but
       * lifetime earned and spent no longer depend on the window at all:
       * `fn_diamond_lifetime_totals` (Club Arena migration 20260913171905)
       * sums the WHOLE ledger where it lives. So the headline stays exact past
       * 5,000 rows, and `truncated` below describes only the breakdowns.
       * Same RPC the Club Arena wallet reads, so one ledger cannot report two
       * lifetimes.
       */
      const totalsPromise =
        offset === 0
          ? getSupabase().rpc('fn_diamond_lifetime_totals', { p_user_id: userId })
          : Promise.resolve({ data: null, error: null });

      /*
       * THE THREE DIAMOND FIGURES (phase 2, 2026-09-14). fn_diamond_wallet_summary
       * (Club Arena migration 20260914015457) returns on_hand, collateral,
       * sendable and in_arena in one read. The Send panel used to check only
       * `balance` and say "Insufficient diamond balance" while the server's
       * real refusal was refund-window collateral - a sentence about a rule
       * the player had never been shown. First page only, like the totals.
       * THE DIAMOND ARENA IS DIAMONDS ONLY: nothing in this read is a chip.
       */
      const summaryPromise =
        offset === 0
          ? getSupabase().rpc('fn_diamond_wallet_summary', { p_user_id: userId })
          : Promise.resolve({ data: null, error: null });

      /*
       * THE BREAKDOWNS ARE SUMMED IN SQL TOO (phase 7, 2026-09-29).
       *
       * The headline has been exact since 2026-09-13, but the SOURCE and GIFT
       * breakdowns under it were still reduced in the browser over the
       * 5,000-row window above - so the two halves of one panel were computed
       * from two different populations, and would disagree the moment a
       * player's ledger outgrew the page. `fn_diamond_flow_by_kind` sums the
       * WHOLE ledger per bucket, spent and earned. It is the same RPC the Club
       * Arena wallet reads (DiamondService.getDiamondFlow), so one ledger
       * cannot report two breakdowns.
       *
       * THE USER ID IS PASSED EXPLICITLY, AND THAT IS NOT OPTIONAL HERE.
       * The function is SECURITY DEFINER and defaults `p_user_id` to
       * `auth.uid()`, which is how the browser-side Club Arena caller reaches
       * it. This route holds a SERVICE-ROLE client, so `auth.uid()` is NULL
       * and omitting the argument raises `authentication_required` (measured
       * against production 2026-09-29). The function's own guard -
       * `v_role <> 'service_role' AND v_user IS DISTINCT FROM auth.uid()` -
       * is what lets a service caller name a user. `userId` is the
       * JWT-verified subject from getServerUserWithFallback, never
       * `req.query.userId` (code safety rule 5, IDOR).
       *
       * Horses are players (10.5): the function takes no include/exclude
       * flag, and nothing on this path filters on is_horse.
       */
      const flowPromise =
        offset === 0
          ? getSupabase().rpc('fn_diamond_flow_by_kind', { p_user_id: userId })
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
       *
       * A NULL `lifetime` HAD TWO MEANINGS AND THE PANEL COULD NOT TELL
       * THEM APART (2026-09-30, 10.86 rule 1).
       *
       * `lifetime` is null on a Load More, where nothing was asked for and
       * nothing is wrong, AND when the 5,000-row window select below threw,
       * where the read genuinely failed. Both left a 200 carrying a bare
       * `lifetime: null`, so the browser set no error, rendered the ledger
       * normally, and a player who opened Stats watched an animated skeleton
       * for ever - a PENDING state standing in for an outcome that had
       * already settled and was unreadable. `lifetimeStatus` names the three
       * outcomes so the client can render three, not two:
       *
       *   'ok'          the figures were computed and are in `lifetime`
       *   'unavailable' the read was attempted on this request and failed
       *   'paged'       not asked for; this is not a first page
       *
       * A failed stats read still must not fail the whole request: the rows
       * are what the player came for and they render either way, which is
       * why this stays a 200 with a named outcome rather than becoming a 500.
       */
      let lifetime = null;
      let lifetimeStatus = offset === 0 ? 'unavailable' : 'paged';
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
          /*
           * ONLY RECIPIENT NAMES ARE STILL REDUCED HERE (phase 7).
           *
           * `bySource`, `giftsSent`, `giftsReceived` and `giftCount` used to
           * be accumulated in this loop and were DELETED on 2026-09-29, not
           * left beside their replacement: `fn_diamond_flow_by_kind` sums
           * every one of them over the whole ledger, and two code paths for
           * one number is how a panel ends up disagreeing with itself.
           *
           * The recipient NAME has no SQL behind it - it is scraped out of
           * the description text - so it is the one breakdown that still
           * depends on this window, and `truncated` below is what tells the
           * player when the window fell short.
           */
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

            if (kind === 'diamond_gift_sent') {
              const match = (row.description || '').match(/to (.+?)\s*\[/);
              if (match) recipients[match[1]] = (recipients[match[1]] || 0) + Math.abs(amt);
            }
          }

          /* Prefer the SQL sum for the two headline figures. If the RPC
             could not answer, the window sum stands and `exact` says so. */
          let exact = false;
          try {
            const { data: totals, error: totalsErr } = await totalsPromise;
            if (totalsErr) throw totalsErr;
            const row = Array.isArray(totals) ? totals[0] : totals;
            const e = Number(row?.lifetime_earned);
            const sp = Number(row?.lifetime_spent);
            if (Number.isFinite(e) && Number.isFinite(sp)) {
              earned = e;
              spent = sp;
              exact = true;
            }
          } catch (totalsErr) {
            console.warn(
              '[diamond-transactions] fn_diamond_lifetime_totals unavailable, headline is the window sum:',
              totalsErr?.message || totalsErr
            );
          }

          /*
           * IS THE WHOLE WEEK INSIDE THE WINDOW? PROVE IT, DO NOT ASSUME IT.
           *
           * `fn_diamond_flow_by_kind` reports lifetime and LAST 30 DAYS; it
           * has no 7-day figure, so "This Week" stays a window sum. That is
           * only honest if the window demonstrably covers the week. It does
           * when the window was not truncated (it is then the whole ledger),
           * and it still does when truncated so long as the OLDEST row in the
           * window predates the week boundary - a full window reaching back
           * past 7 days contains every row inside those 7 days, because the
           * window is ordered newest first. Anything else is unknown, and
           * unknown is its own outcome (10.86), never a quiet partial sum.
           */
          const oldestAt = allRows.length
            ? new Date(allRows[allRows.length - 1].created_at).getTime()
            : Date.now();
          const weekExact =
            allRows.length < 5000 || (Number.isFinite(oldestAt) && oldestAt < weekAgo);

          lifetime = {
            earned,
            spent,
            // true when earned/spent came from the whole-ledger SQL sum.
            exact,
            // true when the week figures provably cover the whole week.
            weekExact,
            weekEarned,
            weekSpent,
            thisMonthEarned,
            thisMonthSpent,
            lastMonthEarned,
            lastMonthSpent,
            rowsCounted: allRows.length,
            // Whether the 5,000 ceiling was reached, so the client can
            // say "5,000 most recent" instead of implying "all time".
            truncated: allRows.length >= 5000,
            recipients,
          };
          lifetimeStatus = 'ok';
        }
        /* `allRows` falsy with no error is only reachable off the first page,
           where the promise resolves `{ data: null }` on purpose. On a first
           page it would be an unreadable answer, and the initial value above
           already says so - it is never quietly upgraded to 'ok'. */
      } catch (statsErr) {
        console.warn(
          '[diamond-transactions] lifetime stats unavailable:',
          statsErr?.message || statsErr
        );
      }

      /* null = could not read (10.86); the client keeps the balance-only
         check and the server stays the final word. Never a fabricated zero. */
      let summary = null;
      try {
        const { data: summaryRow, error: summaryErr } = await summaryPromise;
        if (summaryErr) throw summaryErr;
        const row = Array.isArray(summaryRow) ? summaryRow[0] : summaryRow;
        if (row && typeof row === 'object') {
          const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
          const sendable = n(row.sendable);
          const collateral = n(row.collateral);
          const inArena = n(row.in_arena);
          if (sendable !== null && collateral !== null && inArena !== null) {
            summary = {
              onHand: n(row.on_hand),
              sendable,
              collateral,
              inArena,
              arenaOpen:
                row.arena?.cash_games_enabled === true || row.arena?.tournaments_enabled === true,
            };
          }
        }
      } catch (summaryErr) {
        if (offset === 0) {
          console.warn(
            '[diamond-transactions] fn_diamond_wallet_summary unavailable:',
            summaryErr?.message || summaryErr
          );
        }
      }

      /*
       * THE WHOLE-LEDGER BREAKDOWN. null = COULD NOT TELL (10.86).
       *
       * Validated the way the Club Arena consumer validates it
       * (DiamondService.getDiamondFlow): every figure must be a finite
       * number and every bucket must be named, or the whole read is refused.
       * A half-parsed breakdown drawn as bars is the failure this posture
       * exists to prevent - an unreadable answer must never be coerced into
       * an empty or zero one.
       */
      let flow = null;
      try {
        const { data: flowRow, error: flowErr } = await flowPromise;
        if (flowErr) throw flowErr;
        const row = Array.isArray(flowRow) ? flowRow[0] : flowRow;
        if (offset === 0) {
          if (!row || typeof row !== 'object') {
            throw new Error('fn_diamond_flow_by_kind returned nothing');
          }
          const num = (v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) {
              throw new Error('fn_diamond_flow_by_kind returned a non-numeric figure');
            }
            return n;
          };
          const lines = (raw) => {
            if (!Array.isArray(raw)) {
              throw new Error('fn_diamond_flow_by_kind returned no bucket list');
            }
            return raw.map((l) => {
              const r = l && typeof l === 'object' ? l : {};
              if (typeof r.bucket !== 'string' || typeof r.label !== 'string') {
                throw new Error('fn_diamond_flow_by_kind returned an unnamed bucket');
              }
              return {
                bucket: r.bucket,
                label: r.label,
                lifetime: num(r.lifetime),
                lifetimeCount: num(r.lifetime_count),
                last30: num(r.last30),
                last30Count: num(r.last30_count),
              };
            });
          };
          flow = {
            spent: lines(row.spent),
            earned: lines(row.earned),
            spentTotal: num(row.spent_total),
            earnedTotal: num(row.earned_total),
            spentLast30: num(row.spent_last30),
            earnedLast30: num(row.earned_last30),
            readAt: String(row.read_at || ''),
          };
        }
      } catch (flowErr) {
        if (offset === 0) {
          console.warn(
            '[diamond-transactions] fn_diamond_flow_by_kind unavailable, breakdown is unknown:',
            flowErr?.message || flowErr
          );
        }
      }

      return res.status(200).json({
        success: true,
        transactions: data || [],
        // on_hand / sendable / collateral / in_arena, first page only; null
        // when the read failed.
        summary,
        // The size of the ACTIVE filter's set, so Load More pages that
        // set rather than the raw ledger.
        total: count || 0,
        // Every tab's size, over the whole ledger, regardless of filter.
        counts,
        // Lifetime earned/spent over the whole ledger; null on the
        // paged requests that do not recompute it, and on failure.
        lifetime,
        // WHICH of those two a null `lifetime` is: 'ok' (it is above),
        // 'unavailable' (this request tried to read it and could not), or
        // 'paged' (a Load More never asks). Without this the wallet cannot
        // tell a settled-unreadable panel from one still loading, and it
        // showed a skeleton for ever. 10.86 rule 1.
        lifetimeStatus,
        // Every source and gift bucket summed over the WHOLE ledger, spent
        // and earned; first page only. null means the breakdown could not be
        // read, and the panel must say so rather than draw empty bars.
        flow,
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
