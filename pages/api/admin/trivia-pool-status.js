/**
 * TRIVIA QUESTION POOL STATUS
 * ═══════════════════════════════════════════════════════════════════════════
 * Admin endpoint reporting whether the pool is deep enough to honour the
 * 60-day no-repeat guarantee.
 *
 * GET /api/admin/trivia-pool-status - pool stats (ADMIN AUTH REQUIRED)
 * POST - gone (410); generation runs via the Open Claw cron.
 *
 * This route used to have NO authentication on GET at all — an /api/admin/*
 * endpoint publicly exposing per-category counts, difficulty gaps, 60-day
 * availability and capacity projections.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';
import { NO_REPEAT_WINDOW_DAYS, DEFAULT_QUALITY_FLOOR } from '../../../src/lib/triviaQuestionLoader';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn('[Trivia Pool Status] SUPABASE_SERVICE_ROLE_KEY missing — counts may be RLS-filtered');
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const CATEGORIES = [
    { id: 'poker_history', name: 'Poker History' },
    { id: 'famous_hands', name: 'Famous Hands' },
    { id: 'player_profiles', name: 'Player Profiles' },
    { id: 'tournament_facts', name: 'Tournament Facts' },
    { id: 'rule_knowledge', name: 'Rules & Etiquette' },
    { id: 'gto_theory', name: 'GTO Theory' },
    // New Strategy Categories - Feb 2026
    { id: 'mtt_situations', name: 'MTT Situations' },
    { id: 'cash_game_situations', name: 'Cash Game Situations' },
    { id: 'icm_chip_ev', name: 'ICM & Chip EV' },
    { id: 'gto_scenarios', name: 'GTO Scenarios' }
];

// ═══════════════════════════════════════════════════════════════════════════
// DEPTH MATH (this is what the 60-day guarantee actually costs)
// ═══════════════════════════════════════════════════════════════════════════
//
// A single-category 20-questions/day mode needs 20 x 60 = 1,200 USABLE
// (quality_score >= 6) questions IN THAT CATEGORY. Audit attrition demotes
// rows to qs 2-5, so a 1,500 RAW target leaves no headroom — hence 2,000.
//
// Survival burns 200 questions per run (10 levels x 20) drawn from the whole
// pool, so it needs 200 x 60 = 12,000 usable across all categories.
const TARGET_PER_CATEGORY = 2000;

/** Per-category usable floor required by a dedicated 20-q/day mode. */
const DEDICATED_MODE_QUESTIONS_PER_DAY = 20;
const SIXTY_DAY_FLOOR = DEDICATED_MODE_QUESTIONS_PER_DAY * NO_REPEAT_WINDOW_DAYS; // 1200 usable

/** Categories that back a dedicated single-category mode. */
const DEDICATED_MODE_CATEGORIES = new Set([
    'rule_knowledge',        // rules
    'mtt_situations',        // mtt
    'cash_game_situations',  // cash
    'icm_chip_ev',           // icm
]);

/** Survival draws from the whole pool. */
const SURVIVAL_QUESTIONS_PER_RUN = 200;
const SURVIVAL_SIXTY_DAY_FLOOR = SURVIVAL_QUESTIONS_PER_RUN * NO_REPEAT_WINDOW_DAYS; // 12000 usable

const TRACK_A_CATEGORIES = new Set(['gto_theory', 'gto_scenarios', 'cash_game_situations', 'mtt_situations', 'icm_chip_ev']);

/** head:true count for an arbitrary filter set. */
function countQuery(supabase, { category, difficulty, minQuality, unusedSince }) {
    let q = supabase.from('trivia_questions').select('id', { count: 'exact', head: true });
    if (category) q = q.eq('category', category);
    if (difficulty) q = q.eq('difficulty', difficulty);
    if (Number.isFinite(minQuality)) q = q.gte('quality_score', minQuality);
    if (unusedSince) q = q.or(`last_used_at.is.null,last_used_at.lt.${unusedSince}`);
    return q.then(({ count, error }) => {
        if (error) {
            console.warn('[Trivia Pool Status] count failed:', error.message);
            return null;
        }
        return count || 0;
    });
}

/**
 * Second accepted credential: a Supabase session token belonging to a profile
 * with an admin role. This is how the admin dashboard calls the route, so it
 * must keep working alongside the machine (CRON_SECRET) credential.
 *
 * Pure predicate — it never writes to `res`, so the caller can fall through to
 * requireAdminSecret(), which owns the 401/500 response.
 */
