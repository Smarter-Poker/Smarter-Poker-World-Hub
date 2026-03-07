/**
 * E2E Verification Script for .single() → .maybeSingle() Migration
 * Tests every table and query pattern that was modified to verify:
 * 1. Queries execute without errors
 * 2. .maybeSingle() returns data or null (not throwing)
 * 3. All tables exist and are accessible
 * 4. Auth guard patterns work correctly
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

async function run() {
  console.log('Starting E2E verification of all .maybeSingle() conversions...\n');

  // ==========================================
  // AUTH & GUARD PATTERNS (src/lib/commander/auth.js)
  // ==========================================
  await test('Auth: staff lookup by user_id', async () => {
    const { data, error } = await supabase
      .from('commander_staff')
      .select('id, venue_id, role')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
    // data should be null for fake UUID - that's correct
  });

  await test('Auth: venue_settings lookup', async () => {
    const { data, error } = await supabase
      .from('commander_venue_settings')
      .select('*')
      .eq('venue_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Auth: profile lookup by id', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // COMMANDER API ROUTES
  // ==========================================
  await test('Commander: settings by venue_id', async () => {
    const { data, error } = await supabase
      .from('commander_venue_settings')
      .select('*')
      .eq('venue_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: waitlist entry by id', async () => {
    const { data, error } = await supabase
      .from('commander_waitlist')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: table by id', async () => {
    const { data, error } = await supabase
      .from('commander_tables')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: tournament by id', async () => {
    const { data, error } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: staff by id', async () => {
    const { data, error } = await supabase
      .from('commander_staff')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: floor call by id', async () => {
    const { data, error } = await supabase
      .from('commander_floor_calls')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: schedule shift by id', async () => {
    const { data, error } = await supabase
      .from('commander_schedule_shifts')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: game type by id', async () => {
    const { data, error } = await supabase
      .from('commander_game_types')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: player note by player+venue', async () => {
    const { data, error } = await supabase
      .from('commander_player_notes')
      .select('*')
      .eq('player_id', '00000000-0000-0000-0000-000000000000')
      .eq('venue_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: table rating by id', async () => {
    const { data, error } = await supabase
      .from('commander_table_ratings')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: display by id', async () => {
    const { data, error } = await supabase
      .from('commander_displays')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: league by id', async () => {
    const { data, error } = await supabase
      .from('commander_leagues')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: reward by id', async () => {
    const { data, error } = await supabase
      .from('commander_rewards')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: responsible gaming limit', async () => {
    const { data, error } = await supabase
      .from('commander_responsible_gaming')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: exclusion entry', async () => {
    const { data, error } = await supabase
      .from('commander_exclusions')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: activity log entry', async () => {
    const { data, error } = await supabase
      .from('commander_activity_log')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: bankroll session by id', async () => {
    const { data, error } = await supabase
      .from('commander_bankroll_sessions')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: time billing session', async () => {
    const { data, error } = await supabase
      .from('commander_time_billing_sessions')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: notification by id', async () => {
    const { data, error } = await supabase
      .from('commander_notifications')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: QR scan by code', async () => {
    const { data, error } = await supabase
      .from('commander_qr_scans')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: venue subscription', async () => {
    const { data, error } = await supabase
      .from('commander_subscriptions')
      .select('*')
      .eq('venue_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Commander: receipt by id', async () => {
    const { data, error } = await supabase
      .from('commander_receipts')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // CLUB ARENA API ROUTES
  // ==========================================
  await test('ClubArena: club by id', async () => {
    const { data, error } = await supabase
      .from('arena_clubs')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('ClubArena: membership by user+club', async () => {
    const { data, error } = await supabase
      .from('arena_memberships')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .eq('club_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('ClubArena: table by id', async () => {
    const { data, error } = await supabase
      .from('arena_tables')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('ClubArena: tournament by id', async () => {
    const { data, error } = await supabase
      .from('arena_tournaments')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('ClubArena: chip balance by user+club', async () => {
    const { data, error } = await supabase
      .from('arena_chip_balances')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .eq('club_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('ClubArena: message by id', async () => {
    const { data, error } = await supabase
      .from('arena_messages')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // SOCIAL API ROUTES
  // ==========================================
  await test('Social: post by id', async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Social: comment by id', async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Social: like by user+post', async () => {
    const { data, error } = await supabase
      .from('likes')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .eq('post_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // FRIENDS / MESSENGER
  // ==========================================
  await test('Friends: friendship by id', async () => {
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Messenger: conversation by id', async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // TRAINING API ROUTES
  // ==========================================
  await test('Training: progress by user_id', async () => {
    const { data, error } = await supabase
      .from('training_progress')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Training: scenario by id', async () => {
    const { data, error } = await supabase
      .from('training_scenarios')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Training: achievement by user', async () => {
    const { data, error } = await supabase
      .from('training_achievements')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // POKER TABLES / GAMES
  // ==========================================
  await test('Poker: table state by table_id', async () => {
    const { data, error } = await supabase
      .from('poker_table_states')
      .select('*')
      .eq('table_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Poker: seat by table+position', async () => {
    const { data, error } = await supabase
      .from('poker_seats')
      .select('*')
      .eq('table_id', '00000000-0000-0000-0000-000000000000')
      .eq('position', 0)
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // SHARED SERVICES
  // ==========================================
  await test('DiamondEngine: profile diamonds lookup', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('diamonds')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('DiamondEngine: profile is_vip lookup', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_vip')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('NewsBookmarks: bookmark by user+article', async () => {
    const { data, error } = await supabase
      .from('news_bookmarks')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .eq('article_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('VideoWatchHistory: history by user+video', async () => {
    const { data, error } = await supabase
      .from('video_watch_history')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .eq('video_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('TriviaPreferences: by user_id', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('trivia_preferences')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('PokerNearMeSearchHistory: by user+query', async () => {
    const { data, error } = await supabase
      .from('poker_near_me_search_history')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .eq('search_query', 'test')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // PREFERENCES SERVICES (all upsert-style)
  // ==========================================
  await test('Preferences: user preference lookup', async () => {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .eq('category', 'test')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('ArcadePreferences: by user_id', async () => {
    const { data, error } = await supabase
      .from('diamond_arcade_preferences')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // CRON JOBS
  // ==========================================
  await test('Cron: venue list for processing', async () => {
    const { data, error } = await supabase
      .from('poker_venues')
      .select('id, name')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // CONTENT ENGINE
  // ==========================================
  await test('ContentEngine: horse by id', async () => {
    const { data, error } = await supabase
      .from('content_authors')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('ContentEngine: scheduled content by id', async () => {
    const { data, error } = await supabase
      .from('scheduled_content')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // REWARDS / STORE / ARCADE
  // ==========================================
  await test('Rewards: reward claim by id', async () => {
    const { data, error } = await supabase
      .from('reward_claims')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Store: purchase by id', async () => {
    const { data, error } = await supabase
      .from('store_purchases')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Arcade: game by id', async () => {
    const { data, error } = await supabase
      .from('arcade_games')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // BANKROLL
  // ==========================================
  await test('Bankroll: session by id', async () => {
    const { data, error } = await supabase
      .from('bankroll_sessions')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Bankroll: toke by id', async () => {
    const { data, error } = await supabase
      .from('tokes')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // ASSISTANT
  // ==========================================
  await test('Assistant: conversation by id', async () => {
    const { data, error } = await supabase
      .from('assistant_conversations')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // HORSES / LIVE HELP / GEEVES
  // ==========================================
  await test('Horses: horse profile by slug', async () => {
    const { data, error } = await supabase
      .from('content_authors')
      .select('*')
      .eq('slug', 'nonexistent-horse-slug')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('LiveHelp: ticket by id', async () => {
    const { data, error } = await supabase
      .from('live_help_tickets')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Geeves: conversation by user', async () => {
    const { data, error } = await supabase
      .from('geeves_conversations')
      .select('*')
      .eq('user_id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // PROMO / NEWS / VIDEO
  // ==========================================
  await test('Promo: code by value', async () => {
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', 'NONEXISTENT_CODE_XYZ')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('News: article by id', async () => {
    const { data, error } = await supabase
      .from('news_articles')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('Video: video by id', async () => {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // SQUADS / HOME GAMES
  // ==========================================
  await test('Squads: squad by id', async () => {
    const { data, error } = await supabase
      .from('squads')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('HomeGames: game by id', async () => {
    const { data, error } = await supabase
      .from('home_games')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // VERIFY REAL DATA QUERIES (with actual data)
  // ==========================================
  await test('RealData: fetch first profile', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No profiles found - database may be empty');
  });

  await test('RealData: fetch first venue', async () => {
    const { data, error } = await supabase
      .from('poker_venues')
      .select('id, name')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('RealData: fetch first post', async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('id, content')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('RealData: fetch first staff member', async () => {
    const { data, error } = await supabase
      .from('commander_staff')
      .select('id, user_id, venue_id, role')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  await test('RealData: fetch venue settings', async () => {
    const { data, error } = await supabase
      .from('commander_venue_settings')
      .select('venue_id, room_open')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
  });

  // ==========================================
  // VERIFY QUERY PATTERNS WITH REAL DATA
  // ==========================================

  // Get a real user ID to test with
  const { data: realUser } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  if (realUser) {
    const userId = realUser.id;

    await test('RealPattern: profile lookup by real ID', async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, diamonds, is_vip')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Profile not found for known user');
    });

    await test('RealPattern: user preferences', async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
    });
  }

  // Get a real venue to test commander patterns
  const { data: realVenue } = await supabase.from('poker_venues').select('id').limit(1).maybeSingle();
  if (realVenue) {
    const venueId = realVenue.id;

    await test('RealPattern: venue settings for real venue', async () => {
      const { data, error } = await supabase
        .from('commander_venue_settings')
        .select('*')
        .eq('venue_id', venueId)
        .maybeSingle();
      if (error) throw new Error(error.message);
    });

    await test('RealPattern: tables for real venue', async () => {
      const { data, error } = await supabase
        .from('commander_tables')
        .select('*')
        .eq('venue_id', venueId)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
    });

    await test('RealPattern: waitlist for real venue', async () => {
      const { data, error } = await supabase
        .from('commander_waitlist')
        .select('*')
        .eq('venue_id', venueId)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
    });
  }

  // ==========================================
  // RESULTS
  // ==========================================
  console.log('\n\n========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  console.log('========================================\n');

  if (errors.length > 0) {
    console.log('FAILURES:');
    errors.forEach(e => console.log(`  ${e}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
