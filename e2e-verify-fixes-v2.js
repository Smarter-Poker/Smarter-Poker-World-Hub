/**
 * E2E Verification Script v2 - Uses ACTUAL table names from codebase
 * Tests every .maybeSingle() pattern against live Supabase
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let passed = 0;
let failed = 0;
let errors = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write('.');
  } catch (err) {
    failed++;
    const msg = `FAIL: ${name} → ${err.message}`;
    errors.push(msg);
    process.stdout.write('F');
  }
}

// Helper: test .maybeSingle() on a table with a UUID column
async function testTable(name, table, idCol = 'id') {
  await test(name, async () => {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(idCol, '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
    // data should be null for fake UUID - that's correct behavior
  });
}

// Helper: test .maybeSingle() on a table with an integer column
async function testTableInt(name, table, idCol = 'id') {
  await test(name, async () => {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(idCol, 999999999)
      .maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
  });
}

// Helper: test .maybeSingle() with two eq filters
async function testTableDual(name, table, col1, val1, col2, val2) {
  await test(name, async () => {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(col1, val1)
      .eq(col2, val2)
      .maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
  });
}

async function run() {
  console.log('E2E Verification v2 - Testing all .maybeSingle() patterns with correct table names\n');

  // ==========================================
  // AUTH & PROFILES
  // ==========================================
  await testTable('Auth: profiles by id', 'profiles');
  await testTable('Auth: commander_staff by user_id', 'commander_staff', 'user_id');
  await testTable('Auth: premium_feature_access', 'premium_feature_access', 'user_id');

  // ==========================================
  // COMMANDER CORE TABLES
  // ==========================================
  await testTable('Cmd: commander_tables', 'commander_tables');
  await testTable('Cmd: commander_waitlist', 'commander_waitlist');
  await testTable('Cmd: commander_tournaments', 'commander_tournaments');
  await testTable('Cmd: commander_staff', 'commander_staff');
  await testTable('Cmd: commander_floor_calls', 'commander_floor_calls');
  await testTable('Cmd: commander_game_types', 'commander_game_types');
  await testTable('Cmd: commander_table_ratings', 'commander_table_ratings');
  await testTable('Cmd: commander_leagues', 'commander_leagues');
  await testTable('Cmd: commander_activity_log', 'commander_activity_log');
  await testTable('Cmd: commander_notifications', 'commander_notifications');
  await testTable('Cmd: commander_games', 'commander_games');
  await testTable('Cmd: commander_seats', 'commander_seats');
  await testTable('Cmd: commander_table_sessions', 'commander_table_sessions');
  await testTable('Cmd: commander_player_sessions', 'commander_player_sessions');
  await testTable('Cmd: commander_sessions', 'commander_sessions');
  await testTable('Cmd: commander_members', 'commander_members');
  await testTable('Cmd: commander_checkins', 'commander_checkins');
  await testTable('Cmd: commander_promotions', 'commander_promotions');
  await testTable('Cmd: commander_leaderboards', 'commander_leaderboards');
  await testTable('Cmd: commander_high_hands', 'commander_high_hands');
  await testTable('Cmd: commander_dealers', 'commander_dealers');
  await testTable('Cmd: commander_audit_logs', 'commander_audit_logs');
  await testTable('Cmd: commander_staff_shifts', 'commander_staff_shifts');
  await testTable('Cmd: commander_table_displays', 'commander_table_displays');
  await testTable('Cmd: commander_self_exclusions', 'commander_self_exclusions');
  await testTable('Cmd: commander_spending_limits', 'commander_spending_limits');
  await testTable('Cmd: commander_home_games', 'commander_home_games');
  await testTable('Cmd: commander_home_members', 'commander_home_members');
  await testTable('Cmd: commander_streams', 'commander_streams');
  await testTable('Cmd: commander_tournament_entries', 'commander_tournament_entries');
  await testTable('Cmd: commander_dealer_rotations', 'commander_dealer_rotations');
  await testTable('Cmd: commander_incidents', 'commander_incidents');
  await testTable('Cmd: commander_service_requests', 'commander_service_requests');
  await testTable('Cmd: qr_code_scans', 'qr_code_scans');

  // Commander tables with bigint/integer IDs
  await testTableInt('Cmd: commander_venue_settings (int)', 'commander_venue_settings', 'venue_id');
  await testTableInt('Cmd: commander_subscriptions (int)', 'commander_subscriptions', 'venue_id');

  // ==========================================
  // CLUB ARENA TABLES
  // ==========================================
  await testTable('Arena: clubs', 'clubs');
  await testTable('Arena: club_members', 'club_members');
  await testTable('Arena: tables (arena)', 'tables');
  await testTable('Arena: club_tournaments', 'club_tournaments');
  await testTable('Arena: cashout_requests', 'cashout_requests');
  await testTable('Arena: agents', 'agents');
  await testTable('Arena: chip_transactions', 'chip_transactions');
  await testTable('Arena: club_announcements', 'club_announcements');
  await testTable('Arena: club_shop_items', 'club_shop_items');
  await testTable('Arena: club_shop_purchases', 'club_shop_purchases');
  await testTable('Arena: bbj_pools', 'bbj_pools');
  await testTable('Arena: player_notes', 'player_notes');
  await testTable('Arena: settlement_periods', 'settlement_periods');
  await testTable('Arena: unions', 'unions');
  await testTable('Arena: notifications', 'notifications');
  await testTable('Arena: tournament_registrations', 'tournament_registrations');

  // ==========================================
  // SOCIAL / FRIENDS / MESSENGER
  // ==========================================
  await testTable('Social: social_posts', 'social_posts');
  await testTable('Social: social_comments', 'social_comments');
  await testTable('Social: social_pages', 'social_pages');
  await testTable('Social: social_conversations', 'social_conversations');
  await testTable('Social: social_messages', 'social_messages');
  await testTable('Social: friendships', 'friendships');
  await testTable('Social: follows', 'follows');
  await testTable('Social: conversations', 'conversations');
  await testTable('Social: social_reels', 'social_reels');
  await testTable('Social: social_stories', 'social_stories');

  // ==========================================
  // TRAINING
  // ==========================================
  await testTable('Train: training_progress', 'training_progress');
  await testTable('Train: training_scenarios', 'training_scenarios');
  await testTable('Train: training_sessions', 'training_sessions');
  await testTable('Train: training_user_achievements', 'training_user_achievements');
  await testTable('Train: training_leaderboard', 'training_leaderboard');
  await testTable('Train: training_daily_challenges', 'training_daily_challenges');
  await testTable('Train: training_streaks', 'training_streaks');
  await testTable('Train: training_tournaments', 'training_tournaments');

  // ==========================================
  // POKER / GAMES
  // ==========================================
  await testTable('Poker: poker_sessions', 'poker_sessions');
  await testTable('Poker: poker_venues', 'poker_venues');
  await testTable('Poker: hand_histories', 'hand_histories');
  await testTable('Poker: game_registry', 'game_registry');
  await testTable('Poker: live_games', 'live_games');
  await testTable('Poker: poker_events', 'poker_events');
  await testTable('Poker: tournaments', 'tournaments');

  // ==========================================
  // SERVICES
  // ==========================================
  await testTable('Svc: news_bookmarks', 'news_bookmarks');
  await testTable('Svc: news_read_later', 'news_read_later');
  await testTable('Svc: video_watch_history', 'video_watch_history');
  await testTable('Svc: video_favorites', 'video_favorites');
  await testTable('Svc: video_watch_later', 'video_watch_later');
  await testTable('Svc: poker_near_me_favorites', 'poker_near_me_favorites');
  await testTable('Svc: poker_near_me_search_history', 'poker_near_me_search_history');
  await testTable('Svc: diamond_transactions', 'diamond_transactions');
  await testTable('Svc: diamond_purchases', 'diamond_purchases');
  await testTable('Svc: reward_claims', 'reward_claims');
  await testTable('Svc: promo_codes by code', 'promo_codes', 'code');
  await testTable('Svc: poker_news', 'poker_news');
  await testTable('Svc: poker_clips', 'poker_clips');
  await testTable('Svc: article_bookmarks', 'article_bookmarks');

  // ==========================================
  // CONTENT ENGINE
  // ==========================================
  await testTableInt('Content: content_authors (int)', 'content_authors');
  await testTable('Content: content_schedule', 'content_schedule');
  await testTable('Content: pipeline_runs', 'pipeline_runs');
  await testTable('Content: horse_analytics', 'horse_analytics');

  // ==========================================
  // DIAMOND / ARCADE / STORE
  // ==========================================
  await testTable('Diamond: user_diamond_balance', 'user_diamond_balance', 'user_id');
  await testTable('Arcade: arcade_duels', 'arcade_duels');
  await testTable('Arcade: arcade_duel_queue', 'arcade_duel_queue');
  await testTable('Merchandise: merchandise_items', 'merchandise_items');

  // ==========================================
  // BANKROLL
  // ==========================================
  await testTable('Bankroll: bankroll_trips by id', 'bankroll_trips');
  await testTable('Bankroll: bankroll_goals', 'bankroll_goals');
  await testTable('Bankroll: bankroll_rules', 'bankroll_rules');
  await testTable('Bankroll: toke_gigs', 'toke_gigs');
  await testTable('Bankroll: toke_downs', 'toke_downs');
  await testTable('Bankroll: toke_expenses', 'toke_expenses');

  // ==========================================
  // ASSISTANT / GEEVES / JARVIS
  // ==========================================
  await testTable('Assistant: sandbox_sessions', 'sandbox_sessions');
  await testTable('Geeves: geeves_conversations', 'geeves_conversations');
  await testTable('Jarvis: jarvis_conversations', 'jarvis_conversations');
  await testTable('Jarvis: jarvis_user_training_profile', 'jarvis_user_training_profile', 'user_id');

  // ==========================================
  // TRIVIA
  // ==========================================
  await testTable('Trivia: trivia_scores', 'trivia_scores');
  await testTable('Trivia: trivia_tournaments', 'trivia_tournaments');
  await testTable('Trivia: trivia_pvp_matches', 'trivia_pvp_matches');
  await testTable('Trivia: daily_trivia_plays', 'daily_trivia_plays');

  // ==========================================
  // LIVE HELP
  // ==========================================
  await testTable('LiveHelp: live_help_tickets', 'live_help_tickets');
  await testTable('LiveHelp: live_help_conversations', 'live_help_conversations');

  // ==========================================
  // REAL DATA VERIFICATION (with actual data from DB)
  // ==========================================

  // Fetch real IDs to test with
  const { data: realProfile } = await supabase.from('profiles').select('id, username').limit(1).maybeSingle();
  const { data: realVenue } = await supabase.from('poker_venues').select('id, name').limit(1).maybeSingle();
  const { data: realStaff } = await supabase.from('commander_staff').select('id, user_id, venue_id').limit(1).maybeSingle();
  const { data: realClub } = await supabase.from('clubs').select('id, name').limit(1).maybeSingle();
  const { data: realPost } = await supabase.from('social_posts').select('id').limit(1).maybeSingle();
  const { data: realAuthor } = await supabase.from('content_authors').select('id, name').limit(1).maybeSingle();

  if (realProfile) {
    await test('RealData: profile by real ID returns data', async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, diamonds, is_vip')
        .eq('id', realProfile.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Profile not found for real ID');
      if (data.id !== realProfile.id) throw new Error('ID mismatch');
    });
  }

  if (realVenue) {
    await test('RealData: venue settings for real venue', async () => {
      const { data, error } = await supabase
        .from('commander_venue_settings')
        .select('*')
        .eq('venue_id', realVenue.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      // data may be null if no settings configured yet
    });

    await test('RealData: waitlist for real venue', async () => {
      const { data, error } = await supabase
        .from('commander_waitlist')
        .select('*')
        .eq('venue_id', realVenue.id)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
    });

    await test('RealData: tables for real venue', async () => {
      const { data, error } = await supabase
        .from('commander_tables')
        .select('*')
        .eq('venue_id', realVenue.id)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
    });
  }

  if (realStaff) {
    await test('RealData: staff by real ID returns data', async () => {
      const { data, error } = await supabase
        .from('commander_staff')
        .select('id, user_id, venue_id, role')
        .eq('id', realStaff.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Staff not found for real ID');
    });

    await test('RealData: auth guard pattern (staff by user_id)', async () => {
      const { data, error } = await supabase
        .from('commander_staff')
        .select('id, venue_id, role')
        .eq('user_id', realStaff.user_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Auth guard failed for real user');
    });
  }

  if (realClub) {
    await test('RealData: club by real ID', async () => {
      const { data, error } = await supabase
        .from('clubs')
        .select('id, name')
        .eq('id', realClub.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Club not found');
    });
  }

  if (realPost) {
    await test('RealData: social post by real ID', async () => {
      const { data, error } = await supabase
        .from('social_posts')
        .select('id, content')
        .eq('id', realPost.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Post not found');
    });
  }

  if (realAuthor) {
    await test('RealData: content author by real ID', async () => {
      const { data, error } = await supabase
        .from('content_authors')
        .select('id, name')
        .eq('id', realAuthor.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Author not found');
    });
  }

  // ==========================================
  // RESULTS
  // ==========================================
  console.log('\n\n========================================');
  console.log(`E2E RESULTS: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} tests`);
  console.log('========================================\n');

  if (errors.length > 0) {
    console.log('FAILURES:');
    errors.forEach(e => console.log(`  ${e}`));
    console.log('');
  }

  if (failed === 0) {
    console.log('ALL TESTS PASSED - Every .maybeSingle() query pattern verified against live DB');
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
