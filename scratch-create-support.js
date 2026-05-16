const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const email = 'support@smarter.poker';
    const password = 'SupportPassword123!';
    
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
            username: 'support',
            full_name: 'Smarter.Poker Support'
        }
    });
    
    if (authError) {
        console.error('Auth Error:', authError);
    } else {
        console.log('Created Auth User:', authData.user.id);
        
        // Ensure profile exists
        const { error: profileError } = await supabase.from('profiles').upsert({
            id: authData.user.id,
            username: 'support',
            full_name: 'Smarter.Poker Support',
            email: email
        });
        
        if (profileError) {
            console.error('Profile Error:', profileError);
        } else {
            console.log('Profile created/updated');
        }
    }
}
run();
