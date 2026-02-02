// Debug API: Check specific user and fix orphaned profile
// pages/api/debug/fix-orphan.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Service key not configured' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);

    // The new user's ID
    const USER_ID = '9ca264f1-c0aa-4df9-bc39-1a97bdaad016';

    try {
        // Check if profile exists
        const { data: existingProfile, error: checkError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', USER_ID)
            .single();

        if (existingProfile) {
            return res.json({
                status: 'PROFILE_EXISTS',
                profile: existingProfile,
                message: 'User already has a profile'
            });
        }

        // Profile doesn't exist - get auth user info
        const { data: authData, error: authError } = await supabase.auth.admin.getUserById(USER_ID);

        if (authError || !authData?.user) {
            return res.status(404).json({
                status: 'AUTH_USER_NOT_FOUND',
                error: authError?.message || 'User not found in auth',
                userId: USER_ID
            });
        }

        const authUser = authData.user;

        // If POST, create the profile
        if (req.method === 'POST') {
            const { data: newProfile, error: insertError } = await supabase
                .from('profiles')
                .insert({
                    id: USER_ID,
                    email: authUser.email,
                    username: authUser.email?.split('@')[0] || `user_${Date.now()}`,
                    full_name: authUser.user_metadata?.full_name || null,
                    avatar_url: authUser.user_metadata?.avatar_url || null,
                    created_at: authUser.created_at,
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (insertError) {
                return res.status(500).json({
                    status: 'INSERT_FAILED',
                    error: insertError.message,
                    authUser: {
                        id: authUser.id,
                        email: authUser.email,
                        created_at: authUser.created_at,
                        metadata: authUser.user_metadata
                    }
                });
            }

            return res.json({
                status: 'PROFILE_CREATED',
                profile: newProfile,
                message: 'Successfully created profile for orphaned user!'
            });
        }

        // GET request - just report status
        return res.json({
            status: 'ORPHANED_USER',
            message: 'User has auth account but NO profile! Send POST to fix.',
            authUser: {
                id: authUser.id,
                email: authUser.email,
                created_at: authUser.created_at,
                confirmed_at: authUser.email_confirmed_at,
                last_sign_in: authUser.last_sign_in_at,
                metadata: authUser.user_metadata
            },
            fixInstructions: 'Send POST request to this endpoint to create the profile'
        });

    } catch (e) {
        return res.status(500).json({ error: e.message, stack: e.stack });
    }
}
