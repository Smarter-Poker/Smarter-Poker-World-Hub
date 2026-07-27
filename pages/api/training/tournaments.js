/**
 * TRAINING TOURNAMENTS API
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Competitive timed training challenges vs other players
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
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

export default async function handler(req, res) {
  try {
      withTiming(res);
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      const supabase = getSupabase();

      // ●● Auth: verify JWT identity (tournament registration and diamond rewards require identity) ●●
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: authErr } = await supabase.auth["getUser"](token);
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
      const userId = user.id; // From JWT, not request

      // GET: Fetch tournaments (upcoming, live, or completed)
      if (req.method === 'GET') {
          res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const rawStatus = safeQ(req.query.status);
          const rawTournamentId = safeQ(req.query.tournamentId);
          const status = ['live', 'scheduled', 'completed'].includes(rawStatus) ? rawStatus : null;
          const tournamentId = rawTournamentId ? sanitizeParam(rawTournamentId, 100) : null;

          try {
              // Single tournament with entries leaderboard
              if (tournamentId) {
                  // Parallel fetch: tournament details and entries are independent
                  const [tournamentResult, entriesResult] = await Promise.all([
                      supabase
                          .from('training_tournaments')
                          .select('*')
                          .eq('id', tournamentId)
                          .maybeSingle(),
                      supabase
                          .from('training_tournament_entries')
                          .select(`
                              *,
                              profiles:user_id (username, avatar_url)
                          `)
                          .eq('tournament_id', tournamentId)
                          .order('score', { ascending: false })
                          .limit(100)
                  ]);

                  const { data: tournament } = tournamentResult;
                  const { data: entries } = entriesResult;

                  if (!tournament) {
                      return res.status(404).json({ success: false, error: 'Tournament not found' });
                  }

                  // Check if user is registered
                  let userEntry = null;
                  if (userId) {
                      userEntry = entries?.find(e => e.user_id === userId) || null;
                  }

                  return res.status(200).json({
                      success: true,
                      tournament,
                      entries: entries || [],
                      userEntry,
                      leaderboard: (entries || []).slice(0, 10)
                  });
              }

              // List tournaments
              let query = supabase
                  .from('training_tournaments')
                  .select('*, entry_count')
                  .order('start_time', { ascending: true })
                      .limit(100);

              if (status === 'live') {
                  const now = new Date().toISOString();
                  query = query.eq('status', 'live')
                      .limit(100);
              } else if (status === 'scheduled' || status === 'upcoming') {
                  query = query.eq('status', 'scheduled')
                      .limit(100);
              } else if (status === 'completed') {
                  query = query.eq('status', 'complete')
                      .limit(100);
              }

              const { data: tournaments } = await query.limit(20);

              // If userId, get user's entries
              let userEntries = [];
              if (userId) {
                  const { data } = await supabase
                      .from('training_tournament_entries')
                      .select('tournament_id, status, score, final_rank')
                      .eq('user_id', userId);
                  userEntries = data || [];
              }

              return res.status(200).json({
                  success: true,
                  tournaments: tournaments || [],
                  userEntries
              });

          } catch (error) {
              console.warn('[Tournaments] Error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to fetch tournaments' });
          }
      }

      // POST: Register for tournament
      if (req.method === 'POST') {
          const bodySize = JSON.stringify(req.body || {}).length;
          if (bodySize > 10240) return res.status(413).json({ success: false, error: 'Request body too large' });
          const { tournamentId, action } = req.body;
          // userId from JWT (set at top of handler)

          if (!tournamentId) {
              return res.status(400).json({ success: false, error: 'tournamentId required' });
          }

          try {
              // Get tournament
              const { data: tournament } = await supabase
                  .from('training_tournaments')
                  .select('*')
                  .eq('id', tournamentId)
                  .maybeSingle();

              if (!tournament) {
                  return res.status(404).json({ success: false, error: 'Tournament not found' });
              }

              // Check if can still enter
              const now = new Date();
              const startTime = new Date(tournament.start_time);
              const entryDeadline = new Date(startTime.getTime() + (tournament.entry_window_minutes * 60000));

              if (action === 'register') {
                  if (now > entryDeadline) {
                      return res.status(400).json({ success: false, error: 'Entry window has closed' });
                  }

                  if (tournament.max_entries && tournament.entry_count >= tournament.max_entries) {
                      return res.status(400).json({ success: false, error: 'Tournament is full' });
                  }

                  // Check if already registered
                  const { data: existing } = await supabase
                      .from('training_tournament_entries')
                      .select('id')
                      .eq('tournament_id', tournamentId)
                      .eq('user_id', userId)
                      .maybeSingle();

                  if (existing) {
                      return res.status(400).json({ success: false, error: 'Already registered' });
                  }

                  // Charge entry fee
                  // Note: Supabase RPC returns {data, error} and does NOT throw, so the
                  // previous try/catch never caught RPC failures — a silent deduct
                  // failure would let the user register for free below.
                  let chargedFee = false;
                  if (tournament.entry_fee_diamonds > 0) {
                      const { data: balance, error: balErr } = await supabase.rpc('get_diamond_balance', { p_user_id: userId });
                      if (balErr) {
                          console.warn('[Tournaments] balance check RPC failed:', balErr);
                          return res.status(500).json({ success: false, error: 'Payment processing failed' });
                      }

                      if ((balance || 0) < tournament.entry_fee_diamonds) {
                          return res.status(400).json({ success: false, error: 'Insufficient diamonds' });
                      }

                      // BUG #258 FIX: Include userId in reference_id for per-user uniqueness
                      const { error: chargeErr } = await supabase.rpc('add_diamonds_to_balance', {
                          p_user_id: userId,
                          p_amount: -tournament.entry_fee_diamonds,
                          p_type: 'arcade_entry',
                          p_description: `Tournament entry fee — ${tournament.entry_fee_diamonds}diamonds`,
                          p_reference_id: `tourney_entry_${tournamentId}_${userId}`
                      });

                      if (chargeErr) {
                          console.warn('[Tournaments] Entry-fee RPC failed:', chargeErr);
                          return res.status(500).json({ success: false, error: 'Payment processing failed' });
                      }
                      chargedFee = true;
                  }

                  // BUG #258 FIX: Use upsert with onConflict to prevent double-registration race
                  const { data: regResult, error: regErr } = await supabase
                      .from('training_tournament_entries')
                      .upsert({
                          tournament_id: tournamentId,
                          user_id: userId,
                          status: 'registered'
                      }, { onConflict: 'tournament_id,user_id', ignoreDuplicates: true })
                      .select('id');

                  if (regErr) {
                      // Registration failed AFTER we charged. The reference_id uniqueness
                      // would prevent a duplicate retry-charge, but it does NOT refund the
                      // current one. Compensate explicitly so the user isn't left short.
                      if (chargedFee) {
                          // Phase 63: was using Date.now() in refund reference_id —
                          // every client retry that hit this refund path would credit
                          // AGAIN with a new Date.now(), giving the user a free double
                          // refund. Stable ref now mirrors the charge ref so DB dedups.
                          // Also captures rpcErr destructure — supabase-js doesn't
                          // throw on DB errors so the prior try/catch missed silent
                          // refund failures (user lost entire entry fee).
                          const { error: refundRpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                              p_user_id: userId,
                              p_amount: tournament.entry_fee_diamonds,
                              p_type: 'arcade_entry_refund',
                              p_description: `Tournament entry refund — registration failed`,
                              p_reference_id: `tourney_entry_refund_${tournamentId}_${userId}`,
                          }).catch(refundErr => {
                              console.warn('[Tournaments] Refund threw:', refundErr?.message || refundErr);
                              return { error: { message: 'refund_threw' } };
                          });
                          if (refundRpcErr) {
                              console.warn('[Tournaments] Refund RPC error — user may need manual refund:', refundRpcErr.message);
                          }
                      }
                      return res.status(500).json({ success: false, error: 'Registration failed' });
                  }

                  // Increment entry count
                  const { error: err_training_tournaments_bkr8l } = await supabase
                    .from('training_tournaments')
                    .update({ entry_count: tournament.entry_count + 1 })
                      .eq('id', tournamentId);
                  if (err_training_tournaments_bkr8l) console.warn('[Supabase] Silent mutation failed in training_tournaments:', err_training_tournaments_bkr8l.message);

                  return res.status(200).json({
                      success: true,
                      message: 'Registered for tournament!',
                      entryCost: tournament.entry_fee_diamonds
                  });
              }

              if (action === 'start') {
                  // Get user's entry
                  const { data: entry } = await supabase
                      .from('training_tournament_entries')
                      .select('*')
                      .eq('tournament_id', tournamentId)
                      .eq('user_id', userId)
                      .maybeSingle();

                  if (!entry) {
                      return res.status(400).json({ success: false, error: 'Not registered for this tournament' });
                  }

                  if (entry.status !== 'registered') {
                      return res.status(400).json({ success: false, error: 'Already started or completed' });
                  }

                  // Update to playing
                  const { error: err_training_tournament_entries_wfig7 } = await supabase
                    .from('training_tournament_entries')
                    .update({
                          status: 'playing',
                          started_at: now.toISOString()
                      })
                      .eq('id', entry.id);
                  if (err_training_tournament_entries_wfig7) console.warn('[Supabase] Silent mutation failed in training_tournament_entries:', err_training_tournament_entries_wfig7.message);

                  return res.status(200).json({
                      success: true,
                      message: 'Tournament started!',
                      gameId: tournament.game_id,
                      questionsCount: tournament.questions_count,
                      timeLimit: tournament.time_limit_seconds
                  });
              }

              return res.status(400).json({ success: false, error: 'Invalid action' });

          } catch (error) {
              console.warn('[Tournaments] Register error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to process tournament action' });
          }
      }

      // PUT: Submit tournament results
      if (req.method === 'PUT') {
          let { tournamentId, score, accuracy, timeTaken, questionsAnswered, questionsCorrect } = req.body;
          // userId from JWT (set at top of handler)

          if (!tournamentId) {
              return res.status(400).json({ success: false, error: 'tournamentId required' });
          }

          try {
              // Get user's entry
              const { data: entry } = await supabase
                  .from('training_tournament_entries')
                  .select('*')
                  .eq('tournament_id', tournamentId)
                  .eq('user_id', userId)
                  .maybeSingle();

              if (!entry) {
                  return res.status(404).json({ success: false, error: 'Entry not found' });
              }

              if (entry.status === 'completed') {
                  return res.status(400).json({ success: false, error: 'Already submitted results' });
              }

              // Clamp self-reported results to sane bounds before scoring
              accuracy = Math.max(0, Math.min(100, Number(accuracy) || 0));
              timeTaken = Math.max(0, Number(timeTaken) || 0);
              questionsAnswered = Math.max(0, Number(questionsAnswered) || 0);
              questionsCorrect = Math.min(Math.max(0, Number(questionsCorrect) || 0), questionsAnswered);

              // Calculate score (accuracy * 100 + time bonus)
              const timeBonus = Math.max(0, 300 - (timeTaken || 0)); // Bonus for faster completion
              const finalScore = Math.round((accuracy || 0) * 100) + timeBonus;

              // Update entry with results
              const { error: err_training_tournament_entries_eewe9 } = await supabase
                .from('training_tournament_entries')
                .update({
                      status: 'completed',
                      score: finalScore,
                      accuracy: accuracy || 0,
                      time_taken_seconds: timeTaken,
                      questions_answered: questionsAnswered,
                      questions_correct: questionsCorrect,
                      completed_at: new Date().toISOString()
                  })
                  .eq('id', entry.id);
              if (err_training_tournament_entries_eewe9) console.warn('[Supabase] Silent mutation failed in training_tournament_entries:', err_training_tournament_entries_eewe9.message);

              // Get current rank
              const { data: betterScores } = await supabase
                  .from('training_tournament_entries')
                  .select('id')
                  .eq('tournament_id', tournamentId)
                  .gt('score', finalScore)
                      .limit(100);

              const currentRank = (betterScores?.length || 0) + 1;

              return res.status(200).json({
                  success: true,
                  score: finalScore,
                  currentRank,
                  message: `Score submitted! You're currently #${currentRank}`
              });

          } catch (error) {
              console.warn('[Tournaments] Submit error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to submit results' });
          }
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
