/**
 * 🎯 TRAINING CHALLENGES API - ENHANCED
 * ═══════════════════════════════════════════════════════════════════════════
 * Weekly and monthly rotating challenges with full progress tracking
 * Supports: sessions, perfect_rounds, category_sessions, accuracy_avg, 
 *           streak_days, unique_categories
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyChallengeComplete } from '../../../src/utils/trainingNotifications';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Game ID to category mapping (extracted from TRAINING_LIBRARY)
const CATEGORY_MAP = {
    'mtt': 'mtt',
    'cash': 'cash',
    'spins': 'spins',
    'psychology': 'psychology',
    'psych': 'psychology',
    'advanced': 'advanced',
    'adv': 'advanced',
    'preflop': 'preflop',
    'postflop': 'postflop'
};

// Extract category from gameId (e.g., 'mtt-001' -> 'mtt', 'cash-025' -> 'cash')
function getGameCategory(gameId) {
    if (!gameId) return 'general';
    const prefix = gameId.split('-')[0].toLowerCase();
    return CATEGORY_MAP[prefix] || 'general';
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

// Calculate average accuracy for a period
async function getAverageAccuracy(supabase, userId, periodKey, isWeekly) {
    // Get period start date
    const now = new Date();
    let startDate;

    if (isWeekly) {
        // Start of week (Monday)
        const day = now.getDay() || 7;
        startDate = new Date(now);
        startDate.setDate(now.getDate() - day + 1);
        startDate.setHours(0, 0, 0, 0);
    } else {
        // Start of month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const { data: sessions } = await supabase
        .from('jarvis_training_sessions')
        .select('accuracy')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
        .not('accuracy', 'is', null)
            .limit(100);

    if (!sessions?.length) return 0;

    const sum = sessions.reduce((acc, s) => acc + (s.accuracy || 0), 0);
    return Math.round(sum / sessions.length);
}

// Get unique categories played in period
async function getUniqueCategoriesPlayed(supabase, userId, periodKey, isWeekly) {
    const now = new Date();
    let startDate;

    if (isWeekly) {
        const day = now.getDay() || 7;
        startDate = new Date(now);
        startDate.setDate(now.getDate() - day + 1);
        startDate.setHours(0, 0, 0, 0);
    } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const { data: sessions } = await supabase
        .from('jarvis_training_sessions')
        .select('game_id')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
            .limit(100);

    if (!sessions?.length) return 0;

    const categories = new Set();
    sessions.forEach(s => {
        const cat = getGameCategory(s.game_id);
        if (cat && cat !== 'general') categories.add(cat);
    });

    return categories.size;
}

// Get current streak from streaks table
async function getCurrentStreak(supabase, userId) {
    const { data } = await supabase
        .from('training_streaks')
        .select('current_streak')
        .eq('user_id', userId)
        .maybeSingle();

    return data?.current_streak || 0;
}

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const periods = getPeriodKeys();

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
    const userId = user.id; // From JWT, not request

    // GET: Fetch active challenges with user progress
    if (req.method === 'GET') {

        try {
            // Get active challenge definitions
            const { data: definitions } = await supabase
                .from('training_challenge_definitions')
                .select('*')
                .eq('is_active', true)
                .order('challenge_type', { ascending: true })
                    .limit(100);

            // Get user's progress for current periods
            const { data: userProgress } = await supabase
                .from('training_user_challenges')
                .select('*')
                .eq('user_id', userId)
                .in('period_key', [periods.weekly, periods.monthly])
                    .limit(100);

            const progressMap = new Map(
                (userProgress || []).map(p => [`${p.challenge_id}-${p.period_key}`, p])
            );

            // Calculate dynamic progress for some challenge types
            const avgAccuracyWeekly = await getAverageAccuracy(supabase, userId, periods.weekly, true);
            const avgAccuracyMonthly = await getAverageAccuracy(supabase, userId, periods.monthly, false);
            const uniqueCategoriesMonthly = await getUniqueCategoriesPlayed(supabase, userId, periods.monthly, false);
            const currentStreak = await getCurrentStreak(supabase, userId);

            // Combine definitions with progress
            const challenges = (definitions || []).map(def => {
                const periodKey = def.challenge_type === 'weekly' ? periods.weekly : periods.monthly;
                const existingProgress = progressMap.get(`${def.id}-${periodKey}`);

                // Determine current progress based on target type
                let progress = existingProgress?.progress || 0;

                // Dynamic progress for certain types
                switch (def.target_type) {
                    case 'accuracy_avg':
                        progress = def.challenge_type === 'weekly' ? avgAccuracyWeekly : avgAccuracyMonthly;
                        break;
                    case 'unique_categories':
                        progress = uniqueCategoriesMonthly;
                        break;
                    case 'streak_days':
                        progress = currentStreak;
                        break;
                }

                const completed = progress >= def.target_value;

                return {
                    ...def,
                    periodKey,
                    progress,
                    completed: completed || existingProgress?.completed || false,
                    claimed: existingProgress?.claimed || false,
                    percentage: Math.min(100, Math.round((progress / def.target_value) * 100))
                };
            });

            // Separate by type
            const weekly = challenges.filter(c => c.challenge_type === 'weekly');
            const monthly = challenges.filter(c => c.challenge_type === 'monthly');

            return res.status(200).json({
                success: true,
                periods,
                weekly,
                monthly,
                totalCompleted: challenges.filter(c => c.completed).length,
                totalClaimed: challenges.filter(c => c.claimed).length,
                debug: { avgAccuracyWeekly, avgAccuracyMonthly, uniqueCategoriesMonthly, currentStreak }
            });

        } catch (error) {
            console.error('[Challenges] Error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to fetch challenges' });
        }
    }

    // POST: Update challenge progress after session
    if (req.method === 'POST') {
        const { sessionData } = req.body;
        // userId from JWT (set at top of handler)

        try {
            const {
                accuracy = 0,
                gameId = '',
                isPerfect = false
            } = sessionData || {};

            // Determine category from gameId
            const category = getGameCategory(gameId);

            // Get active challenges
            const { data: definitions } = await supabase
                .from('training_challenge_definitions')
                .select('*')
                .eq('is_active', true)
                    .limit(100);

            const updatedChallenges = [];

            for (const def of definitions || []) {
                const periodKey = def.challenge_type === 'weekly' ? periods.weekly : periods.monthly;
                let incrementBy = 0;
                let directProgress = null;

                // Determine if this session contributes to the challenge
                switch (def.target_type) {
                    case 'sessions':
                        incrementBy = 1;
                        break;

                    case 'perfect_rounds':
                        if (isPerfect || accuracy === 100) incrementBy = 1;
                        break;

                    case 'category_sessions':
                        // Check if category matches
                        const targetCat = def.target_category?.toLowerCase();
                        if (targetCat && category === targetCat) {
                            incrementBy = 1;
                        }
                        // Also match preflop/postflop based on game focus
                        if (targetCat === 'preflop' && gameId.toLowerCase().includes('preflop')) {
                            incrementBy = 1;
                        }
                        if (targetCat === 'postflop' && (
                            gameId.toLowerCase().includes('postflop') ||
                            gameId.toLowerCase().includes('c-bet') ||
                            gameId.toLowerCase().includes('river')
                        )) {
                            incrementBy = 1;
                        }
                        break;

                    case 'accuracy_avg':
                        // This is calculated dynamically on GET, but we update the record
                        const isWeekly = def.challenge_type === 'weekly';
                        directProgress = await getAverageAccuracy(supabase, userId, periodKey, isWeekly);
                        break;

                    case 'unique_categories':
                        // Recalculate unique categories
                        directProgress = await getUniqueCategoriesPlayed(supabase, userId, periodKey, def.challenge_type === 'weekly');
                        break;

                    case 'streak_days':
                        // Get current streak value
                        directProgress = await getCurrentStreak(supabase, userId);
                        break;
                }

                // Skip if no change needed
                if (incrementBy === 0 && directProgress === null) continue;

                // Upsert progress
                const { data: existing } = await supabase
                    .from('training_user_challenges')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('challenge_id', def.id)
                    .eq('period_key', periodKey)
                    .maybeSingle();

                const newProgress = directProgress !== null
                    ? directProgress
                    : (existing?.progress || 0) + incrementBy;

                const isNowComplete = newProgress >= def.target_value;

                if (existing) {
                    await supabase
                        .from('training_user_challenges')
                        .update({
                            progress: newProgress,
                            completed: isNowComplete,
                            completed_at: isNowComplete && !existing.completed ? new Date().toISOString() : existing.completed_at
                        })
                        .eq('id', existing.id);
                } else {
                    await supabase
                        .from('training_user_challenges')
                        .insert({
                            user_id: userId,
                            challenge_id: def.id,
                            period_key: periodKey,
                            progress: newProgress,
                            completed: isNowComplete,
                            completed_at: isNowComplete ? new Date().toISOString() : null
                        });
                }

                if (isNowComplete && !existing?.completed) {
                    // Send push notification
                    await notifyChallengeComplete(userId, def)
                        .catch(e => console.warn('[Challenges] Push failed:', e.message));

                    updatedChallenges.push({
                        ...def,
                        justCompleted: true
                    });
                }
            }

            return res.status(200).json({
                success: true,
                category,
                updatedChallenges,
                newlyCompleted: updatedChallenges.filter(c => c.justCompleted)
            });

        } catch (error) {
            console.error('[Challenges] Update error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to update challenges' });
        }
    }

    // PUT: Claim completed challenge reward
    if (req.method === 'PUT') {
        const { challengeId, periodKey } = req.body;
        // userId from JWT (set at top of handler)

        if (!challengeId || !periodKey) {
            return res.status(400).json({ success: false, error: 'challengeId and periodKey required' });
        }

        try {
            // Get challenge progress
            const { data: progress } = await supabase
                .from('training_user_challenges')
                .select('*, training_challenge_definitions(*)')
                .eq('user_id', userId)
                .eq('challenge_id', challengeId)
                .eq('period_key', periodKey)
                .maybeSingle();

            if (!progress) {
                return res.status(404).json({ success: false, error: 'Challenge progress not found' });
            }

            if (!progress.completed) {
                return res.status(400).json({ success: false, error: 'Challenge not completed yet' });
            }

            if (progress.claimed) {
                return res.status(400).json({ success: false, error: 'Already claimed' });
            }

            // BUG #256 FIX: Atomic claim — prevents TOCTOU double-diamond exploit.
            // Two concurrent requests could both read claimed=false, both award diamonds.
            // Fix: update WHERE claimed=false, check if row was actually updated.
            const { data: claimedRow, error: claimErr } = await supabase
                .from('training_user_challenges')
                .update({
                    claimed: true,
                    claimed_at: new Date().toISOString()
                })
                .eq('id', progress.id)
                .eq('claimed', false)  // Only succeeds if still unclaimed
                .select('id')
                .maybeSingle();

            if (claimErr || !claimedRow) {
                return res.status(409).json({ success: false, error: 'Already claimed (concurrent request)' });
            }

            // Award diamonds via logging RPC
            const reward = progress.training_challenge_definitions?.diamond_reward || 0;
            if (reward > 0) {
                await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: reward,
                    p_type: 'challenge',
                    p_description: `${progress.training_challenge_definitions?.name || 'Challenge'} completed — ${reward}💎`,
                    p_reference_id: challengeId
                });
            }

            return res.status(200).json({
                success: true,
                claimed: {
                    challengeId,
                    name: progress.training_challenge_definitions?.name,
                    diamondsAwarded: reward
                }
            });

        } catch (error) {
            console.error('[Challenges] Claim error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to claim challenge' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
