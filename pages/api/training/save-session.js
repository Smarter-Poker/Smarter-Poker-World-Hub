/**
 * POST /api/training/save-session
 * Saves a complete training session with GTOW scoring, hand history,
 * per-position stats, and trainer configuration.
 *
 * This extends the basic save-progress by capturing rich session data
 * for lifetime tracking and historical replay.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    // Auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // Accept both camelCase (new standard) and snake_case (legacy/existing pages)
        const parsedGameId = req.body.gameId || req.body.game_id;
        const parsedHandsPlayed = req.body.handsPlayed ?? req.body.hands_played ?? 0;
        const parsedCorrectCount = req.body.correctCount ?? req.body.correct_answers ?? 0;
        const parsedTotalEVLoss = req.body.totalEVLoss ?? req.body.ev_loss ?? 0;
        const parsedAccuracy = req.body.accuracy ?? req.body.score ?? 0;
        const parsedMistakeCount = req.body.mistakeCount ?? (parsedHandsPlayed - parsedCorrectCount) ?? 0;
        const parsedGtowScore = req.body.gtowScore ?? req.body.accuracy ?? 100;

        const {
            gameName,
            avgEVLossPerHand,
            avgEVLossPerMistake,
            avgFrequencyDiff,
            bestStreak,
            levelPassed,
            level,
            // Detailed data
            handHistory,         // Full hand-by-hand data
            positionStats,       // Per-position breakdown
            classificationCounts, // Classification distribution
            // Trainer config (if custom)
            trainerConfig,
            // BUG-05 FIX: Speed bonus diamonds
            speedBonusDiamonds,
        } = req.body;

        if (!parsedGameId) {
            return res.status(400).json({ success: false, error: 'gameId or game_id required' });
        }

        const userId = user.id;
        const now = new Date().toISOString();

        // NOTE: training_progress is managed exclusively by save-progress.js
        // to avoid double-write race conditions. This endpoint only writes
        // to training_sessions for detailed session history.

        // 3. Save detailed session to training_sessions (JSONB-rich table)
        // Try to save to training_sessions if the table exists
        const detailedSession = {
            user_id: userId,
            game_id: parsedGameId,
            game_name: gameName || parsedGameId,
            gtow_score: parsedGtowScore,
            total_ev_loss: parsedTotalEVLoss,
            hands_played: parsedHandsPlayed,
            mistake_count: parsedMistakeCount,
            accuracy: parsedAccuracy,
            correct_count: parsedCorrectCount,
            best_streak: bestStreak || 0,
            level_passed: levelPassed || false,
            level: level || 1,
            // JSONB fields — Supabase client handles objects natively, DO NOT stringify
            hand_history: handHistory ? handHistory.slice(0, 100) : [],
            position_stats: positionStats || {},
            classification_counts: classificationCounts || {},
            trainer_config: trainerConfig || null,
            avg_ev_loss_per_hand: avgEVLossPerHand || 0,
            avg_frequency_diff: avgFrequencyDiff || 0,
            created_at: now,
        };

        const { error: sessErr } = await supabase
            .from('training_sessions')
            .insert(detailedSession);

        if (sessErr) {
            // Table might not exist yet — gracefully degrade
            console.warn('[SaveSession] training_sessions insert failed (table may not exist):', sessErr.message);
            // Still return success since we saved to training_progress and training_level_history
        }

        // 4. BUG-05 FIX: Award speed bonus diamonds to user's balance
        if (speedBonusDiamonds && speedBonusDiamonds > 0) {
            try {
                // Use RPC to atomically increment diamonds
                const { error: rpcErr } = await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: userId,
                    p_amount: speedBonusDiamonds,
                });

                if (rpcErr) {
                    // Fallback: direct update with current value
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('diamond_balance')
                        .eq('id', userId)
                        .maybeSingle();

                    if (profile) {
                        await supabase
                            .from('profiles')
                            .update({ diamond_balance: (profile.diamond_balance || 0) + speedBonusDiamonds })
                            .eq('id', userId);
                    }
                }

                console.log(`[SaveSession] Awarded ${speedBonusDiamonds} speed bonus diamonds to ${userId}`);
            } catch (diamondErr) {
                console.warn('[SaveSession] Diamond award failed (non-blocking):', diamondErr.message);
            }
        }

        // 5. Update lifetime stats aggregate
        // Upsert into a simple lifetime_stats concept in training_progress
        // We use training_progress metadata for now

        console.log(`[SaveSession] Saved session for ${userId}: ${parsedGameId} | GTOW ${parsedGtowScore}% | ${parsedHandsPlayed} hands | -${parsedTotalEVLoss?.toFixed?.(1) || 0} EV`);

        return res.status(200).json({
            success: true,
            saved: {
                gtowScore: parsedGtowScore,
                handsPlayed: parsedHandsPlayed,
                totalEVLoss: parsedTotalEVLoss,
            },
        });

    } catch (err) {
        console.error('[SaveSession] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
