/* ═══════════════════════════════════════════════════════════════════════════
   YELLOW BALL: DIAMOND REWARD SERVICE V2.0
   Complete 5-pillar achievement system with training integration
   ═══════════════════════════════════════════════════════════════════════════ */

import { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// 📊 TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface RewardDefinition {
    id: string;
    category: 'standard' | 'easter_egg';
    subcategory?: string;
    name: string;
    description?: string;
    base_amount: number;
    max_amount?: number;
    is_repeatable: boolean;
    cooldown_hours: number;
    bypasses_cap: boolean;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    icon?: string;
}

export interface ClaimResult {
    success: boolean;
    error?: string;
    reward_id?: string;
    diamonds_awarded?: number;
    multiplier?: number;
    bypassed_cap?: boolean;
    streak?: number;
    rarity?: string;
    icon?: string;
    diamonds_earned_today?: number;
}

export interface RewardSummary {
    total_diamonds: number;
    diamonds_today: number;
    diamonds_remaining_cap: number;
    current_streak: number;
    longest_streak: number;
    streak_multiplier: number;
    easter_eggs_found: number;
    last_login: string | null;
}

export interface CelebrationData {
    id: string;
    reward_id: string;
    diamonds: number;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    icon: string;
    multiplier: number;
    message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 💎 REWARD CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const REWARD_RULES = {
    DAILY_CAP: 500,
    MIN_AWARD: 5,
    STREAK_MULTIPLIERS: {
        DAYS_1_3: 1.0,
        DAYS_4_6: 1.5,
        DAYS_7_PLUS: 2.0,
    },
    DAILY_LOGIN_SCALE: {
        MIN: 5,
        MAX: 50,
        INCREMENT: 7,
    },
} as const;

export const STANDARD_REWARDS = {
    DAILY_LOGIN: 'daily_login',
    FIRST_TRAINING: 'first_training_of_day',
    LEVEL_COMPLETE_85: 'level_completion_85',
    PERFECT_SCORE: 'perfect_score_bonus',
    NEW_LEVEL_UNLOCKED: 'new_level_unlocked',
    SOCIAL_POST: 'social_post_share',
    STRATEGY_COMMENT: 'strategy_comment',
    XP_LEVEL_UP: 'xp_level_up',
    GTO_CHART_STUDY: 'gto_chart_study',
    REFERRAL_SUCCESS: 'referral_success',
} as const;

// 5-PILLAR EASTER EGG SYSTEM
export const PILLAR_EGGS = {
    // 🏟️ PILLAR 1: ARENA META & INTERACTION (1-20)
    ARENA_META: {
        SEARCHER: 'pillar1_searcher',
        TERMINAL_NOVICE: 'pillar1_terminal_novice',
        TERMINAL_PRO: 'pillar1_terminal_pro',
        ARCHIVIST: 'pillar1_archivist',
        NIGHT_VISION: 'pillar1_night_vision',
        INSPECTOR: 'pillar1_inspector',
        VOLUME_CONTROL: 'pillar1_volume_control',
        MULTI_TABBER: 'pillar1_multi_tabber',
        CUSTOMIZER: 'pillar1_customizer',
        READER: 'pillar1_reader',
        FILTER_MASTER: 'pillar1_filter_master',
        NOTIFICATION_CLEAR: 'pillar1_notification_clear',
        TOURIST: 'pillar1_tourist',
        QUICK_START: 'pillar1_quick_start',
        WINDOW_SHOPPER: 'pillar1_window_shopper',
        DATA_EXPORT: 'pillar1_data_export',
        WAITER: 'pillar1_waiter',
        INTERFACE_EXPLORER: 'pillar1_interface_explorer',
        OPTIMIZER: 'pillar1_optimizer',
        HARDWARE_FLEX: 'pillar1_hardware_flex',
    },

    // 📢 PILLAR 2: SOCIAL VELOCITY & RECRUITMENT (21-40)
    SOCIAL_VELOCITY: {
        VERIFIED_REFERRAL: 'pillar2_verified_referral',
        RECRUITER: 'pillar2_recruiter',
        SOCIAL_SHARE: 'pillar2_social_share',
        TAG_TEAM: 'pillar2_tag_team',
        VIRAL_CLIP: 'pillar2_viral_clip',
        EVANGELIST: 'pillar2_evangelist',
        COMMUNITY_MENTOR: 'pillar2_community_mentor',
        FEEDBACK_LOOP: 'pillar2_feedback_loop',
        DIPLOMAT: 'pillar2_diplomat',
        BIO_LINK: 'pillar2_bio_link',
        GROUP_FOUNDER: 'pillar2_group_founder',
        INFLUENCER: 'pillar2_influencer',
        SQUAD_GOALS: 'pillar2_squad_goals',
        ASSISTANT: 'pillar2_assistant',
        SOCIAL_STREAK: 'pillar2_social_streak',
        ARENA_REPORTER: 'pillar2_arena_reporter',
        COMMENTATOR: 'pillar2_commentator',
        WEEKLY_WRAP: 'pillar2_weekly_wrap',
        BRIDGE: 'pillar2_bridge',
        LEGACY_RECRUITER: 'pillar2_legacy_recruiter',
    },

    // 🧠 PILLAR 3: GTO & THEORY MASTERY (41-60)
    GTO_MASTERY: {
        DEEP_STUDY: 'pillar3_deep_study',
        THEORY_KING: 'pillar3_theory_king',
        SPECIALIST: 'pillar3_specialist',
        RANGE_ARCHITECT: 'pillar3_range_architect',
        PERFECTIONIST: 'pillar3_perfectionist',
        MISTAKE_LEARNER: 'pillar3_mistake_learner',
        CHART_EXPLORER: 'pillar3_chart_explorer',
        ANALYST: 'pillar3_analyst',
        LOGIC_CHECK: 'pillar3_logic_check',
        GRINDER: 'pillar3_grinder',
        EQUITY_EXPERT: 'pillar3_equity_expert',
        BLOCKER_SCHOLAR: 'pillar3_blocker_scholar',
        SOLVER: 'pillar3_solver',
        ZERO_ASSISTANCE: 'pillar3_zero_assistance',
        SNIPER: 'pillar3_sniper',
        TANKER: 'pillar3_tanker',
        TEXTURE_MASTER: 'pillar3_texture_master',
        POSITIONAL_PRO: 'pillar3_positional_pro',
        GENERALIST: 'pillar3_generalist',
        PURE_STRATEGY: 'pillar3_pure_strategy',
    },

    // 📈 PILLAR 4: STREAK & LOYALTY (61-80)
    STREAK_LOYALTY: {
        MORNING_COFFEE: 'pillar4_morning_coffee',
        NIGHT_OWL: 'pillar4_night_owl',
        WEEKEND_WARRIOR: 'pillar4_weekend_warrior',
        ANNIVERSARY: 'pillar4_anniversary',
        LOYALTY_LOCK: 'pillar4_loyalty_lock',
        HALF_CENTURY: 'pillar4_half_century',
        CENTURION: 'pillar4_centurion',
        LUNCH_BREAK: 'pillar4_lunch_break',
        DAILY_CAP_HERO: 'pillar4_daily_cap_hero',
        CONSISTENT_LEARNER: 'pillar4_consistent_learner',
        HOLIDAY: 'pillar4_holiday',
        CLOCKWORK: 'pillar4_clockwork',
        RETURN: 'pillar4_return',
        MARATHON_MAN: 'pillar4_marathon_man',
        SPEED_RUNNER: 'pillar4_speed_runner',
        DEDICATED: 'pillar4_dedicated',
        SILVER_MEMBER: 'pillar4_silver_member',
        GOLD_MEMBER: 'pillar4_gold_member',
        DIAMOND_HANDS: 'pillar4_diamond_hands',
        LEGEND: 'pillar4_legend',
    },

    // 🎰 PILLAR 5: ARENA CHALLENGES & EASTER EGGS (81-100)
    ARENA_CHALLENGES: {
        JACKPOT: 'pillar5_jackpot',
        BINARY_KING: 'pillar5_binary_king',
        COMEBACK: 'pillar5_comeback',
        LUCKY_SEVEN: 'pillar5_lucky_seven',
        GHOST: 'pillar5_ghost',
        MIRROR_MATCH: 'pillar5_mirror_match',
        UNDERDOG: 'pillar5_underdog',
        FULL_HOUSE: 'pillar5_full_house',
        BURNER: 'pillar5_burner',
        HIGH_STAKES: 'pillar5_high_stakes',
        WHALE: 'pillar5_whale',
        KONAMI: 'pillar5_konami',
        ORACLE: 'pillar5_oracle',
        ZERO_HERO: 'pillar5_zero_hero',
        COLLECTOR: 'pillar5_collector',
        SHADOW_BOXER: 'pillar5_shadow_boxer',
        ALCHEMIST: 'pillar5_alchemist',
        DOUBLE_NOTHING: 'pillar5_double_nothing',
        FINISHER: 'pillar5_finisher',
        ARCHITECT: 'pillar5_architect',
    },
} as const;
import { getAuthUser } from '../lib/authUtils';

// ─────────────────────────────────────────────────────────────────────────────
// 🎯 DIAMOND REWARD SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export class DiamondRewardService {
    private supabase: SupabaseClient;
    private userId: string | null;

