/**
 * TRIVIA POOL DEPTH WATCHDOG
 * ═══════════════════════════════════════════════════════════════════════════
 * Read-only. Spends no Grok tokens. Answers exactly one question:
 *
 *   "Is the question pool still deep enough that no player repeats a question
 *    within 60 days — and if not, by how many questions are we short, where?"
 *
 * The 60-day promise has been aspirational: nothing computed the requirement,
 * nothing compared it to reality, and nothing complained when the pool fell
 * below it. This route makes the shortfall a number that shows up in logs
 * every day, and returns HTTP 200 with `healthy:false` (not an error status, so
 * Vercel does not retry a job that has nothing to retry).
 *
 * DEPTH MATH
 *   required(category) = questionsServedPerDay(mode backed by that category)
 *                        x NO_REPEAT_WINDOW_DAYS
 *   Four modes are single-category and serve 20/day => 20 x 60 = 1,200 usable
 *   (quality_score >= 6) rows needed in rule_knowledge, mtt_situations,
 *   cash_game_situations and icm_chip_ev respectively.
 *   Multi-category modes split their 20/day across their categories.
 *   Survival draws 200/run from the WHOLE pool => 200 x 60 = 12,000 usable.
 *   Headroom multiplier covers audit attrition (rows demoted below qs 6).
 *
 * GET /api/cron/trivia-pool-guard        (admin/cron secret required)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import {
    getPoolDepthReport,
    NO_REPEAT_WINDOW_DAYS,
    DEFAULT_QUALITY_FLOOR,
} from '../../../src/lib/triviaQuestionLoader';
import { reportApiError } from '../../../src/lib/sentryWrap';

export const config = { maxDuration: 60 };

/** category -> questions that category must supply per player per day. */
export const CATEGORY_DAILY_DEMAND = {
    // Dedicated single-category modes (20 questions/day each).
    rule_knowledge: 20,          // rules
    mtt_situations: 20,          // mtt
    cash_game_situations: 20,    // cash
    icm_chip_ev: 20,             // icm
    // Multi-category modes split 20/day across their categories.
    poker_history: 7,            // history (3 categories)
    famous_hands: 7,             // history
    player_profiles: 7,          // history
    tournament_facts: 10,        // pro (2 categories)
    gto_theory: 10,              // pro + gto
    gto_scenarios: 10,           // gto
};

const CATEGORY_NAMES = {
    poker_history: 'Poker History',
    famous_hands: 'Famous Hands',
    player_profiles: 'Player Profiles',
    tournament_facts: 'Tournament Facts',
    rule_knowledge: 'Rules & Etiquette',
    gto_theory: 'GTO Theory',
    mtt_situations: 'MTT Situations',
    cash_game_situations: 'Cash Game Situations',
    icm_chip_ev: 'ICM & Chip EV',
    gto_scenarios: 'GTO Scenarios',
};

/** Survival burns 10 levels x 20 questions from the shared pool. */
const SURVIVAL_QUESTIONS_PER_RUN = 200;

/** Audit attrition headroom — the audit demotes a slice of every category. */
const DEPTH_HEADROOM = 1.25;

/** Daily roster size per category, written by /api/cron/generate-trivia. */
const ROSTER_PER_CATEGORY = 20;

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    return createClient(url, key);
}

