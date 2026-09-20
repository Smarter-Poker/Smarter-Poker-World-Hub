import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * TRAINING ACHIEVEMENTS API
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Get user achievements and check for new unlocks
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

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
      if (req.method === 'POST') {
          return res.status(410).json({
              success: false,
              error: 'Achievements can only be unlocked from verified server-owned Training results.',
              code: 'TRAINING_ACHIEVEMENTS_VERIFIED_ATTEMPT_REQUIRED',
          });
      }
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const supabase = getSupabase();

      // ●● Auth: verify JWT identity ●●
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
      const userId = user.id; // From JWT, not request

      // GET: Fetch user achievements
      if (req.method === 'GET') {
          res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
          res.setHeader('Vary', 'Authorization');

          try {
              // Parallel fetch: definitions and user achievements are independent
              const [definitionResult, historicalResult] = await Promise.all([
                  supabase
                      .from('training_achievement_definitions')
                      .select('*')
                      .order('category', { ascending: true })
                      .limit(100),
                  supabase
                      .from('training_user_achievements')
                      .select('achievement_id, unlocked_at, progress')
                      .eq('user_id', userId)
                      .limit(100)
              ]);
              if (definitionResult.error) throw definitionResult.error;
              if (historicalResult.error) throw historicalResult.error;

              const definitions = definitionResult.data || [];
              const userAchievements = historicalResult.data || [];

              const historicalMap = new Map(
                  (userAchievements || []).map(a => [a.achievement_id, a])
              );

              // Legacy browser-authored rows are retained only as an explicit
              // historical snapshot. They cannot unlock a live achievement,
              // progress bar, share action, or currency award.
              const achievements = (definitions || []).map(def => ({
                  ...def,
                  availability: 'paused_pending_verified_settlement',
                  rewardAvailable: false,
                  unlocked: false,
                  progress: 0,
                  historicallyUnlocked: historicalMap.has(def.id),
                  historicalUnlockedAt: historicalMap.get(def.id)?.unlocked_at || null,
                  historicalProgress: historicalMap.get(def.id)?.progress || 0,
              }));

              // Group by category
              const byCategory = achievements.reduce((acc, ach) => {
                  if (!acc[ach.category]) acc[ach.category] = [];
                  acc[ach.category].push(ach);
                  return acc;
              }, {});

              return res.status(200).json({
                  success: true,
                  availability: 'paused_pending_verified_settlement',
                  rewardAvailable: false,
                  achievements,
                  byCategory,
                  totalUnlocked: 0,
                  historicalUnlocked: userAchievements?.length || 0,
                  totalAchievements: definitions?.length || 0,
                  message: 'Achievement Earning Is Paused Until It Is Derived From Verified Training Completions.',
              });

          } catch (error) {
              console.warn('[Achievements] Error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to fetch achievements' });
          }
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
