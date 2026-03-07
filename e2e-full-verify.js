/**
 * COMPREHENSIVE E2E VERIFICATION - Tests every table used with .maybeSingle()
 * against the LIVE Supabase database. Verifies:
 * 1. Table exists in database
 * 2. .maybeSingle() query executes without error
 * 3. Returns null (not error) for non-existent records
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let passed = 0;
let failed = 0;
let missing = 0;
const errors = [];
const missingTables = [];

async function testTable(table) {
  try {
    // First: does the table exist?
    const { data: check, error: checkErr } = await supabase.from(table).select('*').limit(0);
    if (checkErr) {
      if (checkErr.message.includes('Could not find the table') || checkErr.message.includes('schema cache')) {
        missing++;
        missingTables.push(table);
        process.stdout.write('M');
        return;
      }
      throw checkErr;
    }

    // Second: does .maybeSingle() work on it?
    const { data, error } = await supabase.from(table).select('*').limit(1).maybeSingle();
    if (error) throw error;

    // data can be null (empty table) or an object (has data) - both are valid
    passed++;
    process.stdout.write('.');
  } catch (err) {
    failed++;
    errors.push(`${table}: ${err.message}`);
    process.stdout.write('F');
  }
}

async function run() {
  const tables = [
    'agents','arcade_duel_queue','article_bookmarks','avatar_unlocks','bankroll_ledger',
    'bankroll_locations','bankroll_segments','bankroll_trips','bbj_pools','blocked_users',
    'cashout_requests','chip_transactions','club_game_seats','club_live_games','club_members',
    'club_shop_items','club_tournaments','clubs','commander_analytics_daily','commander_api_keys',
    'commander_cash_transactions','commander_clock_presets','commander_club_announcements',
    'commander_comp_balances','commander_dealer_marketplace','commander_dealers',
    'commander_equipment_rentals','commander_escrow_transactions','commander_export_jobs',
    'commander_floor_calls','commander_freeroll_qualifications','commander_freerolls',
    'commander_game_types','commander_games','commander_hand_history','commander_high_hands',
    'commander_home_game_reviews','commander_home_games','commander_home_groups',
    'commander_home_members','commander_home_rsvps','commander_incidents','commander_leaderboards',
    'commander_leads','commander_league_standings','commander_leagues','commander_member_comp_log',
    'commander_members','commander_membership_plans','commander_player_preferences',
    'commander_player_reputation_scores','commander_player_sessions','commander_promotion_awards',
    'commander_promotions','commander_room_presets','commander_seat_preferences','commander_seats',
    'commander_self_exclusions','commander_service_requests','commander_spending_limits',
    'commander_staff','commander_streams','commander_subscriptions','commander_table_displays',
    'commander_table_sessions','commander_tables','commander_tax_events','commander_time_clock',
    'commander_tournament_entries','commander_tournament_leaderboards','commander_tournament_points',
    'commander_tournament_templates','commander_tournaments','commander_venue_followers',
    'commander_venue_posts','commander_venue_reviews','commander_venue_settings','commander_waitlist',
    'commander_waitlist_group_members','commander_waitlist_groups','commission_records',
    'content_authors','content_settings','daily_trivia_plays','diamond_purchases',
    'diamond_reward_claims','endless_high_scores','follows','friendships','game_registry',
    'geeves_answer_ratings','geeves_conversations','geeves_knowledge_cache','god_mode_questions',
    'god_mode_user_session','grok_explanation_cache','hand_histories','hand_private_state',
    'horse_opponent_reads','horse_relationships','horse_session_stats','horse_threat_intel',
    'jarvis_response_cache','jarvis_training_sessions','jarvis_user_training_profile',
    'leak_hand_examples','live_games','live_help_conversations','live_streams','memory_charts_gold',
    'memory_daily_challenges','news_bookmarks','news_read_later','newsletter_subscribers','orders',
    'page_claims','page_followers','pipeline_runs','player_notes','player_stats',
    'poker_near_me_favorites','poker_near_me_search_history','poker_news','poker_venues',
    'posted_clips','posted_sports_clips','profiles','promo_code_redemptions','promo_codes',
    'rakeback_periods','saved_reels','seeded_content','settlement_locks','settlement_periods',
    'sms_otp_codes','social_comments','social_connections','social_conversation_participants',
    'social_conversations','social_interactions','social_likes','social_media',
    'social_messaging_settings','social_page_followers','social_page_post_likes',
    'social_page_posts','social_page_reviews','social_pages','social_posts','social_reels',
    'solved_spots_gold','staff_claim_tokens','stories','survival_progress','tables','toke_downs',
    'toke_gig_days','toke_gigs','tournament_alert_preferences','tournament_registrations',
    'tournament_series','training_achievement_definitions','training_challenge_definitions',
    'training_daily_bonus','training_daily_challenges','training_leaderboard','training_levels',
    'training_progress','training_scenarios','training_streaks','training_tournament_entries',
    'training_tournaments','training_user_challenges','trivia_category_mastery','trivia_pvp_matches',
    'trivia_pvp_queue','trivia_pvp_stats','trivia_streaks','trivia_survival_runs',
    'trivia_tournament_entries','trivia_tournaments','union_admins','union_clubs','unions',
    'user_assistant_stats','user_avatars','user_daily_streaks','user_diamond_balance',
    'user_dna_profiles','user_leaks','user_level_progress','user_mfa_factors','user_poker_stats',
    'user_preferences','user_sessions','user_training_leaks','venue_checkins','venue_claims',
    'venue_managers','venue_reviews','venues','video_analysis','video_favorites',
    'video_watch_history','video_watch_later','vip_feature_dismissals','vip_subscriptions',
    'wishlists','xp_logs'
  ];

  console.log(`Testing ${tables.length} tables against live Supabase...\n`);

  // Run in batches of 20 for speed
  for (let i = 0; i < tables.length; i += 20) {
    const batch = tables.slice(i, i + 20);
    await Promise.all(batch.map(t => testTable(t)));
  }

  console.log('\n\n' + '='.repeat(60));
  console.log(`RESULTS: ${passed} PASS | ${failed} FAIL | ${missing} MISSING TABLES`);
  console.log('='.repeat(60));

  if (errors.length > 0) {
    console.log('\nFAILURES (query errors on existing tables):');
    errors.forEach(e => console.log(`  ✗ ${e}`));
  }

  if (missingTables.length > 0) {
    console.log(`\nMISSING TABLES (${missingTables.length} - not created in Supabase yet):`);
    missingTables.forEach(t => console.log(`  ○ ${t}`));
  }

  // Now test with REAL data - fetch actual records and verify .maybeSingle() returns them
  console.log('\n\n' + '='.repeat(60));
  console.log('REAL DATA VERIFICATION');
  console.log('='.repeat(60));

  let realPassed = 0;
  let realFailed = 0;
  const realErrors = [];

  async function realTest(name, fn) {
    try {
      await fn();
      realPassed++;
      process.stdout.write('.');
    } catch (err) {
      realFailed++;
      realErrors.push(`${name}: ${err.message}`);
      process.stdout.write('F');
    }
  }

  // Get real IDs
  const { data: profile } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  const { data: venue } = await supabase.from('poker_venues').select('id').limit(1).maybeSingle();
  const { data: staff } = await supabase.from('commander_staff').select('id, user_id, venue_id').limit(1).maybeSingle();
  const { data: club } = await supabase.from('clubs').select('id').limit(1).maybeSingle();
  const { data: table } = await supabase.from('commander_tables').select('id, venue_id').limit(1).maybeSingle();
  const { data: tournament } = await supabase.from('commander_tournaments').select('id').limit(1).maybeSingle();
  const { data: post } = await supabase.from('social_posts').select('id').limit(1).maybeSingle();
  const { data: author } = await supabase.from('content_authors').select('id').limit(1).maybeSingle();

  console.log('\n');

  if (profile) {
    await realTest('Profile lookup by real ID', async () => {
      const { data, error } = await supabase.from('profiles').select('id, username, display_name, diamonds, is_vip').eq('id', profile.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Expected data, got null');
      if (data.id !== profile.id) throw new Error('ID mismatch');
    });

    await realTest('Profile diamonds lookup (DiamondEngine pattern)', async () => {
      const { data, error } = await supabase.from('profiles').select('diamonds').eq('id', profile.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Expected data, got null');
      if (typeof data.diamonds === 'undefined') throw new Error('diamonds field missing');
    });

    await realTest('Training progress by user_id', async () => {
      const { data, error } = await supabase.from('training_progress').select('*').eq('user_id', profile.id).maybeSingle();
      if (error) throw new Error(error.message);
      // null is ok - user may not have training progress
    });

    await realTest('User preferences by user_id', async () => {
      const { data, error } = await supabase.from('user_preferences').select('*').eq('user_id', profile.id).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
    });
  }

  if (staff) {
    await realTest('Staff auth guard pattern', async () => {
      const { data, error } = await supabase.from('commander_staff').select('id, venue_id, role').eq('id', staff.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Staff not found');
    });

    if (staff.user_id) {
      await realTest('Staff by user_id (auth guard)', async () => {
        const { data, error } = await supabase.from('commander_staff').select('id, venue_id, role').eq('user_id', staff.user_id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Staff not found by user_id');
      });
    }
  }

  if (venue) {
    await realTest('Venue settings lookup', async () => {
      const { data, error } = await supabase.from('commander_venue_settings').select('*').eq('venue_id', venue.id).maybeSingle();
      if (error) throw new Error(error.message);
    });

    await realTest('Waitlist by venue_id', async () => {
      const { data, error } = await supabase.from('commander_waitlist').select('*').eq('venue_id', venue.id).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
    });

    await realTest('Tables by venue_id', async () => {
      const { data, error } = await supabase.from('commander_tables').select('*').eq('venue_id', venue.id).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
    });
  }

  if (club) {
    await realTest('Club lookup by ID', async () => {
      const { data, error } = await supabase.from('clubs').select('id, name').eq('id', club.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Club not found');
    });

    await realTest('Club members by club_id', async () => {
      const { data, error } = await supabase.from('club_members').select('*').eq('club_id', club.id).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
    });
  }

  if (table) {
    await realTest('Commander table by ID', async () => {
      const { data, error } = await supabase.from('commander_tables').select('*').eq('id', table.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Table not found');
    });
  }

  if (tournament) {
    await realTest('Tournament by ID', async () => {
      const { data, error } = await supabase.from('commander_tournaments').select('*').eq('id', tournament.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Tournament not found');
    });
  }

  if (post) {
    await realTest('Social post by ID', async () => {
      const { data, error } = await supabase.from('social_posts').select('id, content').eq('id', post.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Post not found');
    });
  }

  if (author) {
    await realTest('Content author by ID', async () => {
      const { data, error } = await supabase.from('content_authors').select('id, name').eq('id', author.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Author not found');
    });
  }

  // Test NON-EXISTENT lookups return null (not error)
  await realTest('Non-existent profile returns null', async () => {
    const { data, error } = await supabase.from('profiles').select('id').eq('id', '00000000-0000-0000-0000-000000000000').maybeSingle();
    if (error) throw new Error(error.message);
    if (data !== null) throw new Error('Expected null for non-existent record');
  });

  await realTest('Non-existent staff returns null', async () => {
    const { data, error } = await supabase.from('commander_staff').select('id').eq('id', '00000000-0000-0000-0000-000000000000').maybeSingle();
    if (error) throw new Error(error.message);
    if (data !== null) throw new Error('Expected null for non-existent record');
  });

  await realTest('Non-existent club returns null', async () => {
    const { data, error } = await supabase.from('clubs').select('id').eq('id', '00000000-0000-0000-0000-000000000000').maybeSingle();
    if (error) throw new Error(error.message);
    if (data !== null) throw new Error('Expected null for non-existent record');
  });

  console.log('\n\n' + '='.repeat(60));
  console.log(`REAL DATA: ${realPassed} PASS | ${realFailed} FAIL`);
  console.log('='.repeat(60));

  if (realErrors.length > 0) {
    console.log('\nREAL DATA FAILURES:');
    realErrors.forEach(e => console.log(`  ✗ ${e}`));
  }

  console.log('\n' + '='.repeat(60));
  console.log('GRAND TOTAL:');
  console.log(`  Tables: ${passed}/${passed + failed + missing} exist and work (${missing} missing from schema)`);
  console.log(`  Real data: ${realPassed}/${realPassed + realFailed} verified`);
  console.log(`  Overall: ${passed + realPassed} PASS | ${failed + realFailed} FAIL | ${missing} SCHEMA GAPS`);
  console.log('='.repeat(60));

  process.exit((failed + realFailed) > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
