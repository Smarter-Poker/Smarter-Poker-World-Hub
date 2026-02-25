#!/usr/bin/env node
/**
 * Seed 2 months of future tournaments for Club JAQK (venue 1996)
 * Feb 26 – Apr 26, 2026
 *
 * Run: node scripts/seed-jaqk-future-tournaments.js
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load env
const envPath = new URL('../.env.local', import.meta.url).pathname;
const envVars = {};
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) envVars[m[1]] = m[2].replace(/\n$/, '');
});
const url = envVars.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

const VENUE_ID = 1996;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ═══════════════════════════════════════════
// Blind structure templates
// ═══════════════════════════════════════════
const TURBO_STRUCTURE = [
    { small_blind: 25, big_blind: 50, ante: 0, duration: 10 },
    { small_blind: 50, big_blind: 100, ante: 0, duration: 10 },
    { small_blind: 75, big_blind: 150, ante: 0, duration: 10 },
    { small_blind: 100, big_blind: 200, ante: 25, duration: 10 },
    { is_break: true, duration: 5 },
    { small_blind: 150, big_blind: 300, ante: 50, duration: 10 },
    { small_blind: 200, big_blind: 400, ante: 50, duration: 10 },
    { small_blind: 300, big_blind: 600, ante: 75, duration: 10 },
    { small_blind: 500, big_blind: 1000, ante: 100, duration: 10 },
    { is_break: true, duration: 5 },
    { small_blind: 700, big_blind: 1400, ante: 200, duration: 10 },
    { small_blind: 1000, big_blind: 2000, ante: 300, duration: 10 },
    { small_blind: 1500, big_blind: 3000, ante: 400, duration: 10 },
    { small_blind: 2000, big_blind: 4000, ante: 500, duration: 10 },
];

const STANDARD_STRUCTURE = [
    { small_blind: 25, big_blind: 50, ante: 0, duration: 20 },
    { small_blind: 50, big_blind: 100, ante: 0, duration: 20 },
    { small_blind: 75, big_blind: 150, ante: 0, duration: 20 },
    { small_blind: 100, big_blind: 200, ante: 25, duration: 20 },
    { is_break: true, duration: 10 },
    { small_blind: 150, big_blind: 300, ante: 50, duration: 20 },
    { small_blind: 200, big_blind: 400, ante: 50, duration: 20 },
    { small_blind: 300, big_blind: 600, ante: 75, duration: 20 },
    { small_blind: 400, big_blind: 800, ante: 100, duration: 20 },
    { is_break: true, duration: 10 },
    { small_blind: 500, big_blind: 1000, ante: 100, duration: 15 },
    { small_blind: 600, big_blind: 1200, ante: 200, duration: 15 },
    { small_blind: 800, big_blind: 1600, ante: 200, duration: 15 },
    { small_blind: 1000, big_blind: 2000, ante: 300, duration: 15 },
    { is_break: true, duration: 10 },
    { small_blind: 1500, big_blind: 3000, ante: 400, duration: 15 },
    { small_blind: 2000, big_blind: 4000, ante: 500, duration: 15 },
    { small_blind: 3000, big_blind: 6000, ante: 600, duration: 15 },
];

const DEEPSTACK_STRUCTURE = [
    { small_blind: 25, big_blind: 50, ante: 0, duration: 30 },
    { small_blind: 50, big_blind: 100, ante: 0, duration: 30 },
    { small_blind: 75, big_blind: 150, ante: 0, duration: 30 },
    { small_blind: 100, big_blind: 200, ante: 25, duration: 30 },
    { small_blind: 150, big_blind: 300, ante: 25, duration: 30 },
    { is_break: true, duration: 15 },
    { small_blind: 200, big_blind: 400, ante: 50, duration: 30 },
    { small_blind: 250, big_blind: 500, ante: 50, duration: 30 },
    { small_blind: 300, big_blind: 600, ante: 75, duration: 30 },
    { small_blind: 400, big_blind: 800, ante: 100, duration: 25 },
    { small_blind: 500, big_blind: 1000, ante: 100, duration: 25 },
    { is_break: true, duration: 15 },
    { small_blind: 600, big_blind: 1200, ante: 200, duration: 25 },
    { small_blind: 800, big_blind: 1600, ante: 200, duration: 25 },
    { small_blind: 1000, big_blind: 2000, ante: 300, duration: 20 },
    { small_blind: 1500, big_blind: 3000, ante: 500, duration: 20 },
    { is_break: true, duration: 15 },
    { small_blind: 2000, big_blind: 4000, ante: 500, duration: 20 },
    { small_blind: 3000, big_blind: 6000, ante: 1000, duration: 20 },
    { small_blind: 4000, big_blind: 8000, ante: 1000, duration: 20 },
];

const STANDARD_PAYOUTS = [
    { place: 1, percentage: 40 },
    { place: 2, percentage: 25 },
    { place: 3, percentage: 15 },
    { place: 4, percentage: 10 },
    { place: 5, percentage: 5 },
    { place: 6, percentage: 3 },
    { place: 7, percentage: 2 },
];

// ═══════════════════════════════════════════
// WEEKLY SCHEDULE TEMPLATE (repeats 8x for 2 months)
// ═══════════════════════════════════════════
const WEEKLY_SCHEDULE = [
    // Monday
    { dayOffset: 0, hour: 12, name: 'Noon Turbo NLH', type: 'turbo', buyin: 60, fee: 10, chips: 10000, max: 80, structure: 'turbo', clock_color: null },
    { dayOffset: 0, hour: 19, name: 'Monday Night Bounty', type: 'bounty', buyin: 150, fee: 20, chips: 20000, max: 100, structure: 'standard', clock_color: 'red', bounty: 50, guarantee: 5000 },

    // Tuesday
    { dayOffset: 1, hour: 12, name: 'Noon Turbo NLH', type: 'turbo', buyin: 60, fee: 10, chips: 10000, max: 80, structure: 'turbo', clock_color: null },
    { dayOffset: 1, hour: 19, name: 'Tuesday PLO Deepstack', type: 'freezeout', buyin: 200, fee: 25, chips: 25000, max: 60, structure: 'deepstack', clock_color: 'teal', guarantee: 8000 },

    // Wednesday
    { dayOffset: 2, hour: 12, name: 'Noon Turbo NLH', type: 'turbo', buyin: 60, fee: 10, chips: 10000, max: 80, structure: 'turbo', clock_color: null },
    { dayOffset: 2, hour: 19, name: 'Wednesday Rebuy Special', type: 'rebuy', buyin: 80, fee: 10, chips: 10000, max: 100, structure: 'standard', clock_color: 'green', rebuy: true },

    // Thursday
    { dayOffset: 3, hour: 12, name: 'Noon Turbo NLH', type: 'turbo', buyin: 60, fee: 10, chips: 10000, max: 80, structure: 'turbo', clock_color: null },
    { dayOffset: 3, hour: 19, name: 'Thursday $300 Freezeout', type: 'freezeout', buyin: 300, fee: 40, chips: 30000, max: 80, structure: 'standard', clock_color: 'purple', guarantee: 10000 },

    // Friday
    { dayOffset: 4, hour: 12, name: 'Noon Turbo NLH', type: 'turbo', buyin: 60, fee: 10, chips: 10000, max: 80, structure: 'turbo', clock_color: null },
    { dayOffset: 4, hour: 17, name: 'Friday Freeroll', type: 'freezeout', buyin: 0, fee: 0, chips: 5000, max: 120, structure: 'turbo', clock_color: 'green' },
    { dayOffset: 4, hour: 20, name: 'Friday Night $500 NLH', type: 'freezeout', buyin: 500, fee: 50, chips: 40000, max: 60, structure: 'deepstack', clock_color: 'gold', guarantee: 15000 },

    // Saturday
    { dayOffset: 5, hour: 12, name: 'Saturday Satellite (1 seat)', type: 'satellite', buyin: 50, fee: 5, chips: 8000, max: 40, structure: 'turbo', clock_color: 'teal' },
    { dayOffset: 5, hour: 15, name: 'Saturday Deepstack NLH', type: 'freezeout', buyin: 250, fee: 30, chips: 30000, max: 80, structure: 'deepstack', clock_color: 'navy', guarantee: 10000 },
    { dayOffset: 5, hour: 20, name: 'Saturday Mystery Bounty', type: 'bounty', buyin: 200, fee: 25, chips: 25000, max: 100, structure: 'standard', clock_color: 'red', bounty: 75, guarantee: 8000 },

    // Sunday
    { dayOffset: 6, hour: 12, name: 'Sunday PLO Turbo', type: 'turbo', buyin: 100, fee: 15, chips: 12000, max: 60, structure: 'turbo', clock_color: 'teal' },
    { dayOffset: 6, hour: 15, name: 'Sunday Championship NLH', type: 'freezeout', buyin: 400, fee: 50, chips: 40000, max: 80, structure: 'deepstack', clock_color: 'gold', guarantee: 20000 },
    { dayOffset: 6, hour: 20, name: 'Sunday Night $1K High Roller', type: 'freezeout', buyin: 1000, fee: 100, chips: 50000, max: 40, structure: 'deepstack', clock_color: 'purple', guarantee: 25000 },
];

// Special monthly events (added once per month)
const MONTHLY_SPECIALS_MARCH = [
    { date: new Date('2026-03-14T18:00:00'), name: 'March Madness Main Event', type: 'freezeout', buyin: 500, fee: 50, chips: 50000, max: 150, structure: 'deepstack', clock_color: 'gold', guarantee: 50000 },
    { date: new Date('2026-03-15T14:00:00'), name: 'March Madness PLO Side Event', type: 'freezeout', buyin: 300, fee: 40, chips: 30000, max: 60, structure: 'standard', clock_color: 'teal', guarantee: 15000 },
    { date: new Date('2026-03-21T19:00:00'), name: 'Ladies Night Invitational', type: 'freezeout', buyin: 100, fee: 15, chips: 15000, max: 60, structure: 'standard', clock_color: 'purple', guarantee: 3000 },
];

const MONTHLY_SPECIALS_APRIL = [
    { date: new Date('2026-04-04T18:00:00'), name: 'Spring Series Main Event', type: 'freezeout', buyin: 1000, fee: 100, chips: 50000, max: 120, structure: 'deepstack', clock_color: 'gold', guarantee: 75000 },
    { date: new Date('2026-04-05T14:00:00'), name: 'Spring Series Bounty Side', type: 'bounty', buyin: 250, fee: 30, chips: 25000, max: 100, structure: 'standard', clock_color: 'red', bounty: 100, guarantee: 20000 },
    { date: new Date('2026-04-11T19:00:00'), name: 'JAQK Anniversary Freeroll', type: 'freezeout', buyin: 0, fee: 0, chips: 10000, max: 200, structure: 'turbo', clock_color: 'green', guarantee: 5000 },
    { date: new Date('2026-04-18T18:00:00'), name: 'PLO Championship', type: 'freezeout', buyin: 500, fee: 50, chips: 40000, max: 60, structure: 'deepstack', clock_color: 'teal', guarantee: 25000 },
];

function getStructure(key) {
    if (key === 'turbo') return TURBO_STRUCTURE;
    if (key === 'deepstack') return DEEPSTACK_STRUCTURE;
    return STANDARD_STRUCTURE;
}

console.log('═══════════════════════════════════════════════');
console.log('  CLUB JAQK (venue 1996)');
console.log('  Seeding 2 Months of Future Tournaments');
console.log('  Feb 26 – Apr 26, 2026');
console.log('═══════════════════════════════════════════════\n');

async function main() {
    const rows = [];

    // Start from the next Monday after today (Feb 25, 2026 is a Wednesday)
    const baseDate = new Date('2026-02-26T00:00:00-06:00');

    // Find the first Monday on or after baseDate
    let firstMonday = new Date(baseDate);
    while (firstMonday.getDay() !== 1) {
        firstMonday.setDate(firstMonday.getDate() + 1);
    }
    // firstMonday = March 2, 2026

    // Generate 8 weeks of recurring tournaments
    for (let week = 0; week < 8; week++) {
        const weekStart = new Date(firstMonday);
        weekStart.setDate(weekStart.getDate() + (week * 7));

        for (const tmpl of WEEKLY_SCHEDULE) {
            const dt = new Date(weekStart);
            dt.setDate(dt.getDate() + tmpl.dayOffset);
            dt.setHours(tmpl.hour, 0, 0, 0);

            // Skip dates before today or after Apr 26
            if (dt < new Date('2026-02-26')) continue;
            if (dt > new Date('2026-04-26')) continue;

            const regOpens = new Date(dt);
            regOpens.setHours(regOpens.getHours() - 2);

            rows.push({
                venue_id: VENUE_ID,
                name: tmpl.name,
                description: `${tmpl.name} — ${tmpl.type} format at Club JAQK`,
                tournament_type: tmpl.type,
                buyin_amount: tmpl.buyin,
                buyin_fee: tmpl.fee,
                starting_chips: tmpl.chips,
                scheduled_start: dt.toISOString(),
                registration_opens: regOpens.toISOString(),
                late_registration_levels: 6,
                min_entries: 2,
                max_entries: tmpl.max,
                guaranteed_pool: tmpl.guarantee || null,
                status: 'scheduled',
                current_level: 0,
                current_entries: 0,
                players_remaining: 0,
                blind_structure: getStructure(tmpl.structure),
                break_schedule: [{ after_level: 4, duration: 10 }, { after_level: 8, duration: 15 }],
                payout_structure: STANDARD_PAYOUTS,
                allows_rebuys: tmpl.rebuy || false,
                rebuy_amount: tmpl.rebuy ? tmpl.buyin : null,
                rebuy_chips: tmpl.rebuy ? tmpl.chips : null,
                max_rebuys: tmpl.rebuy ? 2 : null,
                rebuy_end_level: tmpl.rebuy ? 4 : null,
                allows_addon: false,
                bounty_amount: tmpl.bounty || null,
                broadcast_to_smarter: true,
                settings: { clock_color: tmpl.clock_color || 'navy' },
            });
        }
    }

    // Add monthly specials
    for (const sp of [...MONTHLY_SPECIALS_MARCH, ...MONTHLY_SPECIALS_APRIL]) {
        const regOpens = new Date(sp.date);
        regOpens.setHours(regOpens.getHours() - 3);

        rows.push({
            venue_id: VENUE_ID,
            name: sp.name,
            description: `${sp.name} — special event at Club JAQK`,
            tournament_type: sp.type,
            buyin_amount: sp.buyin,
            buyin_fee: sp.fee,
            starting_chips: sp.chips,
            scheduled_start: sp.date.toISOString(),
            registration_opens: regOpens.toISOString(),
            late_registration_levels: 6,
            min_entries: 2,
            max_entries: sp.max,
            guaranteed_pool: sp.guarantee || null,
            status: 'scheduled',
            current_level: 0,
            current_entries: 0,
            players_remaining: 0,
            blind_structure: getStructure(sp.structure),
            break_schedule: [{ after_level: 4, duration: 10 }, { after_level: 8, duration: 15 }],
            payout_structure: STANDARD_PAYOUTS,
            allows_rebuys: false,
            allows_addon: false,
            bounty_amount: sp.bounty || null,
            broadcast_to_smarter: true,
            settings: { clock_color: sp.clock_color || 'navy' },
        });
    }

    console.log(`  Prepared ${rows.length} tournaments\n`);

    // Insert in batches
    const BATCH = 25;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { data, error } = await sb.from('commander_tournaments').insert(batch).select('id, name, scheduled_start');
        if (error) {
            console.error(`  ❌ Batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
            errors++;
        } else {
            inserted += data.length;
            console.log(`  ✅ Batch ${Math.floor(i / BATCH) + 1}: ${data.length} tournaments inserted`);
        }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════');
    console.log(`  COMPLETE: ${inserted} tournaments seeded, ${errors} errors`);

    // Print schedule overview
    console.log('\n  Schedule breakdown:');
    const byWeekday = {};
    rows.forEach(r => {
        const d = new Date(r.scheduled_start);
        const day = d.toLocaleDateString('en-US', { weekday: 'long' });
        byWeekday[day] = (byWeekday[day] || 0) + 1;
    });
    Object.entries(byWeekday).forEach(([day, count]) => {
        console.log(`    ${day}: ${count} tournaments`);
    });

    const totalBuyins = rows.reduce((s, r) => s + r.buyin_amount, 0);
    const totalGuarantees = rows.reduce((s, r) => s + (r.guaranteed_pool || 0), 0);
    console.log(`\n  Total buy-ins value: $${totalBuyins.toLocaleString()}`);
    console.log(`  Total guarantees: $${totalGuarantees.toLocaleString()}`);
    console.log('═══════════════════════════════════════════════');

    if (errors > 0) process.exit(1);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
