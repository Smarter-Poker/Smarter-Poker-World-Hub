/**
 * useTrainingRealtime Hook — Polling-based replacement
 * ═══════════════════════════════════════════════════════════════════════════
 * Previously opened 3 postgres_changes channels per user on training pages:
 *   training-achievements-{userId}  on training_user_achievements
 *   training-challenges-{userId}    on training_user_challenges
 *
 * Replacement: setInterval polling against Supabase directly, with
 * timestamp-based diffing so we only fire callbacks for genuinely new rows.
 *
 * Poll intervals:
 *   achievements: 30 seconds (INSERT-only, user wants prompt feedback)
 *   challenges:   15 seconds (active users want near-real-time challenge ticks)
 *
 * Interface is identical to the original — callers need no changes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const ACHIEVEMENT_POLL_MS  = 30 * 1000;
const CHALLENGE_POLL_MS    = 15 * 1000;
const POLL_TIMEOUT_MS      = 10 * 1000;

export function useTrainingRealtime(userId) {
    const [newAchievement, setNewAchievement] = useState(null);
    const [leaderboardChange, setLeaderboardChange] = useState(null);
    const [challengeComplete, setChallengeComplete] = useState(null);
    const [error, setError] = useState(null);
    // isConnected is kept for interface compatibility — polling is always "connected"
    const [isConnected, setIsConnected] = useState(false);

    const clearAchievement      = useCallback(() => setNewAchievement(null), []);
    const clearLeaderboardChange = useCallback(() => setLeaderboardChange(null), []);
    const clearChallengeComplete = useCallback(() => setChallengeComplete(null), []);

    const mountedRef = useRef(true);
    const pollErrorsRef = useRef({ achievements: null, challenges: null });
    const achievementPollInFlightRef = useRef(false);
    const challengePollInFlightRef = useRef(false);
    // Timestamps: track last poll boundary so we only notify about genuinely new rows
    const lastAchievementCheckRef = useRef(new Date().toISOString());
    const lastChallengeCheckRef   = useRef(new Date().toISOString());

    useEffect(() => {
        mountedRef.current = true;
        if (!userId || typeof window === 'undefined') return;

        const client = supabase;
        if (!client) {
            console.warn('[TrainingRealtime] Supabase client not available');
            setError('Training updates are temporarily unavailable.');
            setIsConnected(false);
            return;
        }

        setError(null);
        setIsConnected(true);
        pollErrorsRef.current = { achievements: null, challenges: null };
        const updatePollError = (scope, message) => {
            pollErrorsRef.current = { ...pollErrorsRef.current, [scope]: message || null };
            if (mountedRef.current) {
                setError(pollErrorsRef.current.achievements || pollErrorsRef.current.challenges || null);
            }
        };

        // ── Achievement polling ─────────────────────────────────────────
        const pollAchievements = async () => {
            if (typeof document !== 'undefined' && document.hidden) return; // skip while hidden
            if (achievementPollInFlightRef.current) return;
            achievementPollInFlightRef.current = true;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
            try {
                const since = lastAchievementCheckRef.current;
                const through = new Date().toISOString();

                const { data: rows, error } = await client
                    .from('training_user_achievements')
                    .select('*, achievement_id')
                    .eq('user_id', userId)
                    .gt('created_at', since)
                    .lte('created_at', through)
                    .order('created_at', { ascending: true })
                    .abortSignal(controller.signal);

                if (error) {
                    console.warn('[TrainingRealtime] Achievement poll error:', error);
                    updatePollError('achievements', 'Achievement updates are temporarily unavailable.');
                    return;
                }
                lastAchievementCheckRef.current = through;
                updatePollError('achievements', null);
                if (!rows?.length || !mountedRef.current) return;

                // Notify for the most-recently unlocked achievement
                const latest = rows[rows.length - 1];
                const { data: achievementDef, error: definitionError } = await client
                    .from('training_achievement_definitions')
                    .select('*')
                    .eq('id', latest.achievement_id)
                    .abortSignal(controller.signal)
                    .maybeSingle();

                if (definitionError) {
                    console.warn('[TrainingRealtime] Achievement definition poll error:', definitionError);
                    updatePollError('achievements', 'Achievement updates are temporarily unavailable.');
                    return;
                }

                if (achievementDef && mountedRef.current) {
                    console.debug('[TrainingRealtime] New achievement (poll):', latest.achievement_id);
                    setNewAchievement({
                        ...achievementDef,
                        unlockedAt: latest.created_at,
                    });
                }
            } catch (err) {
                console.warn('[TrainingRealtime] Achievement poll exception:', err);
                updatePollError('achievements', 'Achievement updates are temporarily unavailable.');
            } finally {
                clearTimeout(timeout);
                achievementPollInFlightRef.current = false;
            }
        };

        // Rank notifications are intentionally retired until the verified
        // leaderboard API exposes an authenticated `myRank` contract. Browser
        // reads cannot safely reconstruct a rank from protected projections.

        // ── Challenge polling ───────────────────────────────────────────
        const pollChallenges = async () => {
            if (typeof document !== 'undefined' && document.hidden) return;
            if (challengePollInFlightRef.current) return;
            challengePollInFlightRef.current = true;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
            try {
                const since = lastChallengeCheckRef.current;
                const through = new Date().toISOString();

                const { data: rows, error } = await client
                    .from('training_user_challenges')
                    .select('*, challenge_id, completed_at')
                    .eq('user_id', userId)
                    .eq('completed', true)
                    .gt('completed_at', since)
                    .lte('completed_at', through)
                    .order('completed_at', { ascending: true })
                    .abortSignal(controller.signal);

                if (error) {
                    console.warn('[TrainingRealtime] Challenge poll error:', error);
                    updatePollError('challenges', 'Challenge updates are temporarily unavailable.');
                    return;
                }
                lastChallengeCheckRef.current = through;
                updatePollError('challenges', null);
                if (!rows?.length || !mountedRef.current) return;

                // Notify for the most recently completed challenge
                const latest = rows[rows.length - 1];
                const { data: challengeDef, error: definitionError } = await client
                    .from('training_challenge_definitions')
                    .select('*')
                    .eq('id', latest.challenge_id)
                    .abortSignal(controller.signal)
                    .maybeSingle();

                if (definitionError) {
                    console.warn('[TrainingRealtime] Challenge definition poll error:', definitionError);
                    updatePollError('challenges', 'Challenge updates are temporarily unavailable.');
                    return;
                }

                if (challengeDef && mountedRef.current) {
                    console.debug('[TrainingRealtime] Challenge completed (poll):', latest.challenge_id);
                    setChallengeComplete({
                        ...challengeDef,
                        completedAt: latest.completed_at,
                    });
                }
            } catch (err) {
                console.warn('[TrainingRealtime] Challenge poll exception:', err);
                updatePollError('challenges', 'Challenge updates are temporarily unavailable.');
            } finally {
                clearTimeout(timeout);
                challengePollInFlightRef.current = false;
            }
        };

        // Run initial polls immediately
        pollAchievements();
        pollChallenges();

        const achievementInterval = setInterval(pollAchievements, ACHIEVEMENT_POLL_MS);
        const challengeInterval   = setInterval(pollChallenges,   CHALLENGE_POLL_MS);

        // Recover from background: run all polls immediately when tab re-focuses
        const handleVisibility = () => {
            if (!document.hidden) {
                pollAchievements();
                pollChallenges();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            mountedRef.current = false;
            clearInterval(achievementInterval);
            clearInterval(challengeInterval);
            document.removeEventListener('visibilitychange', handleVisibility);
            setIsConnected(false);
        };
    }, [userId]);

    return {
        newAchievement,
        leaderboardChange,
        challengeComplete,
        isConnected,
        error,
        clearAchievement,
        clearLeaderboardChange,
        clearChallengeComplete,
    };
}

export default useTrainingRealtime;
