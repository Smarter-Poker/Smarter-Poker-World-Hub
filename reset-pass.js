const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findAndReset() {
    console.log("Searching for user by email...");

    // We can't search by email directly in admin api without pagination or specific endpoints in v2, 
    // but we can just use the standard sign up trick, or query auth.users if we had postgres access.
    // Actually, in supabase-admin we can use:
    const { data, error } = await supabase.auth.admin.listUsers();

    // To avoid pagination, let's just query the public.profiles table to get the ID!
    const { data: profile } = await supabase.from('profiles').select('id, email').eq('email', 'johndonnahue4485@yahoo.com').maybeSingle();

    if (profile) {
        console.log("Found profile ID:", profile.id);
        const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
            profile.id,
            { password: 'SmarterPoker2026!' }
        );
        console.log("Password updated:", updateError ? updateError : "Success");
    } else {
        console.log("Profile not found in public.profiles. Trying to invite user to force set password...");
    }
}

findAndReset();
