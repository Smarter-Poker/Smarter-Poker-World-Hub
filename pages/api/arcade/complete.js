/**
 * POST /api/arcade/complete
 * Complete an arcade game — award prize diamonds if won, log result
 *
 * Body: { gameType, score, correctCount, totalQuestions, won, prize, entryFee, timeSpentMs }
 * Auth: Bearer token required
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Server-side prize caps per game type (must match arcadeEngine.ts maxPrize)
const MAX_PRIZE = {
    'hand-snap':        50,
    'board-nuts':       75,
    'chip-math':        50,
    'showdown':         100,
    'double-or-nothing': 100,
    'the-gauntlet':     1000,
    'mystery-box':      250,
    'ev-or-fold':       150,
};

// Minimum accuracy to win (must match arcadeEngine.ts: 0.5 = 50%)
const WIN_THRESHOLD = 0.5;

export default async function handler(req, res) {
  try {
      if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Authentication required' });

      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const {
          gameType,
          correctCount = 0,
          totalQuestions = 1,
          streak: rawStreak = 0,
          timeSpentMs = 0,
      } = req.body;

      if (!gameType) return res.status(400).json({ error: 'gameType required' });

      // Sanitize streak — don't fully trust client, clamp to reasonable range
      const streak = Math.max(0, Math.min(Number(rawStreak) || 0, 10));

      // Server verifies win condition — never trust client-supplied 'won' or 'prize'
      const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0;
      const won = accuracy >= WIN_THRESHOLD;

      // Server calculates prize using tiered system matching arcadeEngine.ts calculatePrize
      const cap = MAX_PRIZE[gameType] ?? 100;
      let basePrize = 0;
      if (won) {
          if (accuracy >= 0.95) basePrize = cap;
          else if (accuracy >= 0.85) basePrize = Math.floor(cap * 0.75);
          else if (accuracy >= 0.70) basePrize = Math.floor(cap * 0.50);
          else basePrize = Math.floor(cap * 0.25);
      }
      const rake = Math.floor(basePrize * 0.10); // 10% house rake
      const afterRake = basePrize - rake;

      // Streak bonus: 10% per streak level, max 50% — matches arcadeEngine.ts
      const streakMultiplier = Math.min(streak * 0.10, 0.50);
      const streakBonus = Math.floor(afterRake * streakMultiplier);
      const prize = afterRake + streakBonus;

      try {
          if (won && prize > 0) {
              const { error: awardErr } = await supabaseAdmin.rpc('add_diamonds_to_balance', {
                  p_user_id: user.id,
                  p_amount: prize,
                  p_type: 'arcade_prize',
                  p_description: `${gameType} win — ${correctCount}/${totalQuestions} correct (${prize}💎)`,
                  p_reference_id: null,
              });
              if (awardErr) throw new Error(awardErr.message);
          }

          // Log result for leaderboard + analytics
          await supabaseAdmin
              .from('diamond_arena_events')
              .insert({
                  user_id: user.id,
                  event_type: 'game_complete',
                  game_type: gameType,
                  score: correctCount,
                  correct_count: correctCount,
                  total_questions: totalQuestions,
                  time_spent_ms: Math.max(0, Math.min(timeSpentMs, 3600000)), // cap at 1hr
                  won,
                  prize_awarded: prize,
                  diamonds_delta: prize,
                  status: 'completed',
              });

          return res.status(200).json({
              success: true,
              won,
              prize,
              accuracy: Math.round(accuracy * 100),
              message: won ? `You won ${prize} diamonds!` : 'Better luck next time!',
          });
      } catch (err) {
          console.error('[arcade/complete]', err.message);
          return res.status(500).json({ error: 'Failed to record game result' });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
