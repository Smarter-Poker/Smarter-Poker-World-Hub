/**
 * Profile column list constants
 * ═══════════════════════════════════════════════════════════════════════════
 * Phone and email are protected via column-level REVOKE on the public.profiles
 * table. Any `select('*')` or any select that explicitly requests phone/email
 * will return a 403 from PostgREST for non-service-role callers. The legitimate
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
export const SAFE_PROFILE_COLUMNS =
    'id, full_name, display_name, first_name, last_name, username, bio, city, state, alias, ' +
    'avatar_url, arena_avatar_url, use_avatar_as_profile_pic, role, status, is_vip, is_horse, is_admin, is_online, player_number, ' +
    'diamonds, diamond_balance, diamond_multiplier, level, tier, skill_tier, login_streak, ' +
    'streak_days, settings, preferences, social_page_id, favorite_venue, home_poker_club, ' +
    'referred_by, friends_count, hendon_total_cashes, hendon_total_earnings, email_verified, ' +
    'phone_verified, onboarding_complete, last_login, last_login_date, last_seen, created_at, ' +
    'updated_at, training_view_mode, last_trivia_date, trivia_streak, trivia_high_score, ' +
    'total_hands_played, notification_token, referral_code, horse_status, horse_profile, ' +
    'sounds_enabled, vibrations_enabled, show_stack_bb, birth_year, favorite_hand_type, ' +
    'card_back_preference, country, website, twitter, instagram, hendon_url, favorite_game, ' +
    'favorite_hand, home_casino, cover_photo_url, favorite_hand_plo, app_settings, ' +
    'display_name_preference, cover_photo_position, tiktok, telegram, birthday, ' +
    'hendon_biggest_cash, use_real_name, streak_count, access_tier, vip_tier, vip_expires_at, ' +
    'last_active, poker_near_me_preferences, can_review, deleted_reviews_count, kyc_status, ' +
    'kyc_provider, kyc_inquiry_id, kyc_completed_at, kyc_rejection_reason, age_verified, ' +
    'age_verified_at, jurisdiction_country, mfa_required, hub_preferences, friend_preferences, ' +
    'store_preferences, messenger_preferences, reels_preferences, over_18_attested_at, ' +
    'jurisdiction_region, jurisdiction_acknowledged_at, home_games_onboarded_at, ' +
    'social_profile_completed';

// Columns that are blocked at the DB layer for non-service-role callers.
// These can ONLY be read via:
//   - get_my_full_profile() RPC (self only)
//   - service_role (server-side APIs only)
export const SENSITIVE_PROFILE_COLUMNS = ['phone', 'email'];
