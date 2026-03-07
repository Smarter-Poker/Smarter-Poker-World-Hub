require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TABLES = [
  'user_preferences', 'training_streaks', 'training_scenarios',
  'training_achievement_definitions', 'user_sessions', 'user_mfa_factors',
  'commander_tournament_templates', 'commander_tournament_points',
  'geeves_conversations', 'geeves_knowledge_cache', 'geeves_answer_ratings',
  'god_mode_questions', 'endless_high_scores', 'hand_private_state',
  'horse_relationships', 'leak_hand_examples', 'newsletter_subscribers',
  'tournament_alert_preferences', 'survival_progress', 'trivia_survival_runs',
  'user_poker_stats', 'video_analysis', 'venues'
];

async function run() {
  let existing = 0;
  let missing = [];

  for (const t of TABLES) {
    const { data, error } = await supabase.from(t).select('*').limit(0);
    if (error && error.message.includes('Could not find')) {
      missing.push(t);
      console.log('MISSING: ' + t);
    } else if (error) {
      console.log('ERROR: ' + t + ' - ' + error.message);
    } else {
      existing++;
      console.log('EXISTS: ' + t);
    }
  }

  console.log('\n' + existing + ' exist, ' + missing.length + ' missing');

  if (missing.length > 0) {
    console.log('\nMissing tables:');
    missing.forEach(t => console.log('  - ' + t));
    console.log('\nSQL file ready at: migrations/create-missing-tables.sql');
    console.log('Run it in Supabase SQL Editor to create all missing tables.');
  }
}

run().catch(console.error);
