import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testSignupBonus() {
    console.log('🧪 Testing New User Signup Bonus (500 Diamonds + 3 Month VIP)');
    const testEmail = `test.vip.bonus.${Date.now()}@smarter.poker`;
    const testPassword = 'TestPassword123!';

    try {
        // Create user using admin API (bypasses email confirmation)
        console.log(`👤 Creating test user: ${testEmail}`);
        const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
            email: testEmail,
            password: testPassword,
            email_confirm: true,
            user_metadata: {
                full_name: 'Test VIP User'
            }
        });

        if (createError) throw createError;

        console.log(`✅ User created successfully (ID: ${user.id})`);
        console.log(`⏳ Waiting 3 seconds for the database trigger to execute...`);

        // Wait for the trigger to insert the profile
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Let's verify the profile
        console.log(`🔍 Fetching profile for verification...`);
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('diamonds, is_vip, vip_tier, vip_expires_at')
            .eq('id', user.id)
            .maybeSingle();

        if (profileError) {
            console.error('❌ Failed to fetch profile:', profileError.message);
            // Cleanup and exit 
            await supabase.auth.admin.deleteUser(user.id);
            process.exit(1);
        }

        console.log('\n📊 Profile verification results:');
        console.table(profile);

        const isSuccess =
            profile.diamonds === 500 &&
            profile.is_vip === true &&
            profile.vip_tier === 'quarterly' &&
            profile.vip_expires_at !== null;

        if (isSuccess) {
            console.log('\n✨ SUCCESS! The new user signup bonus is working perfectly.');
        } else {
            console.error('\n❌ FAILURE: The profile did not receive the expected bonus.');
            console.log('Expected: diamonds=500, is_vip=true, vip_tier=quarterly');
            console.log(`Got: diamonds=${profile.diamonds}, is_vip=${profile.is_vip}, vip_tier=${profile.vip_tier}`);
        }

        // Cleanup
        console.log(`🧹 Cleaning up test user...`);
        await supabase.auth.admin.deleteUser(user.id);
        console.log(`✅ Test complete.`);

    } catch (e) {
        console.error('❌ Unexpected Error:', e);
    }
}

testSignupBonus();
