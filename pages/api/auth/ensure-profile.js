/**
 * 🛡️ BULLETPROOF PROFILE CREATION API
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/auth/ensure-profile
 * 
 * This API guarantees that every authenticated user has a profile.
 * Called on every session check/app load to catch orphaned users.
 * 
 * NEVER LET A USER BE ORPHANED AGAIN.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUser } from '../../../src/lib/serverAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { user_id, email, full_name, username, avatar_url, metadata } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    // Use service key to bypass RLS
    const supabase = createClient(
        SUPABASE_URL.trim(),
        SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
    );

    // BUG #240 FIX: Require JWT auth and verify caller is the same user
    // Without this, anyone can create/update profiles for arbitrary user IDs
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Auth token required' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    if (authUser.id !== user_id) {
        return res.status(403).json({ error: 'Cannot create/update profile for another user' });
    }

    try {
        // Step 1: Check if profile exists
        const { data: existingProfile, error: checkError } = await supabase
            .from('profiles')
            .select('id, username, full_name, email, created_at')
            .eq('id', user_id)
            .maybeSingle();

        if (existingProfile) {
            // Profile exists - optionally update last_login
            await supabase
                .from('profiles')
                .update({
                    last_login: new Date().toISOString(),
                    last_active: new Date().toISOString(),
                    is_online: true
                })
                .eq('id', user_id);

            return res.json({
                status: 'EXISTS',
                profile: existingProfile,
                created: false
            });
        }

        // Step 2: Profile doesn't exist - CREATE IT NOW
        console.log(`[ANTIGRAVITY] Creating profile for orphaned user: ${user_id}`);

        // Get next player number
        const { data: maxPlayer } = await supabase
            .from('profiles')
            .select('player_number')
            .order('player_number', { ascending: false })
            .limit(1)
            .maybeSingle();

        const nextPlayerNumber = (maxPlayer?.player_number || 1254) + 1;

        // Generate username if not provided
        const finalUsername = username ||
            email?.split('@')[0] ||
            `Player${nextPlayerNumber}`;

        // Create the profile with all the defaults
        const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
                id: user_id,
                email: email || null,
                username: finalUsername,
                full_name: full_name || metadata?.full_name || metadata?.poker_alias || null,
                avatar_url: avatar_url || metadata?.avatar_url || null,
                player_number: nextPlayerNumber,
                streak_count: 0,
                diamonds: 300,        // Welcome bonus
                diamond_multiplier: 1.0,
                skill_tier: 'Newcomer',
                access_tier: 'Full_Access',
                created_at: new Date().toISOString(),
                last_login: new Date().toISOString(),
                last_active: new Date().toISOString(),
                is_online: true
            })
            .select()
            .maybeSingle();

        if (insertError) {
            console.error('[ANTIGRAVITY] Profile creation failed:', insertError);

            // Try with minimal fields if full insert failed
            const { data: minimalProfile, error: minimalError } = await supabase
                .from('profiles')
                .insert({
                    id: user_id,
                    email: email || null,
                    username: `Player${Date.now()}`,
                    created_at: new Date().toISOString()
                })
                .select()
                .maybeSingle();

            if (minimalError) {
                return res.status(500).json({
                    status: 'FAILED',
                    error: minimalError.message,
                    originalError: insertError.message
                });
            }

            return res.json({
                status: 'CREATED_MINIMAL',
                profile: minimalProfile,
                created: true,
                warning: 'Created with minimal fields due to constraint issues'
            });
        }

        console.log(`[ANTIGRAVITY] ✓ Profile created for ${user_id}: ${finalUsername}`);

        return res.json({
            status: 'CREATED',
            profile: newProfile,
            created: true,
            message: 'Profile created successfully - user was orphaned but is now fixed!'
        });

    } catch (error) {
        console.error('[ANTIGRAVITY] Error:', error);
        return res.status(500).json({
            status: 'ERROR',
            error: error.message
        });
    }
}
