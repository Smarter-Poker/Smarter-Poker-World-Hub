/**
 * useTrainingRealtime Hook — Polling-based replacement
 * ═══════════════════════════════════════════════════════════════════════════
 * Previously opened 3 postgres_changes channels per user on training pages:
 *   training-achievements-{userId}  on training_user_achievements
 *   training-leaderboard-{userId}   on training_leaderboard
 *   training-challenges-{userId}    on training_user_challenges
 *
 * Replacement: setInterval polling against Supabase directly, with
 * timestamp-based diffing so we only fire callbacks for genuinely new rows.
 *
 * Poll intervals:
 *   achievements: 30 seconds (INSERT-only, user wants prompt feedback)
 *   leaderboard:  60 seconds (rank changes are slow-moving)
 *   challenges:   15 seconds (active users want near-real-time challenge ticks)
 *
 * Interface is identical to the original — callers need no changes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const ACHIEVEMENT_POLL_MS  = 30 * 1000;
const LEADERBOARD_POLL_MS  = 60 * 1000;
const CHALLENGE_POLL_MS    = 15 * 1000;

export function useTrainingRealtime(userId) {
    const [newAchievement, setNewAchievement] = useState(null);
    const [leaderboardChange, setLeaderboardChange] = useState(null);
    const [challengeComplete, setChallengeComplete] = useState(null);
    // isConnected is kept for interface compatibility — polling is always "connected"
    const [isConnected, setIsConnected] = useState(false);

    const clearAchievement      = useCallback(() => setNewAchievement(null), []);
    const clearLeaderboardChange = useCallback(() => setLeaderboardChange(null), []);
    const clearChallengeComplete = useCallback(() => setChallengeComplete(null), []);

    const mountedRef = useRef(true);
    // Timestamps: track last poll boundary so we only notify about genuinely new rows
    const lastAchievementCheckRef = useRef(new Date().toISOString());
    const lastLeaderboardCheckRef = useRef(null); // stores last known rank for diff
    const lastChallengeCheckRef   = useRef(new Date().toISOString());

    useEffect(() => {
        mountedRef.current = true;
        if (!userId || typeof window === 'undefined') return;

        const client = supabase;
        if (!client) {
            console.warn('[TrainingRealtime] Supabase client not available');
            return;
        }

        setIsConnected(true);

        // ── Achievement polling ─────────────────────────────────────────
        const pollAchievements = async () => {
            if (typeof document !== 'undefined' && document.hidden) return; // skip while hidden
            try {
                const since = lastAchievementCheckRef.current;
                // Advance the watermark before the query so a slow response
                // doesn't create a gap where events could be missed
                lastAchievementCheckRef.current = new Date().toISOString();

                const { data: rows, error } = await client
                    .from('training_user_achievements')
                    .select('*, achievement_id')
                    .eq('user_id', userId)
                    .gt('created_at', since)
                    .order('created_at', { ascending: true });

                if (error) { console.warn('[TrainingRealtime] Achievement poll error:', error); return; }
                if (!rows?.length || !mountedRef.current) return;

                // Notify for the most-recently unlocked achievement
                const latest = rows[rows.length - 1];
                const { data: achievementDef } = await client
                    .from('training_achievement_definitions')
                    .select('*')
                    .eq('id', latest.achievement_id)
                    .maybeSingle();

                if (achievementDef && mountedRef.current) {
                    console.debug('[TrainingRealtime] New achievement (poll):', latest.achievement_id);
                    setNewAchievement({
                        ...achievementDef,
                        unlockedAt: latest.created_at,
                    });
                }
            } catch (err) {
                console.warn('[TrainingRealtime] Achievement poll exception:', err);
            }
        };

        // ── Leaderboard polling ─────────────────────────────────────────
        const pollLeaderboard = async () => {
            if (typeof document !== 'undefined' && document.hidden) return;
            try {
                // 2026-08-15 CHECK 13: training_leaderboard has no rank
                // column — rank is positional. Derive it the same way the
                // leaderboard API does: count rows in the same period ordered
                // ahead of ours (accuracy desc, then questions_correct desc).
                const { data: myRows, error } = await client
                    .from('training_leaderboard')
                    .select('period_type, period_key, accuracy, questions_correct')
                    .eq('user_id', userId)
                    .limit(5);

                if (error) { console.warn('[TrainingRealtime] Leaderboard poll error:', error); return; }
                const row = myRows?.[0];
                if (!row || !mountedRef.current) return;

                const acc = row.accuracy ?? 0;
                const qc = row.questions_correct ?? 0;
                const { count, error: rankErr } = await client
                    .from('training_leaderboard')
                    .select('id', { count: 'exact', head: true })
                    .eq('period_type', row.period_type)
                    .eq('period_key', row.period_key)
                    .or(`accuracy.gt.${acc},and(accuracy.eq.${acc},questions_correct.gt.${qc})`);
                if (rankErr) { console.warn('[TrainingRealtime] Rank derivation error:', rankErr); return; }
                if (!mountedRef.current) return;

                const oldRank = lastLeaderboardCheckRef.current ?? 999;
                const newRank = (count ?? 0) + 1;

                if (newRank < oldRank && newRank <= 10) {
                    console.debug('[TrainingRealtime] Leaderboard rank improved (poll):', oldRank, '->', newRank);
                    setLeaderboardChange({
                        oldRank,
                        newRank,
                        periodType: row.period_type,
                        improvement: oldRank - newRank,
                    });
                }
                lastLeaderboardCheckRef.current = newRank;
            } catch (err) {
                console.warn('[TrainingRealtime] Leaderboard poll exception:', err);
            }
        };

        // ── Challenge polling ───────────────────────────────────────────
        const pollChallenges = async () => {
            if (typeof document !== 'undefined' && document.hidden) return;
            try {
                const since = lastChallengeCheckRef.current;
                lastChallengeCheckRef.current = new Date().toISOString();

                const { data: rows, error } = await client
                    .from('training_user_challenges')
                    .select('*, challenge_id, completed_at')
                    .eq('user_id', userId)
                    .eq('completed', true)
                    .gt('completed_at', since)
                    .order('completed_at', { ascending: true });

                if (error) { console.warn('[TrainingRealtime] Challenge poll error:', error); return; }
                if (!rows?.length || !mountedRef.current) return;

                // Notify for the most recently completed challenge
                const latest = rows[rows.length - 1];
                const { data: challengeDef } = await client
                    .from('training_challenge_definitions')
                    .select('*')
                    .eq('id', latest.challenge_id)
                    .maybeSingle();

                if (challengeDef && mountedRef.current) {
                    console.debug('[TrainingRealtime] Challenge completed (poll):', latest.challenge_id);
                    setChallengeComplete({
                        ...challengeDef,
                        completedAt: latest.completed_at,
                    });
                }
            } catch (err) {
                console.warn('[TrainingRealtime] Challenge poll exception:', err);
            }
        };

        // Run initial polls immediately
        pollAchievements();
        pollLeaderboard();
        pollChallenges();

        const achievementInterval = setInterval(pollAchievements, ACHIEVEMENT_POLL_MS);
        const leaderboardInterval = setInterval(pollLeaderboard,  LEADERBOARD_POLL_MS);
        const challengeInterval   = setInterval(pollChallenges,   CHALLENGE_POLL_MS);

        // Recover from background: run all polls immediately when tab re-focuses
        const handleVisibility = () => {
            if (!document.hidden) {
                pollAchievements();
                pollLeaderboard();
                pollChallenges();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            mountedRef.current = false;
            clearInterval(achievementInterval);
            clearInterval(leaderboardInterval);
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
        clearAchievement,
        clearLeaderboardChange,
        clearChallengeComplete,
    };
}

export default useTrainingRealtime;