    // 🛡️ BULLETPROOF: Accept userId in constructor instead of calling getUser()
    // Falls back to authUtils if not provided (backwards compatible)
    constructor(supabase: SupabaseClient, userId?: string | null) {
        this.supabase = supabase;
        this.userId = userId || null;
    }

    // Set userId after construction if needed
    setUserId(userId: string): void {
        this.userId = userId;
    }

    // Helper to get userId safely (backwards compatible)
    private _getUserId(): string | null {
        if (this.userId) return this.userId;
        // Fallback to authUtils (synchronous, safe)
        const user = getAuthUser();
        return user?.id || null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CORE REWARD CLAIMING
    // ═══════════════════════════════════════════════════════════════════════

    async claimReward(rewardId: string, metadata: Record<string, unknown> = {}): Promise<ClaimResult> {
        const userId = this._getUserId();
        if (!userId) {
            return { success: false, error: 'User not authenticated' };
        }

        const { data, error } = await this.supabase.rpc('claim_reward', {
            p_user_id: userId,
            p_reward_id: rewardId,
            p_metadata: metadata,
        });

        if (error) {
            console.error('Reward claim error:', error);
            return { success: false, error: error.message };
        }

        if (data?.success) {
            this.emitCelebration(data);
        }

        return data as ClaimResult;
    }

    async claimDailyLogin(): Promise<ClaimResult> {
        const userId = this._getUserId();
        if (!userId) {
            return { success: false, error: 'User not authenticated' };
        }

        await this.supabase.rpc('update_login_streak', {
            p_user_id: userId,
        });

        // Check time-based easter eggs
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 9) {
            await this.claimReward(PILLAR_EGGS.STREAK_LOYALTY.MORNING_COFFEE);
        }
        if (hour >= 0 && hour < 3) {
            await this.claimReward(PILLAR_EGGS.STREAK_LOYALTY.NIGHT_OWL);
        }

        return this.claimReward(STANDARD_REWARDS.DAILY_LOGIN, {
            login_time: new Date().toISOString()
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TRAINING INTEGRATION — Auto-award on training actions
    // ═══════════════════════════════════════════════════════════════════════

    async trackTrainingAction(
        actionType: string,
        metadata: Record<string, unknown> = {}
    ): Promise<ClaimResult[]> {
        const results: ClaimResult[] = [];

        const userId = this._getUserId();
        if (!userId) {
            return results;
        }

        // Use the database function for complex logic
        const { data, error } = await this.supabase.rpc('track_training_action', {
            p_user_id: userId,
            p_action_type: actionType,
            p_metadata: metadata,
        });

        if (error) {
            console.error('Track training action error:', error);
            return results;
        }

        // Process any rewards returned
        if (data?.rewards) {
            for (const reward of data.rewards) {
                if (reward?.success) {
                    results.push(reward);
                    this.emitCelebration(reward);
                }
            }
        }

        return results;
    }

    async onLevelComplete(level: number, accuracy: number, timeSeconds: number): Promise<ClaimResult[]> {
        return this.trackTrainingAction('level_complete', {
            level,
            accuracy,
            time_seconds: timeSeconds,
        });
    }

    async onFirstTrainingOfDay(): Promise<ClaimResult[]> {
        return this.trackTrainingAction('first_training', {
            session_start: new Date().toISOString(),
        });
    }

    async onLevelUnlocked(level: number): Promise<ClaimResult[]> {
        return this.trackTrainingAction('level_unlocked', { level });
    }

    async onChartStudy(minutes: number, chartType: string): Promise<ClaimResult[]> {
        return this.trackTrainingAction('chart_study', {
            minutes,
            chart_type: chartType,
        });
    }

    async onCorrectAnswer(questionId: string, timeMs: number): Promise<ClaimResult[]> {
        return this.trackTrainingAction('correct_answer', {
            question_id: questionId,
            response_time_ms: timeMs,
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PILLAR-SPECIFIC TRIGGERS
    // ═══════════════════════════════════════════════════════════════════════

    // PILLAR 1: Arena Meta
    async onSearchUsed(searchCount: number): Promise<ClaimResult | null> {
        if (searchCount >= 10) {
            return this.claimReward(PILLAR_EGGS.ARENA_META.SEARCHER);
        }
        return null;
    }

    async onTerminalCommand(commandCount: number, usedUI: boolean): Promise<ClaimResult | null> {
        if (commandCount === 1) {
            return this.claimReward(PILLAR_EGGS.ARENA_META.TERMINAL_NOVICE);
        }
        if (commandCount >= 50 && !usedUI) {
            return this.claimReward(PILLAR_EGGS.ARENA_META.TERMINAL_PRO);
        }
        return null;
    }

    async onDarkModeToggle(): Promise<ClaimResult | null> {
        const hour = new Date().getHours();
        if (hour >= 22 || hour < 6) {
            return this.claimReward(PILLAR_EGGS.ARENA_META.NIGHT_VISION);
        }
        return null;
    }

    async onMultiTabOpen(tabCount: number): Promise<ClaimResult | null> {
        if (tabCount >= 3) {
            return this.claimReward(PILLAR_EGGS.ARENA_META.MULTI_TABBER);
        }
        return null;
    }

    async onDashboardCustomize(): Promise<ClaimResult | null> {
        return this.claimReward(PILLAR_EGGS.ARENA_META.CUSTOMIZER);
    }

    async onRulesRead(): Promise<ClaimResult | null> {
        return this.claimReward(PILLAR_EGGS.ARENA_META.READER);
    }

    async onQuickStart(loginToGameSeconds: number): Promise<ClaimResult | null> {
        if (loginToGameSeconds <= 5) {
            return this.claimReward(PILLAR_EGGS.ARENA_META.QUICK_START);
        }
        return null;
    }

    async onHardwareFlex(platform: string): Promise<ClaimResult | null> {
        if (platform.toLowerCase().includes('mac studio')) {
            return this.claimReward(PILLAR_EGGS.ARENA_META.HARDWARE_FLEX);
        }
        return null;
    }

    // PILLAR 2: Social Velocity
    async onReferralVerified(referredUserId: string): Promise<ClaimResult[]> {
        const results: ClaimResult[] = [];

        const verifiedResult = await this.claimReward(PILLAR_EGGS.SOCIAL_VELOCITY.VERIFIED_REFERRAL, {
            referred_user_id: referredUserId,
        });
        if (verifiedResult.success) results.push(verifiedResult);

        // Check for 5 referrals
        const { count } = await this.supabase
            .from('reward_claims')
            .select('*', { count: 'exact' })
            .eq('reward_id', PILLAR_EGGS.SOCIAL_VELOCITY.VERIFIED_REFERRAL);

        if (count && count >= 5) {
            const recruiterResult = await this.claimReward(PILLAR_EGGS.SOCIAL_VELOCITY.RECRUITER);
            if (recruiterResult.success) results.push(recruiterResult);
        }

        return results;
    }

    async onSocialShare(platform: string): Promise<ClaimResult | null> {
        return this.claimReward(PILLAR_EGGS.SOCIAL_VELOCITY.SOCIAL_SHARE, { platform });
    }

    async onDiscordConnect(): Promise<ClaimResult | null> {
        return this.claimReward(PILLAR_EGGS.SOCIAL_VELOCITY.BRIDGE);
    }

    async onBugReport(bugId: string, verified: boolean): Promise<ClaimResult | null> {
        if (verified) {
            return this.claimReward(PILLAR_EGGS.SOCIAL_VELOCITY.ARENA_REPORTER, { bug_id: bugId });
        }
        return null;
    }

    // PILLAR 3: GTO Mastery
    async onLeakStudy(minutes: number): Promise<ClaimResult | null> {
        if (minutes >= 3) {
            return this.claimReward(PILLAR_EGGS.GTO_MASTERY.DEEP_STUDY, { minutes });
        }
        return null;
    }

    async onHintsDisabled(sessionComplete: boolean): Promise<ClaimResult | null> {
        if (sessionComplete) {
            return this.claimReward(PILLAR_EGGS.GTO_MASTERY.ZERO_ASSISTANCE);
        }
        return null;
    }

    async onFastAnswers(answersUnder2s: number): Promise<ClaimResult | null> {
        if (answersUnder2s >= 10) {
            return this.claimReward(PILLAR_EGGS.GTO_MASTERY.SNIPER);
        }
        return null;
    }

    async onLongSession(minutes: number): Promise<ClaimResult | null> {
        if (minutes >= 120) {
            return this.claimReward(PILLAR_EGGS.GTO_MASTERY.GRINDER, { minutes });
        }
        return null;
    }

    // PILLAR 4: Streak & Loyalty
    async onStreakReached(streak: number): Promise<ClaimResult[]> {
        const results: ClaimResult[] = [];

        if (streak === 7) {
            const r = await this.claimReward(PILLAR_EGGS.STREAK_LOYALTY.LOYALTY_LOCK);
            if (r.success) results.push(r);
        }
        if (streak === 50) {
            const r = await this.claimReward(PILLAR_EGGS.STREAK_LOYALTY.HALF_CENTURY);
            if (r.success) results.push(r);
        }
        if (streak === 100) {
            const r = await this.claimReward(PILLAR_EGGS.STREAK_LOYALTY.CENTURION);
            if (r.success) results.push(r);
        }

        return results;
    }

    async onWeekendLogin(isSaturday: boolean, isSunday: boolean): Promise<ClaimResult | null> {
        // Track in session storage
        if (typeof window !== 'undefined') {
            if (isSaturday) sessionStorage.setItem('saturday_login', 'true');
            if (isSunday) sessionStorage.setItem('sunday_login', 'true');

            if (sessionStorage.getItem('saturday_login') && sessionStorage.getItem('sunday_login')) {
                return this.claimReward(PILLAR_EGGS.STREAK_LOYALTY.WEEKEND_WARRIOR);
            }
        }
        return null;
    }

    async onDailyCap(): Promise<ClaimResult | null> {
        return this.claimReward(PILLAR_EGGS.STREAK_LOYALTY.DAILY_CAP_HERO);
    }

    async onMarathonComplete(levelsIn24h: number): Promise<ClaimResult | null> {
        if (levelsIn24h >= 10) {
            return this.claimReward(PILLAR_EGGS.STREAK_LOYALTY.MARATHON_MAN, { levels: levelsIn24h });
        }
        return null;
    }

    // PILLAR 5: Arena Challenges
    async checkJackpot(): Promise<ClaimResult | null> {
        if (Math.random() < 0.001) { // 0.1% chance
            return this.claimReward(PILLAR_EGGS.ARENA_CHALLENGES.JACKPOT, {
                rolled: true,
                timestamp: new Date().toISOString(),
            });
        }
        return null;
    }

    async onKonamiCode(): Promise<ClaimResult | null> {
        return this.claimReward(PILLAR_EGGS.ARENA_CHALLENGES.KONAMI);
    }

    async onKeyboardOnlyLevel(): Promise<ClaimResult | null> {
        return this.claimReward(PILLAR_EGGS.ARENA_CHALLENGES.GHOST);
    }

    async onComeback(failedFirst3: boolean, passed: boolean): Promise<ClaimResult | null> {
        if (failedFirst3 && passed) {
            return this.claimReward(PILLAR_EGGS.ARENA_CHALLENGES.COMEBACK);
        }
        return null;
    }

    async onUnderdogWin(difficulty: string, userLevel: number): Promise<ClaimResult | null> {
        if (difficulty === 'very_hard' && userLevel < 10) {
            return this.claimReward(PILLAR_EGGS.ARENA_CHALLENGES.UNDERDOG);
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CELEBRATION EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    async getPendingCelebrations(): Promise<CelebrationData[]> {
        const userId = this._getUserId();
        if (!userId) return [];

        const { data, error } = await this.supabase.rpc('get_pending_celebrations', {
            p_user_id: userId,
        });

        if (error) {
            console.error('Get celebrations error:', error);
            return [];
        }

        return data || [];
    }

    async dismissCelebration(celebrationId: string): Promise<boolean> {
        const { error } = await this.supabase.rpc('dismiss_celebration', {
            p_celebration_id: celebrationId,
        });

        return !error;
    }

    private emitCelebration(result: ClaimResult): void {
        if (typeof window !== 'undefined' && result.success) {
            window.dispatchEvent(new CustomEvent('diamond-celebration', {
                detail: {
                    id: `${Date.now()}-${Math.random()}`,
                    reward_id: result.reward_id,
                    diamonds: result.diamonds_awarded,
                    rarity: result.rarity || 'common',
                    icon: result.icon || '💎',
                    multiplier: result.multiplier || 1,
                    message: this.getCelebrationMessage(result.rarity || 'common'),
                }
            }));
        }
    }

    private getCelebrationMessage(rarity: string): string {
        switch (rarity) {
            case 'legendary': return '🎊 LEGENDARY ACHIEVEMENT UNLOCKED!';
            case 'epic': return '⭐ EPIC DISCOVERY!';
            case 'rare': return '✨ RARE FIND!';
            case 'uncommon': return '💎 NICE WORK!';
            default: return '💎 DIAMONDS EARNED!';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SUMMARY & STATS
    // ═══════════════════════════════════════════════════════════════════════

    async getRewardSummary(): Promise<RewardSummary | null> {
        const userId = this._getUserId();
        if (!userId) return null;

        const { data, error } = await this.supabase.rpc('get_user_reward_summary', {
            p_user_id: userId,
        });

        if (error) {
            console.error('Get reward summary error:', error);
            return null;
        }

        return data as RewardSummary;
    }

    getStreakMultiplier(streakDays: number): number {
        if (streakDays >= 7) return REWARD_RULES.STREAK_MULTIPLIERS.DAYS_7_PLUS;
        if (streakDays >= 4) return REWARD_RULES.STREAK_MULTIPLIERS.DAYS_4_6;
        return REWARD_RULES.STREAK_MULTIPLIERS.DAYS_1_3;
    }

    getDailyLoginDiamonds(streakDays: number): number {
        const { MIN, MAX, INCREMENT } = REWARD_RULES.DAILY_LOGIN_SCALE;
        return Math.min(MIN + (streakDays - 1) * INCREMENT, MAX);
    }
}

export default DiamondRewardService;
