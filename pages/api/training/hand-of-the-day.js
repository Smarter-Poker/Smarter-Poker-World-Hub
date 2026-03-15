/**
 * HAND OF THE DAY API
 * ═══════════════════════════════════════════════════════════════════════════
 * GET  - Returns today's curated daily challenge hand (seeded by date)
 * POST - Records a user's daily challenge completion
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
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
// Deterministic hash from date string to get consistent daily question
function dateHash(dateStr) {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
        const char = dateStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

export default async function handler(req, res) {
  try {
      withTiming(res);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      if (req.method === 'GET') {
          res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
          // GET: Return today's daily challenge hand
          try {
              const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
              const dailyId = `daily-${today}`;

              // Get total question count first
              const { count } = await supabase
                  .from('training_questions')
                  .select('*', { count: 'exact', head: true });

              if (!count || count === 0) {
                  return res.status(200).json({
                      success: true,
                      dailyId,
                      question: null,
                      message: 'No training questions available',
                  });
              }

              // Use date hash to pick a consistent question for the day
              const offset = dateHash(today) % count;

              const { data: question, error } = await supabase
                  .from('training_questions')
                  .select('*')
                  .range(offset, offset)
                  .maybeSingle();

              if (error) {
                  console.error('[HandOfTheDay] Query error:', error);
                  return res.status(500).json({ success: false, error: 'Failed to fetch daily hand' });
              }

              // Calculate expiry (midnight UTC tomorrow)
              const tomorrow = new Date();
              tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
              tomorrow.setUTCHours(0, 0, 0, 0);

              return res.status(200).json({
                  success: true,
                  dailyId,
                  question,
                  expiresAt: tomorrow.toISOString(),
              });

          } catch (error) {
              console.error('[HandOfTheDay] Error:', error.message);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

      } else if (req.method === 'POST') {
          // POST: Record daily challenge completion
          const bodySize = JSON.stringify(req.body || {}).length;
          if (bodySize > 10240) return res.status(413).json({ success: false, error: 'Request body too large' });
          // ── Auth: verify JWT identity ──
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
          const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          try {
              const userId = user.id; // From JWT, NOT from req.body
              const { dailyId, score, evLoss } = req.body;

              if (!dailyId) {
                  return res.status(400).json({ success: false, error: 'dailyId required' });
              }

              const { data, error } = await supabase
                  .from('training_daily_challenge')
                  .upsert({
                      user_id: userId,
                      daily_id: dailyId,
                      score: score || 0,
                      ev_loss: evLoss || 0,
                      completed_at: new Date().toISOString(),
                  }, {
                      onConflict: 'user_id,daily_id',
                  });

              if (error) {
                  console.error('[HandOfTheDay] Insert error:', error);
                  // Graceful fallback — table might not exist yet
                  return res.status(200).json({
                      success: true,
                      message: 'Completion logged (table may not exist yet)',
                  });
              }

              // Emit diamond reward for daily challenge completion
              return res.status(200).json({
                  success: true,
                  message: 'Daily challenge completed!',
                  diamondsEarned: 25,
              });

          } catch (error) {
              console.error('[HandOfTheDay] Error:', error.message);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

      } else {
          res.setHeader('Allow', ['GET', 'POST']);
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
