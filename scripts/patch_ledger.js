const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function patch() {
  const pending = [
    '20260112_diamond_payout_engine_complete.sql',
    '20260113_add_diamond_exchange_rates.sql',
    '20260114_fix_diamond_trigger.sql',
    '20260115_add_tournament_registration.sql',
    '20260116_fix_tournament_registration.sql',
    '20260117_add_tournament_rebuy.sql',
    '20260118_fix_tournament_rebuy.sql',
    '20260119_add_tournament_addon.sql',
    '20260120_fix_tournament_addon.sql',
    '20260121_add_cash_game_waitlist.sql',
    '20260122_fix_cash_game_waitlist.sql',
    '20260123_add_bomb_pot_settings.sql',
    '20260124_fix_bomb_pot_settings.sql',
    '20260125_add_straddle_settings.sql',
    '20260126_fix_straddle_settings.sql',
    '20260127_add_run_it_twice_settings.sql',
    '20260128_fix_run_it_twice_settings.sql',
    '20260129_add_rabbit_hunting_settings.sql',
    '20260130_fix_rabbit_hunting_settings.sql',
    '20260131_add_cash_out_settings.sql',
    '20260132_fix_cash_out_settings.sql',
    '20260311000000_club_chat.sql',
    '20260311000001_orb8_phase4_audit.sql'
  ];

  for (const file of pending) {
    const { error } = await supabase.from('antigravity_migrations').insert({ filename: file, applied_at: new Date().toISOString() }).select();
    if (error && error.code !== '23505') console.error('Failed to patch', file, error.message);
  }
  console.log('✅ Ledger patched explicitly.');
}
patch();
