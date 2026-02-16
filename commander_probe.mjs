/**
 * Probe valid enum values for Commander check constraints
 */
import { readFileSync } from 'fs';

const envPath = new URL('.env.local', import.meta.url).pathname;
const env = {};
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2].replace(/\\n$/, '');
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
};

const id = crypto.randomUUID();

async function probe(table, column, values) {
    console.log(`\n── ${table}.${column} ──`);
    for (const val of values) {
        const row = { id, [column]: val };
        // Add required fields
        if (table === 'commander_staff') { row.venue_id = 1864; row.display_name = 'test'; }
        if (table === 'commander_tables') { row.venue_id = 1864; row.table_number = 999; }
        if (table === 'commander_waitlist') { row.venue_id = 1864; row.game_type = 'NLH'; row.stakes = '1/3'; row.player_name = 'test'; row.position = 1; }
        if (table === 'commander_service_requests') { row.venue_id = 1864; row.request_type = 'food'; }
        if (table === 'commander_player_sessions') { row.venue_id = 1864; row.player_name = 'test'; }
        if (table === 'commander_promotions') { row.venue_id = 1864; row.name = 'test'; }
        if (table === 'commander_tournaments') { row.venue_id = 1864; row.name = 'test'; row.tournament_type = 'freezeout'; row.buyin_amount = 100; row.starting_chips = 10000; }

        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
            method: 'POST', headers, body: JSON.stringify(row),
        });
        if (res.ok) {
            console.log(`  ✅ "${val}" — VALID`);
            // Delete the test row
            await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers });
        } else {
            const err = await res.text();
            if (err.includes('check constraint')) {
                console.log(`  ❌ "${val}" — invalid`);
            } else if (err.includes('duplicate') || err.includes('unique')) {
                console.log(`  ✅ "${val}" — VALID (dup)`);
            } else {
                console.log(`  ⚠️ "${val}" — other error: ${err.substring(0, 120)}`);
            }
        }
    }
}

async function main() {
    console.log('🔍 Probing check constraint enum values...\n');

    await probe('commander_staff', 'role', [
        'owner', 'manager', 'floor', 'dealer', 'host', 'cashier',
        'supervisor', 'admin', 'staff', 'pit_boss', 'shift_manager',
    ]);

    await probe('commander_tables', 'status', [
        'active', 'inactive', 'reserved', 'maintenance', 'closed',
        'open', 'available', 'occupied', 'running', 'empty', 'broken',
    ]);

    await probe('commander_waitlist', 'signup_method', [
        'staff', 'kiosk', 'app', 'phone', 'online', 'walk_in', 'web', 'sms', 'in_person',
    ]);

    await probe('commander_waitlist', 'status', [
        'waiting', 'called', 'seated', 'left', 'removed', 'expired', 'no_show', 'cancelled', 'active',
    ]);

    await probe('commander_service_requests', 'priority', [
        'low', 'normal', 'high', 'urgent', 'critical', 1, 2, 3, 4, 5,
    ]);

    await probe('commander_service_requests', 'status', [
        'pending', 'acknowledged', 'completed', 'cancelled', 'in_progress', 'open', 'closed',
    ]);

    await probe('commander_player_sessions', 'status', [
        'checked_out', 'active', 'checked_in', 'closed', 'open', 'ended', 'in_progress', 'completed',
    ]);

    await probe('commander_promotions', 'status', [
        'active', 'expired', 'paused', 'draft', 'ended', 'scheduled', 'inactive',
    ]);

    await probe('commander_tournaments', 'status', [
        'scheduled', 'registration', 'running', 'completed', 'cancelled',
        'live', 'active', 'finished', 'upcoming', 'paused', 'SCHEDULED', 'RUNNING',
    ]);
}

main().catch(console.error);
