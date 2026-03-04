require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  const email = 'daniel@bekavactrading.com';
  console.log('Finding user...', email);

  const { data: users, error: userError } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', `%${email}%`)
    .limit(1);

  if (userError || !users || users.length === 0) {
    console.error('User not found');
    return;
  }

  const userId = users[0].id;
  console.log('Found user ID:', userId);

  const newLeaks = [
    {
      user_id: userId,
      leak_type: 'passive_in_3bet_pots',
      description: "You are playing far too passively out of position in 3-bet pots, particularly against the button. You check-fold too often when you miss the flop, surrendering your equity advantage.",
      count: 12,
      fixed_at: null,
      detected_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
      recommended_drill: "3-Bet Pot OOP Defend"
    },
    {
      user_id: userId,
      leak_type: 'river_value_underbetting',
      description: "You are consistently sizing down your value bets on the river when you have a polarized advantage. You're betting 33% instead of 75-100% pot with your strong value.",
      count: 7,
      fixed_at: null,
      detected_at: new Date(Date.now() - 15 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
      recommended_drill: "River Sizing Sandbox"
    },
    {
      user_id: userId,
      leak_type: 'cbetting_too_frequently',
      description: "You c-bet too frequently on coordinated/dynamic flops where the Big Blind has a significant range and nut advantage (e.g., 7-8-9 two-tone).",
      count: 15,
      fixed_at: null,
      detected_at: new Date(Date.now() - 60 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
      recommended_drill: "Dynamic Flop Hand Reading"
    },
    {
      user_id: userId,
      leak_type: 'overfolding_to_river_probes',
      description: "When you check back the turn, you are over-folding to small to medium probe bets on the river. Your check-back range is too weak and unprotected.",
      count: 9,
      fixed_at: null,
      detected_at: new Date(Date.now() - 90 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
      recommended_drill: "Turn Check-Back Construction"
    }
  ];

  const { data, error } = await supabase.from('user_training_leaks').insert(newLeaks).select();
  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('Successfully inserted', data.length, 'simulated leaks for user:', email);
  }
}

main().catch(console.error);
