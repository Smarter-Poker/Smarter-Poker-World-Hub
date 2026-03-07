/**
 * 🔔 useTrainingRealtime Hook
 * ═══════════════════════════════════════════════════════════════════════════
 * Subscribe to Supabase realtime for achievements and leaderboard updates
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useTrainingRealtime(userId) {
    const [newAchievement, setNewAchievement] = useState(null);
    const [leaderboardChange, setLeaderboardChange] = useState(null);
    const [challengeComplete, setChallengeComplete] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    // Clear the notification after it's been consumed
    const clearAchievement = useCallback(() => setNewAchievement(null), []);
    const clearLeaderboardChange = useCallback(() => setLeaderboardChange(null), []);
    const clearChallengeComplete = useCallback(() => setChallengeComplete(null), []);

    useEffect(() => {
        if (!userId) return;

        // Achievement channel
        const achievementChannel = supabase
            .channel(`training-achievements-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'training_user_achievements',
                    filter: `user_id=eq.${userId}`
                },
                async (payload) => {
                    console.log('[Realtime] New achievement:', payload);

                    // Fetch the full achievement details
                    const { data: achievementDef } = await supabase
                        .from('training_achievement_definitions')
                        .select('*')
                        .eq('id', payload.new.achievement_id)
                        .maybeSingle();

                    if (achievementDef) {
                        setNewAchievement({
                            ...achievementDef,
                            unlockedAt: payload.new.created_at
                        });
                    }
                }
            )
            .subscribe((status) => {
                console.log('[Realtime] Achievement channel status:', status);
                if (status === 'SUBSCRIBED') {
                    setIsConnected(true);
                }
            });

        // Leaderboard channel (for rank changes)
        const leaderboardChannel = supabase
            .channel(`training-leaderboard-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'training_leaderboard',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    console.log('[Realtime] Leaderboard update:', payload);

                    // Check if rank improved
                    const oldRank = payload.old?.rank || 999;
                    const newRank = payload.new?.rank || 999;

                    if (newRank < oldRank && newRank <= 10) {
                        setLeaderboardChange({
                            oldRank,
                            newRank,
                            periodType: payload.new.period_type,
                            improvement: oldRank - newRank
                        });
                    }
                }
            )
            .subscribe((status) => {
                console.log('[Realtime] Leaderboard channel status:', status);
                if (status === 'SUBSCRIBED') {
                    setIsConnected(true);
                }
            });

        // Challenge completion channel
        const challengeChannel = supabase
            .channel(`training-challenges-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'training_user_challenges',
                    filter: `user_id=eq.${userId}`
                },
                async (payload) => {
                    // Only notify on NEW completions
                    if (payload.new.completed && !payload.old?.completed) {
                        console.log('[Realtime] Challenge completed:', payload);

                        // Fetch challenge details
                        const { data: challengeDef } = await supabase
                            .from('training_challenge_definitions')
                            .select('*')
                            .eq('id', payload.new.challenge_id)
                            .maybeSingle();

                        if (challengeDef) {
                            setChallengeComplete({
                                ...challengeDef,
                                completedAt: payload.new.completed_at
                            });
                        }
                    }
                }
            )
            .subscribe((status) => {
                console.log('[Realtime] Challenge channel status:', status);
                if (status === 'SUBSCRIBED') {
                    setIsConnected(true);
                }
            });

        // Cleanup
        return () => {
            console.log('[Realtime] Cleaning up subscriptions');
            supabase.removeChannel(achievementChannel);
            supabase.removeChannel(leaderboardChannel);
            supabase.removeChannel(challengeChannel);
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
        clearChallengeComplete
    };
}

export default useTrainingRealtime;
