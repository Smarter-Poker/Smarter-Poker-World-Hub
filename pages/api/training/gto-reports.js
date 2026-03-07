/**
 * API: GTO Reports — Aggregate user training stats vs GTO baselines
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/training/gto-reports
 * 
 * Query params:
 *   userId: string (required)
 *   period: 'week' | 'month' | 'all' (default: 'all')
 * 
 * Returns aggregate position stats, accuracy metrics, and GTO comparison data
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// GTO baseline frequencies (from PIO solver analysis of 6-max cash games at 100BB)
const GTO_BASELINES = {
    preflop: {
        UTG: { openRate: 15, foldRate: 85, threebet: 0, call: 0 },
        MP: { openRate: 19, foldRate: 81, threebet: 0, call: 0 },
        CO: { openRate: 27, foldRate: 73, threebet: 0, call: 0 },
        BTN: { openRate: 45, foldRate: 55, threebet: 0, call: 0 },
        SB: { openRate: 40, foldRate: 50, threebet: 5, call: 5 },
        BB: { openRate: 0, foldRate: 55, threebet: 12, call: 33 },
    },
    postflop: {
        cbetFlop: 55,    // Average C-bet frequency on flop
        cbetTurn: 45,    // Average barrel frequency on turn
        cbetRiver: 35,   // Average barrel frequency on river
        checkRaise: 8,   // Average check-raise frequency
        foldToCSbet: 40, // Average fold to C-bet
    },
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // BUG FIX: No auth — anyone could read any user's GTO training report by supplying a userId
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    try {
        const { period = 'all' } = req.query;
        // BUG FIX: was reading userId from query — IDOR; use JWT identity
        const userId = user.id;

        // Build date filter
        let dateFilter = null;
        const now = new Date();
        if (period === 'week') {
            dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (period === 'month') {
            dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        // Fetch training sessions
        let query = supabase
            .from('training_sessions')
            .select('id, game_id, accuracy, total_questions, correct_answers, best_answers, position_stats, classification_breakdown, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (dateFilter) {
            query = query.gte('created_at', dateFilter);
        }

        const { data: sessions, error } = await query.limit(500);

        if (error) {
            console.error('[GTOReports] Query error:', error);
            return res.status(500).json({ success: false, error: 'Database query failed' });
        }

        // Aggregate position stats
        const positionAgg = {};
        let totalQuestions = 0;
        let totalCorrect = 0;
        let totalBest = 0;
        let totalSessions = sessions?.length || 0;

        // Classification aggregation
        const classAgg = { best: 0, correct: 0, inaccuracy: 0, wrong: 0, blunder: 0 };

        (sessions || []).forEach(session => {
            totalQuestions += session.total_questions || 0;
            totalCorrect += session.correct_answers || 0;
            totalBest += session.best_answers || 0;

            // Per-position aggregation
            const posStats = session.position_stats;
            if (posStats && typeof posStats === 'object') {
                Object.entries(posStats).forEach(([pos, stats]) => {
                    if (!positionAgg[pos]) {
                        positionAgg[pos] = { total: 0, correct: 0, evLoss: 0 };
                    }
                    positionAgg[pos].total += stats.total || 0;
                    positionAgg[pos].correct += stats.correct || 0;
                    positionAgg[pos].evLoss += stats.evLoss || 0;
                });
            }

            // Classification aggregation
            const classBreakdown = session.classification_breakdown;
            if (classBreakdown && typeof classBreakdown === 'object') {
                Object.entries(classBreakdown).forEach(([cls, count]) => {
                    if (classAgg[cls] !== undefined) {
                        classAgg[cls] += count;
                    }
                });
            }
        });

        // Calculate per-position accuracy and deviation from GTO
        const positionReport = {};
        Object.entries(positionAgg).forEach(([pos, data]) => {
            const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
            const gtoBaseline = GTO_BASELINES.preflop[pos];
            positionReport[pos] = {
                total: data.total,
                correct: data.correct,
                accuracy,
                avgEvLoss: data.total > 0 ? (data.evLoss / data.total).toFixed(2) : '0.00',
                gtoOpenRate: gtoBaseline?.openRate || null,
                deviation: gtoBaseline ? Math.abs(accuracy - (100 - gtoBaseline.foldRate)) : null,
            };
        });

        // Compute overall GTOW-like score
        const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
        const bestRate = totalQuestions > 0 ? Math.round((totalBest / totalQuestions) * 100) : 0;

        return res.status(200).json({
            success: true,
            report: {
                period,
                totalSessions,
                totalQuestions,
                totalCorrect,
                totalBest,
                overallAccuracy,
                bestRate,
                positionReport,
                classifications: classAgg,
                gtoBaselines: GTO_BASELINES,
            },
        });

    } catch (err) {
        console.error('[GTOReports] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
