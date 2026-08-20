const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const ts = fs.readFileSync('../Smarter-Poker-Club-Arena/src/services/DailyChallengeService.ts', 'utf8');

const regex = /id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*description:\s*'([^']+)',\s*type:\s*'([^']+)',\s*requirement:\s*(\d+),\s*chipReward:\s*0,\s*diamondReward:\s*(\d+)/g;
const inserts = [];
let match;
while ((match = regex.exec(ts)) !== null) {
  inserts.push({
    id: match[1],
    name: match[2],
    description: match[3],
    challenge_type: match[4],
    requirement: parseInt(match[5], 10),
    chip_reward: 0,
    diamond_reward: parseInt(match[6], 10)
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log(`Upserting ${inserts.length} challenges to catalog...`);
  const { data, error } = await supabase
    .from('daily_challenge_catalog')
    .upsert(inserts, { onConflict: 'id' });
    
  if (error) {
    console.error("Upsert failed:", error);
  } else {
    console.log("Upsert complete!");
  }
}

run();
