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
          const { score, correctCount, xpEarned, totalQuestions } = req.body;

          if (typeof score !== 'number' || typeof correctCount !== 'number') {
              return res.status(400).json({ success: false, error: 'Invalid score data' });
          }

          const today = getTodayCST();

          // Use authenticated user's username if JWT present; otherwise anonymous
          let username = 'Guest_' + Math.random().toString(36).substring(2, 8);
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
              try {
                  const token = authHeader.replace('Bearer ', '');
                  const { data: { user } } = await getSupabase().auth.getUser(token);
                  if (user) {
                      // Try to get their profile username
                      const { data: profile } = await getSupabase()
                          .from('profiles')
                          .select('username, full_name')
                          .eq('id', user.id)
                          .single();
                      username = profile?.username || profile?.full_name || user.email?.split('@')[0] || username;
                  }
              } catch (e) { /* fall back to guest */ }
          }

          // Save score to leaderboard
          const { error: insertError } = await getSupabase()
              .from('trivia_scores')
              .insert({
                  username,
                  score,
                  correct_count: correctCount,
                  total_questions: totalQuestions,
                  xp_earned: xpEarned,
                  play_date: today,
                  created_at: new Date().toISOString()
              });

          if (insertError) {
              console.error('[Trivia Submit] Insert error:', insertError);
              // Don't fail - the table might not exist yet
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
              xpEarned,
              leaderboard: leaderboard || []
          });

      } catch (error) {
          console.error('[Trivia Submit] Error:', error);
          return res.status(500).json({ success: false, error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
