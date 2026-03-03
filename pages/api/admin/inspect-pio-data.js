/**
 * Inspect PioSolver Data API
 * Shows what data is available from solved_spots_gold table
 * 
 * GET /api/admin/inspect-pio-data
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // BUG #167 FIX: Block in production
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. Get overview of available data
        const { data: overview, error: overviewError } = await supabase
            .from('solved_spots_gold')
            .select('game_type, street, stack_depth')
            .limit(1000);

        if (overviewError) {
            return res.status(500).json({
                error: 'Failed to query overview',
                details: overviewError.message
            });
        }

        // Count by category
        const byGameType = {};
        const byStreet = {};
        const byStackDepth = {};

        for (const row of (overview || [])) {
            byGameType[row.game_type] = (byGameType[row.game_type] || 0) + 1;
            byStreet[row.street] = (byStreet[row.street] || 0) + 1;
            byStackDepth[row.stack_depth] = (byStackDepth[row.stack_depth] || 0) + 1;
        }

        // 2. Get a sample scenario with full structure
        const { data: sample, error: sampleError } = await supabase
            .from('solved_spots_gold')
            .select('*')
            .limit(1)
            .single();

        // 3. Analyze strategy_matrix structure
        let strategyStructure = null;
        if (sample?.strategy_matrix) {
            const sm = sample.strategy_matrix;
            strategyStructure = {
                hasActions: !!sm.actions,
                actions: sm.actions || [],
                hasFrequencies: !!sm.frequencies,
                frequencySample: null,
                hasHandEvs: !!sm.hand_evs,
                handEvSample: null,
                totalHands: 0,
            };

            // Get sample frequencies
            if (sm.frequencies && sm.actions?.[0]) {
                const firstAction = sm.actions[0];
                const freqObj = sm.frequencies[firstAction];
                if (freqObj) {
                    const hands = Object.keys(freqObj);
                    strategyStructure.totalHands = hands.length;
                    strategyStructure.frequencySample = {};
                    hands.slice(0, 5).forEach(h => {
                        strategyStructure.frequencySample[h] = freqObj[h];
                    });
                }
            }

            // Get sample EVs
            if (sm.hand_evs) {
                const evHands = Object.keys(sm.hand_evs);
                strategyStructure.handEvSample = {};
                evHands.slice(0, 5).forEach(h => {
                    strategyStructure.handEvSample[h] = sm.hand_evs[h];
                });
            }
        }

        // What PioSolver provides vs what Grok adds
        const dataComparison = {
            fromPioSolver: [
                'Optimal action (from frequencies)',
                'Action frequency (e.g., RAISE 85%)',
                'EV per hand (hand_evs)',
                'Alternate lines with frequencies',
                'Board texture and position',
            ],
            fromGrokAI: [
                'Human-readable explanation text',
                'GTO approach description',
                'EV analysis in plain English',
                'Alternate line reasoning',
                'Complete analysis when PIO data missing',
            ],
        };

        return res.status(200).json({
            success: true,
            totalScenarios: overview?.length || 0,
            byGameType,
            byStreet,
            byStackDepth,
            sampleScenario: sample ? {
                id: sample.id,
                scenario_hash: sample.scenario_hash,
                game_type: sample.game_type,
                street: sample.street,
                stack_depth: sample.stack_depth,
            } : null,
            strategyMatrixStructure: strategyStructure,
            dataComparison,
        });

    } catch (error) {
        console.error('[Inspect PIO] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
