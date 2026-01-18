#!/usr/bin/env node

/**
 * Simple test to verify Supabase connection and create system account
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';

console.log('Testing Supabase connection...\n');
console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('Has Service Key:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('Service Key Length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length);
console.log('');

// Try with ANON key first to test connection
const supabaseAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('Testing with ANON key...');
supabaseAnon
    .from('profiles')
    .select('count')
    .then(({ data, error }) => {
        if (error) {
            console.log('❌ ANON key test failed:', error.message);
        } else {
            console.log('✅ ANON key works!');
        }
    });

// Try with SERVICE key
const supabaseService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('\nTesting with SERVICE key...');
supabaseService
    .from('profiles')
    .select('id, username')
    .limit(1)
    .then(({ data, error }) => {
        if (error) {
            console.log('❌ SERVICE key test failed:', error.message);
            console.log('Error details:', JSON.stringify(error, null, 2));
        } else {
            console.log('✅ SERVICE key works!');
            console.log('Sample data:', data);

            // Try to create system account
            console.log('\nAttempting to create system account...');
            return supabaseService
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
                .select();
        }
    })
    .then((result) => {
        if (result) {
            const { data, error } = result;
            if (error) {
                if (error.code === '23505') {
                    console.log('⚠️  System account already exists');
                } else {
                    console.log('❌ Insert failed:', error.message);
                }
            } else {
                console.log('✅ System account created!', data);
            }
        }
    })
    .catch((err) => {
        console.log('❌ Unexpected error:', err.message);
    });
