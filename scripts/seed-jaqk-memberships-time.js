#!/usr/bin/env node
/**
 * Add random memberships (with expiry dates) and time-billing sessions
 * to all 20 seeded Club JAQK players.
 *
 * Run: node scripts/seed-jaqk-memberships-time.js
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const crypto = require('crypto');

// ─── Config ──────────────────────────────────────────────────────────
const env = fs.readFileSync(require('path').join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996;
const uuid = () => crypto.randomUUID();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
let updated = 0;
let inserted = 0;
let errors = 0;

// ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log('═══════════════════════════════════════════════');
    console.log('  CLUB JAQK (venue 1996) — Memberships & Time');
    console.log('═══════════════════════════════════════════════\n');

    // ═══════════════════════════════════════════════════
    //  STEP 1: Fetch all existing members
    // ═══════════════════════════════════════════════════
    const { data: members, error: mErr } = await sb
        .from('commander_members')
        .select('id, first_name, last_name, membership_tier, member_number')
        .eq('venue_id', VENUE_ID);

    if (mErr) {
        console.error('❌ Failed to fetch members:', mErr.message);
        process.exit(1);
    }
    console.log(`  Found ${members.length} members for venue ${VENUE_ID}\n`);

    if (members.length === 0) {
        console.log('  No members found. Run seed-commander-jaqk.js first.');
        process.exit(0);
    }

    // ═══════════════════════════════════════════════════
    //  STEP 2: Update each member with random membership expiry
    // ═══════════════════════════════════════════════════
    console.log('── Step 1: Updating membership expiry dates ──\n');

    const TIER_CONFIG = {
        standard: { expiryRange: [30, 365], visitRange: [5, 30], hoursRange: [10, 100] },
        gold: { expiryRange: [60, 180], visitRange: [20, 80], hoursRange: [50, 400] },
        platinum: { expiryRange: [90, 365], visitRange: [40, 120], hoursRange: [100, 600] },
        vip: { expiryRange: [180, 730], visitRange: [80, 200], hoursRange: [200, 1000] },
    };

    for (const member of members) {
        const tier = member.membership_tier || 'standard';
        const config = TIER_CONFIG[tier] || TIER_CONFIG.standard;

        // Mix: ~80% active future expiry, ~10% expiring soon, ~10% already expired
        const roll = Math.random();
        let expiryDate;
        if (roll < 0.1) {
            // Already expired (1-30 days ago)
            expiryDate = ago(rand(1, 30));
        } else if (roll < 0.2) {
            // Expiring within 7 days
            expiryDate = future(rand(1, 7));
        } else {
            // Active — expires in future
            expiryDate = future(rand(config.expiryRange[0], config.expiryRange[1]));
        }

        const status = roll < 0.1 ? 'expired' : 'active';

        const { error: uErr } = await sb
            .from('commander_members')
            .update({
                membership_expires: expiryDate,
                membership_status: status,
                total_visits: rand(config.visitRange[0], config.visitRange[1]),
                total_hours_played: rand(config.hoursRange[0], config.hoursRange[1]),
                last_visit: ago(rand(0, 14)),
            })
            .eq('id', member.id);

        if (uErr) {
            console.error(`  ❌ ${member.first_name} ${member.last_name}: ${uErr.message}`);
            errors++;
        } else {
            const label = roll < 0.1 ? '⚠️  EXPIRED' : roll < 0.2 ? '⏰ EXPIRING SOON' : '✅ ACTIVE';
            console.log(`  ${label}  ${member.first_name} ${member.last_name} — ${tier} — expires ${new Date(expiryDate).toLocaleDateString()}`);
            updated++;
        }
    }

    // ═══════════════════════════════════════════════════
    //  STEP 3: Create time-billing sessions (active + completed)
    // ═══════════════════════════════════════════════════
    console.log('\n── Step 2: Creating time-billing sessions ────\n');

    // commander_table_sessions schema:
    //   venue_id uuid, member_id uuid FK, player_name text, table_number int,
    //   seat_number int, time_allocated_minutes int, time_added_minutes int,
    //   started_at timestamptz, ended_at timestamptz, membership_tier text,
    //   member_number text, status ('active','ended','expired','removed'), ended_by text

    const VENUE_UUID = VENUE_ID; // venue_id is bigint in production
    const TIME_PACKAGES = [60, 120, 180, 240, 300, 360]; // 1-6 hrs in minutes
    const ADD_TIME_OPTIONS = [0, 0, 0, 30, 60, 60, 120]; // most get 0 extra

    // Completed/ended sessions (30-45 historical sessions over past 14 days)
    const completedSessions = [];
    const numCompleted = rand(30, 45);
    for (let i = 0; i < numCompleted; i++) {
        const m = pick(members);
        const daysAgo = rand(0, 14);
        const startHour = rand(10, 22);
        const allocMinutes = pick(TIME_PACKAGES);
        const addMinutes = pick(ADD_TIME_OPTIONS);
        const totalMinutes = allocMinutes + addMinutes;

        const startDate = new Date(Date.now() - daysAgo * 86400000);
        startDate.setHours(startHour, rand(0, 59), 0, 0);
        // Ended after the allocated time (+/- some variance)
        const endDate = new Date(startDate.getTime() + totalMinutes * 60000 + rand(-10, 30) * 60000);

        const statuses = ['ended', 'ended', 'ended', 'ended', 'expired'];
        const status = pick(statuses);

        completedSessions.push({
            venue_id: VENUE_UUID,
            member_id: m.id,
            player_name: `${m.first_name} ${m.last_name}`,
            table_number: rand(1, 12),
            seat_number: rand(1, 9),
            time_allocated_minutes: allocMinutes,
            time_added_minutes: addMinutes,
            started_at: startDate.toISOString(),
            ended_at: endDate.toISOString(),
            membership_tier: m.membership_tier,
            member_number: m.member_number,
            status: status,
            ended_by: pick(['system', 'staff', 'player']),
        });
    }

    // Insert completed sessions (no unique constraint conflicts since they're 'ended')
    const { data: compResult, error: compErr } = await sb
        .from('commander_table_sessions')
        .insert(completedSessions)
        .select('id');

    if (compErr) {
        console.error(`  ❌ commander_table_sessions (completed): ${compErr.message}`);
        errors++;
    } else {
        console.log(`  ✅ commander_table_sessions: ${compResult?.length || completedSessions.length} completed sessions inserted`);
        inserted += compResult?.length || completedSessions.length;
    }

    // Active sessions — ALL members get one with 20+ hours so there's
    // plenty of time remaining when testing tomorrow
    // Must avoid unique constraint: (venue_id, table_number, seat_number, status='active')
    const activeSessions = [];
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const usedSeats = new Set();

    for (let i = 0; i < shuffled.length; i++) {
        const m = shuffled[i];
        const hoursAgo = rand(1, 3); // started 1-3 hrs ago
        const allocMinutes = rand(1200, 1800); // 20-30 hours allocated
        const addMinutes = pick([0, 0, 60, 120, 180]); // some got extra time

        // Generate unique table+seat combo
        let tableNum, seatNum, key;
        do {
            tableNum = rand(1, 20);
            seatNum = rand(1, 9);
            key = `${tableNum}-${seatNum}`;
        } while (usedSeats.has(key));
        usedSeats.add(key);

        activeSessions.push({
            venue_id: VENUE_UUID,
            member_id: m.id,
            player_name: `${m.first_name} ${m.last_name}`,
            table_number: tableNum,
            seat_number: seatNum,
            time_allocated_minutes: allocMinutes,
            time_added_minutes: addMinutes,
            started_at: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
            ended_at: null,
            membership_tier: m.membership_tier,
            member_number: m.member_number,
            status: 'active',
            ended_by: null,
        });
    }

    const { data: actResult, error: actErr } = await sb
        .from('commander_table_sessions')
        .insert(activeSessions)
        .select('id');

    if (actErr) {
        console.error(`  ❌ commander_table_sessions (active): ${actErr.message}`);
        errors++;
    } else {
        console.log(`  ✅ commander_table_sessions: ${actResult?.length || activeSessions.length} active sessions inserted (on the clock now)`);
        inserted += actResult?.length || activeSessions.length;
    }
    // ═══════════════════════════════════════════════════
    //  DONE
    // ═══════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════');
    console.log(`  COMPLETE: ${updated} members updated, ${inserted} sessions inserted, ${errors} errors`);
    console.log('═══════════════════════════════════════════════\n');

    if (errors > 0) process.exit(1);
})();
