/**
 * Club JAQK — 2-Month Daily Tournament Schedule Seed
 * Seeds ~60 days of daily tournaments from Feb 17 through April 18, 2026
 * Each day has 3-5 tournaments at staggered times
 */
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

// ── Load env ──
const env = readFileSync('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local', 'utf-8');
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim().replace(/"/g, '');
const SERVICE_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim().replace(/"/g, '');

const CLUB_ID = 'a0000000-0000-0000-0000-000000000001';

const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
};

// ── Tournament Templates ──
// Each day of the week has a distinct flavor with varied game types, buy-ins, and structures

const DAILY_TEMPLATES = {
    // Monday – Grind day, lower buy-ins
    0: [
        { name: 'Monday Micro Stack', game_type: 'NLH', buy_in_amount: 10, buy_in_fee: 1, guaranteed_prize: 200, max_players: 30, starting_chips: 5000, late_reg_mins: 30, hour: 12, blind_structure: 'Turbo', payout_structure: 'Standard' },
        { name: 'Monday Madness', game_type: 'NLH', buy_in_amount: 25, buy_in_fee: 3, guaranteed_prize: 500, max_players: 40, starting_chips: 10000, late_reg_mins: 45, hour: 17, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'Monday PLO Pot Builder', game_type: 'PLO', buy_in_amount: 20, buy_in_fee: 2, guaranteed_prize: 400, max_players: 24, starting_chips: 10000, late_reg_mins: 30, hour: 20, blind_structure: 'Standard', payout_structure: 'Standard' },
    ],
    // Tuesday – Bounty day
    1: [
        { name: 'Tuesday Morning Grind', game_type: 'NLH', buy_in_amount: 15, buy_in_fee: 2, guaranteed_prize: 300, max_players: 30, starting_chips: 7500, late_reg_mins: 30, hour: 11, blind_structure: 'Turbo', payout_structure: 'Standard' },
        { name: 'Texas Bounty Tuesday', game_type: 'NLH', buy_in_amount: 30, buy_in_fee: 3, guaranteed_prize: 750, max_players: 40, starting_chips: 10000, late_reg_mins: 60, hour: 17, blind_structure: 'Standard', payout_structure: 'Bounty' },
        { name: 'Tuesday Night PLO5', game_type: 'PLO5', buy_in_amount: 25, buy_in_fee: 3, guaranteed_prize: 500, max_players: 20, starting_chips: 10000, late_reg_mins: 30, hour: 20, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'Late Night Hyper Turbo', game_type: 'NLH', buy_in_amount: 10, buy_in_fee: 1, guaranteed_prize: 200, max_players: 18, starting_chips: 3000, late_reg_mins: 15, hour: 23, blind_structure: 'Hyper', payout_structure: 'Standard' },
    ],
    // Wednesday – Mid-week majors
    2: [
        { name: 'Hump Day Hold\'em', game_type: 'NLH', buy_in_amount: 20, buy_in_fee: 2, guaranteed_prize: 400, max_players: 40, starting_chips: 10000, late_reg_mins: 45, hour: 12, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'Wednesday Mid-Major', game_type: 'NLH', buy_in_amount: 50, buy_in_fee: 5, guaranteed_prize: 1500, max_players: 50, starting_chips: 15000, late_reg_mins: 60, hour: 18, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'PLO Night Special', game_type: 'PLO', buy_in_amount: 30, buy_in_fee: 3, guaranteed_prize: 600, max_players: 24, starting_chips: 12000, late_reg_mins: 30, hour: 21, blind_structure: 'Standard', payout_structure: 'Standard' },
    ],
    // Thursday – Deep stack day
    3: [
        { name: 'Thursday Deep Stack', game_type: 'NLH', buy_in_amount: 35, buy_in_fee: 5, guaranteed_prize: 1000, max_players: 40, starting_chips: 20000, late_reg_mins: 60, hour: 14, blind_structure: 'Deep', payout_structure: 'Standard' },
        { name: 'Thursday Knockout', game_type: 'NLH', buy_in_amount: 25, buy_in_fee: 3, guaranteed_prize: 600, max_players: 36, starting_chips: 10000, late_reg_mins: 45, hour: 18, blind_structure: 'Standard', payout_structure: 'Bounty' },
        { name: 'Thursday Night PLO Hi-Lo', game_type: 'PLO', buy_in_amount: 20, buy_in_fee: 2, guaranteed_prize: 400, max_players: 20, starting_chips: 10000, late_reg_mins: 30, hour: 21, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'Midnight Express Turbo', game_type: 'NLH', buy_in_amount: 10, buy_in_fee: 1, guaranteed_prize: 200, max_players: 18, starting_chips: 5000, late_reg_mins: 15, hour: 23, blind_structure: 'Turbo', payout_structure: 'Standard' },
    ],
    // Friday – Big night, premium events
    4: [
        { name: 'Friday Afternoon Warm-Up', game_type: 'NLH', buy_in_amount: 20, buy_in_fee: 2, guaranteed_prize: 400, max_players: 30, starting_chips: 10000, late_reg_mins: 30, hour: 13, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'JAQK Friday Night Major', game_type: 'NLH', buy_in_amount: 75, buy_in_fee: 8, guaranteed_prize: 2500, max_players: 60, starting_chips: 20000, late_reg_mins: 90, hour: 18, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'Friday PLO Fireworks', game_type: 'PLO', buy_in_amount: 40, buy_in_fee: 5, guaranteed_prize: 1000, max_players: 30, starting_chips: 15000, late_reg_mins: 45, hour: 20, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'Friday Late Night Bounty', game_type: 'NLH', buy_in_amount: 20, buy_in_fee: 2, guaranteed_prize: 500, max_players: 30, starting_chips: 10000, late_reg_mins: 30, hour: 22, blind_structure: 'Standard', payout_structure: 'Bounty' },
        { name: 'Midnight Madness Hyper', game_type: 'NLH', buy_in_amount: 10, buy_in_fee: 1, guaranteed_prize: 250, max_players: 18, starting_chips: 3000, late_reg_mins: 10, hour: 0, blind_structure: 'Hyper', payout_structure: 'Standard' },
    ],
    // Saturday – Weekend warrior, biggest schedule
    5: [
        { name: 'Saturday Morning Stack', game_type: 'NLH', buy_in_amount: 15, buy_in_fee: 2, guaranteed_prize: 300, max_players: 30, starting_chips: 10000, late_reg_mins: 30, hour: 11, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'JAQK Saturday Showdown', game_type: 'NLH', buy_in_amount: 100, buy_in_fee: 10, guaranteed_prize: 5000, max_players: 80, starting_chips: 25000, late_reg_mins: 120, hour: 16, blind_structure: 'Deep', payout_structure: 'Standard' },
        { name: 'Saturday PLO Slugfest', game_type: 'PLO', buy_in_amount: 50, buy_in_fee: 5, guaranteed_prize: 1500, max_players: 30, starting_chips: 15000, late_reg_mins: 60, hour: 19, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'Saturday Night Turbo', game_type: 'NLH', buy_in_amount: 25, buy_in_fee: 3, guaranteed_prize: 600, max_players: 36, starting_chips: 8000, late_reg_mins: 30, hour: 21, blind_structure: 'Turbo', payout_structure: 'Standard' },
        { name: 'Saturday Midnight Special', game_type: 'NLH', buy_in_amount: 15, buy_in_fee: 2, guaranteed_prize: 350, max_players: 24, starting_chips: 5000, late_reg_mins: 15, hour: 23, blind_structure: 'Hyper', payout_structure: 'Standard' },
    ],
    // Sunday – Championship day
    6: [
        { name: 'Sunday Brunch Bounty', game_type: 'NLH', buy_in_amount: 20, buy_in_fee: 2, guaranteed_prize: 500, max_players: 30, starting_chips: 10000, late_reg_mins: 30, hour: 11, blind_structure: 'Standard', payout_structure: 'Bounty' },
        { name: 'Sunday Warm-Up', game_type: 'NLH', buy_in_amount: 30, buy_in_fee: 3, guaranteed_prize: 750, max_players: 40, starting_chips: 12000, late_reg_mins: 45, hour: 14, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'JAQK Sunday Championship', game_type: 'NLH', buy_in_amount: 100, buy_in_fee: 10, guaranteed_prize: 5000, max_players: 80, starting_chips: 25000, late_reg_mins: 120, hour: 17, blind_structure: 'Deep', payout_structure: 'Standard' },
        { name: 'Sunday PLO Grand Prix', game_type: 'PLO', buy_in_amount: 50, buy_in_fee: 5, guaranteed_prize: 1500, max_players: 30, starting_chips: 15000, late_reg_mins: 60, hour: 20, blind_structure: 'Standard', payout_structure: 'Standard' },
        { name: 'Sunday Night Closer', game_type: 'NLH', buy_in_amount: 15, buy_in_fee: 2, guaranteed_prize: 300, max_players: 24, starting_chips: 7500, late_reg_mins: 20, hour: 22, blind_structure: 'Turbo', payout_structure: 'Standard' },
    ],
};

// ── Build all tournament rows ──
const rows = [];
const START_DATE = new Date('2026-02-17T00:00:00-06:00'); // Tomorrow (CST)
const DAYS = 61; // ~2 months through April 18

for (let d = 0; d < DAYS; d++) {
    const date = new Date(START_DATE);
    date.setDate(date.getDate() + d);
    const dow = date.getDay(); // 0=Sun, 1=Mon, ...
    // Map JS getDay (0=Sun) to our template keys (0=Mon)
    const templateKey = dow === 0 ? 6 : dow - 1;
    const templates = DAILY_TEMPLATES[templateKey];

    for (const t of templates) {
        const startTime = new Date(date);
        startTime.setHours(t.hour, 0, 0, 0);

        // Past tournaments = COMPLETED, today's = ANNOUNCED, future = ANNOUNCED
        const today = new Date('2026-02-16T15:00:00Z'); // current time in UTC
        let status;
        if (startTime < today) {
            status = 'COMPLETED';
        } else if (startTime.toDateString() === today.toDateString()) {
            status = 'ANNOUNCED';
        } else {
            status = 'ANNOUNCED';
        }

        rows.push({
            id: randomUUID(),
            club_id: CLUB_ID,
            name: t.name,
            game_type: t.game_type,
            buy_in_amount: t.buy_in_amount,
            buy_in_fee: t.buy_in_fee,
            guaranteed_prize: t.guaranteed_prize,
            max_players: t.max_players,
            current_players: 0,
            starting_chips: t.starting_chips,
            late_reg_mins: t.late_reg_mins,
            blind_structure: t.blind_structure,
            payout_structure: t.payout_structure,
            start_time: startTime.toISOString(),
            status,
        });
    }
}

console.log(`\n🎰 CLUB JAQK — Tournament Schedule Seed`);
console.log(`════════════════════════════════════════`);
console.log(`  Total tournaments to insert: ${rows.length}`);
console.log(`  Date range: Feb 17 → Apr 18, 2026`);
console.log(`  Days covered: ${DAYS}`);
console.log(`  Templates per week: ${Object.values(DAILY_TEMPLATES).reduce((s, t) => s + t.length, 0)}`);

// ── Insert in batches of 50 ──
const BATCH_SIZE = 50;
let inserted = 0;
let errors = 0;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tournaments`, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
    });

    if (res.ok) {
        inserted += batch.length;
        process.stdout.write(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows inserted\n`);
    } else {
        const errBody = await res.text();
        console.error(`  ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} FAILED: ${errBody}`);
        errors++;
    }
}

console.log(`\n════════════════════════════════════════`);
console.log(`  Inserted: ${inserted} tournaments`);
console.log(`  Errors: ${errors}`);
console.log(`════════════════════════════════════════\n`);

// ── Verify ──
const verifyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tournaments?club_id=eq.${CLUB_ID}&select=id&limit=0`,
    { headers: { ...headers, 'Prefer': 'count=exact' } }
);
const range = verifyRes.headers.get('content-range');
const totalCount = range ? parseInt(range.split('/')[1]) || 0 : 0;
console.log(`  📊 Total tournaments for Club JAQK: ${totalCount}`);