async function hasAdminRole(req) {
    const token = req.headers?.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null;
    if (!token) return false;
    try {
        const supabase = getSupabase();
        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        const authUser = authData?.user;
        if (authErr || !authUser) return false;
        const { data: prof } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', authUser.id)
            .maybeSingle();
        return !!prof && ['admin', 'superadmin', 'god'].includes(prof.role);
    } catch (err) {
        console.warn('[Trivia Pool Status] role lookup failed:', err?.message || err);
        return false;
    }
}

export default async function handler(req, res) {
  try {
    // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    // Auth is required for EVERY method, including GET. Either credential is
    // accepted: an admin/superadmin/god session token, or the machine secret.
    // Both paths are fail-closed — requireAdminSecret sends the 401/500 when
    // neither matches.
    if (!(await hasAdminRole(req)) && !requireAdminSecret(req, res, { label: 'trivia-pool-status' })) return;

    const supabase = getSupabase();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - NO_REPEAT_WINDOW_DAYS);
    const sixtyDaysAgoIso = sixtyDaysAgo.toISOString();

    // 6 counts x 10 categories, issued in parallel rather than 41 serial
    // round-trips (which took multiple seconds on every request).
    const perCategory = await Promise.all(CATEGORIES.map(async (cat) => {
        const [total, usable, easy, medium, hard, available] = await Promise.all([
            countQuery(supabase, { category: cat.id }),
            countQuery(supabase, { category: cat.id, minQuality: DEFAULT_QUALITY_FLOOR }),
            countQuery(supabase, { category: cat.id, difficulty: 'easy' }),
            countQuery(supabase, { category: cat.id, difficulty: 'medium' }),
            countQuery(supabase, { category: cat.id, difficulty: 'hard' }),
            // Availability must respect the quality floor — a question below
            // the floor is not servable no matter how long ago it was used.
            countQuery(supabase, {
                category: cat.id,
                minQuality: DEFAULT_QUALITY_FLOOR,
                unusedSince: sixtyDaysAgoIso,
            }),
        ]);
        return { cat, total, usable, easy, medium, hard, available };
    }));

    const stats = {};
    let totalQuestions = 0;
    let totalUsable = 0;

    for (const { cat, total, usable, easy, medium, hard, available } of perCategory) {
        const catTotal = total || 0;
        const catUsable = usable || 0;
        totalQuestions += catTotal;
        totalUsable += catUsable;

        // Per-difficulty targets follow the 20/50/30 split.
        const targetEasy = Math.floor(TARGET_PER_CATEGORY * 0.20);
        const targetMedium = Math.floor(TARGET_PER_CATEGORY * 0.50);
        const targetHard = Math.floor(TARGET_PER_CATEGORY * 0.30);

        const isDedicated = DEDICATED_MODE_CATEGORIES.has(cat.id);
        const requiredUsable = isDedicated ? SIXTY_DAY_FLOOR : 0;

        stats[cat.id] = {
            name: cat.name,
            track: TRACK_A_CATEGORIES.has(cat.id) ? 'A' : 'B',
            total: catTotal,
            usable: catUsable,
            below_floor: catTotal - catUsable,
            easy: easy || 0,
            medium: medium || 0,
            hard: hard || 0,
            target_easy: targetEasy,
            target_medium: targetMedium,
            target_hard: targetHard,
            gap_easy: Math.max(0, targetEasy - (easy || 0)),
            gap_medium: Math.max(0, targetMedium - (medium || 0)),
            gap_hard: Math.max(0, targetHard - (hard || 0)),
            // `available || catTotal` reported the FULL category total whenever
            // availability was legitimately 0 — hiding the exact exhaustion
            // this metric exists to detect.
            available: available ?? 0,
            target: TARGET_PER_CATEGORY,
            progress: `${Math.round((catTotal / TARGET_PER_CATEGORY) * 100)}%`,
            progress_pct: Math.round((catTotal / TARGET_PER_CATEGORY) * 100),
            needed: Math.max(0, TARGET_PER_CATEGORY - catTotal),
            backs_dedicated_mode: isDedicated,
            required_usable_for_60day: requiredUsable,
            below_60day_floor: isDedicated ? catUsable < requiredUsable : false,
            usable_shortfall: Math.max(0, requiredUsable - catUsable),
        };
    }

    const targetTotal = CATEGORIES.length * TARGET_PER_CATEGORY;
    const overallProgress = Math.round((totalQuestions / targetTotal) * 100);

    const poolStatus = {
        summary: {
            totalQuestions,
            usableQuestions: totalUsable,
            qualityFloor: DEFAULT_QUALITY_FLOOR,
            targetTotal,
            progress: `${overallProgress}%`,
            isComplete: totalQuestions >= targetTotal
        },
        // The old "capacity" block divided the shared pool by an invented
        // 225-questions-per-day figure and reported a playersSupported number
        // as if questions were consumed exclusively per player. They are not:
        // the pool is shared, and the real constraint is per-player 60-day
        // consumption. This reports that instead.
        guarantee: {
            windowDays: NO_REPEAT_WINDOW_DAYS,
            survival: {
                questionsPerRun: SURVIVAL_QUESTIONS_PER_RUN,
                requiredUsable: SURVIVAL_SIXTY_DAY_FLOOR,
                actualUsable: totalUsable,
                shortfall: Math.max(0, SURVIVAL_SIXTY_DAY_FLOOR - totalUsable),
                meetsGuarantee: totalUsable >= SURVIVAL_SIXTY_DAY_FLOOR,
                daysOfCoverage: Math.floor(totalUsable / SURVIVAL_QUESTIONS_PER_RUN),
            },
            standardMode: {
                questionsPerDay: DEDICATED_MODE_QUESTIONS_PER_DAY,
                requiredUsable: SIXTY_DAY_FLOOR,
                actualUsable: totalUsable,
                meetsGuarantee: totalUsable >= SIXTY_DAY_FLOOR,
                daysOfCoverage: Math.floor(totalUsable / DEDICATED_MODE_QUESTIONS_PER_DAY),
            },
        },
        categories: stats,
        recommendations: []
    };

    // Recommendations — plain-text prefixes (repo rule: no emoji in source).
    if (totalUsable < 1000) {
        poolStatus.recommendations.push('CRITICAL: Question pool too small. Run bulk generation immediately.');
    } else if (totalUsable < 5000) {
        poolStatus.recommendations.push('WARNING: Question pool is low. Schedule frequent cron runs.');
    } else if (totalQuestions < targetTotal) {
        poolStatus.recommendations.push('INFO: Pool growing. Continue scheduled cron runs.');
    } else {
        poolStatus.recommendations.push('SUCCESS: Question pool is complete.');
    }

    if (!poolStatus.guarantee.survival.meetsGuarantee) {
        poolStatus.recommendations.push(
            `CRITICAL: 60-day no-repeat guarantee is NOT met for Survival — ` +
            `${totalUsable} usable of ${SURVIVAL_SIXTY_DAY_FLOOR} required ` +
            `(short by ${poolStatus.guarantee.survival.shortfall}).`
        );
    }

    const belowFloorCats = Object.values(stats).filter(s => s.below_60day_floor);
    if (belowFloorCats.length > 0) {
        poolStatus.recommendations.push(
            `CRITICAL: Below the 60-day usable floor: ${belowFloorCats.map(c => `${c.name} (${c.usable}/${c.required_usable_for_60day})`).join(', ')}`
        );
    }

    const exhausted = Object.values(stats).filter(s => s.available === 0 && s.total > 0);
    if (exhausted.length > 0) {
        poolStatus.recommendations.push(
            `WARNING: Every question used within ${NO_REPEAT_WINDOW_DAYS} days in: ${exhausted.map(c => c.name).join(', ')}`
        );
    }

    const demotionHeavy = Object.values(stats).filter(s => s.total > 0 && s.below_floor / s.total > 0.15);
    if (demotionHeavy.length > 0) {
        poolStatus.recommendations.push(
            `WARNING: Over 15 percent of questions are below the quality floor in: ${demotionHeavy.map(c => c.name).join(', ')}`
        );
    }

    const lowCategories = Object.values(stats).filter(s => s.total < TARGET_PER_CATEGORY / 3);
    if (lowCategories.length > 0) {
        poolStatus.recommendations.push(
            `PRIORITY: Focus on ${lowCategories.map(c => c.name).join(', ')}`
        );
    }

    // POST manual-trigger removed 2026-04-27 (Phase 2B.3 Option B).
    // Generation now runs daily at 04:30 UTC via Open Claw on Hetzner.
    if (req.method === 'POST') {
        return res.status(410).json({
            ...poolStatus,
            bulkGeneration: {
                triggered: false,
                error: 'Manual bulk-generation removed. Generation now runs daily at 04:30 UTC via Open Claw -> workers VM. Stats endpoint (GET) still works.',
                nextScheduledRun: 'Daily 04:30 UTC',
            }
        });
    }

    return res.status(200).json(poolStatus);

  } catch (error) {
      try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[Trivia Pool Status] Error:', error);
      if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
