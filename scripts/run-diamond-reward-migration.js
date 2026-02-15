/**
 * 💎 Run Diamond Reward Claims Migration
 * Execute: node scripts/run-diamond-reward-migration.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log('💎 Running diamond_reward_claims migration...');
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓' : '✗');
    console.log('KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');

    // Step 1: Create table via RPC (exec_sql) or direct table check
    // Try direct table creation via Supabase REST API

    // First, check if table already exists by trying to query it
    const { error: checkError } = await supabase
        .from('diamond_reward_claims')
        .select('id')
        .limit(1);

    if (!checkError) {
        console.log('✅ Table diamond_reward_claims already exists!');
        return;
    }

    if (checkError.code === '42P01' || checkError.message?.includes('does not exist') || checkError.message?.includes('relation')) {
        console.log('📋 Table does not exist, creating via SQL...');
    } else {
        console.log('⚠️ Check result:', checkError.message, '— attempting creation anyway...');
    }

    // Use the Supabase Management API / SQL endpoint
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/(.+)\.supabase\.co/)?.[1];

    const sql = `
        CREATE TABLE IF NOT EXISTS diamond_reward_claims (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            reward_type TEXT NOT NULL,
            diamonds_awarded INT NOT NULL DEFAULT 0,
            claimed_at TIMESTAMPTZ DEFAULT NOW(),
            claim_date DATE DEFAULT CURRENT_DATE,
            metadata JSONB DEFAULT '{}'::jsonb
        );

        CREATE INDEX IF NOT EXISTS idx_reward_claims_user_date 
            ON diamond_reward_claims(user_id, claim_date);

        CREATE INDEX IF NOT EXISTS idx_reward_claims_type 
            ON diamond_reward_claims(user_id, reward_type, claim_date);

        ALTER TABLE diamond_reward_claims ENABLE ROW LEVEL SECURITY;

        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'diamond_reward_claims' AND policyname = 'Users can view own claims'
            ) THEN
                CREATE POLICY "Users can view own claims" ON diamond_reward_claims
                    FOR SELECT USING (auth.uid() = user_id);
            END IF;
        END $$;

        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'diamond_reward_claims' AND policyname = 'Service role can insert claims'
            ) THEN
                CREATE POLICY "Service role can insert claims" ON diamond_reward_claims
                    FOR INSERT WITH CHECK (true);
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_daily_login
            ON diamond_reward_claims(user_id, reward_type, claim_date) 
            WHERE reward_type = 'daily_login';

        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_social_post
            ON diamond_reward_claims(user_id, reward_type, claim_date) 
            WHERE reward_type = 'social_post';
    `;

    // Try exec_sql RPC first
    const { data, error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.log('⚠️ exec_sql RPC failed:', error.message);
        console.log('');
        console.log('Trying via Supabase Management API...');

        // Try the REST SQL endpoint
        const response = await fetch(`https://${projectRef}.supabase.co/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ sql })
        });

        if (!response.ok) {
            const text = await response.text();
            console.log('⚠️ REST endpoint also failed:', response.status, text);
            console.log('');
            console.log('═══════════════════════════════════════════════════════');
            console.log('📋 MANUAL SQL REQUIRED — Copy the SQL below into Supabase Dashboard > SQL Editor:');
            console.log('═══════════════════════════════════════════════════════');
            console.log(sql);
            return;
        }

        console.log('✅ Table created via REST API!');
    } else {
        console.log('✅ Table created via exec_sql RPC!', data);
    }

    // Verify the table exists now
    const { data: verify, error: verifyError } = await supabase
        .from('diamond_reward_claims')
        .select('id')
        .limit(1);

    if (verifyError) {
        console.log('❌ Verification failed:', verifyError.message);
    } else {
        console.log('✅ Verification passed — diamond_reward_claims table is live!');
        console.log('   Rows found:', verify?.length || 0);
    }
}

run().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
