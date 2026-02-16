/**
 * Commander Schema Inspector
 * Probes live Supabase to discover which commander_ tables exist and their columns.
 */
import { readFileSync } from 'fs';

// Load env
const envPath = new URL('.env.local', import.meta.url).pathname;
const env = {};
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2].replace(/\\n$/, '');
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SERVICE_KEY');
    process.exit(1);
}

const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
};

// All commander tables from COMMANDER_FULL_SCHEMA.sql
const ALL_TABLES = [
    'poker_venues',
    'profiles',
    'commander_staff',
    'commander_tables',
    'commander_games',
    'commander_waitlist',
    'commander_waitlist_history',
    'commander_seats',
    'commander_notifications',
    'commander_player_sessions',
    'commander_service_requests',
    'commander_player_preferences',
    'commander_tournaments',
    'commander_tournament_entries',
    'commander_home_groups',
    'commander_home_members',
    'commander_home_games',
    'commander_home_rsvps',
    'commander_club_announcements',
    'commander_push_subscriptions',
    'commander_notification_log',
    'commander_promotions',
    'commander_promotion_awards',
    'commander_analytics_daily',
    'commander_player_stats',
    'commander_leaderboards',
    'commander_leaderboard_entries',
    'commander_comp_rates',
    'commander_comp_balances',
    'commander_comp_transactions',
    'commander_comp_redemptions',
    'commander_audit_logs',
    'commander_rate_limits',
    'commander_system_health',
    'commander_admin_settings',
    'commander_export_jobs',
    'commander_api_keys',
    'commander_waitlist_groups',
    'commander_waitlist_group_members',
    'commander_dealers',
    'commander_dealer_rotations',
    'commander_incidents',
    'commander_home_game_reviews',
    'commander_escrow_transactions',
    'commander_dealer_marketplace',
    'commander_equipment_rentals',
    'commander_wait_time_predictions',
    'commander_player_recommendations',
    'commander_streams',
    'commander_hand_history',
    'commander_tax_events',
    'commander_self_exclusions',
    'commander_spending_limits',
    'commander_leagues',
    'commander_league_standings',
    'commander_venue_posts',
    'commander_home_posts',
    'commander_venue_photos',
    'commander_venue_reviews',
    'commander_venue_followers',
    'commander_post_likes',
    'commander_post_comments',
    'commander_tournament_templates',
];

async function probeTable(table) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=0`, { headers });
        if (res.ok) {
            // Get columns from OpenAPI spec
            const specRes = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers });
            const spec = await specRes.json();
            const def = spec.definitions?.[table];
            const cols = def ? Object.keys(def.properties || {}) : [];

            // Also count existing rows
            const countRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
                headers: { ...headers, 'Prefer': 'count=exact' }
            });
            const countHeader = countRes.headers.get('content-range');
            const count = countHeader ? countHeader.split('/')[1] : '?';

            return { table, exists: true, columns: cols, rowCount: count };
        } else {
            return { table, exists: false, error: res.status };
        }
    } catch (e) {
        return { table, exists: false, error: e.message };
    }
}

async function main() {
    console.log(`\n🔍 Inspecting ${ALL_TABLES.length} Commander tables at ${SUPABASE_URL}\n`);

    // Fetch OpenAPI spec once
    const specRes = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers });
    const spec = await specRes.json();

    const results = { exists: [], missing: [] };

    for (const table of ALL_TABLES) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=0`, { headers });
            if (res.ok) {
                const def = spec.definitions?.[table];
                const cols = def ? Object.keys(def.properties || {}) : [];

                // Count rows
                const countRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
                    headers: { ...headers, 'Prefer': 'count=exact' }
                });
                const countHeader = countRes.headers.get('content-range');
                const count = countHeader ? countHeader.split('/')[1] : '?';

                results.exists.push({ table, columns: cols, rowCount: count });
                console.log(`✅ ${table} (${count} rows) [${cols.length} cols]: ${cols.join(', ')}`);
            } else {
                results.missing.push({ table, status: res.status });
                console.log(`❌ ${table} — HTTP ${res.status}`);
            }
        } catch (e) {
            results.missing.push({ table, error: e.message });
            console.log(`❌ ${table} — ${e.message}`);
        }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`SUMMARY: ${results.exists.length} tables exist, ${results.missing.length} missing`);
    console.log(`${'═'.repeat(60)}`);

    if (results.missing.length > 0) {
        console.log(`\nMissing tables:`);
        results.missing.forEach(t => console.log(`  - ${t.table}`));
    }

    // Also check for existing venue and profile IDs we can reference
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`EXISTING DATA DISCOVERY`);
    console.log(`${'═'.repeat(60)}`);

    // Get venue IDs
    try {
        const venueRes = await fetch(`${SUPABASE_URL}/rest/v1/poker_venues?select=id,name&limit=10`, { headers });
        const venues = await venueRes.json();
        console.log(`\nVenues (${venues.length}):`);
        venues.forEach(v => console.log(`  ${v.id}: ${v.name}`));
    } catch (e) {
        console.log(`  ❌ Could not fetch venues: ${e.message}`);
    }

    // Get profile IDs
    try {
        const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,username,display_name&limit=10`, { headers });
        const profiles = await profileRes.json();
        console.log(`\nProfiles (${profiles.length}):`);
        profiles.forEach(p => console.log(`  ${p.id}: ${p.username || p.display_name}`));
    } catch (e) {
        console.log(`  ❌ Could not fetch profiles: ${e.message}`);
    }

    // Get existing staff
    if (results.exists.some(t => t.table === 'commander_staff')) {
        try {
            const staffRes = await fetch(`${SUPABASE_URL}/rest/v1/commander_staff?select=id,venue_id,name,role&limit=10`, { headers });
            const staff = await staffRes.json();
            console.log(`\nStaff (${staff.length}):`);
            staff.forEach(s => console.log(`  ${s.id}: ${s.name} (${s.role}) @ venue ${s.venue_id}`));
        } catch (e) {
            console.log(`  ❌ Could not fetch staff: ${e.message}`);
        }
    }
}

main().catch(console.error);
