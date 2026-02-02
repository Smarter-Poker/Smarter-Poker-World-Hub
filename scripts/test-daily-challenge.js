#!/usr/bin/env node
/**
 * Test script for Memory Matrix Daily Challenge Generation
 * Run: node scripts/test-daily-challenge.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDailyChallenge() {
    const today = new Date();
    const challengeDate = today.toISOString().split('T')[0];

    console.log(`\n🎯 Testing Daily Challenge for ${challengeDate}\n`);

    // Check if a challenge already exists
    const { data: existing, error: checkError } = await supabase
        .from('memory_daily_challenges')
        .select('*')
        .eq('challenge_date', challengeDate)
        .single();

    if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing:', checkError);
        return;
    }

    if (existing) {
        console.log('✅ Challenge already exists for today:');
        console.log(`   ID: ${existing.id}`);
        console.log(`   Level: ${existing.level}`);
        console.log(`   Game Mode: ${existing.game_mode}`);
        console.log(`   Target Accuracy: ${existing.target_accuracy}%`);
        console.log(`   Diamond Reward: ${existing.diamond_reward} 💎`);
        console.log(`   Bonus Reward: ${existing.bonus_reward} 💎`);

        // Try to parse the scenario
        try {
            const scenario = JSON.parse(existing.scenario_id);
            console.log(`   Title: ${scenario.title}`);
            console.log(`   Position: ${scenario.position}`);
            console.log(`   Stack Depth: ${scenario.stackDepth}bb`);
            console.log(`   Hands: ${Object.keys(scenario.solution || {}).length}`);
        } catch (e) {
            console.log(`   Scenario ID: ${existing.scenario_id}`);
        }
        return;
    }

    console.log('❌ No challenge exists for today. Creating one...\n');

    // Calculate level based on day of month
    const dayOfMonth = today.getDate();
    let level;
    if (dayOfMonth <= 3) level = Math.min(dayOfMonth, 3);
    else if (dayOfMonth <= 10) level = Math.min(3 + Math.floor((dayOfMonth - 3) / 2), 6);
    else level = Math.min(5 + Math.floor((dayOfMonth - 10) / 3), 8);

    // Weekend check
    const dayOfWeek = today.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const targetAccuracy = isWeekend ? 90 : 85;
    const diamondReward = isWeekend ? 75 : 50;
    const bonusReward = isWeekend ? 150 : 100;

    console.log(`📊 Challenge Parameters:`);
    console.log(`   Date: ${challengeDate}`);
    console.log(`   Day of Month: ${dayOfMonth}`);
    console.log(`   Level: ${level}`);
    console.log(`   Is Weekend: ${isWeekend}`);
    console.log(`   Target Accuracy: ${targetAccuracy}%`);
    console.log(`   Diamond Reward: ${diamondReward} 💎`);
    console.log(`   Bonus Reward: ${bonusReward} 💎`);

    // Create a basic scenario for testing
    const testScenario = {
        id: `daily-${Date.now()}`,
        level,
        title: `UTG Open Raise Strategy (${level}00bb Deep)`,
        position: 'UTG',
        stackDepth: 100,
        description: 'Practice your opening ranges from Under The Gun position in a 6-max cash game.',
        tip: 'UTG is the tightest opening position. Focus on premium hands and strong suited connectors.',
        solution: {
            "AA": "raise", "KK": "raise", "QQ": "raise", "JJ": "raise", "TT": "raise",
            "99": "raise", "88": "raise", "77": level >= 4 ? "raise" : "fold",
            "AKs": "raise", "AQs": "raise", "AJs": "raise", "ATs": level >= 3 ? "raise" : "fold",
            "KQs": "raise", "KJs": level >= 3 ? "raise" : "fold",
            "QJs": level >= 4 ? "raise" : "fold",
            "AKo": "raise", "AQo": "raise", "AJo": level >= 4 ? "raise" : "fold"
        }
    };

    // Insert the challenge
    const { data: challenge, error: insertError } = await supabase
        .from('memory_daily_challenges')
        .insert({
            challenge_date: challengeDate,
            game_mode: 'range',
            level,
            scenario_id: JSON.stringify(testScenario),
            target_accuracy: targetAccuracy,
            target_time: 90 + (10 - level) * 10,
            diamond_reward: diamondReward,
            bonus_reward: bonusReward
        })
        .select()
        .single();

    if (insertError) {
        console.error('\n❌ Insert error:', insertError);
        return;
    }

    console.log('\n✅ Successfully created daily challenge!');
    console.log(`   ID: ${challenge.id}`);
    console.log(`   Level: ${challenge.level}`);
    console.log(`   Title: ${testScenario.title}`);

    // Verify it can be read via RPC
    console.log('\n🔍 Testing get_daily_challenge RPC...');
    const { data: rpcResult, error: rpcError } = await supabase.rpc('get_daily_challenge');

    if (rpcError) {
        console.error('RPC error:', rpcError);
    } else {
        console.log('RPC Result:', JSON.stringify(rpcResult, null, 2));
    }
}

testDailyChallenge().then(() => {
    console.log('\n✅ Test complete!\n');
    process.exit(0);
}).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
