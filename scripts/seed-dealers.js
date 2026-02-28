/**
 * Seed 20 New Dealers + Rotation Schedule for Club JAQK
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+?)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/"/g, '').trim();
const sb = createClient(url, key);

const VENUE_ID = 1996;
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

const NEW_DEALERS = [
    { name: 'Anthony "Big Tony" Russo', skill: 5, certs: ['nlh', 'plo', 'mixed'] },
    { name: 'Vanessa Liu', skill: 5, certs: ['nlh', 'plo'] },
    { name: 'Marcus "Money" Williams', skill: 4, certs: ['nlh', 'plo', 'mixed'] },
    { name: 'Rachel Nguyen', skill: 4, certs: ['nlh', 'plo'] },
    { name: 'Derek "The Pitch" Patel', skill: 5, certs: ['nlh', 'plo', 'stud'] },
    { name: 'Camille Brooks', skill: 3, certs: ['nlh'] },
    { name: 'Jordan Kessler', skill: 4, certs: ['nlh', 'plo'] },
    { name: 'Natasha Petrov', skill: 5, certs: ['nlh', 'plo', 'mixed', 'stud'] },
    { name: 'Tyreke Jackson', skill: 4, certs: ['nlh', 'plo'] },
    { name: 'Mia Hernandez', skill: 3, certs: ['nlh'] },
    { name: 'Brandon "B-Mac" McAlister', skill: 4, certs: ['nlh', 'plo', 'mixed'] },
    { name: 'Sofia Ricci', skill: 5, certs: ['nlh', 'plo'] },
    { name: 'Isaiah Thompson', skill: 3, certs: ['nlh'] },
    { name: 'Elena Volkov', skill: 4, certs: ['nlh', 'plo', 'mixed'] },
    { name: 'Chris "Smooth Hands" Park', skill: 5, certs: ['nlh', 'plo', 'stud', 'mixed'] },
    { name: 'Aaliyah Washington', skill: 4, certs: ['nlh', 'plo'] },
    { name: "Liam O'Brien", skill: 3, certs: ['nlh'] },
    { name: 'Gabrielle Dupont', skill: 4, certs: ['nlh', 'plo', 'mixed'] },
    { name: 'Mateo Cruz', skill: 5, certs: ['nlh', 'plo'] },
    { name: 'Priya Sharma', skill: 4, certs: ['nlh', 'plo', 'mixed'] },
];

(async () => {
    console.log('══════════════════════════════════════');
    console.log('  DEALER SEEDING — Club JAQK');
    console.log('══════════════════════════════════════\n');

    // ── 1. Clean old rotations ──
    await sb.from('commander_dealer_rotations').delete().eq('venue_id', VENUE_ID);
    console.log('✅ Old rotations cleared');

    // ── 2. Activate all existing dealers ──
    await sb.from('commander_dealers').update({ is_active: true }).eq('venue_id', VENUE_ID);
    console.log('✅ All existing dealers activated');

    // ── 3. Insert 20 new dealers ──
    const inserts = NEW_DEALERS.map((d, i) => ({
        venue_id: VENUE_ID,
        name: d.name,
        employee_id: `DLR-${108 + i}`,
        skill_level: d.skill,
        certified_games: d.certs,
        is_active: true,
        hired_date: new Date(2024, rand(0, 11), rand(1, 28)).toISOString().split('T')[0],
    }));

    const { data: newDealers, error } = await sb.from('commander_dealers').insert(inserts).select('id, name, employee_id');
    if (error) { console.error('❌ Insert error:', error.message); return; }
    console.log(`✅ ${newDealers.length} new dealers inserted`);

    // ── 4. Get all active dealers ──
    const { data: allDealers } = await sb.from('commander_dealers')
        .select('id, name, employee_id')
        .eq('venue_id', VENUE_ID).eq('is_active', true)
        .order('employee_id');
    console.log(`✅ Total active dealers: ${allDealers.length}`);

    // ── 5. Get active tables ──
    const { data: tables } = await sb.from('commander_tables')
        .select('id, table_number')
        .eq('venue_id', VENUE_ID).eq('status', 'in_use')
        .order('table_number');
    console.log(`✅ Active tables: ${tables.length}\n`);

    // ── 6. Build 30-min rotation schedule ──
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const rotations = [];
    let di = 0;

    for (const table of tables) {
        // 3 rotations per table: 2 completed + 1 active
        for (let ago = 3; ago >= 1; ago--) {
            const started = new Date(now.getTime() - ago * 30 * 60000);
            const ended = ago === 1 ? null : new Date(now.getTime() - (ago - 1) * 30 * 60000);
            const dealer = allDealers[di % allDealers.length];
            di++;

            rotations.push({
                venue_id: VENUE_ID,
                dealer_id: dealer.id,
                dealer_name: dealer.name,
                table_number: table.table_number,
                started_at: started.toISOString(),
                ended_at: ended ? ended.toISOString() : null,
                rotation_date: today,
                duration_minutes: 30,
                break_after: false,
            });
        }
    }

    const { error: rotErr } = await sb.from('commander_dealer_rotations').insert(rotations);
    if (rotErr) { console.error('❌ Rotation error:', rotErr.message); return; }

    const active = rotations.filter(r => !r.ended_at);
    const completed = rotations.filter(r => r.ended_at);
    console.log('── ROTATION SCHEDULE ──');
    console.log(`  Total records: ${rotations.length}`);
    console.log(`  Active (dealing now): ${active.length}`);
    console.log(`  Completed (past pushes): ${completed.length}`);
    console.log(`  Push interval: 30 minutes\n`);

    console.log('── CURRENT TABLE ASSIGNMENTS ──');
    for (const rot of active) {
        const mins = Math.round((now - new Date(rot.started_at)) / 60000);
        console.log(`  T${String(rot.table_number).padStart(2)} → ${rot.dealer_name} (${mins} min ago)`);
    }

    const dealingIds = new Set(active.map(r => r.dealer_id));
    const avail = allDealers.filter(d => !dealingIds.has(d.id));
    console.log(`\n── DEALER STATUS ──`);
    console.log(`  🎰 Dealing: ${dealingIds.size}`);
    console.log(`  ✋ Available: ${avail.length}`);
    avail.forEach(d => console.log(`     ${d.employee_id} ${d.name}`));
    console.log(`\n✅ ALL DONE — ${allDealers.length} dealers, ${active.length} tables covered`);
})();
