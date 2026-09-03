/**
 * Profile column list constants
 * ═══════════════════════════════════════════════════════════════════════════
 * SENSITIVE_PROFILE_COLUMNS are protected via column-level REVOKE on the
 * public.profiles table. Any `select('*')` or any select that explicitly
 * requests one of them returns a 403 from PostgREST for non-service-role
 * callers.
 *
 * That list was `['phone', 'email']` until 2026-08-26. On that date an audit
 * found SAFE_PROFILE_COLUMNS — the list used to read ANOTHER user's profile —
 * still carried kyc_status, kyc_inquiry_id, kyc_rejection_reason,
 * age_verified, jurisdiction_*, mfa_required and notification_token. The list
 * had quietly come to mean "every column except phone and email", so each new
 * sensitive column joined it by default. It is now an allow-list of columns
 * that are safe for a stranger to see, and nothing is added without asking
 * that question. The legitimate
 * paths to read these are:
 *
 *   • Self-read of OWN row → use the get_my_full_profile() RPC
 *   • Anonymous public profile share page (/u/[username]) → use the
 *     get_public_profile_by_username() RPC (returns only display-safe columns)
 *
 * For all other reads — viewing another user's profile, prefetching, social
 * feeds, mentions, etc. — use SAFE_PROFILE_COLUMNS or list explicit columns
 * (none of which can be phone/email).
 *
 * Updated: when new sensitive columns are added (e.g. notification_token),
 * add them to SENSITIVE_PROFILE_COLUMNS and apply a REVOKE migration.
 */

// Every column on public.profiles EXCEPT phone and email.
// Mirror this string when reading another user's profile via direct table query.
/*
 * REVOKED 2026-09-03: is_horse, horse_status, horse_profile.
 *
 * `authenticated` has NO table-level SELECT on public.profiles - reads are
 * carried entirely by column-level grants - and those three columns are not
 * among them. Postgres does not refuse the column, it refuses the statement:
 *
 *   403 {"code":"42501","message":"permission denied for table profiles"}
 *
 * so ONE ungranted name in this list fails the WHOLE read. Every consumer of
 * this constant takes the `error || !data` branch, and the profile page renders
 * "User Not Found" for a user who plainly exists. Verified live against
 * production the same afternoon: this list returned 42501 for `kingfish`, and
 * the identical list minus these three returned the row.
 *
 * They also do not belong here on the merits. This is the allow-list for
 * reading a STRANGER's profile, and whether an account is a house horse is not
 * a stranger's business - which is why the grant was removed in the first
 * place. Nothing that reads this constant used them.
 *
 * BEFORE ADDING A COLUMN HERE, CHECK THE GRANT:
 *
 *   select column_name from information_schema.column_privileges
 *    where table_schema='public' and table_name='profiles'
 *      and grantee='authenticated' and privilege_type='SELECT';
 *
 * A name missing from that result takes every profile read down with it.
 */
export const SAFE_PROFILE_COLUMNS =
    'id, full_name, display_name, first_name, last_name, username, bio, city, state, alias, ' +
    'avatar_url, arena_avatar_url, use_avatar_as_profile_pic, role, status, is_vip, ' +
    'is_admin, is_online, player_number, diamonds, diamond_balance, diamond_multiplier, level, ' +
    'tier, skill_tier, login_streak, streak_days, settings, preferences, social_page_id, ' +
    'favorite_venue, home_poker_club, referred_by, friends_count, hendon_total_cashes, ' +
    'hendon_total_earnings, email_verified, phone_verified, onboarding_complete, last_login, ' +
    'last_login_date, last_seen, created_at, updated_at, training_view_mode, last_trivia_date, ' +
    'trivia_streak, trivia_high_score, total_hands_played, referral_code, ' +
    'sounds_enabled, vibrations_enabled, show_stack_bb, birth_year, ' +
    'favorite_hand_type, card_back_preference, country, website, twitter, instagram, hendon_url, ' +
    'favorite_game, favorite_hand, home_casino, cover_photo_url, favorite_hand_plo, ' +
    'app_settings, display_name_preference, cover_photo_position, tiktok, telegram, birthday, ' +
    'hendon_biggest_cash, use_real_name, streak_count, access_tier, vip_tier, vip_expires_at, ' +
    'last_active, poker_near_me_preferences, can_review, deleted_reviews_count, hub_preferences, ' +
    'friend_preferences, store_preferences, messenger_preferences, reels_preferences, ' +
    'home_games_onboarded_at, social_profile_completed';

// Columns that are blocked at the DB layer for non-service-role callers.
// These can ONLY be read via:
//   - get_my_full_profile() RPC (self only)
//   - service_role (server-side APIs only)
export const SENSITIVE_PROFILE_COLUMNS = [
    'phone',
    'email',
    // AUDIT 2026-08-26 — these were in SAFE_PROFILE_COLUMNS, which is the
    // list used to read ANOTHER user's profile (pages/hub/user/[username].js,
    // useProfilePrefetch). Every viewer was therefore served the subject's
    // KYC state, age-verification state, jurisdiction and push token.
    // Nothing in the client reads any of them; they were carried along by a
    // list that had grown to mean "every column except phone and email".
    'kyc_status',
    'kyc_provider',
    'kyc_inquiry_id',
    'kyc_completed_at',
    'kyc_rejection_reason',
    'age_verified',
    'age_verified_at',
    'over_18_attested_at',
    'jurisdiction_country',
    'jurisdiction_region',
    'jurisdiction_acknowledged_at',
    'mfa_required',
    'notification_token',
];
