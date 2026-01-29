import { createClient } from '@supabase/supabase-js';

/**
 * API Endpoint: Setup System Account
 * POST /api/system/setup-account
 * 
 * Creates the Smarter.Poker system account in the database
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';

    try {
        // Initialize Supabase with service role key
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

        // Check if system account already exists
        const { data: existing } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('id', SYSTEM_UUID)
            .maybeSingle();

        if (existing) {
            // Update avatar_url if missing
            if (!existing.avatar_url) {
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                        avatar_url: '/smarter-poker-logo.png'
                    })
                    .eq('id', SYSTEM_UUID);

                if (!updateError) {
                    existing.avatar_url = '/smarter-poker-logo.png';
                }
            }

            return res.status(200).json({
                success: true,
                message: 'System account already exists' + (!existing.avatar_url ? ' (avatar updated)' : ''),
                account: existing
            });
        }

        // Create system account
        const { data: newAccount, error: insertError } = await supabase
            .from('profiles')
            .insert({
                id: SYSTEM_UUID,
                username: 'smarter.poker',
                full_name: 'Smarter.Poker',
                email: 'system@smarter.poker',
                avatar_url: '/smarter-poker-logo.png',
                xp_total: 999999,
                diamonds: 0,
                skill_tier: 'System',
                email_verified: true
            })
            .select()
            .single();

        if (insertError) {
            throw new Error(`Failed to create system account: ${insertError.message}`);
        }

        return res.status(200).json({
            success: true,
            message: 'System account created successfully',
            account: newAccount
        });

    } catch (error) {
        console.error('System account setup error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
