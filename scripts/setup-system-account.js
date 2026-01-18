#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXECUTE SYSTEM SETUP — Direct SQL Execution via Supabase
 * 
 * Runs the complete database setup for the system account
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';

// Initialize Supabase client with SERVICE ROLE key
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

async function executeSetup() {
    try {
        console.log('🚀 EXECUTING DAILY CONTENT SYSTEM SETUP\n');
        console.log('═══════════════════════════════════════════════════════════\n');

        // Step 1: Create system account
        console.log('Step 1: Creating system account...');

        const { data: existingAccount } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('id', SYSTEM_UUID)
            .maybeSingle();

        if (existingAccount) {
            console.log('✅ System account already exists:', existingAccount.username);
        } else {
            const { data: newAccount, error: insertError } = await supabase
                .from('profiles')
                .insert({
                    id: SYSTEM_UUID,
                    username: 'smarter.poker',
                    full_name: 'Smarter.Poker',
                    email: 'system@smarter.poker',
                    xp_total: 999999,
                    diamonds: 0,
                    skill_tier: 'System',
                    email_verified: true
                })
                .select()
                .single();

            if (insertError) {
                throw new Error(`Failed to create account: ${insertError.message}`);
            }

            console.log('✅ System account created:', newAccount.username);
        }

        // Step 2: Verify account is accessible
        console.log('\nStep 2: Verifying account accessibility...');
        const { data: verified, error: verifyError } = await supabase
            .from('profiles')
            .select('id, username, full_name, xp_total')
            .eq('id', SYSTEM_UUID)
            .single();

        if (verifyError || !verified) {
            throw new Error('System account not accessible');
        }

        console.log('✅ Account verified:');
        console.log(`   Username: ${verified.username}`);
        console.log(`   Full Name: ${verified.full_name}`);
        console.log(`   XP: ${verified.xp_total}`);

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('✅ DATABASE SETUP COMPLETE!');
        console.log('═══════════════════════════════════════════════════════════\n');

        return verified;

    } catch (error) {
        console.error('\n❌ SETUP FAILED:', error.message);
        throw error;
    }
}

// Execute
executeSetup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
