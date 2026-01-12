const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

async function setupCelebrationQueue() {
    console.log('🎉 Setting up Celebration Queue System...\n');

    // Create celebration_queue table using raw SQL via RPC
    // Since we can't run DDL directly, we'll use the insert approach to verify structure

    // First, let's check if the table exists by trying to select from it
    const { error: checkError } = await supabase
        .from('celebration_queue')
        .select('id')
        .limit(1);

    if (checkError && checkError.code === '42P01') {
        console.log('❌ celebration_queue table does not exist');
        console.log('📋 You need to create it in Supabase Dashboard SQL Editor:');
        console.log(`
CREATE TABLE IF NOT EXISTS celebration_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reward_id TEXT NOT NULL,
    reward_name TEXT,
    diamonds INTEGER NOT NULL,
    rarity TEXT NOT NULL DEFAULT 'common',
    icon TEXT,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    dismissed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_celebration_queue_user 
ON celebration_queue(user_id, dismissed, created_at DESC);

ALTER TABLE celebration_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own celebrations" ON celebration_queue
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users dismiss own celebrations" ON celebration_queue
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service can insert celebrations" ON celebration_queue
    FOR INSERT WITH CHECK (true);
    `);
    } else if (checkError) {
        console.log('⚠️ Error checking table:', checkError.message);
    } else {
        console.log('✅ celebration_queue table exists!');
    }

    // Check reward_claims table
    const { error: claimsError } = await supabase
        .from('reward_claims')
        .select('id')
        .limit(1);

    if (claimsError && claimsError.code === '42P01') {
        console.log('❌ reward_claims table does not exist');
    } else if (claimsError) {
        console.log('⚠️ reward_claims check:', claimsError.message);
    } else {
        console.log('✅ reward_claims table exists!');
    }

    // Check user_diamond_balance table
    const { error: balanceError } = await supabase
        .from('user_diamond_balance')
        .select('user_id')
        .limit(1);

    if (balanceError && balanceError.code === '42P01') {
        console.log('❌ user_diamond_balance table does not exist');
    } else if (balanceError) {
        console.log('⚠️ user_diamond_balance check:', balanceError.message);
    } else {
        console.log('✅ user_diamond_balance table exists!');
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('Setup check complete!');
    console.log('═══════════════════════════════════════════════════\n');
}

setupCelebrationQueue().catch(console.error);
