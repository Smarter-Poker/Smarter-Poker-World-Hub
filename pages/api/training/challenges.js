/**
 * TRAINING CHALLENGES API - ENHANCED
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Historical weekly and monthly definitions. Live progress and rewards remain
 * paused until every target is derived atomically from verified attempts.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
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

// Get current period keys
function getPeriodKeys() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // ISO week calculation
    const tempDate = new Date(now.valueOf());
    tempDate.setDate(tempDate.getDate() + 3 - ((now.getDay() + 6) % 7));
    const week1 = new Date(tempDate.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((tempDate - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);

    return {
        weekly: `${year}-W${String(weekNum).padStart(2, '0')}`,
        monthly: `${year}-${month}`
    };
}

export default async function handler(req, res) {
  try {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Vary', 'Authorization');
      withTiming(res);
      if (req.method === 'POST' || req.method === 'PUT') {
          return res.status(410).json({
              success: false,
              error: 'Challenge progress and rewards require a verified server-owned Training attempt.',
              code: 'TRAINING_CHALLENGES_VERIFIED_ATTEMPT_REQUIRED',
          });
      }
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const supabase = getSupabase();
      const periods = getPeriodKeys();

      // ●● Auth: verify JWT identity ●●
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: authErr } = await supabase.auth['getUser'](token);
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
      const userId = user.id; // From JWT, not request

      // GET: Fetch active challenges with user progress
      if (req.method === 'GET') {
          try {
              // Parallel fetch: definitions and user progress are independent
              const [definitionResult, historicalResult] = await Promise.all([
                  supabase
                      .from('training_challenge_definitions')
                      .select('*')
                      .eq('is_active', true)
                      .order('challenge_type', { ascending: true })
                      .limit(100),
                  supabase
                      .from('training_user_challenges')
                      .select('*')
                      .eq('user_id', userId)
                      .in('period_key', [periods.weekly, periods.monthly])
                      .limit(100)
              ]);
              if (definitionResult.error) throw definitionResult.error;
              if (historicalResult.error) throw historicalResult.error;
              const definitions = definitionResult.data || [];
              const userProgress = historicalResult.data || [];

              const progressMap = new Map(
                  (userProgress || []).map(p => [`${p.challenge_id}-${p.period_key}`, p])
              );

              // Legacy rows are displayed only as historical evidence. They
              // cannot prove live completion, activate a claim, or promise a
              // reward after the unsafe browser writer was retired.
              const challenges = (definitions || []).map(def => {
                  const periodKey = def.challenge_type === 'weekly' ? periods.weekly : periods.monthly;
                  const existingProgress = progressMap.get(`${def.id}-${periodKey}`);

                  return {
                      ...def,
                      periodKey,
                      availability: 'paused_pending_verified_settlement',
                      rewardAvailable: false,
                      progress: 0,
                      completed: false,
                      claimed: false,
                      percentage: 0,
                      historicalProgress: existingProgress?.progress || 0,
                      historicallyCompleted: existingProgress?.completed || false,
                      historicallyClaimed: existingProgress?.claimed || false,
                  };
              });

              // Separate by type
              const weekly = challenges.filter(c => c.challenge_type === 'weekly');
              const monthly = challenges.filter(c => c.challenge_type === 'monthly');

              return res.status(200).json({
                  success: true,
                  availability: 'paused_pending_verified_settlement',
                  rewardAvailable: false,
                  periods,
                  weekly,
                  monthly,
                  challenges: [...(weekly || []), ...(monthly || [])],
                  totalCompleted: 0,
                  totalClaimed: 0,
                  historicalCompleted: challenges.filter(c => c.historicallyCompleted).length,
                  historicalClaimed: challenges.filter(c => c.historicallyClaimed).length,
                  message: 'Challenge Tracking And Rewards Are Paused Until They Are Derived From Verified Training Completions.',
              });

          } catch (error) {
              console.warn('[Challenges] Error:', error.message);
              return res.status(500).json({ success: false, error: 'Failed to fetch challenges' });
          }
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
