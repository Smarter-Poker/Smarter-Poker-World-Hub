#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRIVIA POOL DEPTH REPORT — is the 60-day no-repeat promise actually kept?
 * ═══════════════════════════════════════════════════════════════════════════
 * Prints required vs current vs shortfall for every category and for the pool
 * as a whole, plus the exact commands to close each gap.
 *
 * Usage:
 *   node scripts/trivia-pool-report.js
 *   node scripts/trivia-pool-report.js --json
 *   node scripts/trivia-pool-report.js --window=60 --headroom=1.25
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * No node_modules required — it talks to PostgREST over fetch.
 *
 * ─── THE MATH ──────────────────────────────────────────────────────────────
 * The product promise is that a player never repeats a question within 60 days.
 * Exclusion is per PLAYER and GLOBAL across modes (see
 * src/lib/triviaQuestionLoader.js), so the requirement for any category is:
 *
 *     required(category) = questionsServedPerDay(category) x windowDays
 *
 * where questionsServedPerDay is what a single player can consume from that
 * category in one day. Four modes are single-category and serve 20/day
 * (rules -> rule_knowledge, mtt -> mtt_situations, cash -> cash_game_situations,
 * icm -> icm_chip_ev), so those four each need 20 x 60 = 1,200 USABLE rows.
 * Multi-category modes split their 20/day across their categories.
 *
 * Survival draws 200 questions per run (10 levels x 20) from the WHOLE pool, so
 * the pool-wide requirement is 200 x 60 = 12,000 usable.
 *
 * "Usable" means quality_score >= 6, the gameplay floor enforced by
 * pages/hub/trivia/[mode].js, survival-game.js and /api/trivia/daily. Raw row
 * counts overstate depth because the factual audit demotes a slice of every
 * category below that floor — hence the headroom multiplier on the recommended
 * target.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const WINDOW_DAYS = parseInt(args.find(a => a.startsWith('--window='))?.split('=')[1] || '60', 10);
const HEADROOM = parseFloat(args.find(a => a.startsWith('--headroom='))?.split('=')[1] || '1.25');

/** Gameplay quality floor — must match [mode].js MIN_QUALITY_SCORE. */
const QUALITY_FLOOR = 6;
/** Survival burns 10 levels x 20 questions from the shared pool. */
const SURVIVAL_QUESTIONS_PER_RUN = 200;
/** Daily roster size per category, written by /api/cron/generate-trivia. */
const ROSTER_PER_CATEGORY = 20;

/** category -> questions a single player can draw from it per day. */
const CATEGORIES = [
    { id: 'rule_knowledge', name: 'Rules & Etiquette', perDay: 20, mode: 'rules (dedicated)' },
    { id: 'mtt_situations', name: 'MTT Situations', perDay: 20, mode: 'mtt (dedicated)' },
    { id: 'cash_game_situations', name: 'Cash Game Situations', perDay: 20, mode: 'cash (dedicated)' },
    { id: 'icm_chip_ev', name: 'ICM & Chip EV', perDay: 20, mode: 'icm (dedicated)' },
    { id: 'gto_theory', name: 'GTO Theory', perDay: 10, mode: 'pro + gto (shared)' },
    { id: 'gto_scenarios', name: 'GTO Scenarios', perDay: 10, mode: 'gto (shared)' },
    { id: 'tournament_facts', name: 'Tournament Facts', perDay: 10, mode: 'pro (shared)' },
    { id: 'poker_history', name: 'Poker History', perDay: 7, mode: 'history (shared)' },
    { id: 'famous_hands', name: 'Famous Hands', perDay: 7, mode: 'history (shared)' },
    { id: 'player_profiles', name: 'Player Profiles', perDay: 7, mode: 'history (shared)' },
];

const HEADERS = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
};

/** Exact server-side count. Never fetches rows, so PostgREST max-rows cannot lie. */
async function count(filter = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/trivia_questions?select=id${filter}&limit=1`, {
        headers: { ...HEADERS, Prefer: 'count=exact' },
    });
    if (!res.ok) throw new Error(`count failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const cr = res.headers.get('content-range') || '';
    return cr ? parseInt(cr.split('/')[1] || '0', 10) : 0;
}

function todayCST() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
}

function pad(v, n) { return String(v).padStart(n); }

