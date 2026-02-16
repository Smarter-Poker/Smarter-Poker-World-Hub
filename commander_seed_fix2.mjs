/**
 * Commander Seed - Final Fix: Individual inserts for home_members + export_jobs
 */
import { readFileSync } from 'fs';

const envPath = new URL('.env.local', import.meta.url).pathname;
const env = {};
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2].replace(/\\n$/, '');
});

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = {
    'apikey': KEY, 'Authorization': `Bearer ${KEY}`,
    'Content-Type': 'application/json', 'Prefer': 'return=representation',
};

async function insertRow(table, row) {
    const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
        method: 'POST', headers: hdrs, body: JSON.stringify(row),
    });
    return res.ok;
}

async function main() {
    console.log('\n🔧 Final targeted fix\n');

    // Get existing home_members to know what's there
    const existingRes = await fetch(`${SB_URL}/rest/v1/commander_home_members?select=group_id,user_id`, {
        headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` },
    });
    const existing = await existingRes.json();
    const existingKeys = new Set(existing.map(e => `${e.group_id}|${e.user_id}`));
    console.log(`  Existing home_members: ${existing.length}`);

    // Get groups + profiles
    const groupsRes = await fetch(`${SB_URL}/rest/v1/commander_home_groups?select=id&limit=5`, {
        headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` },
    });
    const groups = await groupsRes.json();

    const profilesRes = await fetch(`${SB_URL}/rest/v1/profiles?select=id&limit=50`, {
        headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` },
    });
    const profiles = await profilesRes.json();
    const userIds = profiles.map(p => p.id);

    // Insert home_members that don't already exist
    console.log('── Home Members ──');
    let inserted = 0;
    for (let gi = 0; gi < groups.length; gi++) {
        const gid = groups[gi].id;
        const offset = gi * 12; // Different offset to avoid overlap
        for (let i = 0; i < 10; i++) {
            const uid = userIds[(offset + i) % userIds.length];
            const key = `${gid}|${uid}`;
            if (!existingKeys.has(key)) {
                const ok = await insertRow('commander_home_members', {
                    id: crypto.randomUUID(), group_id: gid, user_id: uid,
                    role: i === 0 ? 'owner' : i < 3 ? 'admin' : 'member',
                    status: 'approved', games_attended: Math.floor(Math.random() * 18) + 2,
                    can_host: i < 3, notifications_enabled: true,
                });
                if (ok) inserted++;
                existingKeys.add(key);
            }
        }
    }
    console.log(`  ✅ Inserted ${inserted} new home_members (${existingKeys.size} total)`);

    // Export Jobs — format: csv|json|xlsx; status: pending|processing|completed|failed|expired
    console.log('── Export Jobs ──');
    const staffRes = await fetch(`${SB_URL}/rest/v1/commander_staff?select=id&limit=1`, {
        headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` },
    });
    const staffData = await staffRes.json();
    const venueRes = await fetch(`${SB_URL}/rest/v1/poker_venues?select=id&limit=1`, {
        headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` },
    });
    const venueData = await venueRes.json();
    const VENUE_ID = venueData[0].id;
    const staffId = staffData[0]?.id || null;

    const expRows = [
        { export_type: 'players', format: 'csv', status: 'completed', row_count: 245 },
        { export_type: 'analytics', format: 'json', status: 'completed', row_count: 30 },
        { export_type: 'tournaments', format: 'xlsx', status: 'pending', row_count: 0 },
    ];

    let expOk = 0;
    for (const e of expRows) {
        const ok = await insertRow('commander_export_jobs', {
            id: crypto.randomUUID(), venue_id: VENUE_ID, requested_by: staffId,
            export_type: e.export_type, format: e.format, status: e.status,
            row_count: e.row_count,
        });
        if (ok) expOk++;
        else console.log(`  ❌ Failed: ${e.export_type}`);
    }
    console.log(`  ✅ commander_export_jobs: ${expOk} rows`);

    console.log('\n✅ Final fix complete!\n');
}

main().catch(console.error);
