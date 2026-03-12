/**
 * 🟢 HORSE PRESENCE UTILITY (Client-Side)
 * ═══════════════════════════════════════════════════════════════════════════
 * Pure-math presence check for horse profiles.
 * Determines if a horse is "online" based on its deterministic schedule.
 * No DB calls — uses the same hash algorithm as HorseScheduler.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

function getHorseSlotClient(profileId) {
    if (!profileId) return 0;
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
        const char = profileId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash) % 60;
}

const ACTIVE_HOUR_PATTERNS = [
    { start: 6, end: 18 },
    { start: 8, end: 20 },
    { start: 10, end: 22 },
    { start: 12, end: 0 },
    { start: 14, end: 2 },
    { start: 16, end: 4 },
    { start: 18, end: 6 },
    { start: 20, end: 8 },
    { start: 22, end: 10 },
    { start: 0, end: 12 },
];

/**
 * Check if a horse profile is currently "online"
 * @param {string} profileId - The profile UUID
 * @returns {boolean}
 */
export function isHorseOnlineNow(profileId) {
    if (!profileId) return false;
    const hash = getHorseSlotClient(profileId);
    const { start, end } = ACTIVE_HOUR_PATTERNS[hash % ACTIVE_HOUR_PATTERNS.length];
    const currentHour = new Date().getHours();

    if (start <= end) {
        return currentHour >= start && currentHour <= end;
    } else {
        return currentHour >= start || currentHour <= end;
    }
}
