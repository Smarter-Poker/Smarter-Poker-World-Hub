/* ═══════════════════════════════════════════════════════════════════════════
   LIVE HELP CONTEXT COLLECTOR — Gather user context for AI agents
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase';
import { signedTrainingScore } from '../training/sessionEvidence.mjs';

export interface UserContext {
    currentOrb: string;
    currentPage: string;
    currentMode: string;
    userLevel: number;

    diamondBalance: number;
    sessionDuration: number;
    recentActivity?: string[];
    lastDrillType?: string;
    winRate?: number;
    handsPlayed?: number;
}

/**
 * Collect comprehensive user context for AI agent
 */
export async function collectUserContext(userId: string): Promise<UserContext> {
    try {
        // Get user profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('level, diamonds')
            .eq('id', userId)
            .maybeSingle();
        if (profileError) throw new Error(`Profile context unavailable: ${profileError.message}`);

        // Get current page from window location
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/hub';
        const currentOrb = extractOrbFromPath(currentPath);
        const currentPage = currentPath;

        // Get session duration (from sessionStorage or default to 0)
        const sessionStart = typeof window !== 'undefined'
            ? sessionStorage.getItem('session_start')
            : null;
        const sessionDuration = sessionStart
            ? Math.floor((Date.now() - parseInt(sessionStart)) / 1000)
            : 0;

        // Get recent training activity (last 5 sessions)
        const { data: recentSessions, error: recentSessionsError } = await supabase
            .from('training_sessions')
            .select('game_id, gtow_score, score_scale, created_at, attempt_id, training_attempts!training_sessions_attempt_fk!inner(id, user_id, status, practice_only)')
            .eq('user_id', userId)
            .eq('training_attempts.user_id', userId)
            .eq('training_attempts.status', 'completed')
            .not('attempt_id', 'is', null)
            .eq('training_attempts.practice_only', false)
            .order('created_at', { ascending: false })
            .limit(5);
        if (recentSessionsError) {
            throw new Error(`Verified training context unavailable: ${recentSessionsError.message}`);
        }

        const recentActivity = recentSessions?.map((session) => {
            const score = signedTrainingScore(session);
            return score === null
                ? `${session.game_id}: Verified Score Not Available`
                : `${session.game_id}: ${score} Signed Training Score`;
        }) || [];

        // Get last drill type
        const lastDrillType = recentSessions?.[0]?.game_id || undefined;

        // Get poker stats (if available)
        const { data: stats, error: statsError } = await supabase
            .from('player_stats')
            // 2026-08-15 CHECK 13: player_stats has no win_rate column
            .select('hands_played')
            .eq('user_id', userId)
            .maybeSingle();
        if (statsError) throw new Error(`Player context unavailable: ${statsError.message}`);

        return {
            currentOrb,
            currentPage,
            currentMode: determineMode(currentPath),
            userLevel: profile?.level || 1,

            diamondBalance: profile?.diamonds || 0,
            sessionDuration,
            recentActivity,
            lastDrillType,
            winRate: undefined,
            handsPlayed: stats?.hands_played ?? undefined
        };
    } catch (error) {
        console.warn('Failed to collect user context:', error);
        // Personalization must never turn a database outage into plausible
        // zero-valued user history. Let the caller present an unavailable
        // state instead of feeding fabricated context to an assistant.
        throw error instanceof Error ? error : new Error('User context is unavailable');
    }
}

/**
 * Extract orb name from path
 */
function extractOrbFromPath(path: string): string {
    const match = path.match(/\/hub\/([^\/]+)/);
    if (!match) return 'hub';

    const orb = match[1];

    // Map paths to orb names
    const orbMap: Record<string, string> = {
        'social-media': 'Social Hub',
        'messenger': 'Messenger',
        'training': 'GTO Training',
        'diamond-arena': 'Diamond Arena',
        'club-arena': 'Club Arena',
        'diamond-store': 'Diamond Store',
        'tournaments': 'Tournaments',
        'poker-near-me': 'Poker Near Me',
        'news': 'News',
        'reels': 'Reels',
        'lives': 'Lives',
        'profile': 'Profile',
        'settings': 'Settings'
    };

    return orbMap[orb] || orb;
}

/**
 * Determine current mode from path
 */
function determineMode(path: string): string {
    if (path.includes('/training/arena')) return 'training';
    if (path.includes('/diamond-arena/table')) return 'playing';
    if (path.includes('/club-arena/table')) return 'playing';
    if (path.includes('/settings')) return 'settings';
    if (path.includes('/social-media')) return 'social';
    return 'browsing';
}

/**
 * Format context for display in agent prompt
 */
export function formatContextForPrompt(context: UserContext): string {
    const parts = [
        `Location: ${context.currentOrb} (${context.currentPage})`,
        `Mode: ${context.currentMode}`,
        `User Level: ${context.userLevel}`,
        `Diamonds: ${context.diamondBalance}`,
        `Session Duration: ${Math.floor(context.sessionDuration / 60)} minutes`
    ];

    if (context.recentActivity && context.recentActivity.length > 0) {
        parts.push(`Recent Activity: ${context.recentActivity.slice(0, 3).join(', ')}`);
    }

    if (context.lastDrillType) {
        parts.push(`Last Drill: ${context.lastDrillType}`);
    }

    if (context.handsPlayed) {
        parts.push(`Hands Played: ${context.handsPlayed.toLocaleString()}`);
    }

    if (context.winRate !== undefined) {
        parts.push(`Win Rate: ${context.winRate.toFixed(1)}%`);
    }

    return parts.join('\n');
}

/**
 * Initialize session tracking
 */
export function initSessionTracking() {
    if (typeof window === 'undefined') return;

    if (!sessionStorage.getItem('session_start')) {
        sessionStorage.setItem('session_start', Date.now().toString());
    }
}
