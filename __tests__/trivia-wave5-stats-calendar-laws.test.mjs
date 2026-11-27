/**
 * Wave 5 Track 2 (30-Day Chicago-Timezone Streak Calendar, Next Milestone Countdown
 * & "Weakest Spot Of The Week" Spotlight on /hub/trivia/stats) Anti-Regression Laws:
 *
 *  1. Pure deterministic buildThirtyDayStreakCalendar in streakCalendarModel.mjs:
 *     - Always returns exact 30 ascending days ending on todayChicago (YYYY-MM-DD).
 *     - Handles DST transitions and month/year rollovers without skipping or duplicating days.
 *     - Classifies played, freeze_saved, today_pending, and missed with strict precedence
 *       (played > freeze_saved > today_pending > missed) and counts activeDaysIn30 accurately.
 *     - Computes nextMilestone strictly from authoritative STREAK_MILESTONES and
 *       STREAK_MILESTONE_REWARDS in streakMilestoneModel.mjs (7->25, 14->50, 30->150, 100->500).
 *  2. Pure deterministic deriveWeakestCategorySpotlight in streakCalendarModel.mjs:
 *     - Filters out unanswered categories (total < 1) and returns null when none exist.
 *     - Selects the lowest-accuracy category deterministically (tie-breaking on higher volume,
 *       then alphabetical category) and maps through authoritative trainingSpotMap.mjs.
 *  3. Source-contract & #SMARTERDESIGN Fortress on pages/hub/trivia/stats.js:
 *     - Renders data-streak-calendar="true", data-next-milestone-countdown="true", and
 *       data-weakest-spot-spotlight="true" with accessible aria-labels and >= 44px .sd-button CTAs.
 *     - Queries authoritative tables (daily_trivia_plays, trivia_streaks, trivia_scores,
 *       trivia_user_items) and NEVER references nonexistent user_trivia_items.
 *     - Zero forbidden yellow/gold/amber/orange/purple/pink hex colors, zero text-transform: uppercase,
 *       and zero :hover rules.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    DEFAULT_TRAINING_SPOT,
    THIRTY_DAY_CALENDAR_LENGTH,
    buildThirtyDayStreakCalendar,
    deriveWeakestCategorySpotlight,
    getChicagoDateString,
    shiftChicagoDate,
} from '../src/lib/trivia/streakCalendarModel.mjs';
import {
    STREAK_MILESTONES,
    STREAK_MILESTONE_REWARDS,
} from '../src/lib/trivia/streakMilestoneModel.mjs';
import { TRAINING_SPOT_MAP } from '../src/lib/trivia/trainingSpotMap.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function hexToRgb(hex) {
    let raw = hex.slice(1);
    if (raw.length === 3) raw = raw.split('').map((c) => c + c).join('');
    if (raw.length !== 6) return null;
    return [
        Number.parseInt(raw.slice(0, 2), 16),
        Number.parseInt(raw.slice(2, 4), 16),
        Number.parseInt(raw.slice(4, 6), 16),
    ];
}

function isForbiddenHueHex(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta < 25) return false;
    let hue = 0;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
    return (hue >= 15 && hue <= 75) || (hue >= 255 && hue <= 345);
}

test('Wave 5 Stats Law 1: buildThirtyDayStreakCalendar builds exact 30 ascending Chicago days and enforces status precedence', () => {
    const today = '2026-11-26';
    const calendar = buildThirtyDayStreakCalendar({
        todayChicago: today,
        playedDates: ['2026-11-25', '2026-11-24', '2026-11-20', '2026-10-01'],
        freezeDates: ['2026-11-23', '2026-11-24'], // 2026-11-24 also played -> played wins
        currentStreak: 4,
        bestStreak: 9,
    });

    assert.equal(calendar.days.length, THIRTY_DAY_CALENDAR_LENGTH);
    assert.equal(calendar.days.length, 30);
    assert.equal(calendar.windowStart, '2026-10-28');
    assert.equal(calendar.windowEnd, '2026-11-26');
    assert.equal(calendar.days[0].date, '2026-10-28');
    assert.equal(calendar.days[29].date, '2026-11-26');
    assert.equal(calendar.days[29].isToday, true);
    assert.equal(calendar.days[29].status, 'today_pending');

    // Verify strictly ascending unique dates across DST boundary (Nov 1, 2026)
    const uniqueDates = new Set(calendar.days.map((d) => d.date));
    assert.equal(uniqueDates.size, 30);
    for (let i = 1; i < calendar.days.length; i += 1) {
        assert.ok(calendar.days[i].date > calendar.days[i - 1].date, 'calendar dates must be strictly ascending');
    }

    const byDate = Object.fromEntries(calendar.days.map((d) => [d.date, d]));
    assert.equal(byDate['2026-11-25'].status, 'played');
    assert.equal(byDate['2026-11-24'].status, 'played', 'played takes precedence over freeze_saved');
    assert.equal(byDate['2026-11-23'].status, 'freeze_saved');
    assert.equal(byDate['2026-11-22'].status, 'missed');
    assert.equal(byDate['2026-11-26'].shortLabel, 'Nov 26');
    assert.equal(byDate['2026-11-26'].dayOfMonth, 26);

    // Out-of-window date (2026-10-01) must not inflate activeDaysIn30
    assert.equal(calendar.activeDaysIn30, 3);
    assert.equal(calendar.freezeSavedDaysIn30, 1);

    // Next milestone for 4-day streak is 7-day (+25 Diamonds, 3 days left, 57%)
    assert.equal(calendar.nextMilestone.targetDays, STREAK_MILESTONES[0]);
    assert.equal(calendar.nextMilestone.rewardDiamonds, STREAK_MILESTONE_REWARDS[7]);
    assert.equal(calendar.nextMilestone.daysRemaining, 3);
    assert.equal(calendar.nextMilestone.progressPct, 57);
    assert.equal(calendar.nextMilestone.allMilestonesReached, false);
});

test('Wave 5 Stats Law 2: buildThirtyDayStreakCalendar handles played today, milestone tiers, and Chicago TZ rollover', () => {
    // 2026-11-27T02:30:00Z is still 2026-11-26 20:30 CST in America/Chicago
    const chicagoDate = getChicagoDateString(new Date('2026-11-27T02:30:00.000Z'));
    assert.equal(chicagoDate, '2026-11-26');
    assert.equal(shiftChicagoDate('2026-03-01', 1), '2026-02-28');

    const playedToday = buildThirtyDayStreakCalendar({
        todayChicago: '2026-11-26',
        playedDates: [{ played_date: '2026-11-26' }],
        currentStreak: 14,
        bestStreak: 14,
    });
    assert.equal(playedToday.days[29].status, 'played');
    assert.equal(playedToday.days[29].isToday, true);
    assert.equal(playedToday.nextMilestone.targetDays, 30);
    assert.equal(playedToday.nextMilestone.rewardDiamonds, STREAK_MILESTONE_REWARDS[30]);
    assert.equal(playedToday.nextMilestone.daysRemaining, 16);

    const mastered = buildThirtyDayStreakCalendar({
        todayChicago: '2026-11-26',
        currentStreak: 120,
        bestStreak: 120,
    });
    assert.equal(mastered.nextMilestone.allMilestonesReached, true);
    assert.equal(mastered.nextMilestone.targetDays, 100);
    assert.equal(mastered.nextMilestone.daysRemaining, 0);
    assert.equal(mastered.nextMilestone.progressPct, 100);
});

test('Wave 5 Stats Law 3: deriveWeakestCategorySpotlight picks lowest accuracy and maps via trainingSpotMap.mjs', () => {
    assert.equal(deriveWeakestCategorySpotlight([]), null);
    assert.equal(deriveWeakestCategorySpotlight([{ category: 'gto_theory', correct: 0, total: 0 }]), null);

    const spot = deriveWeakestCategorySpotlight([
        { category: 'poker_history', correct: 9, total: 10 },
        { category: 'icm_chip_ev', correct_count: 3, total_answered: 8 },
        { category: 'cash_game_situations', correct: 6, total: 10 },
    ]);

    assert.ok(spot);
    assert.equal(spot.category, 'icm_chip_ev');
    assert.equal(spot.correct, 3);
    assert.equal(spot.total, 8);
    assert.equal(spot.accuracyPct, 38);
    assert.equal(spot.studyHref, '/hub/trivia/study');
    assert.equal(spot.trainingHref, TRAINING_SPOT_MAP.icm_chip_ev.href);
    assert.equal(spot.trainingLabel, TRAINING_SPOT_MAP.icm_chip_ev.label);

    // Unknown category safely falls back to DEFAULT_TRAINING_SPOT
    const unknownSpot = deriveWeakestCategorySpotlight([
        { category: 'unmapped_custom_cat', correct: 1, total: 5 },
    ]);
    assert.ok(unknownSpot);
    assert.equal(unknownSpot.trainingHref, DEFAULT_TRAINING_SPOT.href);
});

test('Wave 5 Stats Law 4: pages/hub/trivia/stats.js wires calendar, weakest spot, real tables, and #SMARTERDESIGN fortress', () => {
    const src = read('pages/hub/trivia/stats.js');
    const modelSrc = read('src/lib/trivia/streakCalendarModel.mjs');

    assert.match(src, /data-streak-calendar="true"/, 'stats.js must render 30-day streak calendar');
    assert.match(src, /data-next-milestone-countdown="true"/, 'stats.js must render next milestone countdown');
    assert.match(src, /data-weakest-spot-spotlight="true"/, 'stats.js must render weakest spot spotlight');
    assert.match(src, /30-Day Streak Calendar \(Chicago Time\)/);
    assert.match(src, /Weakest Spot Of The Week/);
    assert.match(src, /Quiz My Misses/);
    assert.match(src, /Train This Spot/);
    assert.match(src, /className="sd-button/);
    assert.match(src, /\.from\('daily_trivia_plays'\)/, 'stats.js must query authoritative daily_trivia_plays');
    assert.match(src, /\.from\('trivia_streaks'\)/, 'stats.js must query authoritative trivia_streaks');
    assert.match(src, /\.from\('trivia_scores'\)/, 'stats.js must query authoritative trivia_scores');
    assert.match(src, /\.from\('trivia_user_items'\)/, 'stats.js must query authoritative trivia_user_items');
    assert.doesNotMatch(src, /user_trivia_items/, 'stats.js must NEVER reference nonexistent user_trivia_items');

    // #SMARTERDESIGN Fortress: 0 forbidden colors, 0 uppercase, 0 :hover
    for (const [label, text] of [['pages/hub/trivia/stats.js', src], ['src/lib/trivia/streakCalendarModel.mjs', modelSrc]]) {
        const hexes = text.match(/#[0-9a-fA-F]{3,6}\b/g) || [];
        const forbidden = hexes.filter((hex) => isForbiddenHueHex(hex));
        assert.deepEqual(forbidden, [], `${label} must contain 0 forbidden yellow/gold/amber/purple/pink colors`);
        assert.doesNotMatch(text, /text-transform:\s*uppercase|textTransform:\s*['"]uppercase['"]/i, `${label} must contain 0 uppercase transforms`);
        assert.doesNotMatch(text, /:hover\b/, `${label} must contain 0 :hover styles`);
    }
});
