import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 🛡️ BULLETPROOF PROFILE CREATION API
 * ═══════════════════════════════════════════════════════════════════════
 * POST /api/auth/ensure-profile
 * 
 * This API guarantees that every authenticated user has a profile.
 * Called on every session check/app load to catch orphaned users.
 * 
 * NEVER LET A USER BE ORPHANED AGAIN.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
// 🛡️ ANTI-ABUSE: disposable-domain detection gates the Welcome Package.
// antiAbuse.js was written for exactly this and had no caller until now.
import { isDisposableEmail, normalizeEmail, hashEmail } from '../../../src/lib/antiAbuse';

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

      // ── ANTI-ABUSE: snapshot the submitted email now. The duplicate-email
      // branch below sets `email = null` to dodge the unique constraint, so by
      // the time we build the INSERT the original address is gone. The welcome
      // package decision must be made against what the user actually signed up
      // with, not against the nulled column value.
      const submittedEmail = typeof email === 'string' ? email.trim() : '';

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
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      /* removed duplicate authUser */
      if (authErr || !authUser) {
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
              const { error: err_profiles_rzlwk } = await getSupabase()
                .from('profiles')
                .update({
                      last_login: new Date().toISOString(),
                      last_active: new Date().toISOString(),
                      is_online: true
                  })
                  .eq('id', user_id);
              if (err_profiles_rzlwk) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_rzlwk.message);

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

          // ═══════════════════════════════════════════════════════════════
          // 🔗 DUPLICATE PREVENTION: Check if a profile with same email exists
          // This catches the case where a user signed up with email/password
          // and then signs in with Google OAuth (or vice versa), which creates
          // a new auth.users entry but should NOT create a new profile.
          // ═══════════════════════════════════════════════════════════════
          if (email) {
              const { data: emailMatch, error: emailCheckError } = await getSupabase()
                  .from('profiles')
                  // avatar_url MUST be in this select: the merge below guards
                  // with `!emailMatch.avatar_url`, which was always true when
                  // the column wasn't selected — silently overwriting existing
                  // users' custom avatars with their Google picture.
                  .select('id, username, full_name, email, avatar_url, created_at')
                  .ilike('email', email.trim())
                  .maybeSingle();

              if (emailMatch && !emailCheckError) {
                  console.info('[ANTIGRAVITY] Duplicate email found — nullifying email for new profile to prevent constraint violation and orphaning.');

                  // Update the existing profile to reflect the latest login just in case
                  const { error: err_profiles_vzk0i } = await getSupabase()
                    .from('profiles')
                    .update({
                          last_login: new Date().toISOString(),
                          last_active: new Date().toISOString(),
                          is_online: true,
                          ...(full_name && !emailMatch.full_name ? { full_name } : {}),
                          ...(metadata?.avatar_url && !emailMatch.avatar_url ? { avatar_url: metadata.avatar_url } : {}),
                      })
                      .eq('id', emailMatch.id);
                  if (err_profiles_vzk0i) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_vzk0i.message);

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
          let finalUsername = username ||
              email?.split('@')[0] ||
              `Player${nextPlayerNumber}`;

          // ── Reserved-word guard ──
          // Calls the centralized public.is_reserved_username() so the JS path,
          // the handle_new_user trigger, claim_social_profile, and the legacy
          // check_username_available all share ONE source of truth and never drift.
          // is_reserved_username is IMMUTABLE and doesn't use auth.uid(), so it
          // works fine over the service-role client.
          try {
              const { data: isReserved } = await getSupabase()
                  .rpc('is_reserved_username', { p_username: finalUsername });
              if (isReserved === true) {
                  finalUsername = `Player${nextPlayerNumber}`;
              }
          } catch (_e) {
              // If the RPC fails, fall back to a small inline block on the most
              // dangerous exact-match cases. This is defense-in-depth — the DB
              // trigger and unique index will still catch issues.
              const fallbackReserved = new Set([
                  'admin','administrator','root','support','help','staff','owner',
                  'moderator','official','smarter','smarterpoker','jarvis','geeves',
                  'kingfish','bekavac','danbekavac','system','bot','api','www',
                  'null','undefined','anonymous',
              ]);
              if (typeof finalUsername === 'string' && fallbackReserved.has(finalUsername.toLowerCase())) {
                  finalUsername = `Player${nextPlayerNumber}`;
              }
          }

          // ── SOCIAL PROFILE COMPLETION GATE ──
          // Mark profile complete only if the caller supplied BOTH an explicit
          // alias (poker_alias / preferred_username in metadata) AND a phone.
          // Currently the email signup form only passes poker_alias (no phone),
          // and Google/Facebook OAuth pass neither, so all new signups will be
          // gated when they enter Social Media — which matches the requirement
          // of collecting phone numbers from every user. If the email signup
          // form is updated to collect phone, those users will be marked
          // complete out of the gate automatically.
          // ═══════════════════════════════════════════════════════════════
          // 🛡️ WELCOME-PACKAGE ABUSE GATE
          // Throwaway-inbox farming is the cheapest attack on this economy: the
          // package is 500 ◆ ($5 at 1 ◆ = $0.01) plus a 30-day VIP card, granted
          // unconditionally on first profile creation. A disposable address costs
          // the attacker nothing and is infinitely repeatable.
          //
          // Policy: NEVER block the signup — the profile is always created, the
          // user keeps full app access. We withhold only the free money and the
          // free VIP. Legitimate signups are completely unaffected.
          // ═══════════════════════════════════════════════════════════════
          const signupEmail = submittedEmail || (typeof authUser?.email === 'string' ? authUser.email.trim() : '');
          const isDisposable = isDisposableEmail(signupEmail);

          // Normalized form + SHA-256 digest. gmail dots and +aliases collapse to
          // one identity, so the same human farming a.b+1@gmail / ab+2@gmail maps
          // to a single hash. NOTE: `profiles` has no column to persist this yet —
          // see the note in this handler's response/logging below. We compute it
          // so it lands in the logs and is one line away from being stored once a
          // migration adds the column.
          const normalizedSignupEmail = signupEmail ? normalizeEmail(signupEmail) : '';
          const signupEmailHash = normalizedSignupEmail ? hashEmail(normalizedSignupEmail) : null;

          if (isDisposable) {
              console.warn(
                  '[ANTI-ABUSE] Disposable signup domain detected — creating profile but WITHHOLDING welcome package ' +
                  '(0 ◆ instead of 500 ◆, no 30-day VIP).',
                  {
                      user_id,
                      domain: signupEmail.split('@')[1] || 'unknown',
                      email_hash: signupEmailHash,
                  }
              );
          }

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
                  // 🛡️ Welcome package — withheld for disposable-domain signups.
                  // access_tier stays 'Full_Access': we gate the reward, not the app.
                  diamonds: isDisposable ? 0 : 500,   // Welcome bonus (Updated from 300 to 500)
                  diamond_multiplier: 1.0,
                  skill_tier: 'Newcomer',
                  access_tier: 'Full_Access',
                  is_vip: !isDisposable,              // Welcome VIP bonus
                  vip_tier: isDisposable ? null : 'monthly',  // 30-day VIP card
                  vip_expires_at: isDisposable
                      ? null
                      : new Date(new Date().setDate(new Date().getDate() + 30)).toISOString(),
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

          // ── MySpace Tom: Auto-friend + auto-follow Dan Bekavac for every new user ──
          const DAN_BEKAVAC_ID = '47965354-0e56-43ef-931c-ddaab82af765';
          if (user_id !== DAN_BEKAVAC_ID) {
          // [2026-07-25] AWAITED, not fire-and-forget: on Vercel the lambda
          // freezes the moment the response is sent, so an unawaited promise
          // here silently never completed for a fraction of signups (missing
          // auto-friend rows, no log trail). Two upserts cost ~50ms.
          await (async () => {
              try {
                const [friendResult, followResult] = await Promise.all([
                  // Bidirectional friendship (accepted immediately)
                  getSupabase().from('friendships').upsert(
                    [{ user_id, friend_id: DAN_BEKAVAC_ID, status: 'accepted' },
                     { user_id: DAN_BEKAVAC_ID, friend_id: user_id, status: 'accepted' }],
                    { onConflict: 'user_id,friend_id', ignoreDuplicates: true }
                  ),
                  // Auto-follow Dan
                  getSupabase().from('social_follows').upsert(
                    { follower_id: user_id, following_id: DAN_BEKAVAC_ID },
                    { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
                  ),
                ]);
                if (friendResult.error) console.warn('[ANTIGRAVITY] MySpace Tom friendship upsert failed:', friendResult.error.message);
                if (followResult.error) console.warn('[ANTIGRAVITY] MySpace Tom follow upsert failed:', followResult.error.message);
              } catch (e) {
                console.warn('[ANTIGRAVITY] MySpace Tom auto-connect failed (non-fatal):', e?.message || e);
              }
            })();
          }

          return res.json({
              status: 'CREATED',
              profile: newProfile,
              created: true,
              welcomePackage: {
                  granted: !isDisposable,
                  diamonds: isDisposable ? 0 : 500,
                  vipDays: isDisposable ? 0 : 30,
                  ...(isDisposable ? { withheldReason: 'disposable_email_domain' } : {}),
              },
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
