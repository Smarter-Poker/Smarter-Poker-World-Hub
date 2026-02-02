/**
 * TRIVIA QUESTION POOL STATUS & BULK GENERATOR
 * Admin endpoint to check pool status and trigger bulk generation
 * 
 * Usage:
 * GET /api/admin/trivia-pool-status - Get current pool stats
 * POST /api/admin/trivia-pool-status - Trigger bulk generation (pass batches in body)
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CATEGORIES = [
    { id: 'poker_history', name: 'Poker History' },
    { id: 'famous_hands', name: 'Famous Hands' },
    { id: 'player_profiles', name: 'Player Profiles' },
    { id: 'tournament_facts', name: 'Tournament Facts' },
    { id: 'rule_knowledge', name: 'Rules & Etiquette' },
    { id: 'gto_theory', name: 'GTO Theory' }
];

const TARGET_PER_CATEGORY = 3000;

export default async function handler(req, res) {
    try {
        // Get comprehensive pool statistics
        const stats = {};
        let totalQuestions = 0;

        for (const cat of CATEGORIES) {
            const { count: total } = await supabase
                .from('trivia_questions')
                .select('*', { count: 'exact', head: true })
                .eq('category', cat.id);

            const { count: easy } = await supabase
                .from('trivia_questions')
                .select('*', { count: 'exact', head: true })
                .eq('category', cat.id)
                .eq('difficulty', 'easy');

            const { count: medium } = await supabase
                .from('trivia_questions')
                .select('*', { count: 'exact', head: true })
                .eq('category', cat.id)
                .eq('difficulty', 'medium');

            const { count: hard } = await supabase
                .from('trivia_questions')
                .select('*', { count: 'exact', head: true })
                .eq('category', cat.id)
                .eq('difficulty', 'hard');

            // Check how many are available (not used in last 60 days)
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            const { count: available } = await supabase
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
        const lowCategories = Object.values(stats).filter(s => s.total < TARGET_PER_CATEGORY / 3);
        if (lowCategories.length > 0) {
            poolStatus.recommendations.push(
                `🎯 PRIORITY: Focus on ${lowCategories.map(c => c.name).join(', ')}`
            );
        }

        // If POST request, trigger bulk generation
        if (req.method === 'POST') {
            const { batches = 5 } = req.body || {};

            // Call the generation endpoint
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/cron/generate-trivia-questions`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${process.env.CRON_SECRET}`
                    }
                }
            );

            const genResult = await response.json();

            return res.status(200).json({
                ...poolStatus,
                bulkGeneration: {
                    triggered: true,
                    result: genResult
                }
            });
        }

        return res.status(200).json(poolStatus);

    } catch (error) {
        console.error('[Trivia Pool Status] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
