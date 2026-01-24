/**
 * POY (Player of the Year) Calculation Engine
 *
 * This module handles all POY point calculations and integrations
 * with Diamond Arcade and Club Arena leaderboards.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Point configuration - matches database defaults
export const POY_POINT_CONFIG = {
    // Diamond Arcade
    arcade: {
        game_win: 10,
        perfect_score: 50,
        win_streak_5: 100,
        win_streak_10: 250,
        daily_leaderboard_top3: 200,
        weekly_leaderboard_top10: 500,
    },
    // Club Arena
    club: {
        tournament_win: 100,
        tournament_win_large: 150, // 50+ players
        final_table: 50,
        cash_finish: 25,
        sng_win: 50,
        spin_win: 30,
        per_10_players: 1, // Bonus for larger fields
        profit_milestone_1k: 100,
        profit_milestone_10k: 500,
    },
    // Achievements
    achievements: {
        first_arcade_win: 50,
        first_tournament_win: 100,
        weekly_active: 25,
    },
};

// Point sources
export type PointSource =
    | 'diamond_arcade'
    | 'club_arena'
    | 'tournament'
    | 'achievement'
    | 'bonus';

// Calculate POY points for an arcade game result
export function calculateArcadePoints(result: {
    won: boolean;
    accuracy: number;
    currentStreak: number;
    isNewStreakMilestone?: boolean;
}): number {
    let points = 0;

    if (result.won) {
        points += POY_POINT_CONFIG.arcade.game_win;

        // Perfect score bonus
        if (result.accuracy >= 1.0) {
            points += POY_POINT_CONFIG.arcade.perfect_score;
        }

        // Streak milestones
        if (result.isNewStreakMilestone) {
            if (result.currentStreak === 5) {
                points += POY_POINT_CONFIG.arcade.win_streak_5;
            } else if (result.currentStreak === 10) {
                points += POY_POINT_CONFIG.arcade.win_streak_10;
            }
        }
    }

    return points;
}

// Calculate POY points for a Club Arena result
export function calculateClubArenaPoints(result: {
    gameType: 'tournament' | 'cash' | 'sit-n-go' | 'spin-n-go';
    placement: number;
    totalPlayers: number;
    buyIn: number;
    winnings: number;
}): number {
    let points = 0;
    const { gameType, placement, totalPlayers, buyIn, winnings } = result;

    // First place wins
    if (placement === 1) {
        switch (gameType) {
            case 'tournament':
                points += totalPlayers >= 50
                    ? POY_POINT_CONFIG.club.tournament_win_large
                    : POY_POINT_CONFIG.club.tournament_win;
                break;
            case 'sit-n-go':
                points += POY_POINT_CONFIG.club.sng_win;
                break;
            case 'spin-n-go':
                points += POY_POINT_CONFIG.club.spin_win;
                break;
        }

        // Bonus for larger fields (tournament/sng)
        if (gameType !== 'cash') {
            points += Math.floor(totalPlayers / 10) * POY_POINT_CONFIG.club.per_10_players;
        }
    }
    // Final table (top 9 in 18+ player games)
    else if (placement <= 9 && totalPlayers >= 18) {
        points += POY_POINT_CONFIG.club.final_table;
    }
    // Cashed (top 15%)
    else if (placement <= Math.ceil(totalPlayers * 0.15) && winnings > buyIn) {
        points += POY_POINT_CONFIG.club.cash_finish;
    }

    return points;
}

// POY Engine class for more complex operations
export class POYEngine {
    private supabase: SupabaseClient;

    constructor(supabaseUrl?: string, supabaseKey?: string) {
        this.supabase = createClient(
            supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!,
            supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
    }

    // Award POY points to a player
    async awardPoints(
        playerId: string,
        points: number,
        source: PointSource,
        reason: string,
        sourceId?: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            // Use the RPC function if available
            if (source === 'diamond_arcade') {
                const { data, error } = await this.supabase.rpc('update_poy_from_arcade', {
                    p_player_id: playerId,
                    p_points: points,
                    p_reason: reason,
                    p_source_id: sourceId || null,
                });

                if (error) throw error;
                return { success: true };
            }

            // For other sources, update directly
            const seasonYear = new Date().getFullYear();
            const columnMap: Record<PointSource, string> = {
                diamond_arcade: 'diamond_arcade_points',
                club_arena: 'club_arena_points',
                tournament: 'tournament_points',
                achievement: 'achievement_points',
                bonus: 'bonus_points',
            };

            // Get current points
            const { data: existing } = await this.supabase
                .from('poy_rankings')
                .select(columnMap[source])
                .eq('player_id', playerId)
                .eq('season_year', seasonYear)
                .single();

            const currentPoints = existing?.[columnMap[source]] || 0;

            // Upsert with new points
            const { error: upsertError } = await this.supabase
                .from('poy_rankings')
                .upsert({
                    player_id: playerId,
                    season_year: seasonYear,
                    [columnMap[source]]: currentPoints + points,
                }, {
                    onConflict: 'player_id,season_year',
                });

            if (upsertError) throw upsertError;

            // Record history
            await this.supabase.from('poy_point_history').insert({
                player_id: playerId,
                season_year: seasonYear,
                points_earned: points,
                point_source: source,
                source_id: sourceId,
                description: reason,
            });

            return { success: true };
        } catch (error: any) {
            console.error('Error awarding POY points:', error);
            return { success: false, error: error.message };
        }
    }

    // Get player's POY stats
    async getPlayerPOYStats(playerId: string, seasonYear?: number) {
        const year = seasonYear || new Date().getFullYear();

        const { data, error } = await this.supabase
            .from('poy_rankings')
            .select('*')
            .eq('player_id', playerId)
            .eq('season_year', year)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        return data || {
            player_id: playerId,
            season_year: year,
            diamond_arcade_points: 0,
            club_arena_points: 0,
            tournament_points: 0,
            achievement_points: 0,
            bonus_points: 0,
            total_points: 0,
            current_rank: null,
        };
    }

    // Get point history for a player
    async getPointHistory(playerId: string, seasonYear?: number, limit = 50) {
        const year = seasonYear || new Date().getFullYear();

        const { data, error } = await this.supabase
            .from('poy_point_history')
            .select('*')
            .eq('player_id', playerId)
            .eq('season_year', year)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    }

    // Recalculate rankings (should be called periodically)
    async recalculateRankings(seasonYear?: number) {
        const { data, error } = await this.supabase.rpc('recalculate_poy_rankings', {
            p_season_year: seasonYear || null,
        });

        if (error) throw error;
        return data;
    }

    // Check and award leaderboard position bonuses
    async checkLeaderboardBonuses(playerId: string) {
        const points: { source: string; points: number; reason: string }[] = [];

        // Check arcade daily leaderboard
        const { data: arcadeDaily } = await this.supabase
            .rpc('get_arcade_leaderboard', { p_period: 'daily', p_limit: 10 });

        if (arcadeDaily) {
            const playerRank = arcadeDaily.findIndex((p: any) => p.player_id === playerId) + 1;
            if (playerRank > 0 && playerRank <= 3) {
                points.push({
                    source: 'diamond_arcade',
                    points: POY_POINT_CONFIG.arcade.daily_leaderboard_top3,
                    reason: `Top ${playerRank} on daily arcade leaderboard`,
                });
            }
        }

        // Check arcade weekly leaderboard
        const { data: arcadeWeekly } = await this.supabase
            .rpc('get_arcade_leaderboard', { p_period: 'weekly', p_limit: 10 });

        if (arcadeWeekly) {
            const playerRank = arcadeWeekly.findIndex((p: any) => p.player_id === playerId) + 1;
            if (playerRank > 0 && playerRank <= 10) {
                points.push({
                    source: 'diamond_arcade',
                    points: POY_POINT_CONFIG.arcade.weekly_leaderboard_top10,
                    reason: `Top ${playerRank} on weekly arcade leaderboard`,
                });
            }
        }

        // Award all bonuses
        for (const bonus of points) {
            await this.awardPoints(
                playerId,
                bonus.points,
                bonus.source as PointSource,
                bonus.reason
            );
        }

        return points;
    }
}

// Export singleton instance
let poyEngineInstance: POYEngine | null = null;

export function getPOYEngine(): POYEngine {
    if (!poyEngineInstance) {
        poyEngineInstance = new POYEngine();
    }
    return poyEngineInstance;
}

export default POYEngine;
