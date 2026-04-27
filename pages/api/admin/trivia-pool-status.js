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

const TARGET_PER_CATEGORY = 3000;

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
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

            stats[cat.id] = {
                name: cat.name,
                total: catTotal,
                easy: easy || 0,
                medium: medium || 0,
                hard: hard || 0,
                available: available || catTotal, // If tracking not set up, assume all available
                target: TARGET_PER_CATEGORY,
                progress: `${Math.round((catTotal / TARGET_PER_CATEGORY) * 100)}%`,
                needed: Math.max(0, TARGET_PER_CATEGORY - catTotal)
            };
        }

        const targetTotal = CATEGORIES.length * TARGET_PER_CATEGORY;
        const overallProgress = Math.round((totalQuestions / targetTotal) * 100);

        // Calculate estimated gameplay support
        const survivalRunQuestions = 200; // 10 levels × 20 questions
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
            poolStatus.recommendations.push('⚠️ CRITICAL: Question pool too small. Run bulk generation immediately.');
        } else if (totalQuestions < 5000) {
            poolStatus.recommendations.push('🔶 WARNING: Question pool is low. Schedule frequent cron runs.');
        } else if (totalQuestions < targetTotal) {
            poolStatus.recommendations.push('📈 INFO: Pool growing. Continue scheduled cron runs.');
        } else {
            poolStatus.recommendations.push('✅ SUCCESS: Question pool is complete!');
        }

        // Check for imbalanced categories
        const lowCategories = Object.values(stats || {}).filter(s => s.total < TARGET_PER_CATEGORY / 3);
        if (lowCategories.length > 0) {
            poolStatus.recommendations.push(
                `🎯 PRIORITY: Focus on ${lowCategories.map(c => c.name).join(', ')}`
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
                    error: 'Manual bulk-generation removed. Generation now runs daily at 04:30 UTC via Open Claw → workers VM. Stats endpoint (GET) still works.',
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
