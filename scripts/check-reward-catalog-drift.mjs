#!/usr/bin/env node
/**
 * REWARD CATALOG DRIFT CHECK
 * ═══════════════════════════════════════════════════════════════════════════
 * Compares public.diamond_reward_catalog (what award_diamonds_v2 actually
 * reads) against src/config/diamondRewards.js (what everyone believes the
 * economy does).
 *
 * WHY THIS EXISTS
 *   On 2026-08-05 a manual diff found five fields where the two disagreed,
 *   and the table wins every time:
 *     - easter_egg.counts_toward_daily_cap was true, so 500 ◆ legendary eggs
 *       were clamped to the 110/150 daily cap and the excess was discarded
 *       while the ledger row was still written — the store page meanwhile
 *       promised users that eggs pay "on top of your normal daily cap"
 *     - first_training_session.lifetime was false, so a once-ever 15 ◆ bonus
 *       was repayable daily
 *     - referral_vip_conversion.max_per_day was NULL on a 500 ◆ action with
 *       no other periodic rule
 *   Nothing in the codebase compared them, so all five sat there silently.
 *   This script is that comparison.
 *
 * USAGE
 *   node scripts/check-reward-catalog-drift.mjs
 *
 *   Exit 0 = catalog matches the config (or credentials absent — see below).
 *   Exit 1 = drift found, printed field by field.
 *
 * CREDENTIALS
 *   Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. When they
 *   are missing the script SKIPS with exit 0 rather than failing, so it can
 *   be wired into CI before the secret exists without turning the build red.
 *   A skip prints loudly; do not mistake it for a pass.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Deliberately dependency-free: this runs as a CI step in the Build Safety
// Gate job, which does not `npm install`. Raw PostgREST over global fetch
// (Node 18+) instead of @supabase/supabase-js. diamondRewards.js is pure
// config with no imports of its own, so it loads standalone.
import { REWARDS } from '../src/config/diamondRewards.js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.log('[catalog-drift] SKIPPED — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.');
    console.log('[catalog-drift] This is a SKIP, not a PASS. The catalog was not checked.');
    process.exit(0);
}

const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/diamond_reward_catalog`
    + '?select=action_key,diamonds,max_per_day,counts_toward_daily_cap,lifetime,category,active';

let data;
try {
    const res = await fetch(endpoint, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
        console.error(`[catalog-drift] query failed: HTTP ${res.status} ${await res.text()}`);
        process.exit(1);
    }
    data = await res.json();
} catch (err) {
    console.error('[catalog-drift] query failed:', err?.message || err);
    process.exit(1);
}

if (!Array.isArray(data) || data.length === 0) {
    // An empty catalog is not "no drift" — it means every reward is
    // unknown_action and the economy is dead. Fail loudly.
    console.error('[catalog-drift] diamond_reward_catalog returned no rows.');
    process.exit(1);
}

const rows = Object.fromEntries(data.map((r) => [r.action_key, r]));
const problems = [];

for (const [key_, cfg] of Object.entries(REWARDS)) {
    const row = rows[key_];
    if (!row) {
        problems.push(`${key_}: in config, MISSING from diamond_reward_catalog (award_diamonds_v2 will answer unknown_action)`);
        continue;
    }
    if (!row.active) {
        problems.push(`${key_}: catalog row is inactive, but the config still advertises it`);
    }

    const compare = [
        ['counts_toward_daily_cap', row.counts_toward_daily_cap, cfg.countsTowardDailyCap === true],
        ['lifetime', row.lifetime, cfg.lifetime === true],
        ['max_per_day', row.max_per_day, cfg.maxPerDay ?? null],
        ['diamonds', row.diamonds, cfg.diamonds ?? 0],
        ['category', row.category, cfg.category],
    ];

    for (const [field, dbValue, cfgValue] of compare) {
        // category is a loose match on purpose: the SQL column is only used
        // for reporting, and the two vocabularies were never identical.
        if (field === 'category') continue;
        if (dbValue !== cfgValue) {
            problems.push(
                `${key_}.${field}: db=${JSON.stringify(dbValue)} config=${JSON.stringify(cfgValue)}`,
            );
        }
    }
}

for (const action of Object.keys(rows)) {
    if (!REWARDS[action]) {
        problems.push(`${action}: in diamond_reward_catalog, MISSING from the config (payable but undocumented)`);
    }
}

if (problems.length) {
    console.error('');
    console.error('CATALOG DRIFT — the database and src/config/diamondRewards.js disagree.');
    console.error('award_diamonds_v2 reads the DATABASE, so the database is what users experience.');
    console.error('');
    for (const p of problems) console.error(`  ${p}`);
    console.error('');
    console.error('Fix with a migration that updates diamond_reward_catalog, or correct the config');
    console.error('if the database is right. Do not leave them disagreeing.');
    console.error('');
    process.exit(1);
}

console.log(`[catalog-drift] OK — ${Object.keys(REWARDS).length} actions match the database.`);
process.exit(0);
