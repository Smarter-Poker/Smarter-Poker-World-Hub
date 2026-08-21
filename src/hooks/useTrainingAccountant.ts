/**
 * 🧾 useTrainingAccountant — Engine 4: The Accountant
 * ═══════════════════════════════════════════════════════════════════════════
 * Handles Supabase persistence for the training system:
 * - Leak detection for mistakes  (user_leaks — live)
 * - User progress tracking
 *
 * NOT persisted: XP and daily streaks. Both used to write/read `xp_logs`,
 * which does not exist and is forbidden by the `xp_ban_guard` event trigger
 * (zero-XP policy), so those calls failed on every correct answer. XP is
 * still COMPUTED and returned for in-session display; it is simply never
 * stored, and the streak multiplier is a documented constant 1.0x rather
 * than a lookup that always fails. See the notes at each call site.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLaw } from '../data/POKER_LAWS';

interface XPLogEntry {
    user_id: string;
    game_id: string;
    session_type: 'game' | 'clinic' | 'remediation';
    xp_awarded: number;
    base_xp: number;
    streak_multiplier: number;
    speed_multiplier: number;
    remediation_multiplier: number;
    streak_count: number;
    is_correct: boolean;
    question_number: number;
    time_taken_ms?: number;
    metadata?: { [key: string]: string | number | boolean | null } | null;
}

interface LeakEntry {
    user_id: string;
    leak_category: string;
    leak_name: string;
    error_rate: number;
    confidence: number;
    total_samples: number;
    mistake_count: number;
    clinic_id?: string;
}

export function useTrainingAccountant(userId: string | null) {
    const [isLogging, setIsLogging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Log a correct answer and award XP
     */
    const logCorrectAnswer = useCallback(async (
        gameId: string,
        questionNumber: number,
        baseXP: number = 100,
        timeTakenMs?: number
    ) => {
        if (!userId) {
            console.warn('[ACCOUNTANT] No userId, skipping XP log');
            return null;
        }

        setIsLogging(true);
        setError(null);

        try {
            // Calculate streak multiplier
            const streakData = await calculateStreakMultiplier(userId);

            // Calculate speed bonus (faster = more XP)
            const speedMultiplier = timeTakenMs && timeTakenMs < 3000 ? 1.2 : 1.0;

            const xpAwarded = Math.round(
                baseXP *
                streakData.multiplier *
                speedMultiplier
            );

            const entry: XPLogEntry = {
                user_id: userId,
                game_id: gameId,
                session_type: 'clinic',
                xp_awarded: xpAwarded,
                base_xp: baseXP,
                streak_multiplier: streakData.multiplier,
                speed_multiplier: speedMultiplier,
                remediation_multiplier: 1.0,
                streak_count: streakData.count,
                is_correct: true,
                question_number: questionNumber,
                time_taken_ms: timeTakenMs,
                metadata: { source: 'UniversalTrainingTable' }
            };

            // ── ZERO-XP POLICY (audit 2026-08-12) ────────────────────────
            // This used to INSERT `entry` into `xp_logs`. That table does not
            // exist and MUST NOT: the database carries an event trigger,
            // `xp_ban_guard`, which rejects any XP-shaped table, column or
            // function name — an attempt to create xp_logs raises
            // 'XP_BAN: table "public.xp_logs" violates zero-XP policy'.
            //
            // So every correct answer was firing a write that failed 42P01 and
            // then calling setError(...) on this hook. It was not merely dead;
            // it was parking an error on a hook the training table renders
            // from, on the app's hottest interaction path.
            //
            // The XP value is still computed and returned so the caller's
            // contract is unchanged and any in-session display keeps working.
            // It is simply not persisted, because the platform has decided XP
            // is not a thing. If XP is ever reinstated, remove xp_ban_guard
            // deliberately and restore a write here — do not reintroduce one
            // while the guard stands.
            void entry;
            return { xpAwarded, streakCount: streakData.count };

        } catch (err) {
            console.warn('[ACCOUNTANT] Error logging correct answer:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
            return null;
        } finally {
            setIsLogging(false);
        }
    }, [userId, supabase]);

    /**
     * Log a mistake and track the leak
     */
    const logMistake = useCallback(async (
        gameId: string,
        questionNumber: number,
        lawId: string,
        clinicId?: string
    ) => {
        if (!userId) {
            console.warn('[ACCOUNTANT] No userId, skipping leak log');
            return null;
        }

        setIsLogging(true);
        setError(null);

        try {
            const law = getLaw(lawId);
            const leakCategory = lawId; // Use lawId as category
            const leakName = law?.name || lawId;

            // Check if this leak already exists for this user
            const { data: existingLeak, error: fetchError } = await supabase
                .from('user_leaks')
                .select('*')
                .eq('user_id', userId)
                .eq('leak_category', leakCategory)
                .eq('is_active', true)
                .maybeSingle();

            if (fetchError && fetchError.code !== 'PGRST116') {
                console.warn('[ACCOUNTANT] Error fetching existing leak:', fetchError);
                setError(fetchError.message);
                return null;
            }

            if (existingLeak) {
                // Update existing leak
                const newMistakeCount = existingLeak.mistake_count + 1;
                const newTotalSamples = existingLeak.total_samples + 1;
                const newErrorRate = newMistakeCount / newTotalSamples;
                const newConfidence = Math.min(0.99, existingLeak.confidence + 0.05);

                const { error: updateError } = await supabase
                    .from('user_leaks')
                    .update({
                        mistake_count: newMistakeCount,
                        total_samples: newTotalSamples,
                        error_rate: newErrorRate,
                        confidence: newConfidence,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingLeak.id);

                if (updateError) {
                    console.warn('[ACCOUNTANT] Leak update error:', updateError);
                    setError(updateError.message);
                    return null;
                }

                console.log(`[ACCOUNTANT] ⚠️ Updated leak: ${leakName} (${newMistakeCount} mistakes, ${Math.round(newConfidence * 100)}% confidence)`);
                return {
                    leakId: existingLeak.id,
                    isNew: false,
                    confidence: newConfidence,
                    mistakeCount: newMistakeCount
                };

            } else {
                // Insert new leak
                const entry: LeakEntry = {
                    user_id: userId,
                    leak_category: leakCategory,
                    leak_name: leakName,
                    error_rate: 1.0,
                    confidence: 0.25, // Start with low confidence
                    total_samples: 1,
                    mistake_count: 1,
                    clinic_id: clinicId
                };

                const { data, error: insertError } = await supabase
                    .from('user_leaks')
                    .insert(entry)
                    .select()
                    .maybeSingle();

                if (insertError) {
                    console.warn('[ACCOUNTANT] Leak insert error:', insertError);
                    setError(insertError.message);
                    return null;
                }

                console.log(`[ACCOUNTANT] 🚨 NEW LEAK DETECTED: ${leakName}`);
                return {
                    leakId: data?.id,
                    isNew: true,
                    confidence: 0.25,
                    mistakeCount: 1
                };
            }


        } catch (err) {
            console.warn('[ACCOUNTANT] Error logging mistake:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
            return null;
        } finally {
            setIsLogging(false);
        }
    }, [userId, supabase]);

    /**
     * Calculate streak multiplier based on consecutive days played
     */
    const calculateStreakMultiplier = async (uid: string): Promise<{ count: number; multiplier: number }> => {
        // ── ZERO-XP POLICY (audit 2026-08-12) ────────────────────────────
        // This used to read `xp_logs` to count unique active days in the last
        // week and scale a multiplier from 1.0x to 1.7x. `xp_logs` does not
        // exist and is forbidden by the `xp_ban_guard` event trigger, so the
        // query always errored and the catch always returned the neutral
        // default — meaning the multiplier has been a hard-coded 1.0x for
        // every user since this shipped. Nobody has ever received a streak
        // bonus.
        //
        // Returning the default directly states the real behaviour instead of
        // dressing it up as a lookup that fails. The day-counting arithmetic
        // was removed rather than left unreachable behind an empty array.
        //
        // If daily streaks are wanted, derive them from
        // `training_sessions.created_at` — a table that exists and is
        // written — not from an XP ledger the platform has banned.
        void uid;
        return { count: 1, multiplier: 1.0 };
    };

    // getUserTotalXP was removed on 2026-08-21. XP was dropped as a product
    // decision months ago; the RPC it called had already been gutted to
    // `BEGIN RETURN 0; END` and has now been dropped outright, so the call
    // would error rather than return the zero it always returned. Nothing
    // outside this hook ever called it.

    /**
     * Get user's active leaks
     */
    const getActiveLeaks = useCallback(async () => {
        if (!userId) return [];

        try {
            const { data, error } = await supabase
                .rpc('get_active_leaks', { p_user_id: userId });

            if (error) {
                console.warn('[ACCOUNTANT] Error getting leaks:', error);
                return [];
            }

            return data || [];
        } catch (err) {
            console.warn('[ACCOUNTANT] Error getting leaks:', err);
            return [];
        }
    }, [userId, supabase]);

    /**
     * Store detected leaks in localStorage for LeakFixerIntercept
     */
    const storeLeakForIntercept = useCallback((
        lawId: string,
        confidence: number,
        mistakeCount: number
    ) => {
        const law = getLaw(lawId);
        if (!law) return;

        try {
            const stored = localStorage.getItem('pokeriq_detected_leaks');
            const leaks = stored ? JSON.parse(stored) : [];

            // Check if this leak already exists
            const existingIndex = leaks.findIndex((l: any) => l.category === lawId);

            if (existingIndex >= 0) {
                // Update existing
                leaks[existingIndex].confidence = confidence;
                leaks[existingIndex].mistakeCount = mistakeCount;
            } else {
                // Add new
                leaks.push({
                    category: lawId,
                    name: law.name,
                    confidence: confidence,
                    mistakeCount: mistakeCount,
                    detected_at: new Date().toISOString()
                });
            }

            localStorage.setItem('pokeriq_detected_leaks', JSON.stringify(leaks));
            console.log(`[ACCOUNTANT] Stored leak for intercept: ${law.name}`);

        } catch (err) {
            console.warn('[ACCOUNTANT] Failed to store leak for intercept:', err);
        }
    }, []);

    return {
        logCorrectAnswer,
        logMistake,
        getActiveLeaks,
        storeLeakForIntercept,
        isLogging,
        error
    };
}
