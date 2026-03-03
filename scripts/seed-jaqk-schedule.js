#!/usr/bin/env node
/**
 * Seed Schedule, Time Clock & Dealer Downs data for Club JAQK (venue_id: 1996)
 *
 * Creates:
 *  - 2 weeks of shifts in commander_staff_shifts
 *  - 7 days of time clock entries in commander_time_clock
 *  - 14 days of dealer rotations in commander_dealer_rotations
 *
 * Usage: node scripts/seed-jaqk-schedule.js
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Config ──────────────────────────────────────────────────────────
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996; // Club JAQK — integer FK to poker_venues.id
const uuid = () => crypto.randomUUID();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

let inserted = 0;
let errors = 0;

async function insert(table, rows) {
    const { data, error } = await sb.from(table).insert(rows).select('id');
    if (error) {
        console.error(`  ❌ ${table}: ${error.message}`);
        errors++;
        return [];
    }
    const count = Array.isArray(data) ? data.length : 1;
    inserted += count;
    console.log(`  ✅ ${table}: ${count} rows inserted`);
    return data || [];
}

// ─────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log('═══════════════════════════════════════════════');
    console.log('  CLUB JAQK (venue 1996) — Schedule/TimeClock/Downs');
    console.log('═══════════════════════════════════════════════\n');

    // Step 1: Fetch existing Club JAQK staff
    const { data: staff, error: staffErr } = await sb
        .from('commander_staff')
        .select('id, display_name, role')
        .eq('venue_id', VENUE_ID)
        .eq('is_active', true);

    if (staffErr || !staff || staff.length === 0) {
        console.error('❌ No staff found for venue 1996. Run seed-commander-jaqk.js first!');
        process.exit(1);
    }

    console.log(`  Found ${staff.length} active staff:`);
    staff.forEach(s => console.log(`    • ${s.display_name} (${s.role})`));
    console.log('');

    const dealers = staff.filter(s => s.role === 'dealer');
    const floors = staff.filter(s => s.role === 'floor');
    const managers = staff.filter(s => s.role === 'manager');
    const allRoles = staff;

    // ═══════════════════════════════════════════════════
    //  PHASE 1: Staff Shifts (2 weeks — current + next)
    // ═══════════════════════════════════════════════════
    console.log('── Phase 1: Staff Schedule Shifts (2 Weeks) ──\n');

    // Clean up old shifts first
    const { error: delErr } = await sb
        .from('commander_staff_shifts')
        .delete()
        .eq('venue_id', VENUE_ID);
    if (delErr) console.warn(`  ⚠️  cleanup: ${delErr.message}`);
    else console.log('  🧹 Cleaned existing shifts');

    const shifts = [];
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Align to Sunday

    const SHIFT_PRESETS = {
        dealer: [
            { start: '10:00', end: '18:00', label: 'Day' },
            { start: '14:00', end: '22:00', label: 'Swing' },
            { start: '18:00', end: '02:00', label: 'Night' },
        ],
        floor: [
            { start: '10:00', end: '20:00', label: 'Day' },
            { start: '14:00', end: '00:00', label: 'Swing' },
            { start: '18:00', end: '04:00', label: 'Night' },
        ],
        manager: [
            { start: '10:00', end: '20:00', label: 'Day' },
            { start: '14:00', end: '00:00', label: 'Swing' },
        ],
        cashier: [
            { start: '09:00', end: '17:00', label: 'Morning' },
            { start: '13:00', end: '21:00', label: 'Afternoon' },
            { start: '17:00', end: '01:00', label: 'Evening' },
        ],
        brush: [
            { start: '10:00', end: '18:00', label: 'Day' },
            { start: '16:00', end: '00:00', label: 'Swing' },
        ],
        owner: [
            { start: '10:00', end: '20:00', label: 'Day' },
        ],
        security: [
            { start: '10:00', end: '22:00', label: 'Day' },
            { start: '22:00', end: '10:00', label: 'Night' },
        ],
    };

    // Generate 14 days of shifts
    for (let week = 0; week < 2; week++) {
        for (const person of allRoles) {
            const presets = SHIFT_PRESETS[person.role] || SHIFT_PRESETS.dealer;
            const preferredShift = presets[staff.indexOf(person) % presets.length];

            // Each person works 5 days per week (random days off)
            const daysOff = new Set();
            while (daysOff.size < 2) daysOff.add(rand(0, 6));

            for (let day = 0; day < 7; day++) {
                if (daysOff.has(day)) continue;

                const shiftDate = new Date(weekStart);
                shiftDate.setDate(weekStart.getDate() + (week * 7) + day);
                const dateStr = shiftDate.toISOString().split('T')[0];

                shifts.push({
                    venue_id: VENUE_ID,
                    staff_id: person.id,
                    staff_name: person.display_name,
                    staff_role: person.role,
                    shift_date: dateStr,
                    start_time: preferredShift.start,
                    end_time: preferredShift.end,
                    notes: week === 0 && day === 0 ? `${preferredShift.label} shift` : null,
                    created_by: 'Seed Script',
                });
            }
        }
    }

    await insert('commander_staff_shifts', shifts);

    // ═══════════════════════════════════════════════════
    //  PHASE 2: Time Clock Entries (7 Days)
    // ═══════════════════════════════════════════════════
    console.log('\n── Phase 2: Time Clock Entries (7 Days) ──────\n');

    // Check if time clock table exists
    const timeClockEntries = [];
    for (let day = 0; day < 7; day++) {
        const entryDate = new Date(today);
        entryDate.setDate(today.getDate() - day);
        const dateStr = entryDate.toISOString().split('T')[0];

        // 4-7 staff clock in/out per day
        const dayStaff = [...allRoles].sort(() => Math.random() - 0.5).slice(0, rand(4, Math.min(7, allRoles.length)));

        for (const person of dayStaff) {
            const presets = SHIFT_PRESETS[person.role] || SHIFT_PRESETS.dealer;
            const shift = pick(presets);
            const [startH, startM] = shift.start.split(':').map(Number);

            const clockIn = new Date(`${dateStr}T${shift.start}:00`);
            // Add small random variance (-5 to +10 minutes)
            clockIn.setMinutes(clockIn.getMinutes() + rand(-5, 10));

            const clockedOut = day > 0 || (day === 0 && new Date() > clockIn);
            let clockOut = null;
            let hoursWorked = null;

            if (clockedOut) {
                const [endH, endM] = shift.end.split(':').map(Number);
                clockOut = new Date(`${dateStr}T${shift.end}:00`);
                if (endH < startH) clockOut.setDate(clockOut.getDate() + 1); // Overnight
                clockOut.setMinutes(clockOut.getMinutes() + rand(-10, 15));
                hoursWorked = Math.round(((clockOut - clockIn) / 3600000) * 100) / 100;
            }

            timeClockEntries.push({
                venue_id: VENUE_ID,
                staff_id: person.id,
                clock_in: clockIn.toISOString(),
                clock_out: clockOut ? clockOut.toISOString() : null,
                hours_worked: hoursWorked,
            });
        }
    }

    // Try to insert — table may not exist
    try {
        await insert('commander_time_clock', timeClockEntries);
    } catch (e) {
        console.warn('  ⚠️  commander_time_clock table may not exist yet');
    }

    // ═══════════════════════════════════════════════════
    //  PHASE 3: Dealer Downs / Rotations (14 Days)
    // ═══════════════════════════════════════════════════
    console.log('\n── Phase 3: Dealer Downs/Rotations (14 Days) ─\n');

    // Dealer rotations use commander_dealers (not commander_staff)
    const { data: realDealers, error: dealerErr } = await sb
        .from('commander_dealers')
        .select('id, name')
        .eq('venue_id', VENUE_ID)
        .eq('is_active', true);

    if (dealerErr || !realDealers || realDealers.length === 0) {
        console.log('  ⏭️  No dealers found in commander_dealers — skipping downs');
    } else {
        console.log(`  Found ${realDealers.length} dealers in commander_dealers`);
        const rotations = [];
        for (let day = 0; day < 14; day++) {
            const rotDate = new Date(today);
            rotDate.setDate(today.getDate() - day);
            const dateStr = rotDate.toISOString().split('T')[0];

            // Each dealer gets 3-6 table rotations per day
            for (const dealer of realDealers) {
                const numRotations = rand(3, 6);
                let currentTime = new Date(`${dateStr}T10:00:00`);

                for (let r = 0; r < numRotations; r++) {
                    const tableNum = rand(1, 12);
                    const durationMins = rand(25, 40); // 25-40 min per down
                    const endTime = new Date(currentTime.getTime() + durationMins * 60000);

                    rotations.push({
                        venue_id: VENUE_ID,
                        dealer_id: dealer.id,
                        dealer_name: dealer.name,
                        table_number: tableNum,
                        started_at: currentTime.toISOString(),
                        ended_at: day > 0 ? endTime.toISOString() : (r < numRotations - 1 ? endTime.toISOString() : null),
                    });

                    // Next rotation starts after a 5-10 min break
                    currentTime = new Date(endTime.getTime() + rand(5, 10) * 60000);
                }
            }
        }

        try {
            await insert('commander_dealer_rotations', rotations);
        } catch (e) {
            console.warn('  ⚠️  commander_dealer_rotations insert issue:', e.message);
        }
    }

    // ═══════════════════════════════════════════════════
    //  DONE
    // ═══════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════');
    console.log(`  COMPLETE: ${inserted} rows inserted, ${errors} errors`);
    console.log('═══════════════════════════════════════════════\n');

    if (errors > 0) process.exit(1);
})();
