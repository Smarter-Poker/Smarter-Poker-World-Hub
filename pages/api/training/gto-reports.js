import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
          const { period: rawPeriod = 'all', gameId: rawGameId = '' } = req.query;
          const period = ['week', 'month', 'all'].includes(rawPeriod) ? rawPeriod : 'all';
          // GTOW parity #39 — stats broken out by format as well as by date.
          // game_id was already being SELECTed here and then thrown away: the
          // route grouped everything a player had ever done into one number, so
          // a cash-game leak and a tournament leak averaged each other out and
          // neither was visible. `gameId` narrows the whole report to one
          // format; `byFormat` below reports every format side by side.
          //
          // Deliberately not whitelisted against a catalog: there is no game-id
          // catalog in the repo, ids are created by whatever trainer wrote the
          // session, and this value is only ever used as an equality filter on
          // rows already scoped to `user_id`, so an unknown id yields an empty
          // report rather than anything unsafe. Bound the length so a huge
          // query string cannot be pushed into the database layer.
          const gameId = typeof rawGameId === 'string' ? rawGameId.slice(0, 64).trim() : '';
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
              // #39 adds game_name (format label — there is no game-id catalog
              // to look one up from), gtow_score + score_scale (the signed
              // -100..+100 scale shipped in roadmap #25 must be identified as
              // such before it can be averaged with anything), level and the
              // EV-loss columns. All are needed by the `sessions` array the
              // reports page has always tried to read and never received.
              .select('id, game_id, game_name, gtow_score, score_scale, level, accuracy, hands_played, correct_count, mistake_count, total_ev_loss, avg_ev_loss_per_hand, position_stats, classification_counts, hand_history, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false });

          if (dateFilter) {
              query = query.gte('created_at', dateFilter);
          }
          if (gameId) {
              query = query.eq('game_id', gameId);
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

          // ═══════════════════════════════════════════════════════════════
          // GTOW parity #39 — breakdowns by format and by date
          // ═══════════════════════════════════════════════════════════════
          // Two scales of gtow_score exist in this table. Rows written before
          // roadmap #25 hold 0..100; rows written since hold the signed
          // -100..+100 GTOW scale and say so with score_scale = 2. Averaging
          // them raw would silently drag every historical average downward the
          // moment a signed row appeared. Everything downstream of this route
          // (calculateTrends, identifyLeaks, the LeakDetector thresholds at 70
          // / 60 / 50) is written against 0..100, so normalise onto that scale
          // here rather than teaching four consumers about two scales.
          const toUnitScore = (row) => {
              const raw = Number(row?.gtow_score);
              if (!Number.isFinite(raw)) {
                  // No score recorded: fall back to accuracy, which every
                  // session has, rather than emitting a 0 that reads as a
                  // catastrophic session in the trend line.
                  const acc = Number(row?.accuracy);
                  return Number.isFinite(acc) ? Math.max(0, Math.min(100, acc)) : 0;
              }
              const unit = Number(row?.score_scale) === 2 ? (raw + 100) / 2 : raw;
              return Math.max(0, Math.min(100, Math.round(unit)));
          };

          // Per-format aggregation. Keyed on game_id because that is the stable
          // identifier; game_name is carried alongside purely as a display
          // label, and the most recent non-empty one wins because sessions are
          // ordered newest-first and a game may have been renamed.
          const formatAgg = {};
          // Per-day aggregation, keyed on the UTC calendar day of created_at.
          const dateAgg = {};

          (sessions || []).forEach(session => {
              const hands = session.hands_played || 0;
              const correct = session.correct_count || 0;
              const blunders = (session.classification_counts && session.classification_counts.blunder) || 0;
              const evLoss = Number(session.total_ev_loss) || 0;
              const unitScore = toUnitScore(session);

              const fid = session.game_id || 'unknown';
              if (!formatAgg[fid]) {
                  formatAgg[fid] = {
                      gameId: fid,
                      gameName: session.game_name || fid,
                      sessions: 0, hands: 0, correct: 0, blunders: 0,
                      evLoss: 0, scoreSum: 0, lastPlayed: session.created_at || null,
                  };
              }
              const f = formatAgg[fid];
              if (!f.gameName || f.gameName === fid) f.gameName = session.game_name || f.gameName;
              f.sessions += 1;
              f.hands += hands;
              f.correct += correct;
              f.blunders += blunders;
              f.evLoss += evLoss;
              f.scoreSum += unitScore;

              const day = typeof session.created_at === 'string' ? session.created_at.slice(0, 10) : null;
              if (day) {
                  if (!dateAgg[day]) {
                      dateAgg[day] = { date: day, sessions: 0, hands: 0, correct: 0, blunders: 0, evLoss: 0, scoreSum: 0 };
                  }
                  const d = dateAgg[day];
                  d.sessions += 1;
                  d.hands += hands;
                  d.correct += correct;
                  d.blunders += blunders;
                  d.evLoss += evLoss;
                  d.scoreSum += unitScore;
              }
          });

          const byFormat = Object.values(formatAgg)
              .map(f => ({
                  gameId: f.gameId,
                  gameName: f.gameName,
                  sessions: f.sessions,
                  hands: f.hands,
                  correct: f.correct,
                  blunders: f.blunders,
                  accuracy: f.hands > 0 ? Math.round((f.correct / f.hands) * 100) : 0,
                  avgScore: f.sessions > 0 ? Math.round(f.scoreSum / f.sessions) : 0,
                  avgEvLoss: f.hands > 0 ? Number((f.evLoss / f.hands).toFixed(2)) : 0,
                  lastPlayed: f.lastPlayed,
              }))
              // Most-played first: the format a player has the most data in is
              // the one whose numbers actually mean something.
              .sort((a, b) => b.hands - a.hands || b.sessions - a.sessions);

          // Ascending by date so the client can render a series without
          // re-sorting, matching calculateTrends' own convention.
          const byDate = Object.values(dateAgg)
              .map(d => ({
                  date: d.date,
                  sessions: d.sessions,
                  hands: d.hands,
                  correct: d.correct,
                  blunders: d.blunders,
                  accuracy: d.hands > 0 ? Math.round((d.correct / d.hands) * 100) : 0,
                  avgScore: d.sessions > 0 ? Math.round(d.scoreSum / d.sessions) : 0,
                  avgEvLoss: d.hands > 0 ? Number((d.evLoss / d.hands).toFixed(2)) : 0,
              }))
              .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

          // The format selector must keep offering every format the player has
          // data in, including while the report is narrowed to one of them —
          // otherwise choosing a format destroys the means of choosing another.
          // Scoped to the same period as the report so the list never offers a
          // format that would return an empty report.
          let availableFormats = byFormat.map(f => ({ gameId: f.gameId, gameName: f.gameName, sessions: f.sessions }));
          if (gameId) {
              let fq = getSupabase()
                  .from('training_sessions')
                  .select('game_id, game_name')
                  .eq('user_id', userId)
                  .order('created_at', { ascending: false });
              if (dateFilter) fq = fq.gte('created_at', dateFilter);
              const { data: allRows, error: fErr } = await fq.limit(500);
              if (!fErr && Array.isArray(allRows)) {
                  const seen = {};
                  allRows.forEach(r => {
                      const k = r.game_id || 'unknown';
                      if (!seen[k]) seen[k] = { gameId: k, gameName: r.game_name || k, sessions: 0 };
                      seen[k].sessions += 1;
                  });
                  availableFormats = Object.values(seen).sort((a, b) => b.sessions - a.sessions);
              }
          }

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

          // ═══════════════════════════════════════════════════════════════
          // The `sessions` array the reports page has always tried to read
          // ═══════════════════════════════════════════════════════════════
          // pages/hub/training/reports.js gates ALL of its trend and leak
          // enrichment on `data.report?.sessions` being an array. This route
          // has never returned that key, so calculateTrends, identifyLeaks,
          // detectLeaks and generateDrillRecommendations have been imported,
          // bundled and never executed — the page's entire "what should I work
          // on" half was dead. Emit it, shaped to what those functions read
          // (completed_at / gto_score / ev_loss_avg / hands_played / level /
          // breakdown_blunder) rather than to the raw column names, since two
          // of those consumers are also fed by localStorage records that use
          // this shape.
          const sessionSeries = (sessions || []).map(s => ({
              id: s.id,
              completed_at: s.created_at,
              game_id: s.game_id || 'unknown',
              game_name: s.game_name || s.game_id || 'unknown',
              gto_score: toUnitScore(s),
              ev_loss_avg: Number(s.avg_ev_loss_per_hand) || 0,
              hands_played: s.hands_played || 0,
              // identifyLeaks buckets by `level` and parseInt()s it; sessions
              // saved without one default to 1, matching save-session.js.
              level: s.level || 1,
              breakdown_blunder: (s.classification_counts && s.classification_counts.blunder) || 0,
          }));

          // detectLeaks() reads report.positionStats ({decisions, accuracy}),
          // report.gtoScore and report.totalDecisions — none of which existed
          // under those names, so every one of its checks was skipped. These
          // are views over the numbers already computed above, not new maths.
          const positionStats = {};
          Object.entries(positionReport || {}).forEach(([pos, data]) => {
              positionStats[pos] = { decisions: data.total, accuracy: data.accuracy };
          });

          return res.status(200).json({
              success: true,
              report: {
                  period,
                  gameId: gameId || null,
                  byFormat,
                  byDate,
                  availableFormats,
                  sessions: sessionSeries,
                  positionStats,
                  gtoScore: overallAccuracy,
                  totalDecisions: totalQuestions,
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
