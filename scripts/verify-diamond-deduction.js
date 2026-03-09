require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDiamondDeduction() {
    console.log("Starting Diamond Deduction Simulation (Trivia Lobby Flow)...");

    // 1. Find a test user (we'll look for dev accounts first)
    const { data: users, error: userError } = await supabase
        .from('profiles')
        .select('id, username, diamonds, is_vip, phone_verified')
        .not('diamonds', 'is', null)
        .limit(3);

    if (userError || !users || users.length === 0) {
        console.error("Test blocked: Could not find eligible test profiles.");
        return;
    }

    // pick a non-VIP user if possible, or just the first user
    let targetUser = users.find(u => !u.is_vip) || users[0];
    console.log(`Targeting User: ${targetUser.username} (ID: ${targetUser.id})`);
    console.log(`Initial Balance: ${targetUser.diamonds} 💎`);
    console.log(`VIP Status: ${targetUser.is_vip}`);

    if (targetUser.is_vip) {
        console.log("Warning: User is VIP, deduction logic in UI usually skips the charge. We will force the RPC anyway to ensure the backend works.");
    }

    const GAME_COST = 10;

    if (targetUser.diamonds < GAME_COST) {
        console.log(`User has insufficient funds (${targetUser.diamonds} < 10) to test. Giving them 100 diamonds...`);
        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: targetUser.id,
            p_amount: 100,
            p_type: 'admin_grant',
            p_description: 'Test Funding'
        });
        targetUser.diamonds += 100;
    }

    console.log("Executing Trivia Lobby RPC Payload...");

    const payload = {
        p_user_id: targetUser.id,
        p_amount: -GAME_COST,
        p_type: 'game_cost',
        p_description: `Trivia game entry — ${GAME_COST}💎`,
        p_reference_id: null
    };

    console.log("Payload:", payload);

    const { data: rpcData, error: rpcError } = await supabase.rpc('add_diamonds_to_balance', payload);

    if (rpcError) {
        console.error("❌ RPC EXECUTION FAILED:", rpcError);
        return;
    }

    console.log("✅ RPC Executed Successfully. Checking DB verification...");

    // Verify
    const { data: verifyData } = await supabase
        .from('profiles')
        .select('diamonds')
        .eq('id', targetUser.id)
        .single();

    console.log(`New Balance: ${verifyData.diamonds} 💎`);

    const expectedDiff = verifyData.diamonds - targetUser.diamonds;
    if (expectedDiff === -GAME_COST) {
        console.log(`✅ ATOMIC MUTATION VERIFIED. Exact ${GAME_COST} 💎 delta observed.`);
    } else {
        console.log(`❌ ATOMIC MUTATION ERROR. Expected diff of -${GAME_COST}, got ${expectedDiff}`);
    }

    // Verify Event Trail / Economy Log if present
    console.log("Checking diamond_transactions table for ledger verification...");
    const { data: ledger } = await supabase
        .from('diamond_transactions')
        .select('*')
        .eq('user_id', targetUser.id)
        .order('created_at', { ascending: false })
        .limit(1);

    if (ledger && ledger.length > 0) {
        console.log("✅ Ledger Entry Created:", ledger[0].description);
    } else {
        console.log("⚠️ No ledger entry found (this may be expected if transactions table is deprecated for stats_only mode).");
    }

    console.log("Test Complete.");
}

testDiamondDeduction();