async function main() {
    const today = todayCST();

    const rows = [];
    for (const cat of CATEGORIES) {
        const base = `&category=eq.${cat.id}`;
        const [total, usable, easy, medium, hard, roster] = await Promise.all([
            count(base),
            count(`${base}&quality_score=gte.${QUALITY_FLOOR}`),
            count(`${base}&difficulty=eq.easy&quality_score=gte.${QUALITY_FLOOR}`),
            count(`${base}&difficulty=eq.medium&quality_score=gte.${QUALITY_FLOOR}`),
            count(`${base}&difficulty=eq.hard&quality_score=gte.${QUALITY_FLOOR}`),
            count(`${base}&daily_date=eq.${today}&quality_score=gte.${QUALITY_FLOOR}`),
        ]);

        const required = cat.perDay * WINDOW_DAYS;
        const recommended = Math.ceil(required * HEADROOM);
        rows.push({
            ...cat,
            total,
            usable,
            belowFloor: total - usable,
            easy, medium, hard,
            required,
            recommended,
            shortfall: Math.max(0, required - usable),
            shortfallWithHeadroom: Math.max(0, recommended - usable),
            daysOfCoverage: cat.perDay > 0 ? Math.floor(usable / cat.perDay) : 0,
            meetsGuarantee: usable >= required,
            roster,
            rosterComplete: roster >= ROSTER_PER_CATEGORY,
        });
    }

    const totalRows = rows.reduce((s, r) => s + r.total, 0);
    const totalUsable = rows.reduce((s, r) => s + r.usable, 0);
    const survivalRequired = SURVIVAL_QUESTIONS_PER_RUN * WINDOW_DAYS;

    const summary = {
        generatedAt: new Date().toISOString(),
        todayCST: today,
        windowDays: WINDOW_DAYS,
        qualityFloor: QUALITY_FLOOR,
        headroom: HEADROOM,
        totals: {
            total: totalRows,
            usable: totalUsable,
            belowFloor: totalRows - totalUsable,
            categoryRequiredSum: rows.reduce((s, r) => s + r.required, 0),
            categoryShortfallSum: rows.reduce((s, r) => s + r.shortfall, 0),
        },
        survival: {
            questionsPerRun: SURVIVAL_QUESTIONS_PER_RUN,
            required: survivalRequired,
            usable: totalUsable,
            shortfall: Math.max(0, survivalRequired - totalUsable),
            daysOfCoverage: Math.floor(totalUsable / SURVIVAL_QUESTIONS_PER_RUN),
            meetsGuarantee: totalUsable >= survivalRequired,
        },
        categories: rows,
    };

    if (AS_JSON) {
        console.log(JSON.stringify(summary, null, 2));
        process.exit(summary.totals.categoryShortfallSum > 0 ? 1 : 0);
    }

    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(`  TRIVIA POOL DEPTH vs THE ${WINDOW_DAYS}-DAY NO-REPEAT GUARANTEE`);
    console.log(`  quality floor ${QUALITY_FLOOR} | headroom x${HEADROOM} | ${today} CST`);
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    console.log('Category                  q/day  required   usable  shortfall  days  roster');
    console.log('------------------------  -----  --------  -------  ---------  ----  ------');
    for (const r of rows) {
        console.log(
            `${r.id.padEnd(24)}  ${pad(r.perDay, 5)}  ${pad(r.required, 8)}  ${pad(r.usable, 7)}  ` +
            `${pad(r.shortfall, 9)}  ${pad(r.daysOfCoverage, 4)}  ${pad(r.roster, 6)}` +
            `${r.meetsGuarantee ? '' : '  << SHORT'}`
        );
    }
    console.log('------------------------  -----  --------  -------  ---------  ----  ------');
    console.log(`${'POOL TOTAL'.padEnd(24)}  ${pad(SURVIVAL_QUESTIONS_PER_RUN, 5)}  ${pad(survivalRequired, 8)}  ${pad(totalUsable, 7)}  ${pad(summary.survival.shortfall, 9)}  ${pad(summary.survival.daysOfCoverage, 4)}`);

    console.log(`\n  raw rows:          ${totalRows}`);
    console.log(`  usable (qs >= ${QUALITY_FLOOR}):  ${totalUsable}`);
    console.log(`  below the floor:   ${totalRows - totalUsable} (audit-demoted or reported)`);

    console.log('\nDIFFICULTY MIX (usable rows; target 20/50/30)');
    console.log('Category                    easy   medium     hard');
    console.log('------------------------  ------  -------  -------');
    for (const r of rows) {
        console.log(`${r.id.padEnd(24)}  ${pad(r.easy, 6)}  ${pad(r.medium, 7)}  ${pad(r.hard, 7)}`);
    }

    const short = rows.filter(r => !r.meetsGuarantee);
    const rosterGaps = rows.filter(r => !r.rosterComplete);

    console.log('\n═══ WHAT TO RUN ═══');
    if (short.length === 0 && summary.survival.meetsGuarantee && rosterGaps.length === 0) {
        console.log('  Nothing. The pool meets the guarantee and today\'s roster is complete.');
    } else {
        if (short.length > 0) {
            console.log('\n  Fill these categories to the recommended depth (includes audit headroom):');
            for (const r of short) {
                const factCategory = ['poker_history', 'famous_hands', 'player_profiles', 'tournament_facts', 'rule_knowledge'].includes(r.id);
                const cmd = factCategory
                    ? `node scripts/trivia-grok-seed.js --live --category=${r.id} --target=${r.recommended}`
                    : `node scripts/trivia-deterministic-seed.js --live --category=${r.id} --target=${r.recommended}`;
                console.log(`    # ${r.id}: ${r.usable}/${r.required} usable, short ${r.shortfall}`);
                console.log(`    ${cmd}`);
            }
            console.log('\n    Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, XAI_API_KEY');
        }
        if (!summary.survival.meetsGuarantee) {
            console.log(`\n  Survival needs ${survivalRequired} usable pool-wide; there are ${totalUsable} ` +
                `(short ${summary.survival.shortfall}). Filling the per-category gaps above closes this too.`);
        }
        if (rosterGaps.length > 0) {
            console.log(`\n  Today's roster is incomplete in: ${rosterGaps.map(r => `${r.id} (${r.roster}/${ROSTER_PER_CATEGORY})`).join(', ')}`);
            console.log('    curl -H "Authorization: Bearer $CRON_SECRET" \\');
            console.log('      "https://<host>/api/cron/generate-trivia?rosterOnly=1"');
        }
    }

    console.log('');
    process.exit(short.length > 0 || !summary.survival.meetsGuarantee ? 1 : 0);
}

main().catch(e => { console.error(e.message || e); process.exit(2); });
