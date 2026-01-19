/**
 * 🧾 useTrainingAccountant — Engine 4: The Accountant
 * ═══════════════════════════════════════════════════════════════════════════
 * Handles all Supabase persistence for the training system:
 * - XP logging for correct answers
 * - Leak detection for mistakes
 * - Streak multiplier calculation
 * - User progress tracking
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLaw, LEAK_TO_LAW_MAP } from '../data/POKER_LAWS';

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
    metadata?: Record<string, unknown>;
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

            const { data, error: insertError } = await supabase
                .from('xp_logs')
                .insert(entry)
                .select()
                .single();

            if (insertError) {
                console.error('[ACCOUNTANT] XP log error:', insertError);
                setError(insertError.message);
                return null;
            }

            console.log(`[ACCOUNTANT] ✅ Logged ${xpAwarded} XP (streak: ${streakData.count}x)`);
            return { xpAwarded, streakCount: streakData.count };

        } catch (err) {
            console.error('[ACCOUNTANT] Error logging correct answer:', err);
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
                console.error('[ACCOUNTANT] Error fetching existing leak:', fetchError);
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
                    console.error('[ACCOUNTANT] Leak update error:', updateError);
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
                    .single();

                if (insertError) {
                    console.error('[ACCOUNTANT] Leak insert error:', insertError);
                    setError(insertError.message);
                    return null;
                }

                console.log(`[ACCOUNTANT] 🚨 NEW LEAK DETECTED: ${leakName}`);
                return {
                    leakId: data.id,
                    isNew: true,
                    confidence: 0.25,
                    mistakeCount: 1
                };
            }

            // Also log as incorrect XP entry (0 XP)
            await supabase.from('xp_logs').insert({
                user_id: userId,
                game_id: gameId,
                session_type: 'clinic',
                xp_awarded: 0,
                base_xp: 0,
                streak_multiplier: 1.0,
                speed_multiplier: 1.0,
                remediation_multiplier: 1.0,
                streak_count: 0,
                is_correct: false,
                question_number: questionNumber,
                metadata: { source: 'UniversalTrainingTable', lawId }
            });

        } catch (err) {
            console.error('[ACCOUNTANT] Error logging mistake:', err);
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
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: recentLogs } = await supabase
                .from('xp_logs')
                .select('created_at')
                .eq('user_id', uid)
                .gte('created_at', sevenDaysAgo.toISOString())
                .order('created_at', { ascending: false });

            if (!recentLogs || recentLogs.length === 0) {
                return { count: 1, multiplier: 1.0 };
            }

            // Count unique days
            const uniqueDays = new Set(
                recentLogs.map(log =>
                    new Date(log.created_at).toISOString().split('T')[0]
                )
            );

            const streakCount = Math.min(uniqueDays.size, 7);

            // Multiplier: 1.0 base + 0.1 per day (max 1.7x at 7 days)
            const multiplier = 1.0 + (streakCount - 1) * 0.1;

            return { count: streakCount, multiplier: Math.round(multiplier * 100) / 100 };

        } catch (err) {
            console.warn('[ACCOUNTANT] Streak calculation failed:', err);
            return { count: 1, multiplier: 1.0 };
        }
    };

    /**
     * Get user's total XP from database
     */
    const getUserTotalXP = useCallback(async (): Promise<number> => {
        if (!userId) return 0;

        try {
            const { data, error } = await supabase
                .rpc('get_user_total_xp', { p_user_id: userId });

            if (error) {
                console.error('[ACCOUNTANT] Error getting total XP:', error);
                return 0;
            }

            return data || 0;
        } catch (err) {
            console.error('[ACCOUNTANT] Error getting total XP:', err);
            return 0;
        }
    }, [userId, supabase]);

    /**
     * Get user's active leaks
     */
    const getActiveLeaks = useCallback(async () => {
        if (!userId) return [];

        try {
            const { data, error } = await supabase
                .rpc('get_active_leaks', { p_user_id: userId });

            if (error) {
                console.error('[ACCOUNTANT] Error getting leaks:', error);
                return [];
            }

            return data || [];
        } catch (err) {
            console.error('[ACCOUNTANT] Error getting leaks:', err);
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
        getUserTotalXP,
        getActiveLeaks,
        storeLeakForIntercept,
        isLogging,
        error
    };
}
