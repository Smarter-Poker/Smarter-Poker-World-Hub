/**
 * Commander Data Cleanup — deletes all seeded commander data
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
    'Prefer': 'return=minimal',
};

// Delete in reverse dependency order
const TABLES = [
    'commander_post_comments', 'commander_post_likes', 'commander_venue_followers',
    'commander_venue_reviews', 'commander_venue_photos', 'commander_home_posts', 'commander_venue_posts',
    'commander_league_standings', 'commander_leagues',
    'commander_spending_limits', 'commander_self_exclusions', 'commander_tax_events',
    'commander_hand_history', 'commander_streams',
    'commander_player_recommendations', 'commander_wait_time_predictions',
    'commander_equipment_rentals', 'commander_dealer_marketplace',
    'commander_escrow_transactions', 'commander_home_game_reviews',
    'commander_home_rsvps', 'commander_home_games', 'commander_home_members', 'commander_home_groups',
    'commander_notification_log', 'commander_push_subscriptions', 'commander_club_announcements',
    'commander_export_jobs', 'commander_api_keys',
    'commander_audit_logs',
    'commander_comp_redemptions', 'commander_comp_transactions', 'commander_comp_balances', 'commander_comp_rates',
    'commander_leaderboard_entries', 'commander_leaderboards',
    'commander_player_stats', 'commander_analytics_daily',
    'commander_promotion_awards', 'commander_promotions',
    'commander_tournament_entries', 'commander_tournaments',
    'commander_player_preferences', 'commander_service_requests',
    'commander_incidents', 'commander_dealer_rotations', 'commander_dealers',
    'commander_player_sessions', 'commander_notifications',
    'commander_waitlist_group_members', 'commander_waitlist_groups',
    'commander_waitlist_history', 'commander_waitlist',
    'commander_seats', 'commander_games', 'commander_tables', 'commander_staff',
];

async function main() {
    console.log('🧹 Cleaning all Commander data...\n');
    for (const table of TABLES) {
        try {
            // Delete all rows (neq.0 matches all integer IDs, or use gte for text)
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=not.is.null`, {
                method: 'DELETE', headers,
            });
            if (res.ok) {
                console.log(`  ✅ ${table} cleared`);
            } else {
                const err = await res.text();
                console.log(`  ⚠️ ${table}: ${err.substring(0, 80)}`);
            }
        } catch (e) {
            console.log(`  ❌ ${table}: ${e.message}`);
        }
    }
    console.log('\n✅ Cleanup complete!\n');
}

main().catch(console.error);
