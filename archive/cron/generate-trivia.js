/**
 * ARCHIVED — SUPERSEDED BY pages/api/cron/generate-trivia.js
 * ═══════════════════════════════════════════════════════════════════════════
 * DO NOT REVIVE THIS FILE. The live daily generation job is:
 *
 *     pages/api/cron/generate-trivia.js
 *     scheduled in vercel.json as { "path": "/api/cron/generate-trivia",
 *                                   "schedule": "5 5 * * *" }
 *
 * The previous contents of this file were dangerous to resurrect and are kept
 * only as this record of what was wrong with them:
 *
 *  1. AUTH BYPASS (critical). The gate was
 *       if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
 *           if (NODE_ENV === 'production' && req.method !== 'POST') return 401;
 *       }
 *     so ANY unauthenticated POST in production ran the job — 10 paid grok-3
 *     calls plus service-role inserts, repeatable by anyone. The replacement
 *     uses requireAdminSecret() from src/lib/trivia/adminAuth.js: fail-closed,
 *     constant-time, header-only, with no method or NODE_ENV exception.
 *
 *  2. RLS-SILENT WRITES. getSupabase() fell back to NEXT_PUBLIC_SUPABASE_ANON_KEY
 *     when SUPABASE_SERVICE_ROLE_KEY was absent, so every insert was rejected by
 *     RLS while the handler still reported success. The replacement throws.
 *
 *  3. COVERAGE. It generated 10 questions/day across only the 6 fact categories.
 *     The four strategy categories (mtt_situations, cash_game_situations,
 *     icm_chip_ev, gto_scenarios) were never generated at all, and 10 rows could
 *     never satisfy pages/hub/trivia/[mode].js STEP 1, which needs >= 20 matching
 *     daily rows per mode. The replacement generates across all 10 categories and
 *     tags a 20-question daily roster PER CATEGORY.
 *
 *  4. TIMEZONE. It ran at 05:59 UTC and called a locally duplicated getTodayCST().
 *     During CST that timestamp is 23:59 the PREVIOUS Chicago day, so half the
 *     year the roster was dated for a day that ended one minute later. The
 *     replacement imports src/lib/trivia/getTodayCST.js and tags the Chicago day
 *     in effect 90 minutes ahead, which is correct in both CST and CDT.
 *
 *  5. RELIABILITY. Ten sequential grok-3 calls plus 500ms sleeps under
 *     maxDuration:60, with a single all-or-nothing insert at the very end: a
 *     timeout lost the whole day. The replacement batches one call per
 *     (category, difficulty), inserts incrementally, runs under maxDuration 300
 *     with an internal wall-clock budget, and returns a resumable cursor.
 *
 *  6. BROKEN IMPORTS. From archive/cron/ the '../../../src/lib/...' specifiers
 *     resolve ABOVE the repo root (they were written for pages/api/cron/), so
 *     this module could not even be loaded.
 *
 *  7. WEAK DEDUP. Duplicate avoidance was a prompt hint listing 50 recent
 *     question texts, with no membership check before insert. The replacement
 *     checks a normalized-text Set per category in code and passes it to
 *     validateBatch({ existingTexts }).
 *
 * This module intentionally exports nothing runnable.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const SUPERSEDED_BY = 'pages/api/cron/generate-trivia.js';

export default function archivedTriviaGenerator() {
    throw new Error(
        'archive/cron/generate-trivia.js is archived and unsafe to run. ' +
        'Use pages/api/cron/generate-trivia.js (scheduled in vercel.json).'
    );
}
