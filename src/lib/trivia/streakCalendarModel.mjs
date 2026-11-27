/**
 * Pure deterministic 30-day Chicago-timezone streak calendar, milestone countdown,
 * and "Weakest Spot Of The Week" spotlight helpers for /hub/trivia/stats.
 *
 * Zero DOM, browser globals, or network dependencies so Node unit tests can import directly.
 */
import {
    STREAK_MILESTONES,
    STREAK_MILESTONE_REWARDS,
    computeStreakMilestoneProgress,
} from './streakMilestoneModel.mjs';
import {
    DEFAULT_TRAINING_SPOT,
    getTrainingSpotForCategory,
} from './trainingSpotMap.mjs';

const CHICAGO_TZ = 'America/Chicago';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHORT_MONTHS = Object.freeze([
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

export const THIRTY_DAY_CALENDAR_LENGTH = 30;

/**
 * Format a Date instance into an authoritative America/Chicago YYYY-MM-DD key.
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function getChicagoDateString(now = new Date()) {
    const safeDate = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: CHICAGO_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(safeDate);
}

/**
 * Subtract N calendar days from an ISO YYYY-MM-DD anchor using UTC noon so DST
 * transitions in America/Chicago never skip or duplicate a day.
 * @param {string} anchorDate
 * @param {number} daysBack
 * @returns {string}
 */
export function shiftChicagoDate(anchorDate, daysBack) {
    const base = ISO_DATE_RE.test(String(anchorDate || ''))
        ? String(anchorDate)
        : getChicagoDateString();
    const dt = new Date(`${base}T12:00:00.000Z`);
    dt.setUTCDate(dt.getUTCDate() - Math.trunc(Number(daysBack) || 0));
    return dt.toISOString().slice(0, 10);
}

function normalizeDateSet(input) {
    const set = new Set();
    if (!input) return set;
    const iterable = input instanceof Set || Array.isArray(input) ? input : [];
    for (const item of iterable) {
        const raw = typeof item === 'string'
            ? item.trim()
            : typeof item === 'object' && item !== null
                ? String(item.played_date ?? item.play_date ?? item.missed_date ?? item.date ?? '').trim()
                : '';
        if (ISO_DATE_RE.test(raw)) {
            set.add(raw);
        }
    }
    return set;
}

function formatShortDateLabel(isoDate) {
    const monthIndex = Number.parseInt(isoDate.slice(5, 7), 10) - 1;
    const dayOfMonth = Number.parseInt(isoDate.slice(8, 10), 10);
    const monthName = SHORT_MONTHS[monthIndex] || 'Day';
    return {
        shortLabel: `${monthName} ${dayOfMonth}`,
        dayOfMonth,
    };
}

/**
 * Build an exact 30-day ascending calendar ending on `todayChicago` (YYYY-MM-DD),
 * plus active day counts and the next streak milestone countdown.
 */
export function buildThirtyDayStreakCalendar({
    todayChicago,
    playedDates = [],
    freezeDates = [],
    currentStreak = 0,
    bestStreak = 0,
} = {}) {
    const anchor = ISO_DATE_RE.test(String(todayChicago || '').trim())
        ? String(todayChicago).trim()
        : getChicagoDateString();

    const playedSet = normalizeDateSet(playedDates);
    const freezeSet = normalizeDateSet(freezeDates);

    const days = [];
    let activeDaysIn30 = 0;
    let freezeSavedDaysIn30 = 0;

    for (let index = 0; index < THIRTY_DAY_CALENDAR_LENGTH; index += 1) {
        const daysBack = THIRTY_DAY_CALENDAR_LENGTH - 1 - index;
        const date = shiftChicagoDate(anchor, daysBack);
        const isToday = date === anchor;
        const { shortLabel, dayOfMonth } = formatShortDateLabel(date);

        let status = 'missed';
        if (playedSet.has(date)) {
            status = 'played';
            activeDaysIn30 += 1;
        } else if (freezeSet.has(date)) {
            status = 'freeze_saved';
            freezeSavedDaysIn30 += 1;
        } else if (isToday) {
            status = 'today_pending';
        }

        days.push({
            date,
            shortLabel,
            dayOfMonth,
            status,
            isToday,
        });
    }

    const safeCurrent = Number.isFinite(Number(currentStreak))
        ? Math.max(0, Math.floor(Number(currentStreak)))
        : 0;
    const safeBest = Number.isFinite(Number(bestStreak))
        ? Math.max(safeCurrent, Math.floor(Number(bestStreak)))
        : safeCurrent;

    const milestoneProgress = computeStreakMilestoneProgress(safeCurrent);
    const highestMilestone = STREAK_MILESTONES[STREAK_MILESTONES.length - 1];
    const nextMilestone = milestoneProgress.nextMilestone !== null
        ? {
            targetDays: milestoneProgress.nextMilestone,
            rewardDiamonds: STREAK_MILESTONE_REWARDS[milestoneProgress.nextMilestone] ?? 0,
            daysRemaining: milestoneProgress.daysRemaining,
            progressPct: milestoneProgress.progressPct,
            allMilestonesReached: false,
        }
        : {
            targetDays: highestMilestone,
            rewardDiamonds: STREAK_MILESTONE_REWARDS[highestMilestone] ?? 500,
            daysRemaining: 0,
            progressPct: 100,
            allMilestonesReached: true,
        };

    return {
        todayChicago: anchor,
        windowStart: days[0].date,
        windowEnd: days[days.length - 1].date,
        days,
        activeDaysIn30,
        freezeSavedDaysIn30,
        currentStreak: safeCurrent,
        bestStreak: safeBest,
        nextMilestone,
    };
}

/**
 * Identify the player's lowest-accuracy answered category and map it to its
 * authoritative World Hub Training destination via trainingSpotMap.mjs.
 */
export function deriveWeakestCategorySpotlight(categoryStats) {
    if (!Array.isArray(categoryStats) || categoryStats.length === 0) return null;

    const candidates = [];
    for (const row of categoryStats) {
        if (!row || typeof row !== 'object') continue;
        const category = typeof row.category === 'string' ? row.category.trim() : '';
        if (!category) continue;
        const rawTotal = row.total ?? row.total_answered;
        const rawCorrect = row.correct ?? row.correct_count;
        const total = Number.isFinite(Number(rawTotal)) ? Math.max(0, Math.floor(Number(rawTotal))) : 0;
        if (total < 1) continue;
        const correct = Number.isFinite(Number(rawCorrect))
            ? Math.min(total, Math.max(0, Math.floor(Number(rawCorrect))))
            : 0;
        const ratio = correct / total;
        const accuracyPct = Math.round(ratio * 100);
        candidates.push({ category, correct, total, ratio, accuracyPct });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
        if (a.ratio !== b.ratio) return a.ratio - b.ratio;
        if (b.total !== a.total) return b.total - a.total;
        return a.category.localeCompare(b.category);
    });

    const weakest = candidates[0];
    const spot = getTrainingSpotForCategory(weakest.category) || DEFAULT_TRAINING_SPOT;

    return {
        category: weakest.category,
        label: spot.categoryLabel || weakest.category,
        correct: weakest.correct,
        total: weakest.total,
        accuracyPct: weakest.accuracyPct,
        studyHref: '/hub/trivia/study',
        trainingHref: spot.href,
        trainingLabel: spot.label,
        specialty: spot.specialty,
    };
}

export { getTrainingSpotForCategory as getTriviaTrainingSpot, DEFAULT_TRAINING_SPOT };
