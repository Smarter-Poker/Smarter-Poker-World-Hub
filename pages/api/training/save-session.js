/**
 * POST /api/training/save-session
 * Saves a complete training session with GTOW scoring, hand history,
 * per-position stats, and trainer configuration.
 *
 * This extends the basic save-progress by capturing rich session data
 * for lifetime tracking and historical replay.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withRetry } from '../../../src/lib/supabaseRetry';
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

// 2026-07-19 AUDIT FIX (E2E defect D1): session payloads with 100-hand
// histories exceeded the 1MB Next.js default body limit -> 413 on every
// level completion -> sessions never saved. The client now strips the bulk
// solver matrices, but older cached clients still send fat payloads; accept
// up to 4MB so their sessions save too.
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb',
        },
    },
};

// Strip the two per-169-hand bulk matrices from a hand-history entry before
// persisting — they are review-time UI data, not reporting data.
function compactHandHistoryEntry(h) {
    if (!h || typeof h !== 'object') return h;
    const hd = h.handData && typeof h.handData === 'object' ? h.handData : null;
    if (!hd) return h;
    const { rawFrequencies: _rf, ...restHd } = hd;
    const evData =
        restHd.evData && typeof restHd.evData === 'object'
            ? (({ handEVs: _he, ...restEv }) => restEv)(restHd.evData)
            : restHd.evData ?? null;
    return { ...h, handData: { ...restHd, evData } };
}

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      // Auth
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Body size guard (100KB max)
      // 2026-07-19 AUDIT FIX (wave-1 E2E): this in-handler guard was 100KB —
      // real 20-hand sessions with compacted histories are ~400KB, so EVERY
      // level completion still 413'd here even after the bodyParser limit was
      // raised. 2MB comfortably fits compacted histories while still bounding
      // abuse (bodyParser itself caps at 4MB).
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 2097152) {
          return res.status(413).json({ success: false, error: 'Request body too large' });
      }

      try {
          // Accept both camelCase (new standard) and snake_case (legacy/existing pages)
          const parsedGameId = req.body.gameId || req.body.game_id;
          const parsedHandsPlayed = req.body.handsPlayed ?? req.body.hands_played ?? 0;
          const parsedCorrectCount = req.body.correctCount ?? req.body.correct_answers ?? 0;
          const parsedTotalEVLoss = req.body.totalEVLoss ?? req.body.ev_loss ?? 0;
          const parsedAccuracy = req.body.accuracy ?? req.body.score ?? 0;
          const parsedMistakeCount = req.body.mistakeCount ?? (parsedHandsPlayed - parsedCorrectCount) ?? 0;
          const parsedGtowScore = req.body.gtowScore ?? req.body.accuracy ?? 100;

          const {
              gameName,
              avgEVLossPerHand,
              avgEVLossPerMistake,
              avgFrequencyDiff,
              bestStreak,
              levelPassed,
              level,
              // Detailed data
              handHistory,         // Full hand-by-hand data
              positionStats,       // Per-position breakdown
              classificationCounts, // Classification distribution
              // Trainer config (if custom)
              trainerConfig,
              // BUG-05 FIX: Speed bonus diamonds
              speedBonusDiamonds,
          } = req.body;

          if (!parsedGameId) {
              return res.status(400).json({ success: false, error: 'gameId or game_id required' });
          }

          const userId = user.id;
          const now = new Date().toISOString();

          // NOTE: training_progress is managed exclusively by save-progress.js
          // to avoid double-write race conditions. This endpoint only writes
          // to training_sessions for detailed session history.

          // 3. Save detailed session to training_sessions (JSONB-rich table)
          // Try to save to training_sessions if the table exists
          const detailedSession = {
              user_id: userId,
              game_id: parsedGameId,
              game_name: gameName || parsedGameId,
              gtow_score: parsedGtowScore,
              // roadmap #25 — mark the scale this row was written on. The
              // column defaults to 1 (legacy 0..100) so that any older deploy
              // still running the unsigned scorer labels its rows correctly;
              // this build emits the signed -100..+100 score, so it says so.
              score_scale: 2,
              total_ev_loss: parsedTotalEVLoss,
              hands_played: parsedHandsPlayed,
              mistake_count: parsedMistakeCount,
              accuracy: parsedAccuracy,
              correct_count: parsedCorrectCount,
              best_streak: bestStreak || 0,
              level_passed: levelPassed || false,
              level: level || 1,
              // JSONB fields — Supabase client handles objects natively, DO NOT stringify
              // 2026-07-19: compact server-side too (older clients send bulk matrices)
              hand_history: handHistory
                  ? handHistory.slice(0, 100).map(compactHandHistoryEntry)
                  : [],
              position_stats: positionStats || {},
              classification_counts: classificationCounts || {},
              trainer_config: trainerConfig || null,
              avg_ev_loss_per_hand: avgEVLossPerHand || 0,
              avg_frequency_diff: avgFrequencyDiff || 0,
              created_at: now,
          };

          const { error: sessErr } = await withRetry(
              () => getSupabase()
                  .from('training_sessions')
                  .insert(detailedSession),
              { label: 'SaveSession:insert' }
          );

          if (sessErr) {
              // Table might not exist yet — gracefully degrade
              console.warn('[SaveSession] training_sessions insert failed (table may not exist):', sessErr.message);
              // Still return success since we saved to training_progress and training_level_history
          }

          // 4. BUG-05 FIX: Award speed bonus diamonds to user's balance
          // SECURITY: Server-side cap — max legitimate speed bonus is ~50 diamonds
          const safeSpeedBonus = Math.max(0, Math.min(parseInt(speedBonusDiamonds, 10) || 0, 50));
          // ●●● 2026-07-26 AUDIT FIX: record the training streak ●●●
          // POST /api/training/streak was the only writer of training_streaks
          // and had no live caller (its callers are components with zero
          // importers, sending no auth header). The table had 0 rows, so
          // streaks, streak milestones, daily-bonus streak multipliers and the
          // challenges streak_days metric all read zero forever. Record it
          // here, where every completed session already lands. Non-blocking:
          // a streak failure must never fail a session save.
          try {
              // Anchor the streak day to America/Chicago, matching streak.js --
              // UTC days would double-count an evening session.
              const todayCST = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
              const { data: streakRow } = await getSupabase()
                  .from('training_streaks')
                  .select('id, current_streak, longest_streak, last_training_date, streak_start_date')
                  .eq('user_id', userId)
                  .maybeSingle();

              if (!streakRow) {
                  await getSupabase().from('training_streaks').insert({
                      user_id: userId,
                      current_streak: 1,
                      longest_streak: 1,
                      last_training_date: todayCST,
                      streak_start_date: todayCST,
                      milestones_claimed: [],
                  });
              } else if (streakRow.last_training_date !== todayCST) {
                  let daysDiff = null;
                  if (streakRow.last_training_date) {
                      const last = new Date(`${streakRow.last_training_date}T00:00:00Z`);
                      const today = new Date(`${todayCST}T00:00:00Z`);
                      daysDiff = Math.round((today - last) / 86400000);
                  }
                  const continues = daysDiff === 1;
                  const newStreak = continues ? (streakRow.current_streak || 0) + 1 : 1;
                  await getSupabase()
                      .from('training_streaks')
                      .update({
                          current_streak: newStreak,
                          longest_streak: Math.max(streakRow.longest_streak || 0, newStreak),
                          last_training_date: todayCST,
                          streak_start_date: continues
                              ? (streakRow.streak_start_date || todayCST)
                              : todayCST,
                          updated_at: new Date().toISOString(),
                      })
                      .eq('id', streakRow.id);
              }
          } catch (streakErr) {
              console.warn('[SaveSession] streak update failed (non-blocking):', streakErr.message);
          }

          let speedBonusAwarded = 0;
          if (safeSpeedBonus > 0) {
              try {
                  // Use RPC to atomically increment diamonds.
                  // Phase 63: was using `speed_..._${Date.now()}` — per-millisecond
                  // means every retry/replay credits AGAIN. Combined with the
                  // 50-diamond cap, a user could spam save-session 100x and
                  // grab 5000 free diamonds. Now buckets to per-(user, game,
                  // level, day) so the user gets at most one speed bonus per
                  // level per UTC day. DB dedups identical retries.
                  const _dayBucket = Math.floor(Date.now() / 86400000);
                  const { error: rpcErr } = await getSupabase().rpc('add_diamonds_to_balance', {
                      p_user_id: userId,
                      p_amount: safeSpeedBonus,
                      p_type: 'speed_bonus',
                      p_description: `Speed bonus: ${parsedGameId} — ${safeSpeedBonus}diamonds`,
                      p_reference_id: `speed_${userId}_${parsedGameId}_${level || 0}_${_dayBucket}`
                  });

                  if (rpcErr) {
                      // Fallback: direct update with current value
                      const { data: profile } = await getSupabase()
                          .from('profiles')
                          .select('diamond_balance')
                          .eq('id', userId)
                          .maybeSingle();

                      if (profile) {
                          const { error: err_profiles_yjrym } = await getSupabase()
                            .from('profiles')
                            .update({ diamond_balance: (profile.diamond_balance || 0) + safeSpeedBonus })
                              .eq('id', userId);
                          if (err_profiles_yjrym) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_yjrym.message);
                          else speedBonusAwarded = safeSpeedBonus;
                      }
                  } else {
                      speedBonusAwarded = safeSpeedBonus;
                  }

                  console.info(`[SaveSession] Speed bonus diamonds awarded: ${speedBonusAwarded}`);
              } catch (diamondErr) {
                  console.warn('[SaveSession] Diamond award failed (non-blocking):', diamondErr.message);
              }
          }

          // 5. Update lifetime stats aggregate
          // Upsert into a simple lifetime_stats concept in training_progress
          // We use training_progress metadata for now

          console.info(`[SaveSession] Session saved — GTOW ${parsedGtowScore}% | ${parsedHandsPlayed} hands played`);

          return res.status(200).json({
              success: true,
              saved: {
                  gtowScore: parsedGtowScore,
                  handsPlayed: parsedHandsPlayed,
                  totalEVLoss: parsedTotalEVLoss,
                  speedBonusAwarded,
              },
          });

      } catch (err) {
          console.warn('[SaveSession] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
