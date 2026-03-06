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

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { hashEmail, extractClientIP } from '../../../src/lib/antiAbuse';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

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
        SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY
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
            .single();

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

        // ═══════════════════════════════════════════════════════════
        // 🛡️ ANTI-ABUSE CHECK — Prevent welcome package farming
        // ═══════════════════════════════════════════════════════════
        const userEmail = email || authUser.email || '';
        const emailHash = hashEmail(userEmail);
        const clientIP = extractClientIP(req);
        let welcomePackageAllowed = true;
        let abuseReason = null;

        if (emailHash) {
            try {
                // Check 1: Has this email hash been seen before? (re-signup after deletion)
                const { data: emailMatch } = await supabase
                    .from('signup_abuse_log')
                    .select('id, signup_count, deleted_account_count, welcome_package_granted')
                    .eq('email_hash', emailHash)
                    .single();

                if (emailMatch) {
                    if (emailMatch.deleted_account_count > 0) {
                        welcomePackageAllowed = false;
                        abuseReason = `Re-signup after ${emailMatch.deleted_account_count} account deletion(s)`;
                    } else if (emailMatch.welcome_package_granted) {
                        welcomePackageAllowed = false;
                        abuseReason = 'Welcome package already granted to this email';
                    }
                }

                // Check 2: Same IP created an account in the last 24 hours?
                if (welcomePackageAllowed && clientIP && clientIP !== 'unknown') {
                    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                    const { data: ipMatches } = await supabase
                        .from('signup_abuse_log')
                        .select('id, raw_email')
                        .eq('ip_address', clientIP)
                        .gt('last_signup_at', twentyFourHoursAgo)
                        .neq('email_hash', emailHash); // Different email, same IP

                    if (ipMatches && ipMatches.length > 0) {
                        welcomePackageAllowed = false;
                        abuseReason = `Same IP (${clientIP}) used for ${ipMatches.length} other signup(s) in 24h`;
                    }
                }
            } catch (abuseCheckErr) {
                // If abuse table doesn't exist yet, allow welcome package (graceful degradation)
                console.warn('[ANTI-ABUSE] Check failed (table may not exist yet):', abuseCheckErr.message);
            }
        }

        if (!welcomePackageAllowed) {
            console.warn(`[ANTI-ABUSE] Blocked welcome package for ${userEmail}: ${abuseReason}`);
        }
        // ═══════════════════════════════════════════════════════════

        // Get next player number
        const { data: maxPlayer } = await supabase
            .from('profiles')
            .select('player_number')
            .order('player_number', { ascending: false })
            .limit(1)
            .single();

        const nextPlayerNumber = (maxPlayer?.player_number || 1254) + 1;

        // Generate username if not provided
        const finalUsername = username ||
            email?.split('@')[0] ||
            `Player${nextPlayerNumber}`;

        // Calculate 30-day VIP expiry for welcome package
        const vipExpiresAt = new Date();
        vipExpiresAt.setDate(vipExpiresAt.getDate() + 30);

        // Determine welcome package values based on abuse check
        const grantDiamonds = welcomePackageAllowed ? 500 : 0;
        const grantVip = welcomePackageAllowed;
        const grantVipTier = welcomePackageAllowed ? 'welcome' : null;
        const grantVipExpiry = welcomePackageAllowed ? vipExpiresAt.toISOString() : null;

        // Create the profile with all the defaults + conditional Welcome Package
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
                diamonds: grantDiamonds,
                diamond_multiplier: 1.0,
                skill_tier: 'Newcomer',
                access_tier: 'Full_Access',
                is_vip: grantVip,
                vip_tier: grantVipTier,
                vip_expires_at: grantVipExpiry,
                created_at: new Date().toISOString(),
                last_login: new Date().toISOString(),
                last_active: new Date().toISOString(),
                is_online: true
            })
            .select()
            .single();

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
                .single();

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

        // Log the welcome diamond transaction (only if package was granted)
        if (welcomePackageAllowed) {
            await supabase.from('diamond_transactions').insert({
                user_id: user_id,
                amount: 500,
                transaction_type: 'signup_bonus',
                description: 'Welcome to Smarter.Poker — 500 Diamond Signup Bonus',
                metadata: { type: 'welcome_package' },
                balance_after: 500
            }).catch(() => { });

            // Log the welcome VIP subscription
            await supabase.from('vip_subscriptions').upsert({
                user_id: user_id,
                tier: 'welcome',
                status: 'active',
                price_usd: 0,
                current_period_start: new Date().toISOString(),
                current_period_end: vipExpiresAt.toISOString(),
                stripe_subscription_id: `welcome_${user_id}_${Date.now()}`,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' }).catch(() => { });
        }

        // 🛡️ Log signup in abuse table (survives account deletion)
        if (emailHash) {
            try {
                await supabase.from('signup_abuse_log').upsert({
                    email_hash: emailHash,
                    ip_address: clientIP,
                    raw_email: userEmail,
                    user_id: user_id,
                    welcome_package_granted: welcomePackageAllowed,
                    last_signup_at: new Date().toISOString(),
                    abuse_flags: abuseReason ? [{ reason: abuseReason, at: new Date().toISOString() }] : [],
                }, {
                    onConflict: 'email_hash',
                    ignoreDuplicates: false,
                });

                // If this is a re-signup, increment signup_count
                await supabase.rpc('increment_signup_count', { p_email_hash: emailHash }).catch(() => {
                    // RPC may not exist yet — fallback to manual update
                    supabase.from('signup_abuse_log')
                        .update({ signup_count: 2 }) // At minimum 2 if re-signing up
                        .eq('email_hash', emailHash)
                        .catch(() => { });
                });
            } catch (logErr) {
                console.warn('[ANTI-ABUSE] Failed to log signup:', logErr.message);
            }
        }

        const statusMessage = welcomePackageAllowed
            ? 'Welcome Package activated! 500 diamonds + 30-day VIP membership.'
            : 'Account created. Welcome package not available for this signup.';

        return res.json({
            status: 'CREATED',
            profile: newProfile,
            created: true,
            isNewUser: true,
            welcomePackageGranted: welcomePackageAllowed,
            message: statusMessage
        });

    } catch (error) {
        console.error('[ANTIGRAVITY] Error:', error);
        return res.status(500).json({
            status: 'ERROR',
            error: error.message
        });
    }
}
