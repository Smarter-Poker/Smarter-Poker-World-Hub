/**
 * Commander Seed Verification — counts all rows in Commander tables
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
    'Prefer': 'count=exact',
};

const TABLES = [
    'commander_staff', 'commander_tables', 'commander_games', 'commander_waitlist',
    'commander_waitlist_history', 'commander_seats', 'commander_notifications',
    'commander_player_sessions', 'commander_service_requests', 'commander_player_preferences',
    'commander_tournaments', 'commander_tournament_entries',
    'commander_home_groups', 'commander_home_members', 'commander_home_games', 'commander_home_rsvps',
    'commander_club_announcements', 'commander_push_subscriptions', 'commander_notification_log',
    'commander_promotions', 'commander_promotion_awards',
    'commander_analytics_daily', 'commander_player_stats',
    'commander_leaderboards', 'commander_leaderboard_entries',
    'commander_comp_rates', 'commander_comp_balances', 'commander_comp_transactions', 'commander_comp_redemptions',
    'commander_audit_logs', 'commander_rate_limits', 'commander_system_health', 'commander_admin_settings',
    'commander_export_jobs', 'commander_api_keys',
    'commander_waitlist_groups', 'commander_waitlist_group_members',
    'commander_dealers', 'commander_dealer_rotations', 'commander_incidents',
    'commander_home_game_reviews', 'commander_escrow_transactions',
    'commander_dealer_marketplace', 'commander_equipment_rentals',
    'commander_wait_time_predictions', 'commander_player_recommendations',
    'commander_streams', 'commander_hand_history',
    'commander_tax_events', 'commander_self_exclusions', 'commander_spending_limits',
    'commander_leagues', 'commander_league_standings',
    'commander_venue_posts', 'commander_home_posts',
    'commander_venue_photos', 'commander_venue_reviews', 'commander_venue_followers',
    'commander_post_likes', 'commander_post_comments',
];

async function main() {
    console.log(`\n📊 COMMANDER SEED VERIFICATION\n${'═'.repeat(50)}\n`);
    let totalRows = 0;
    let seededTables = 0;
    let emptyTables = 0;

    for (const table of TABLES) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=0`, {
                headers,
            });
            const range = res.headers.get('content-range');
            const count = range ? parseInt(range.split('/')[1]) || 0 : 0;
            const icon = count > 0 ? '✅' : '⬜';
            console.log(`${icon} ${table}: ${count} rows`);
            totalRows += count;
            if (count > 0) seededTables++;
            else emptyTables++;
        } catch (e) {
            console.log(`❌ ${table}: ${e.message}`);
        }
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`TOTAL: ${totalRows} rows across ${seededTables} seeded tables`);
    console.log(`Empty tables: ${emptyTables}`);
    console.log(`${'═'.repeat(50)}\n`);
}

main().catch(console.error);
