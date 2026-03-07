require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const tables = ['commander_sessions', 'training_scenarios', 'training_user_achievements', 'training_streaks', 'poker_sessions', 'poker_clips', 'content_schedule', 'horse_analytics', 'arcade_duels', 'geeves_conversations', 'jarvis_conversations'];

  for (const t of tables) {
    const { data, error } = await sb.from(t).select('*').limit(0);
    console.log(t + ': ' + (error ? 'MISSING' : 'EXISTS'));
  }

  // Also check club_members columns
  const { data: cm, error: cmErr } = await sb.from('club_members').select('*').limit(1);
  if (cmErr) {
    console.log('\nclub_members: ERROR - ' + cmErr.message);
  } else if (cm && cm.length > 0) {
    console.log('\nclub_members columns: ' + Object.keys(cm[0]).join(', '));
  } else {
    console.log('\nclub_members: exists but empty');
  }

  // Check poker_venues ID type
  const { data: pv } = await sb.from('poker_venues').select('id').limit(1);
  if (pv && pv.length > 0) {
    console.log('poker_venues.id type: ' + typeof pv[0].id + ' = ' + pv[0].id);
  }

  // Check article_bookmarks ID type
  const { data: ab } = await sb.from('article_bookmarks').select('id').limit(1);
  if (ab && ab.length > 0) {
    console.log('article_bookmarks.id type: ' + typeof ab[0].id + ' = ' + ab[0].id);
  }

  // Check qr_code_scans ID type
  const { data: qr } = await sb.from('qr_code_scans').select('id').limit(1);
  if (qr && qr.length > 0) {
    console.log('qr_code_scans.id type: ' + typeof qr[0].id + ' = ' + qr[0].id);
  }
}

main();
