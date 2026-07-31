import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * API: GTO Reports — Aggregate user training stats vs GTO baselines
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GET /api/training/gto-reports
 * 
 * Query params:
 *   userId: string (required)
 *   period: 'week' | 'month' | 'all' (default: 'all')
 * 
 * Returns aggregate position stats, accuracy metrics, and GTO comparison data
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
// GTO baseline frequencies (from PIO solver analysis of 6-max cash games at 100BB)
const GTO_BASELINES = {
    preflop: {
        UTG: { openRate: 15, foldRate: 85, threebet: 0, call: 0 },
        MP: { openRate: 19, foldRate: 81, threebet: 0, call: 0 },
        CO: { openRate: 27, foldRate: 73, threebet: 0, call: 0 },
        BTN: { openRate: 45, foldRate: 55, threebet: 0, call: 0 },
        SB: { openRate: 40, foldRate: 50, threebet: 5, call: 5 },
        BB: { openRate: 0, foldRate: 55, threebet: 12, call: 33 },
    },
    postflop: {
        cbetFlop: 55,    // Average C-bet frequency on flop
        cbetTurn: 45,    // Average barrel frequency on turn
        cbetRiver: 35,   // Average barrel frequency on river
        checkRaise: 8,   // Average check-raise frequency
        foldToCSbet: 40, // Average fold to C-bet
    },
    // Institutional GTO Baselines for Scorecard Visualizer
    scorecard: {
        vpip: 22.5, // optimal VPIP for 6-max
        pfr: 18.0,  // optimal PFR for 6-max
        threeBet: 8.5 // optimal 3-Bet for 6-max
    }
};

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // BUG FIX: No auth — anyone could read any user's GTO training report by supplying a userId
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      try {
          const { period: rawPeriod = 'all' } = req.query;
          const period = ['week', 'month', 'all'].includes(rawPeriod) ? rawPeriod : 'all';
          // BUG FIX: was reading userId from query — IDOR; use JWT identity
          const userId = user.id;

          // Build date filter
          let dateFilter = null;
          const now = new Date();
          if (period === 'week') {
              dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          } else if (period === 'month') {
              dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          }

          // Fetch training sessions
          let query = getSupabase()
              .from('training_sessions')
              // 2026-07-26 AUDIT FIX: total_questions / correct_answers / best_answers /
              // classification_breakdown are not columns on training_sessions. The
              // real ones are hands_played / correct_count / classification_counts,
              // so this select errored and the whole reports page returned 500.
              .select('id, game_id, accuracy, hands_played, correct_count, position_stats, classification_counts, hand_history, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false });

          if (dateFilter) {
              query = query.gte('created_at', dateFilter);
          }

          const { data: sessions, error } = await query.limit(500);

          if (error) {
              console.warn('[GTOReports] Query error:', error);
              return res.status(500).json({ success: false, error: 'Database query failed' });
          }

          // Aggregate position stats
          const positionAgg = {};
          let totalQuestions = 0;
          let totalCorrect = 0;
          let totalBest = 0;
          let totalSessions = sessions?.length || 0;

          // Classification aggregation
          const classAgg = { best: 0, correct: 0, inaccuracy: 0, wrong: 0, blunder: 0 };

          (sessions || []).forEach(session => {
              totalQuestions += session.hands_played || 0;
              totalCorrect += session.correct_count || 0;
              totalBest += (session.classification_counts && session.classification_counts.best) || 0;

              // Per-position aggregation
              const posStats = session.position_stats;
              if (posStats && typeof posStats === 'object') {
                  Object.entries(posStats || {}).forEach(([pos, stats]) => {
                      if (!positionAgg[pos]) {
                          positionAgg[pos] = { total: 0, correct: 0, evLoss: 0 };
                      }
                      positionAgg[pos].total += stats.total || 0;
                      positionAgg[pos].correct += stats.correct || 0;
                      positionAgg[pos].evLoss += stats.evLoss || 0;
                  });
              }

              // Classification aggregation
              const classBreakdown = session.classification_counts;
              if (classBreakdown && typeof classBreakdown === 'object') {
                  Object.entries(classBreakdown || {}).forEach(([cls, count]) => {
                      if (classAgg[cls] !== undefined) {
                          classAgg[cls] += count;
                      }
                  });
              }
          });

          // ♠ Scorecard Stat Calculation (VPIP, PFR, 3Bet)
          let totalPreflopHands = 0;
          let vpipCount = 0;
          let pfrCount = 0;
          let threeBetOppCount = 0;
          let threeBetCount = 0;

          (sessions || []).forEach(session => {
              const hhs = session.hand_history || [];
              if (Array.isArray(hhs)) {
                  hhs.forEach(hand => {
                      // ARRAY TYPE GUARD REQUIRED to prevent older session JSON layouts from throwing .filter is not a function
                      if (Array.isArray(hand.actionHistory)) {
                          totalPreflopHands++;

                          // Parse preflop hero actions
                          const heroPreActions = hand.actionHistory.filter(a => a.player === 'hero' && a.street === 'preflop');
                          if (heroPreActions.length > 0) {
                              const firstAction = heroPreActions[0].action;

                              // Voluntarily Put Money in Pot (any call, bet, raise, allin)
                              if (['call', 'bet', 'raise', 'allin'].includes(firstAction)) {
                                  vpipCount++;
                              }

                              // Preflop Raise (any bet, raise, allin)
                              if (['bet', 'raise', 'allin'].includes(firstAction)) {
                                  pfrCount++;
                              }

                              // 3-Bet Opportunity & Action (simplistic logic: if previous villain action was raise)
                              const villainPreActions = hand.actionHistory.filter(a => a.player === 'villain' && a.street === 'preflop');
                              const facedRaise = villainPreActions.some(a => ['raise', 'bet', 'allin'].includes(a.action));

                              if (facedRaise) {
                                  threeBetOppCount++;
                                  if (['raise', 'allin'].includes(firstAction)) {
                                      threeBetCount++;
                                  }
                              }
                          }
                      }
                  });
              }
          });

          const scorecardStats = {
              vpip: totalPreflopHands > 0 ? (vpipCount / totalPreflopHands) * 100 : 0,
              pfr: totalPreflopHands > 0 ? (pfrCount / totalPreflopHands) * 100 : 0,
              threeBet: threeBetOppCount > 0 ? (threeBetCount / threeBetOppCount) * 100 : 0,
              totalAnalyzed: totalPreflopHands
          };

          // Calculate per-position accuracy and deviation from GTO
          const positionReport = {};
          Object.entries(positionAgg || {}).forEach(([pos, data]) => {
              const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
              const gtoBaseline = GTO_BASELINES.preflop[pos];
              positionReport[pos] = {
                  total: data.total,
                  correct: data.correct,
                  accuracy,
                  avgEvLoss: data.total > 0 ? (data.evLoss / data.total).toFixed(2) : '0.00',
                  gtoOpenRate: gtoBaseline?.openRate || null,
                  deviation: gtoBaseline ? Math.abs(accuracy - (100 - gtoBaseline.foldRate)) : null,
              };
          });

          // Compute overall GTOW-like score
          const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
          const bestRate = totalQuestions > 0 ? Math.round((totalBest / totalQuestions) * 100) : 0;

          // Calculate global GTO Proximity Score (0-100)
          let totalDeviation = 0;
          let positionsWithData = 0;
          Object.values(positionReport || {}).forEach(data => {
              if (data.deviation !== null) {
                  totalDeviation += data.deviation;
                  positionsWithData++;
              }
          });

          const avgDeviation = positionsWithData > 0 ? (totalDeviation / positionsWithData) : 0;
          const gtoProximityScore = positionsWithData > 0 ? Math.max(0, Math.round(100 - avgDeviation)) : 0;

          return res.status(200).json({
              success: true,
              report: {
                  period,
                  totalSessions,
                  totalQuestions,
                  totalCorrect,
                  totalBest,
                  overallAccuracy,
                  bestRate,
                  gtoProximityScore,
                  positionReport,
                  classifications: classAgg,
                  gtoBaselines: GTO_BASELINES,
                  scorecardStats,
              },
          });

      } catch (err) {
          console.warn('[GTOReports] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
