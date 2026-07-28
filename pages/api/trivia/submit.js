/**
 * TRIVIA SUBMIT API - Save Quiz Results
 * ═══════════════════════════════════════════════════════════════════════════
 * Saves player's trivia score and awards XP
 * All dates are in CST (Central Standard Time / America/Chicago)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Get current date in CST
function getTodayCST() {
    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const year = cstDate.getFullYear();
    const month = String(cstDate.getMonth() + 1).padStart(2, '0');
    const day = String(cstDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const { score, correctCount, xpEarned, totalQuestions, mode } = req.body || {};

          // ─── INPUT VALIDATION (was missing — anyone could post score=999999) ─
          if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score > 100000) {
              return res.status(400).json({ success: false, error: 'invalid_score' });
          }
          if (!Number.isFinite(correctCount) || !Number.isInteger(correctCount) || correctCount < 0 || correctCount > 1000) {
              return res.status(400).json({ success: false, error: 'invalid_correct_count' });
          }
          if (totalQuestions != null && (!Number.isInteger(totalQuestions) || totalQuestions < 0 || totalQuestions > 1000)) {
              return res.status(400).json({ success: false, error: 'invalid_total_questions' });
          }
          if (totalQuestions != null && correctCount > totalQuestions) {
              return res.status(400).json({ success: false, error: 'correct_exceeds_total' });
          }
          if (xpEarned != null && (!Number.isFinite(xpEarned) || xpEarned < 0 || xpEarned > 1_000_000)) {
              return res.status(400).json({ success: false, error: 'invalid_xp' });
          }

          // ─── AUTH REQUIRED (was optional — anon submissions polluted leaderboard) ─
          const authHeader = req.headers.authorization;
          if (!authHeader?.startsWith('Bearer ')) {
              return res.status(401).json({ success: false, error: 'authentication_required' });
          }
          const token = authHeader.slice(7).trim();
          if (!token) {
              return res.status(401).json({ success: false, error: 'authentication_required' });
          }
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          if (authErr || !authData?.user) {
              return res.status(401).json({ success: false, error: 'invalid_token' });
          }
          const userId = authData.user.id;

          // Resolve username (NEVER fall back to email prefix — was PII leak to public leaderboard)
          const { data: profile } = await getSupabase()
              .from('profiles')
              .select('username, full_name')
              .eq('id', userId)
              .maybeSingle();
          const username = profile?.username || profile?.full_name || 'Player';

          const today = getTodayCST();

          // Save score with user_id (RLS policy on trivia_scores requires auth.uid()=user_id OR null).
          // NOTE: trivia_scores.mode/total_questions/diamonds_earned are NOT NULL — provide defaults.
          // The original handler was silently failing on every insert due to missing `mode` column.
          const safeMode = (typeof mode === 'string' && mode.length > 0 && mode.length <= 32) ? mode : 'unknown';
          const { error: insertError } = await getSupabase()
              .from('trivia_scores')
              .insert({
                  user_id: userId,
                  username,
                  mode: safeMode,
                  score,
                  correct_count: correctCount,
                  total_questions: totalQuestions ?? correctCount,
                  diamonds_earned: 0,
                  play_date: today,
                  created_at: new Date().toISOString()
              });

          if (insertError) {
              console.warn('[Trivia Submit] Insert error:', insertError);
              // Surface real failures (was silently swallowed before)
              return res.status(500).json({ success: false, error: 'score_persist_failed' });
          }

          // Get updated leaderboard
          const { data: leaderboard } = await getSupabase()
              .from('trivia_scores')
              .select('username, score')
              .eq('play_date', today)
              .order('score', { ascending: false })
              .limit(10);

          return res.status(200).json({
              success: true,
              message: 'Score saved successfully',
              score,
              xpEarned: xpEarned ?? 0,
              leaderboard: leaderboard || []
          });

      } catch (error) {
          console.warn('[Trivia Submit] Error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
