/**
 * 🔔 TRAINING NOTIFICATIONS UTILITY
 * ═══════════════════════════════════════════════════════════════════════════
 * Send push notifications for training achievements, challenges, and milestones
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://smarter.poker';

/**
 * Send push notification via OneSignal
 */
async function sendPushNotification({ userId, title, message, url, data }) {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        console.warn('[TrainingNotifications] OneSignal not configured');
        return false;
    }

    try {
        const notification = {
            app_id: ONESIGNAL_APP_ID,
            contents: { en: message },
            headings: { en: title },
            url: url ? `${BASE_URL}${url}` : undefined,
            web_url: url ? `${BASE_URL}${url}` : undefined,
            include_external_user_ids: [userId],
            channel_for_external_user_ids: 'push',
            data: data || {},
            ios_sound: 'default',
            android_sound: 'default',
            priority: 10,
            android_visibility: 1,
        };

        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
            },
            body: JSON.stringify(notification),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('[TrainingNotifications] OneSignal error:', result);
            return false;
        }

        console.log('[TrainingNotifications] Sent:', title, 'to', userId);
        return true;
    } catch (error) {
        console.error('[TrainingNotifications] Error:', error);
        return false;
    }
}

/**
 * Notify user of achievement unlock
 */
export async function notifyAchievementUnlock(userId, achievement) {
    return sendPushNotification({
        userId,
        title: '🏅 Achievement Unlocked!',
        message: `${achievement.icon || '🏆'} ${achievement.name} - ${achievement.diamondReward || 0}💎 earned!`,
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
        title: `🎯 ${typeLabel} Challenge Complete!`,
        message: `${challenge.icon || '🏆'} ${challenge.name} - Claim your ${challenge.diamond_reward || 0}💎 reward!`,
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
        title: '🔥 Streak Milestone!',
        message: `${streakDays}-day training streak achieved! Claim your ${reward}💎 reward!`,
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
        title: '🏆 Leaderboard Update!',
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
        title: '💎 Daily Bonus Ready!',
        message: `Your ${bonusAmount}💎 daily training bonus is waiting! Start a session to claim it.`,
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
        title: '💎 Perfect Round!',
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
