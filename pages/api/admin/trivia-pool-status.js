/**
 * TRIVIA QUESTION POOL STATUS & BULK GENERATOR
 * Admin endpoint to check pool status and trigger bulk generation
 *
 * Usage:
 * GET /api/admin/trivia-pool-status - Get current pool stats
 * POST /api/admin/trivia-pool-status - Trigger bulk generation (pass batches in body)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const CATEGORIES = [
    { id: 'poker_history', name: 'Poker History' },
    { id: 'famous_hands', name: 'Famous Hands' },
    { id: 'player_profiles', name: 'Player Profiles' },
    { id: 'tournament_facts', name: 'Tournament Facts' },
    { id: 'rule_knowledge', name: 'Rules & Etiquette' },
    { id: 'gto_theory', name: 'GTO Theory' },
    // New Strategy Categories - Feb 2026
    { id: 'mtt_situations', name: 'MTT Situations' },
    { id: 'cash_game_situations', name: 'Cash Game Situations' },
    { id: 'icm_chip_ev', name: 'ICM & Chip EV' },
    { id: 'gto_scenarios', name: 'GTO Scenarios' }
];

// Phase 49 (2026-05-05): bumped down from 3000 to 1500. Plan v3 target:
// 5 strategy categories at 1500 each (deterministic engine) + 5 fact categories
// at 1500 each (Grok refill) = 15,000 total at 60-day rotation capacity.
const TARGET_PER_CATEGORY = 1500;
const SIXTY_DAY_FLOOR = 1200;
const TRACK_A_CATEGORIES = new Set(['gto_theory', 'gto_scenarios', 'cash_game_situations', 'mtt_situations', 'icm_chip_ev']);

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    // Auth: require admin/superadmin/god for ALL methods. GET was previously
    // unauthenticated, leaking full content-pipeline metrics to anyone.
    {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
        const authUser = authData?.user;
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
        const { data: prof } = await getSupabase().from('profiles').select('role').eq('id', authUser.id).maybeSingle();
        if (!prof || !['admin', 'superadmin', 'god'].includes(prof.role)) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
    }

    try {
        // Get comprehensive pool statistics
        const stats = {};
        let totalQuestions = 0;

        for (const cat of CATEGORIES) {
            const { count: total } = await getSupabase()
                .from('trivia_questions')
                .select('*', { count: 'exact', head: true })
                .eq('category', cat.id);

            const { count: easy } = await getSupabase()
                .from('trivia_questions')
                .select('*', { count: 'exact', head: true })
                .eq('category', cat.id)
                .eq('difficulty', 'easy');

            const { count: medium } = await getSupabase()
                .from('trivia_questions')
                .select('*', { count: 'exact', head: true })
                .eq('category', cat.id)
                .eq('difficulty', 'medium');

            const { count: hard } = await getSupabase()
                .from('trivia_questions')
                .select('*', { count: 'exact', head: true })
                .eq('category', cat.id)
                .eq('difficulty', 'hard');

            // Check how many are available (not used in last 60 days)
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            const { count: available } = await getSupabase()
                .from('trivia_questions')
                .select('*', { count: 'exact', head: true })
                .eq('category', cat.id)
                .or(`last_used_at.is.null,last_used_at.lt.${sixtyDaysAgo.toISOString()}`);

            const catTotal = total || 0;
            totalQuestions += catTotal;

            // Phase 49: per-difficulty targets follow 20/50/30 split (300/750/450 of 1500)
            const targetEasy = Math.floor(TARGET_PER_CATEGORY * 0.20);
            const targetMedium = Math.floor(TARGET_PER_CATEGORY * 0.50);
            const targetHard = Math.floor(TARGET_PER_CATEGORY * 0.30);

            stats[cat.id] = {
                name: cat.name,
                track: TRACK_A_CATEGORIES.has(cat.id) ? 'A' : 'B',
                total: catTotal,
                easy: easy || 0,
                medium: medium || 0,
                hard: hard || 0,
                target_easy: targetEasy,
                target_medium: targetMedium,
                target_hard: targetHard,
                gap_easy: Math.max(0, targetEasy - (easy || 0)),
                gap_medium: Math.max(0, targetMedium - (medium || 0)),
                gap_hard: Math.max(0, targetHard - (hard || 0)),
                available: available || catTotal,
                target: TARGET_PER_CATEGORY,
                progress: `${Math.round((catTotal / TARGET_PER_CATEGORY) * 100)}%`,
                progress_pct: Math.round((catTotal / TARGET_PER_CATEGORY) * 100),
                needed: Math.max(0, TARGET_PER_CATEGORY - catTotal),
                below_60day_floor: catTotal < SIXTY_DAY_FLOOR,
            };
        }

        const targetTotal = CATEGORIES.length * TARGET_PER_CATEGORY;
        const overallProgress = Math.round((totalQuestions / targetTotal) * 100);

        // Calculate estimated gameplay support
        const survivalRunQuestions = 200; // 10 levels x 20 questions
        const dailyQuestions = 225; // Survival + Mixed + Daily typical usage
        const daysSupported = Math.floor(totalQuestions / dailyQuestions);
        const playersSupported = Math.floor(totalQuestions / (dailyQuestions * 60)); // 60-day rotation

        const poolStatus = {
            summary: {
                totalQuestions,
                targetTotal,
                progress: `${overallProgress}%`,
                isComplete: totalQuestions >= targetTotal
            },
            capacity: {
                survivalRunsSupported: Math.floor(totalQuestions / survivalRunQuestions),
                daysOfUniqueContent: daysSupported,
                concurrentDailyPlayers: playersSupported,
                questionsNeeded: Math.max(0, targetTotal - totalQuestions)
            },
            categories: stats,
            recommendations: []
        };

        // Add recommendations
        if (totalQuestions < 1000) {
            poolStatus.recommendations.push('CRITICAL: Question pool too small. Run bulk generation immediately.');
        } else if (totalQuestions < 5000) {
            poolStatus.recommendations.push('WARNING: Question pool is low. Schedule frequent cron runs.');
        } else if (totalQuestions < targetTotal) {
            poolStatus.recommendations.push('INFO: Pool growing. Continue scheduled cron runs.');
        } else {
            poolStatus.recommendations.push('SUCCESS: Question pool is complete!');
        }

        // Check for imbalanced categories
        const lowCategories = Object.values(stats || {}).filter(s => s.total < TARGET_PER_CATEGORY / 3);
        if (lowCategories.length > 0) {
            poolStatus.recommendations.push(
                `PRIORITY: Focus on ${lowCategories.map(c => c.name).join(', ')}`
            );
        }

        // POST manual-trigger removed 2026-04-27 (Phase 2B.3 Option B).
        // Generation now runs daily at 04:30 UTC via Open Claw on Hetzner —
        // the workers VM at 10.0.0.3:8081 fires /cron/generate-trivia-questions
        // (see scripts/openclaw-cron-dispatcher.py WORKERS_PREFERRED).
        // The monolith handler that this admin route used to call no longer
        // exists; calling it would hit a public 404. Read-only stats below
        // continue to work normally.
        if (req.method === 'POST') {
            return res.status(410).json({
                ...poolStatus,
                bulkGeneration: {
                    triggered: false,
                    error: 'Manual bulk-generation removed. Generation now runs daily at 04:30 UTC via Open Claw to workers VM. Stats endpoint (GET) still works.',
                    nextScheduledRun: 'Daily 04:30 UTC',
                }
            });
        }

        return res.status(200).json(poolStatus);

    } catch (error) {
        try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Trivia Pool Status] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
