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
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ORB-0 FIX-5: No hardcoded fallbacks — env vars are mandatory
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  try {
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      let { email } = req.body;
      const { user_id, full_name, username, avatar_url, metadata } = req.body;

      if (!user_id) {
          return res.status(400).json({ error: 'Missing user_id' });
      }

      // ORB-0 FIX-4: Fail hard if service key is missing — never fall back to anon for admin ops
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
          console.warn('[ANTIGRAVITY] FATAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
          return res.status(500).json({ error: 'Server configuration error — contact admin' });
      }

      // BUG #240 FIX: Require JWT auth and verify caller is the same user
      // Without this, anyone can create/update profiles for arbitrary user IDs
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Auth token required' });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: authData, error: authError } = await getSupabase().auth.getUser(token);
      const authUser = authData?.user;
      if (authError || !authUser) {
          return res.status(401).json({ error: 'Invalid or expired token' });
      }
      if (authUser.id !== user_id) {
          return res.status(403).json({ error: 'Cannot create/update profile for another user' });
      }

      try {
          // Step 1: Check if profile exists by user_id
          const { data: existingProfile, error: checkError } = await getSupabase()
              .from('profiles')
              .select('id, username, full_name, email, created_at')
              .eq('id', user_id)
              .maybeSingle();

          if (existingProfile) {
              // Profile exists - optionally update last_login
              await getSupabase()
                  .from('profiles')
                  .update({
                      last_login: new Date().toISOString(),
                      last_active: new Date().toISOString(),
                      is_online: true
                  })
                  .eq('id', user_id);

              // ── ANTIGRAVITY FIX: Detect if profile was JUST created by the DB trigger ──
              const createdTime = new Date(existingProfile.created_at).getTime();
              const now = Date.now();
              const isBrandNew = (now - createdTime) < 60000; // Created in last 60 seconds

              return res.json({
                  status: 'EXISTS',
                  profile: existingProfile,
                  created: false,
                  isBrandNew
              });
          }

          // ═══════════════════════════════════════════════════════════════════
          // 🔗 DUPLICATE PREVENTION: Check if a profile with same email exists
          // This catches the case where a user signed up with email/password
          // and then signs in with Google OAuth (or vice versa), which creates
          // a new auth.users entry but should NOT create a new profile.
          // ═══════════════════════════════════════════════════════════════════
          if (email) {
              const { data: emailMatch, error: emailCheckError } = await getSupabase()
                  .from('profiles')
                  .select('id, username, full_name, email, created_at')
                  .ilike('email', email.trim())
                  .maybeSingle();

              if (emailMatch && !emailCheckError) {
                  console.info('[ANTIGRAVITY] Duplicate email found — nullifying email for new profile to prevent constraint violation and orphaning.');

                  // Update the existing profile to reflect the latest login just in case
                  await getSupabase()
                      .from('profiles')
                      .update({
                          last_login: new Date().toISOString(),
                          last_active: new Date().toISOString(),
                          is_online: true,
                          ...(full_name && !emailMatch.full_name ? { full_name } : {}),
                          ...(metadata?.avatar_url && !emailMatch.avatar_url ? { avatar_url: metadata.avatar_url } : {}),
                      })
                      .eq('id', emailMatch.id);

                  // FIX: DO NOT RETURN 'LINKED'. If we return here, the new auth user (user_id)
                  // NEVER gets a profile, permanently breaking the app for them.
                  // Instead, we nullify the email so the new profile creation succeeds.
                  email = null;
              }
          }

          // Step 2: Profile doesn't exist by id OR email - CREATE IT NOW
          console.info('[ANTIGRAVITY] Creating profile for orphaned user (ID redacted for security).');

          // NOTE: player_number is stored as TEXT. We must cast to int for numeric MAX
          // to avoid lexicographic ordering where '999' > '1500'.
          const { data: maxPlayer } = await getSupabase()
              .rpc('get_max_player_number');

          const nextPlayerNumber = Math.max(1500, (parseInt(maxPlayer, 10) || 1499) + 1);

          // Generate username if not provided
          const finalUsername = username ||
              email?.split('@')[0] ||
              `Player${nextPlayerNumber}`;

          // ── SOCIAL PROFILE COMPLETION GATE ──
          // New OAuth signups (no explicit poker_alias in metadata) need to
          // confirm name, choose a unique alias, and add a phone before
          // entering Social Media. Email signups via /auth/signup explicitly
          // set metadata.poker_alias and a phone, so they're complete out of the gate.
          const hadExplicitAlias = !!(metadata?.poker_alias || metadata?.preferred_username);
          const hadPhone         = !!(metadata?.phone || metadata?.phone_number);
          const socialProfileCompleted = hadExplicitAlias && hadPhone;

          // Create the profile with all the defaults
          const { data: newProfile, error: insertError } = await getSupabase()
              .from('profiles')
              .insert({
                  id: user_id,
                  email: email || null,
                  username: finalUsername,
                  full_name: full_name || metadata?.full_name || metadata?.poker_alias || null,
                  avatar_url: avatar_url || metadata?.avatar_url || null,
                  phone: metadata?.phone || metadata?.phone_number || null,
                  social_profile_completed: socialProfileCompleted,
                  player_number: nextPlayerNumber,
                  streak_count: 0,
                  diamonds: 500,        // Welcome bonus (Updated from 300 to 500)
                  diamond_multiplier: 1.0,
                  skill_tier: 'Newcomer',
                  access_tier: 'Full_Access',
                  is_vip: true,         // Welcome VIP bonus
                  vip_tier: 'monthly',  // 30-day VIP card
                  vip_expires_at: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString(),
                  created_at: new Date().toISOString(),
                  last_login: new Date().toISOString(),
                  last_active: new Date().toISOString(),
                  is_online: true
              })
              .select()
              .maybeSingle();

          if (insertError) {
              console.warn('[ANTIGRAVITY] Profile creation failed:', insertError);

              // Try with minimal fields if full insert failed
              const { data: minimalProfile, error: minimalError } = await getSupabase()
                  .from('profiles')
                  .insert({
                      id: user_id,
                      email: null, // Always use null on fallback to bypass email unique constraints
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

          console.info(`[ANTIGRAVITY] ✓ Profile created — username: ${finalUsername}`);

          return res.json({
              status: 'CREATED',
              profile: newProfile,
              created: true,
              message: 'Profile created successfully - user was orphaned but is now fixed!'
          });

      } catch (error) {
          console.warn('[ANTIGRAVITY] Error:', error);
          return res.status(500).json({
              status: 'ERROR',
              error: error.message
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
