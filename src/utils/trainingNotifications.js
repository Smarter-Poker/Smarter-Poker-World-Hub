/**
 * TRAINING NOTIFICATIONS UTILITY
 * ═══════════════════════════════════════════════════════════════════════════
 * Send push notifications for training achievements, challenges, and milestones
 * ═══════════════════════════════════════════════════════════════════════════
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://smarter.poker';

/**
 * REWIRED 2026-08-19: this file used to POST directly to the OneSignal REST API.
 * OneSignal is gone. Sends now go through enqueuePush(), so they are gated by
 * notification_preferences, recorded in push_outbox and retried by
 * /api/cron/push-dispatch like every other notification in the product.
 *
 * SERVER ONLY -- imports the service-role Supabase client.
 */
import { createClient } from '../lib/supabaseServerClient';
import { enqueuePush } from '../lib/push/push-enqueue';
import { isPushConfigured } from '../lib/push/web-push';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

async function sendPushNotification({ userId, title, message, url, data, event }) {
    if (!isPushConfigured()) {
        console.warn('[TrainingNotifications] Push is not configured (VAPID keys missing)');
        return false;
    }
    if (!userId) return false;

    try {
        const result = await enqueuePush(getSupabase(), {
            userId,
            title,
            body: message,
            url: url ? `${BASE_URL}${url}` : '/hub/training',
            event: event || 'achievement',
            relatedEntityId: null,
        });
        return Boolean(result.sent || result.outboxId);
    } catch (error) {
        console.warn('[TrainingNotifications] Error:', error?.message || error);
        return false;
    }
}

/**
 * Notify user of achievement unlock
 */
export async function notifyAchievementUnlock(userId, achievement) {
    return sendPushNotification({
        userId,
        title: 'Achievement Unlocked',
        message: `${achievement.name} - ${achievement.diamondReward || 0} diamonds earned`,
        url: '/hub/training/achievements',
        data: {
            type: 'achievement',
            achievementId: achievement.id,
            diamonds: achievement.diamondReward
        }
    });
}

/**
 * Notify user of challenge completion
 */
export async function notifyChallengeComplete(userId, challenge) {
    const typeLabel = challenge.challenge_type === 'weekly' ? 'Weekly' : 'Monthly';

    return sendPushNotification({
        userId,
        title: `${typeLabel} Challenge Complete`,
        message: `${challenge.name} - claim your ${challenge.diamond_reward || 0} diamond reward`,
        url: '/hub/training',
        data: {
            type: 'challenge',
            challengeId: challenge.id,
            diamonds: challenge.diamond_reward
        }
    });
}

/**
 * Notify user of streak milestone
 */
export async function notifyStreakMilestone(userId, streakDays, reward) {
    return sendPushNotification({
        userId,
        title: 'Streak Milestone!',
        message: `${streakDays}-day training streak achieved! Claim your ${reward} reward!`,
        url: '/hub/training/streaks',
        data: {
            type: 'streak',
            streakDays,
            diamonds: reward
        }
    });
}

/**
 * Notify user of leaderboard rank change
 */
export async function notifyLeaderboardRank(userId, newRank, periodType) {
    const periodLabel = {
        daily: 'Today',
        weekly: 'This Week',
        monthly: 'This Month',
        alltime: 'All Time'
    }[periodType] || periodType;

    return sendPushNotification({
        userId,
        title: 'Leaderboard Update!',
        message: `You moved to #${newRank} on the ${periodLabel} leaderboard!`,
        url: '/hub/training/leaderboard',
        data: {
            type: 'leaderboard',
            rank: newRank,
            periodType
        }
    });
}

/**
 * Notify user of daily bonus available
 */
export async function notifyDailyBonus(userId, bonusAmount) {
    return sendPushNotification({
        userId,
        title: 'Daily Bonus Ready!',
        message: `Your ${bonusAmount} daily training bonus is waiting! Start a session to claim it.`,
        url: '/hub/training',
        data: {
            type: 'daily_bonus',
            diamonds: bonusAmount
        }
    });
}

/**
 * Notify user of perfect round achievement
 */
export async function notifyPerfectRound(userId, gameName, perfectCount) {
    return sendPushNotification({
        userId,
        title: 'Perfect Round!',
        message: `100% accuracy on ${gameName}! That's ${perfectCount} perfect rounds total!`,
        url: '/hub/training/achievements',
        data: {
            type: 'perfect_round',
            gameName,
            totalPerfect: perfectCount
        }
    });
}

/**
 * Notify user of upcoming tournament
 */
export async function notifyTournamentReminder(userId, tournament, reminderType = '1h') {
    const timeLabel = reminderType === '24h' ? 'tomorrow' : 'in 1 hour';
    const flight = tournament.flight_label ? ` (${tournament.flight_label})` : '';
    return sendPushNotification({
        userId,
        title: `TOURNAMENT ${reminderType === '24h' ? 'TOMORROW' : 'STARTING SOON'}`,
        message: `${tournament.name}${flight} starts ${timeLabel}!`,
        url: '/hub/my-tournaments',
        data: {
            type: 'tournament_reminder',
            tournamentId: tournament.id,
            reminderType
        }
    });
}

/**
 * Notify user of multi-day flight resume
 */
export async function notifyFlightResume(userId, tournament, nextFlightTime) {
    const resumeStr = new Date(nextFlightTime).toLocaleString('en-US', {
        weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true
    });
    const flight = tournament.flight_label || 'Next Day';
    return sendPushNotification({
        userId,
        title: 'FLIGHT RESUMES',
        message: `${tournament.name} - ${flight} resumes ${resumeStr}. Bring your bag!`,
        url: '/hub/my-tournaments',
        data: {
            type: 'flight_resume',
            tournamentId: tournament.id,
            resumeTime: nextFlightTime
        }
    });
}

export default {
    notifyAchievementUnlock,
    notifyChallengeComplete,
    notifyStreakMilestone,
    notifyLeaderboardRank,
    notifyDailyBonus,
    notifyPerfectRound,
    notifyTournamentReminder,
    notifyFlightResume
};
