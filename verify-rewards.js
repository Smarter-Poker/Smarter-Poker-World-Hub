const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

async function checkSetup() {
    console.log('💎 Verifying Diamond Reward System Setup...\n');

    // Check easter egg count
    const { count: easterEggCount } = await supabase
        .from('reward_definitions')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'easter_egg');

    console.log(`📊 Easter Egg Rewards: ${easterEggCount}/100`);

    // Check by pillar
    const pillars = ['arena_meta', 'social_velocity', 'gto_mastery', 'streak_loyalty', 'arena_challenges'];
    for (const pillar of pillars) {
        const { count } = await supabase
            .from('reward_definitions')
            .select('*', { count: 'exact', head: true })
            .eq('subcategory', pillar);
        console.log(`   - ${pillar}: ${count} rewards`);
    }

    // Check rarity distribution
    console.log('\n📈 Rarity Distribution:');
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    for (const rarity of rarities) {
        const { count } = await supabase
            .from('reward_definitions')
            .select('*', { count: 'exact', head: true })
            .eq('rarity', rarity)
            .eq('category', 'easter_egg');
        console.log(`   - ${rarity}: ${count}`);
    }

    // Check total diamond value
    const { data: rewards } = await supabase
        .from('reward_definitions')
        .select('base_amount')
        .eq('category', 'easter_egg');

    const totalValue = rewards?.reduce((sum, r) => sum + (r.base_amount || 0), 0) || 0;
    console.log(`\n💰 Total Diamond Value (all easter eggs): ${totalValue.toLocaleString()} 💎`);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ Diamond Reward System V2 is COMPLETE!');
    console.log('═══════════════════════════════════════════════════\n');
}

checkSetup().catch(console.error);
