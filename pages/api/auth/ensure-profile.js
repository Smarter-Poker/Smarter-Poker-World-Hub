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

/**
 * How long a phone-verification receipt stays usable. The signup form verifies
 * the handset, then the user still has to finish the form, submit, and confirm
 * their email before ensure-profile runs — so this cannot be tight. Long enough
 * to complete a signup, short enough that a receipt is not a permanent bearer
 * token for a number.
 */
const PHONE_RECEIPT_TTL_MS = 60 * 60 * 1000; // 1 hour

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

          // [2026-08-04] If the existence check itself errored (transient DB
          // failure, RLS misconfig), we previously fell through to the CREATE
          // path — the insert then hit a duplicate-PK error against the row
          // we couldn't see, and the handler returned 500 FAILED even though
          // a perfectly good profile existed. Bail out with 503 instead so
          // the client's non-blocking retry path can try again later.
          if (checkError) {
              console.error('[ensure-profile] existence check failed:', checkError.message);
              return res.status(503).json({
                  status: 'RETRY',
                  error: 'Profile lookup temporarily unavailable',
              });
          }

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
                  // [2026-08-04] Escape ILIKE wildcards. '_' is a legal and
                  // common email character but a single-char wildcard in
                  // ILIKE — 'john_doe@x.com' matched 'johnadoe@x.com' and
                  // this handler then updated the WRONG USER'S profile and
                  // nullified the new user's email. Escaping %, _ and \
                  // makes this a case-insensitive exact match.
                  .ilike('email', email.trim().replace(/([\\%_])/g, '\\$1'))
                  .maybeSingle();

              // A FAILED LOOKUP IS NOT "NO DUPLICATE" (2026-08-25).
              // The `!emailCheckError` guard below meant an errored read fell
              // straight past the whole linking branch, so the insert further
              // down ran WITH the email, hit the unique constraint, and dropped
              // the user into the minimal-profile fallback. The sibling
              // existence check at the top of this handler already answers a
              // read failure with 503 RETRY; this one silently guessed. Same
              // answer here: a transient blip is worth one retry, not a
              // permanently degraded account.
              if (emailCheckError) {
                  console.warn('[ensure-profile] duplicate-email check failed:', emailCheckError.message);
                  return res.status(503).json({ status: 'RETRY', reason: 'email_check_unavailable' });
              }

              if (emailMatch) {
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
          //
          // A FAILED READ IS NOT "1499" (2026-08-25). The error was discarded,
          // so an RPC blip handed EVERY concurrent caller the same 1500 - and
          // the same `Player1500` username underneath it. Two signups in that
          // window collide on the unique index and both fall into the minimal
          // path below. Surfacing the error lets the caller retry against a
          // real number instead of silently minting a duplicate.
          const { data: maxPlayer, error: maxPlayerError } = await getSupabase()
              .rpc('get_max_player_number');
          if (maxPlayerError) {
              console.warn('[ensure-profile] get_max_player_number failed:', maxPlayerError.message);
              return res.status(503).json({ status: 'RETRY', reason: 'player_number_unavailable' });
          }

          const nextPlayerNumber = Math.max(1500, (parseInt(maxPlayer, 10) || 1499) + 1);

          // A SUFFIX, BECAUSE THE NUMBER IS NOT A LOCK.
          // `nextPlayerNumber` comes from a read-max, so two callers in the same
          // window compute the same one. When the caller supplied no username
          // and no email - which is exactly what Facebook does before its app is
          // approved for the `email` permission - `Player<N>` was the entire
          // identity, and identical for both. The user id is already unique, so
          // borrowing six characters of it makes the fallback unique too without
          // needing a lock.
          // ── IS THIS HANDSET ACTUALLY VERIFIED? ──────────────────────────
          // The signup form verifies the phone BEFORE the account exists, so
          // /api/sms/verify-otp has no session to write to and used to return
          // success and write nothing at all - leaving the client as the only
          // witness. It now writes a receipt keyed on the number the moment
          // Twilio's code matches, which is a fact the browser cannot invent.
          // Fail CLOSED: no receipt, or a read that errors, means not verified.
          const claimedPhone = String(metadata?.phone || metadata?.phone_number || '')
              .replace(/\D/g, '');
          let phoneVerified = Boolean(authUser?.phone_confirmed_at);
          if (!phoneVerified && claimedPhone.length >= 10) {
              const cutoff = new Date(Date.now() - PHONE_RECEIPT_TTL_MS).toISOString();
              const { data: receipt, error: receiptError } = await getSupabase()
                  .from('phone_verification_receipts')
                  .select('phone')
                  .eq('phone', claimedPhone)
                  .gte('verified_at', cutoff)
                  .maybeSingle();
              if (receiptError) {
                  console.warn('[ensure-profile] phone receipt read failed:', receiptError.message);
              }
              phoneVerified = Boolean(receipt);
          }

          const uniqueSuffix = String(user_id).replace(/-/g, '').slice(0, 6);
          const fallbackUsername = `Player${nextPlayerNumber}_${uniqueSuffix}`;

          let finalUsername = username || email?.split('@')[0] || fallbackUsername;

          /**
           * The welcome grant, as a function so BOTH insert paths can run it.
           * It used to be inline below the full insert, underneath a
           * `return res.json({ status: 'CREATED_MINIMAL' })` - so the fallback
           * path could never reach it and those accounts had no balance row at
           * all. Upsert on user_id, so calling it twice is harmless.
           */
          const grantWelcomeDiamonds = async () => {
              const { error: balanceErr } = await getSupabase()
                  .from('user_diamond_balance')
                  .upsert(
                      {
                          user_id: user_id,
                          balance: isDisposable ? 0 : 500,
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                      },
                      { onConflict: 'user_id' }
                  );
              if (balanceErr) {
                  console.warn('[ANTIGRAVITY] Failed to grant welcome diamonds:', balanceErr.message);
              }
          };

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
                  finalUsername = fallbackUsername;
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
                  finalUsername = fallbackUsername;
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
                  // [Phase 6.1.27] Carry the signup SMS verification through.
                  // Without this the duplicate-phone guard in
                  // pages/api/sms/verify-otp.js (which only matches
                  // phone_verified = true) never fires for email signups, so
                  // one handset can open unlimited accounts.
                  //
                  // [2026-08-25] BUT NOT ON THE CLIENT'S SAY-SO. `metadata` is
                  // `user_metadata`, which the account holder can set for
                  // themselves at any time with
                  // supabase.auth.updateUser({ data: { phone_verified: true } }).
                  // `=== true` only rejects a truthy STRING; a genuine boolean
                  // written by the user sailed through and disarmed the very
                  // duplicate-phone guard this line exists to arm - one handset,
                  // unlimited accounts, unlimited welcome diamonds, which the
                  // comment above correctly calls the cheapest attack on the
                  // economy.
                  //
                  // `phoneVerified` is resolved above from a RECEIPT that
                  // /api/sms/verify-otp writes server-side after Twilio's code
                  // actually matched. See the block near the top of this handler.
                  phone_verified: phoneVerified,
                  city: metadata?.city || null,
                  state: metadata?.state || null,
                  birthday: metadata?.birthday || null,
                  birth_year: metadata?.birth_year || null,
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

              // MINIMAL IS STILL A REAL ACCOUNT (2026-08-25).
              // This fallback used to insert four columns and RETURN - above
              // the welcome-diamond upsert 15 lines below, which it therefore
              // never reached. So the users most likely to land here (an
              // emailless OAuth signup colliding on the username, i.e. exactly
              // the Facebook case) ended up with no player_number, no
              // access_tier, no diamonds row and no VIP, permanently, from a
              // sign-in they were told had worked.
              //
              // Carry the fields that make the account usable. `email` stays
              // null on purpose - bypassing the unique constraint is the whole
              // point of the fallback - and the username gets the unique
              // suffix rather than a bare timestamp, because two callers in
              // the same millisecond is precisely the race that got us here.
              const { data: minimalProfile, error: minimalError } = await getSupabase()
                  .from('profiles')
                  .insert({
                      id: user_id,
                      email: null, // Always use null on fallback to bypass email unique constraints
                      username: `Player${Date.now()}_${uniqueSuffix}`,
                      player_number: nextPlayerNumber,
                      access_tier: 'Full_Access',
                      skill_tier: 'Newcomer',
                      diamonds: isDisposable ? 0 : 500,
                      diamond_multiplier: 1.0,
                      streak_count: 0,
                      created_at: new Date().toISOString(),
                      last_login: new Date().toISOString(),
                      last_active: new Date().toISOString(),
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

              await grantWelcomeDiamonds();

              return res.json({
                  status: 'CREATED_MINIMAL',
                  profile: minimalProfile,
                  created: true,
                  warning: 'Created with minimal fields due to constraint issues'
              });
          }

          console.info(`[ANTIGRAVITY] ✓ Profile created — username: ${finalUsername}`);

          // CRITICAL: Ensure new users receive their welcome diamonds in the actual balance table!
          await grantWelcomeDiamonds();
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