export default async function handler(req, res) {
    try {
        if (!requireAdminSecret(req, res, { label: 'trivia-pool-guard' })) return;

        const supabase = getSupabase();
        const today = getTodayCST();
        const ids = Object.keys(CATEGORY_DAILY_DEMAND);

        const rows = await Promise.all(ids.map(async (id) => {
            const perDay = CATEGORY_DAILY_DEMAND[id];
            const [report, rosterCount] = await Promise.all([
                getPoolDepthReport(supabase, {
                    category: id,
                    minQuality: DEFAULT_QUALITY_FLOOR,
                    questionsPerDay: perDay,
                    windowDays: NO_REPEAT_WINDOW_DAYS,
                }),
                supabase
                    .from('trivia_questions')
                    .select('id', { count: 'exact', head: true })
                    .eq('category', id)
                    .eq('daily_date', today)
                    .gte('quality_score', DEFAULT_QUALITY_FLOOR)
                    .then(({ count }) => count || 0),
            ]);
            const recommended = Math.ceil(report.required * DEPTH_HEADROOM);
            return [id, {
                name: CATEGORY_NAMES[id] || id,
                questionsPerDay: perDay,
                total: report.total,
                usable: report.usable,
                belowFloor: report.total - report.usable,
                required: report.required,
                recommendedWithHeadroom: recommended,
                shortfall: report.shortfall,
                shortfallWithHeadroom: Math.max(0, recommended - report.usable),
                daysOfCoverage: report.daysOfCoverage,
                meetsGuarantee: report.meetsGuarantee,
                rosterToday: rosterCount,
                rosterComplete: rosterCount >= ROSTER_PER_CATEGORY,
            }];
        }));

        const categories = Object.fromEntries(rows);

        const survivalReport = await getPoolDepthReport(supabase, {
            minQuality: DEFAULT_QUALITY_FLOOR,
            questionsPerDay: SURVIVAL_QUESTIONS_PER_RUN,
            windowDays: NO_REPEAT_WINDOW_DAYS,
        });

        const below = Object.entries(categories).filter(([, c]) => !c.meetsGuarantee);
        const rosterGaps = Object.entries(categories).filter(([, c]) => !c.rosterComplete);
        const totalShortfall = Object.values(categories).reduce((s, c) => s + c.shortfall, 0);
        const totalShortfallWithHeadroom = Object.values(categories)
            .reduce((s, c) => s + c.shortfallWithHeadroom, 0);

        const actions = [];
        for (const [id, c] of below) {
            actions.push(
                `node scripts/trivia-grok-seed.js --live --category=${id} --target=${c.recommendedWithHeadroom} ` +
                `(short ${c.shortfall} usable of ${c.required})`
            );
        }
        if (!survivalReport.meetsGuarantee) {
            actions.push(
                `Survival needs ${survivalReport.required} usable pool-wide; have ${survivalReport.usable} ` +
                `(short ${survivalReport.shortfall}).`
            );
        }
        if (rosterGaps.length > 0) {
            actions.push(
                `Daily roster incomplete for ${today} in: ${rosterGaps.map(([id]) => id).join(', ')} — ` +
                'invoke /api/cron/generate-trivia?rosterOnly=1'
            );
        }

        const healthy = below.length === 0 && survivalReport.meetsGuarantee && rosterGaps.length === 0;

        if (!healthy) {
            console.warn(
                `[TriviaPoolGuard] UNHEALTHY — ${below.length} categories below the ` +
                `${NO_REPEAT_WINDOW_DAYS}-day floor, total shortfall ${totalShortfall} usable questions.`
            );
        }

        return res.status(200).json({
            healthy,
            checkedAt: new Date().toISOString(),
            todayCST: today,
            windowDays: NO_REPEAT_WINDOW_DAYS,
            qualityFloor: DEFAULT_QUALITY_FLOOR,
            headroomMultiplier: DEPTH_HEADROOM,
            categories,
            survival: {
                questionsPerRun: SURVIVAL_QUESTIONS_PER_RUN,
                required: survivalReport.required,
                usable: survivalReport.usable,
                shortfall: survivalReport.shortfall,
                daysOfCoverage: survivalReport.daysOfCoverage,
                meetsGuarantee: survivalReport.meetsGuarantee,
            },
            totals: {
                usable: survivalReport.usable,
                total: survivalReport.total,
                shortfall: totalShortfall,
                shortfallWithHeadroom: totalShortfallWithHeadroom,
                categoriesBelowFloor: below.map(([id]) => id),
            },
            actions,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
        console.warn('[TriviaPoolGuard] fatal:', err?.message || err);
        if (!res.headersSent) {
            return res.status(500).json({ healthy: false, error: err?.message || 'Internal server error' });
        }
    }
}
