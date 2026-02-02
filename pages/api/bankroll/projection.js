/**
 * 📈 BANKROLL PROJECTION API
 * ═══════════════════════════════════════════════════════════════════════════
 * Monte Carlo simulation for bankroll growth projections (on-demand only)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SIMULATION_COUNT = 1000;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
        userId,
        currentBankroll = 0,
        sessionsPerWeek = 3,
        projectionDays = 90
    } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    try {
        // Fetch historical data for variance calculation
        const { data: entries, error } = await supabase
            .from('ledger_entries')
            .select('gross_in, gross_out, entry_date')
            .eq('user_id', userId)
            .order('entry_date', { ascending: false })
            .limit(100);

        if (error) {
            console.error('[Projection] Error:', error);
            return res.status(500).json({ error: error.message });
        }

        if (!entries || entries.length < 5) {
            return res.status(200).json({
                success: false,
                message: 'Need at least 5 sessions for projection analysis',
                minRequired: 5,
                currentCount: entries?.length || 0
            });
        }

        // Calculate session statistics
        const sessionResults = entries.map(e => (e.gross_out || 0) - (e.gross_in || 0));
        const avgResult = sessionResults.reduce((a, b) => a + b, 0) / sessionResults.length;

        // Calculate standard deviation
        const squaredDiffs = sessionResults.map(r => Math.pow(r - avgResult, 2));
        const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / sessionResults.length);

        // Run Monte Carlo simulations
        const projectionWeeks = Math.ceil(projectionDays / 7);
        const totalSessions = projectionWeeks * sessionsPerWeek;

        const simulations = [];
        for (let sim = 0; sim < SIMULATION_COUNT; sim++) {
            let bankroll = currentBankroll;
            const path = [bankroll];

            for (let session = 0; session < totalSessions; session++) {
                // Use normal distribution for session result
                const result = gaussianRandom(avgResult, stdDev);
                bankroll += result;

                // Track weekly snapshots
                if ((session + 1) % sessionsPerWeek === 0) {
                    path.push(bankroll);
                }
            }

            simulations.push({
                finalBankroll: bankroll,
                peak: Math.max(...path),
                trough: Math.min(...path),
                path
            });
        }

        // Calculate percentiles
        const finalBankrolls = simulations.map(s => s.finalBankroll).sort((a, b) => a - b);
        const p5 = finalBankrolls[Math.floor(SIMULATION_COUNT * 0.05)];
        const p25 = finalBankrolls[Math.floor(SIMULATION_COUNT * 0.25)];
        const p50 = finalBankrolls[Math.floor(SIMULATION_COUNT * 0.50)];
        const p75 = finalBankrolls[Math.floor(SIMULATION_COUNT * 0.75)];
        const p95 = finalBankrolls[Math.floor(SIMULATION_COUNT * 0.95)];

        // Calculate win probability
        const profitableRuns = finalBankrolls.filter(b => b > currentBankroll).length;
        const winProbability = Math.round((profitableRuns / SIMULATION_COUNT) * 100);

        // Calculate ruin probability (bankroll goes to 0)
        const ruinRuns = simulations.filter(s => s.trough <= 0).length;
        const ruinProbability = Math.round((ruinRuns / SIMULATION_COUNT) * 100);

        // Average max drawdown
        const maxDrawdowns = simulations.map(s => currentBankroll - s.trough);
        const avgMaxDrawdown = Math.round(maxDrawdowns.reduce((a, b) => a + b, 0) / SIMULATION_COUNT);

        return res.status(200).json({
            success: true,
            projection: {
                timeframe: `${projectionDays} days`,
                sessionsSimulated: totalSessions,
                simulationRuns: SIMULATION_COUNT,

                // Percentile outcomes
                pessimistic: Math.round(p5),      // 5th percentile
                conservative: Math.round(p25),    // 25th percentile  
                expected: Math.round(p50),        // Median
                optimistic: Math.round(p75),      // 75th percentile
                bestCase: Math.round(p95),        // 95th percentile

                // Probabilities
                winProbability,
                ruinProbability,

                // Risk metrics
                avgMaxDrawdown,
                expectedGain: Math.round(p50 - currentBankroll),
                expectedGainPercent: Math.round(((p50 - currentBankroll) / currentBankroll) * 100),
            },
            inputs: {
                currentBankroll,
                sessionsPerWeek,
                projectionDays,
                avgSessionResult: Math.round(avgResult),
                sessionStdDev: Math.round(stdDev),
                historicalSessions: entries.length
            }
        });

    } catch (error) {
        console.error('[Projection] Server error:', error);
        return res.status(500).json({ error: 'Projection failed' });
    }
}

/**
 * Generate normally distributed random number using Box-Muller transform
 */
function gaussianRandom(mean = 0, stdev = 1) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
}
