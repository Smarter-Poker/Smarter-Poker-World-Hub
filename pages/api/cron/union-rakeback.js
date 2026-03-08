/**
 * GET /api/cron/union-rakeback
 *
 * WEEKLY UNION RAKE REDISTRIBUTION
 * Runs every Monday at 10:20 UTC (4:20 AM CST) — after settle + distribute finish.
 *
 * FLOW:
 * For every union that has a non-zero rake_wallet balance:
 *   1. Read each member club's club_commission_rate (their % share of rake)
 *   2. Calculate each club's share of the available rake_wallet balance
 *   3. Credit the club treasury with its share
 *   4. Debit the union rake_wallet by the total redistributed
 *   5. Write union_wallet_transactions ledger entries
 *   6. Write chip_transactions entries per club
 *
 * Clubs with auto_settlement_enabled = false are skipped.
 * The union's chip_balance, bbj_wallet, and promo_wallet are NOT touched.
 *
 * Vercel cron:
 * { "path": "/api/cron/union-rakeback", "schedule": "20 10 * * 1" }
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = req.headers['authorization']?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!['admin', 'superadmin'].includes(profile?.role)) {
        return res.status(403).json({ error: 'Platform admin required' });
      }
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const startedAt = new Date().toISOString();
  const results = {
    unions_processed: 0,
    unions_skipped: 0,
    clubs_credited: 0,
    total_redistributed: 0,
    errors: [],
  };

  try {
    // Load all unions that have rake to distribute
    const { data: unions } = await supabaseAdmin
      .from('unions')
      .select('id, name, rake_wallet, settings')
      .gt('rake_wallet', 0);

    if (!unions || unions.length === 0) {
      return res.status(200).json({ success: true, message: 'No unions with rake balance', results });
    }

    for (const union of unions) {
      try {
        const rakeBalance = Number(union.rake_wallet || 0);
        if (rakeBalance <= 0) { results.unions_skipped++; continue; }

        // Load all active member clubs with their commission rates
        const { data: unionClubs } = await supabaseAdmin
          .from('union_clubs')
          .select('club_id, club_commission_rate')
          .eq('union_id', union.id)
          .limit(500);

        if (!unionClubs || unionClubs.length === 0) { results.unions_skipped++; continue; }

        const clubIds = unionClubs.map(uc => uc.club_id);
        const { data: clubs } = await supabaseAdmin
          .from('clubs')
          .select('id, name, auto_settlement_enabled, chip_treasury')
          .in('id', clubIds)
          .eq('auto_settlement_enabled', true)
          .limit(500);

        if (!clubs || clubs.length === 0) { results.unions_skipped++; continue; }

        // Build commission rate map from union_clubs
        const rateMap = {};
        for (const uc of unionClubs) rateMap[uc.club_id] = Number(uc.club_commission_rate || 0);

        // Calculate total weight (sum of all active clubs' commission rates)
        const totalWeight = clubs.reduce((s, c) => s + (rateMap[c.id] || 0), 0);
        if (totalWeight <= 0) { results.unions_skipped++; continue; }

        // Distribute proportionally
        let totalDistributed = 0;
        const distributions = clubs.map(club => {
          const share = (rateMap[club.id] || 0) / totalWeight;
          const amount = Math.floor(rakeBalance * share * 100) / 100; // floor to 2dp
          return { club, amount };
        }).filter(d => d.amount > 0);

        for (const { club, amount } of distributions) {
          try {
            // Credit club treasury
            const { error: creditErr } = await supabaseAdmin.rpc('fn_credit_treasury', {
              p_club_id: club.id,
              p_amount: amount,
            });
            if (creditErr) throw creditErr;

            // chip_transactions record
            await supabaseAdmin.from('chip_transactions').insert({
              club_id: club.id,
              amount,
              transaction_type: 'union_rakeback',
              notes: `Weekly union rakeback from ${union.name} — ${((rateMap[club.id] || 0) * 100).toFixed(1)}% share of ${rakeBalance.toLocaleString()} rake wallet`,
              metadata: { union_id: union.id, commission_rate: rateMap[club.id], started_at: startedAt },
            }).catch(() => {});

            // union_wallet_transactions debit entry (logged per club)
            await supabaseAdmin.from('union_wallet_transactions').insert({
              union_id: union.id,
              wallet: 'rake_wallet',
              direction: 'debit',
              amount,
              tx_type: 'rakeback_distribution',
              club_id: club.id,
              notes: `Rakeback to ${club.name} — ${((rateMap[club.id] || 0) * 100).toFixed(1)}% share`,
            }).catch(() => {});

            totalDistributed += amount;
            results.clubs_credited++;
          } catch (clubErr) {
            results.errors.push(`Club ${club.id}: ${clubErr.message}`);
          }
        }

        // Debit union rake_wallet by total actually distributed
        if (totalDistributed > 0) {
          await supabaseAdmin.rpc('fn_union_debit_wallet', {
            p_union_id: union.id,
            p_wallet: 'rake_wallet',
            p_amount: totalDistributed,
          }).catch(e => results.errors.push(`Union ${union.id} debit error: ${e.message}`));
        }

        results.unions_processed++;
        results.total_redistributed += totalDistributed;
      } catch (unionErr) {
        results.errors.push(`Union ${union.id}: ${unionErr.message}`);
        results.unions_skipped++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Rakeback complete. ${results.unions_processed} unions processed, ${results.clubs_credited} clubs credited, ${results.total_redistributed.toLocaleString()} chips distributed.`,
      results,
    });
  } catch (err) {
    console.error('[union-rakeback]', err);
    return res.status(500).json({ success: false, error: err.message, results });
  }
}
