const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
// Read the TS file and parse the diamondRewards!
const ts = fs.readFileSync('../Smarter-Poker-Club-Arena/src/services/DailyChallengeService.ts', 'utf8');

// We'll extract all { id: '...', ..., diamondReward: XX } blocks.
const regex = /id:\s*'([^']+)'[\s\S]*?diamondReward:\s*(\d+)/g;
const rewards = {};
let match;
while ((match = regex.exec(ts)) !== null) {
  rewards[match[1]] = parseInt(match[2], 10);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Updating catalog to new scaling difficulty...");
  for (const [id, reward] of Object.entries(rewards)) {
    if (reward > 0) {
      console.log(`Setting ${id} -> ${reward} diamonds`);
      await supabase.from('daily_challenge_catalog').update({ diamond_reward: reward }).eq('id', id);
    }
  }
  console.log("DB Update complete!");
}

run();
