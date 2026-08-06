/**
 * ◆ DIAMOND REWARDS STANDARD v2 — CANONICAL CATALOG
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH for every way a user can earn diamonds.
 *
 * ECONOMIC ANCHOR
 *   1 diamond = $0.01 USD. VIP = $19.99/mo ($199.99/yr).
 * A genuinely hard-working free user tops out at ~3,300 ◆/month ($33) =
 * a VIP card (1,999 ◆) + ~1,300 ◆ for the Diamond Arena.
 *   Every diamond is REAL MONEY. Ceilings are mandatory, not advisory.
 *
 * HARD RULES (enforced in SQL by public.award_diamonds_v2)
 *   1. The client NEVER sends an amount. The server resolves the amount from
 *      THIS FILE only. Anything else is a mint-your-own-money bug.
 *   2. The daily/monthly cap is evaluated on the POST-multiplier amount.
 *      profiles.diamond_multiplier (share streak) may make the cap easier to
 *      REACH; it must NEVER raise the ceiling. 110 is 110 at 1.00x and at
 *      2.00x. (The v1 bug: JS capped pre-multiplier, so the true ceiling was
 * 500 × 2.00 = 1,000 ◆/day = $10/day/user.)
 *   3. Lifetime rewards fire exactly once, ever, per user.
 *   4. `serverOnly` actions are NEVER claimable from the browser. They are
 *      awarded by trusted server flows (Stripe webhook, referral qualifier,
 *      verification callbacks, VIP stipend cron) calling award_diamonds_v2
 *      directly with the service-role key.
 *
 * MODULE CONTRACT
 *   - Pure data + pure functions. NO react, NO lucide-react, NO supabase
 *     imports, so this file is safe to import from API routes, cron workers,
 *     migration scripts and the browser bundle alike.
 *   - `icon` is a STRING that must be a valid lucide-react export name; the
 *     UI does the icon lookup so this module stays dependency-free.
 *
 * @see pages/api/rewards/claim.js  — the only client-facing claim entrypoint
 * @see public.award_diamonds_v2()  — the only function that moves the balance
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CATALOG_VERSION = 2;

// ═══════════════════════════════════════════════════════════════════════════
// CEILINGS — the whole point of v2
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maximum diamonds a user may bank in one America/Chicago day, measured
 * AFTER the share-streak multiplier is applied.
 * free: 110 × 30 days = 3,300 ◆ = $33/mo. vip: 150 × 30 = 4,500 ◆ = $45/mo.
 */
export const DAILY_CAP = { free: 110, vip: 150 };

/** Hard monthly ceiling per user (America/Chicago calendar month). */
export const MONTHLY_CAP = { free: 3300, vip: 4500 };

/**
 * Platform-wide circuit breaker: 2,500,000 ◆ = $25,000/month of liability.
 * When the month-to-date platform total crosses this, award_diamonds_v2
 * returns reason 'budget_exhausted' for everyone until the month rolls.
 */
export const PLATFORM_MONTHLY_BUDGET = 2500000;

/**
 * Easter eggs draw on their own budget, separate from DAILY_CAP / MONTHLY_CAP:
 * 1000 ◆ = $10/user/month. Raised from 500 on 2026-08-05 (approved by Dan)
 * alongside migration 20260805210000, which also fixed the catalog row that
 * had eggs counting toward the 110/150 daily cap — a 500 ◆ legendary was
 * being clamped to the daily remainder and the excess silently discarded.
 *
 * Mirrored in award_diamonds_v2 as c_egg_monthly_cap. If you change one,
 * change both, or the SQL silently wins.
 */
export const EASTER_EGG_MONTHLY_CAP = 1000;

/**
 * Hard ceiling on a SINGLE egg, mirrored in award_diamonds_v2 as
 * c_egg_max_single. Was 250 while sixteen catalog eggs were priced above it,
 * so those paid 250 and the UI promised more.
 *
 * No egg in EASTER_EGGS is priced above 500 today; the headroom exists so a
 * future legendary is not silently truncated. Egg awards are all-or-nothing:
 * one that does not fit in the remaining monthly budget is deferred whole and
 * picked up by a later sweep, never part-paid.
 */
export const EASTER_EGG_MAX_SINGLE = 1000;

/**
 * Share-streak multiplier tiers stored on profiles.diamond_multiplier.
 * These multiply the per-action award, NOT the cap. Documented here so no
 * one re-derives them wrong. Anything above 2.00 in the DB is corruption.
 */
export const MULTIPLIER_TIERS = [1.0, 1.2, 1.5, 1.75, 2.0];
export const MAX_MULTIPLIER = 2.0;

/** Timezone that anchors "day", "month", streaks and birthdays. */
export const REWARD_TIMEZONE = 'America/Chicago';

// ═══════════════════════════════════════════════════════════════════════════
// REWARD CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

export const CATEGORIES = {
  daily: 'Daily',
  training: 'Training',
  content: 'Content',
  social: 'Social',
  engagement: 'Engagement',
  profile: 'One-Time',
  referral: 'Referral',
  vip: 'VIP',
  secret: 'Secret',
};

/**
 * Categories that require a warmed-up account (>= 24h old + verified email)
 * before anything is paid out. Enforced in pages/api/rewards/claim.js.
 */
export const AGE_GATED_CATEGORIES = ['social'];

// ═══════════════════════════════════════════════════════════════════════════
// THE CATALOG
// ═══════════════════════════════════════════════════════════════════════════
//
// Field reference
//   key                   action_key / reward_type / p_type in the ledger
//   label                 short UI title
//   description           one line of UI copy explaining how to earn it
//   diamonds              base award BEFORE the share-streak multiplier
//   maxDiamonds           upper bound when `scaling` is present
//   scaling               how `diamonds` grows (streak-based)
//   maxPerDay             max successful awards per America/Chicago day
//   category              key of CATEGORIES
//   countsTowardDailyCap  false = paid from a separate budget line
//   lifetime              true = once ever, per user
//   icon                  lucide-react export name (string)
//   gate                  'free' | 'vip'
//   oncePerTarget         true = one award per distinct p_target_id, forever
//   oncePerYear           true = one award per calendar year
//   oncePerMonth          true = one award per calendar month
//   monthlyMax            per-user monthly award count ceiling
//   serverOnly            true = never claimable from the browser
//   verifyNote            what the server MUST prove before paying
//
export const REWARDS = {
  // ─────────────────────────────────────────────────────────────────────────
  // DAILY — the habit loop
  // ─────────────────────────────────────────────────────────────────────────
  daily_login: {
    key: 'daily_login',
    label: 'Daily Login',
    description:
      'Show up every day. Day 1 pays 5 ◆ and each consecutive day adds 2 ◆, up to 25 ◆ at day 11+. Miss a day and the streak resets to 5.',
    diamonds: 5,
    maxDiamonds: 25,
    scaling: {
      type: 'streak',
      base: 5,
      increment: 2,
      max: 25,
      timezone: REWARD_TIMEZONE,
      formula: 'min(5 + (streak - 1) * 2, 25)',
      note: 'TRUE consecutive calendar days in America/Chicago. Server-computed only.',
    },
    maxPerDay: 1,
    category: 'daily',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'CalendarCheck',
    gate: 'free',
    verifyNote: 'Streak length is read from the ledger, never from the client.',
  },

  daily_trivia_challenge: {
    key: 'daily_trivia_challenge',
    label: 'Daily Trivia Challenge',
    description:
      "Finish today's poker trivia challenge. Any score counts — showing up is the reward.",
    diamonds: 15,
    maxPerDay: 1,
    category: 'daily',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'Brain',
    gate: 'free',
    verifyNote: 'Requires a completed trivia attempt row for today owned by the claimer.',
  },

  hand_of_the_day: {
    key: 'hand_of_the_day',
    label: 'Hand Of The Day',
    description:
      'Analyze the featured hand and lock in your line before the solution reveals.',
    diamonds: 10,
    maxPerDay: 1,
    category: 'daily',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'Spade',
    gate: 'free',
    verifyNote: 'Requires a submitted answer row for the current HOTD id.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TRAINING — the product
  // ─────────────────────────────────────────────────────────────────────────
  first_training_session: {
    key: 'first_training_session',
    label: 'First Training Session',
    description:
      'Complete your very first GTO training session. A one-time welcome to the grind.',
    diamonds: 15,
    maxPerDay: 1,
    category: 'training',
    countsTowardDailyCap: true,
    lifetime: true,
    icon: 'Rocket',
    gate: 'free',
    verifyNote: 'Lifetime once. Requires at least one completed training session row.',
  },

  training_level_complete: {
    key: 'training_level_complete',
    label: 'Training Level Complete',
    description:
      'Clear a training level at a passing score. Up to 3 levels per day pay out.',
    diamonds: 8,
    maxPerDay: 3,
    category: 'training',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'GraduationCap',
    gate: 'free',
    oncePerTarget: true,
    verifyNote:
      'p_target_id is the level id. One payout per level id per user, forever — replaying a cleared level pays nothing.',
  },

  gto_chart_study: {
    key: 'gto_chart_study',
    label: 'GTO Chart Study',
    description:
      'Study a preflop range chart for a full session. Two studied charts pay out per day.',
    diamonds: 5,
    maxPerDay: 2,
    category: 'training',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'BookOpen',
    gate: 'free',
    verifyNote: 'Requires a server-recorded study session of sufficient dwell time.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CONTENT
  // ─────────────────────────────────────────────────────────────────────────
  video_watch: {
    key: 'video_watch',
    label: 'Watch Training Video',
    description: 'Watch 5+ minutes of a training video. Three videos per day pay out.',
    diamonds: 3,
    maxPerDay: 3,
    category: 'content',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'PlayCircle',
    gate: 'free',
    oncePerTarget: true,
    verifyNote:
      'Watch progress MUST come from a server-written table. The v1 source table was client-writable.',
  },

  video_favorite: {
    key: 'video_favorite',
    label: 'Favorite A Video',
    description: 'Save a training video to your favorites. Three per day pay out.',
    diamonds: 1,
    maxPerDay: 3,
    category: 'content',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'Star',
    gate: 'free',
    oncePerTarget: true,
    verifyNote: 'One payout per video id per user, forever. Un-favoriting does not refund a new claim.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SOCIAL — 24h account age + verified email required (see AGE_GATED_CATEGORIES)
  // ─────────────────────────────────────────────────────────────────────────
  social_post: {
    key: 'social_post',
    label: 'Create A Post',
    description:
      'Post a hand, a result, or a thought to the feed. Two posts per day pay out.',
    diamonds: 10,
    maxPerDay: 2,
    category: 'social',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'SquarePen',
    gate: 'free',
    oncePerTarget: true,
    verifyNote:
      'MUST confirm posts.author_id = claimer. v1 paid anyone who sent a post id, and the reference id was not user-scoped.',
  },

  share_content: {
    key: 'share_content',
    label: 'Share Content',
    description:
      'Share a post, score card, or hand outside the app. Two shares per day pay out.',
    diamonds: 10,
    maxPerDay: 2,
    category: 'social',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'Send',
    gate: 'free',
    oncePerTarget: true,
    verifyNote: 'One payout per shared content id per user.',
  },

  strategy_comment: {
    key: 'strategy_comment',
    label: 'Strategy Comment',
    description:
      'Leave a substantive strategy comment on a hand or post. Three per day pay out.',
    diamonds: 3,
    maxPerDay: 3,
    category: 'social',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'MessageSquare',
    gate: 'free',
    oncePerTarget: true,
    verifyNote:
      'MUST confirm comments.author_id = claimer AND a minimum length, or this is a text-spam faucet.',
  },

  reaction: {
    key: 'reaction',
    label: 'React To A Post',
    description: 'Like or react to a post. Five reactions per day pay out.',
    diamonds: 1,
    maxPerDay: 5,
    category: 'social',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'ThumbsUp',
    gate: 'free',
    oncePerTarget: true,
    verifyNote: 'One payout per post id per user. Un-react/re-react pays nothing.',
  },

  follow: {
    key: 'follow',
    label: 'Follow A Player',
    description: 'Follow another player. Three follows per day pay out.',
    diamonds: 2,
    maxPerDay: 3,
    category: 'social',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'UserPlus',
    gate: 'free',
    oncePerTarget: true,
    verifyNote:
      'One payout per followed user id, forever. Unfollow/refollow pays nothing. Self-follow is rejected.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ENGAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  venue_review: {
    key: 'venue_review',
    label: 'Venue Review',
    description:
      'Review a poker room you actually played. One payout per venue, ever — 25 ◆ for real, useful intel.',
    diamonds: 25,
    maxPerDay: 1,
    category: 'engagement',
    countsTowardDailyCap: true,
    lifetime: false,
    icon: 'MapPin',
    gate: 'free',
    oncePerTarget: true,
    verifyNote:
      'p_target_id is the venue id. NEVER geofence against client-supplied lat/long (v1 bug) — use a server-side check-in or trusted geo-IP.',
  },

  birthday: {
    key: 'birthday',
    label: 'Birthday Bonus',
    description: 'Happy birthday from Smarter.Poker — 100 ◆, once a year.',
    diamonds: 100,
    maxPerDay: 1,
    category: 'engagement',
    countsTowardDailyCap: true,
    lifetime: false,
    oncePerYear: true,
    icon: 'Cake',
    gate: 'free',
    verifyNote:
      'Birth date must be locked at signup and immutable afterwards, or this is a 100 ◆/day faucet.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ONE-TIME PROFILE MILESTONES
  // Lifetime once. Exempt from the daily cap so a new user can finish
  // onboarding in one sitting (145 ◆ total, one time, forever).
  // ─────────────────────────────────────────────────────────────────────────
  profile_complete: {
    key: 'profile_complete',
    label: 'Complete Your Profile',
    description: 'Avatar, bio, and username all filled in. Paid once, ever.',
    diamonds: 50,
    maxPerDay: 1,
    category: 'profile',
    countsTowardDailyCap: false,
    lifetime: true,
    icon: 'UserCheck',
    gate: 'free',
    verifyNote: 'Server re-reads the profile columns; it does not trust a client "complete" flag.',
  },

  profile_pic: {
    key: 'profile_pic',
    label: 'Upload A Profile Picture',
    description: 'Put a face (or an avatar) to the name. Paid once, ever.',
    diamonds: 10,
    maxPerDay: 1,
    category: 'profile',
    countsTowardDailyCap: false,
    lifetime: true,
    icon: 'Camera',
    gate: 'free',
    verifyNote: 'Requires a non-default avatar_url that resolves to our own storage bucket.',
  },

  hendonmob_link: {
    key: 'hendonmob_link',
    label: 'Link Your Hendon Mob',
    description: 'Connect your Hendon Mob profile and pull in your live results. Paid once, ever.',
    diamonds: 25,
    maxPerDay: 1,
    category: 'profile',
    countsTowardDailyCap: false,
    lifetime: true,
    icon: 'Link2',
    gate: 'free',
    verifyNote: 'URL must be validated against thehendonmob.com and uniquely claimed across users.',
  },

  email_verified: {
    key: 'email_verified',
    label: 'Verify Your Email',
    description: 'Confirm your email address. Paid once, ever.',
    diamonds: 10,
    maxPerDay: 1,
    category: 'profile',
    countsTowardDailyCap: false,
    lifetime: true,
    icon: 'MailCheck',
    gate: 'free',
    serverOnly: true,
    verifyNote:
      'Awarded by the auth callback from auth.users.email_confirmed_at. Never claimable from the browser.',
  },

  phone_verified: {
    key: 'phone_verified',
    label: 'Verify Your Phone',
    description: 'Confirm your phone number with a one-time code. Paid once, ever.',
    diamonds: 25,
    maxPerDay: 1,
    category: 'profile',
    countsTowardDailyCap: false,
    lifetime: true,
    icon: 'PhoneCall',
    gate: 'free',
    serverOnly: true,
    verifyNote:
      'Awarded by the OTP verify flow AFTER the code is checked, using the JWT identity — not a body-supplied userId (v1 bug).',
  },

  first_purchase: {
    key: 'first_purchase',
    label: 'First Purchase',
    description: 'Thanks for your first purchase — here is 25 ◆ back. Paid once, ever.',
    diamonds: 25,
    maxPerDay: 1,
    category: 'profile',
    countsTowardDailyCap: false,
    lifetime: true,
    icon: 'ShoppingBag',
    gate: 'free',
    serverOnly: true,
    verifyNote: 'Awarded by the Stripe webhook on a settled payment_intent only.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REFERRAL — separate budget line, exempt from the daily cap, but hard
  // capped at 10 qualified referrals per month (2,500 ◆ = $25 max exposure).
  // ─────────────────────────────────────────────────────────────────────────
  referral_qualified: {
    key: 'referral_qualified',
    label: 'Qualified Referral',
    description:
      'A player you referred verified their email AND phone, and logged in on 5 separate days. 500 ◆ to you, 100 ◆ to them, up to 20 qualified referrals per month.',
    diamonds: 500,
    maxPerDay: 20,
    monthlyMax: 20,
    category: 'referral',
    countsTowardDailyCap: false,
    lifetime: false,
    oncePerTarget: true,
    icon: 'Users',
    gate: 'free',
    serverOnly: true,
    verifyNote:
      'p_target_id is the referee user id. Qualification is decided server-side (verified email + real activity + distinct device/IP), never by the referrer.',
  },

  referral_referee: {
    key: 'referral_referee',
    label: 'Welcome Bonus',
    description: 'You joined with a friend’s invite code — here is 100 ◆ to start.',
    diamonds: 100,
    maxPerDay: 1,
    category: 'referral',
    countsTowardDailyCap: false,
    lifetime: true,
    icon: 'Gift',
    gate: 'free',
    serverOnly: true,
    verifyNote: 'Paid once, ever, at the same moment the referrer qualifies.',
  },

  referral_vip_conversion: {
    key: 'referral_vip_conversion',
    label: 'Referral Went VIP',
    description: 'A player you referred bought a VIP membership. 500 ◆ bonus.',
    diamonds: 500,
    maxPerDay: 20,
    monthlyMax: 20,
    category: 'referral',
    countsTowardDailyCap: false,
    lifetime: false,
    oncePerTarget: true,
    icon: 'Crown',
    gate: 'free',
    serverOnly: true,
    verifyNote:
      'Stripe webhook only, on a PAID subscription (never a trial). One payout per referee, forever.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // VIP
  // ─────────────────────────────────────────────────────────────────────────
  vip_stipend: {
    key: 'vip_stipend',
    label: 'VIP Monthly Stipend',
    description: '500 ◆ credited every month for as long as your VIP membership is active.',
    diamonds: 500,
    maxPerDay: 1,
    oncePerMonth: true,
    category: 'vip',
    countsTowardDailyCap: false,
    lifetime: false,
    icon: 'Crown',
    gate: 'vip',
    serverOnly: true,
    verifyNote:
      'PAID subscribers only. Requires an active, non-trial Stripe subscription with vip_expires_at in the future. Never self-granted, never for diamond-purchased day passes.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TRAINING MILESTONES — server-only award families
  //
  // These families were previously paid via direct add_diamonds_to_balance
  // calls with uncatalogued transaction_types, making them invisible to every
  // cap and to the 2.5M platform circuit breaker.
  //
  // All are serverOnly — they are NEVER claimable from the browser. The eight
  // server routes call award_diamonds_v2 directly with the service-role client.
  //
  // Per-family monthly ceilings (Dan's decisions, 2026-08-06):
  //   streak_reward    1,000 ◆/month — milestone itself is the natural ceiling
  //   daily_bonus      3,750 ◆/month — own line; 125/day × 30
  //   training_reward  1,500 ◆/month — small per-session; 50/day × 30
  //   achievement      1,000 ◆/month — DB-driven amounts
  //   challenge        1,000 ◆/month — DB-driven amounts
  //   tournament_prize uncapped        — prize pool integrity; breaker still counts it
  //
  // IMPORTANT: if you change monthlyDiamondCap here you MUST also update the
  // corresponding row in diamond_reward_catalog (migration + apply). The SQL
  // function reads the table, not this file.
  // ─────────────────────────────────────────────────────────────────────────

  streak_reward: {
    key: 'streak_reward',
    label: 'Training Streak Milestone',
    description:
      'Milestone reward for maintaining a consecutive training streak — up to 10,000 ◆ for a 365-day run.',
    diamonds: 0,                // variable; server passes amount in metadata.streak_diamonds
    maxDiamonds: 10000,
    monthlyDiamondCap: 1000,   // $10/user/month ceiling; 10k milestone defers whole if over budget
    category: 'training',
    countsTowardDailyCap: false,
    lifetime: false,
    oncePerTarget: true,        // p_target_id = `streak_<userId>_<milestoneDays>` — one claim per milestone
    icon: 'Flame',
    gate: 'free',
    serverOnly: true,
    verifyNote:
      'Awarded by pages/api/training/streak.js after confirming the milestone has not been claimed. Amount passed in metadata.streak_diamonds.',
  },

  daily_bonus: {
    key: 'daily_bonus',
    label: 'Daily Training Bonus',
    description:
      'Daily login training bonus — base plus consecutive-streak multiplier, up to 125 ◆/day.',
    diamonds: 0,                // variable; server passes amount in metadata.bonus_diamonds
    maxDiamonds: 125,
    monthlyDiamondCap: 3750,   // 125/day × 30; own budget, not the 110 daily cap
    category: 'training',
    countsTowardDailyCap: false,
    lifetime: false,
    maxPerDay: 1,
    icon: 'CalendarDays',
    gate: 'free',
    serverOnly: true,
    verifyNote:
      'Awarded by pages/api/training/daily-bonus.js, idempotency-keyed to user+date. Amount passed in metadata.bonus_diamonds.',
  },

  training_reward: {
    key: 'training_reward',
    label: 'Training Session Reward',
    description:
      'Per-session training reward for completing a GTO training level or the Hand of the Day.',
    diamonds: 0,                // variable (8–25 ◆ per session); server passes amount in metadata.reward_diamonds
    maxDiamonds: 50,
    monthlyDiamondCap: 1500,   // 50/day × 30 generous headroom; own budget
    category: 'training',
    countsTowardDailyCap: false,
    lifetime: false,
    icon: 'GraduationCap',
    gate: 'free',
    serverOnly: true,
    verifyNote:
      'Awarded by pages/api/training/save-progress.js, save-session.js (speed bonus) and hand-of-the-day.js. Amount passed in metadata.reward_diamonds.',
  },

  achievement: {
    key: 'achievement',
    label: 'Achievement Unlocked',
    description:
      'One-time reward for unlocking a training achievement. Amount is DB-driven.',
    diamonds: 0,                // variable; server passes amount in metadata.achievement_diamonds
    maxDiamonds: 500,
    monthlyDiamondCap: 1000,   // $10/user/month across all achievements
    category: 'training',
    countsTowardDailyCap: false,
    lifetime: false,
    oncePerTarget: true,        // p_target_id = achievement_id — one claim per achievement per user
    icon: 'Trophy',
    gate: 'free',
    serverOnly: true,
    verifyNote:
      'Awarded by pages/api/training/achievements.js after DB confirms first-unlock. Amount passed in metadata.achievement_diamonds.',
  },

  challenge: {
    key: 'challenge',
    label: 'Challenge Completed',
    description:
      'Reward for completing a recurring training challenge. Amount is DB-driven.',
    diamonds: 0,                // variable; server passes amount in metadata.challenge_diamonds
    maxDiamonds: 500,
    monthlyDiamondCap: 1000,   // $10/user/month across all challenges
    category: 'training',
    countsTowardDailyCap: false,
    lifetime: false,
    icon: 'Swords',
    gate: 'free',
    serverOnly: true,
    verifyNote:
      'Awarded by pages/api/training/challenges.js after DB confirms completion and idempotency. Amount passed in metadata.challenge_diamonds.',
  },

  tournament_prize: {
    key: 'tournament_prize',
    label: 'Trivia Tournament Prize',
    description:
      'Prize for placing in a Smarter.Poker trivia tournament. Amount determined by prize pool.',
    diamonds: 0,                // variable prize pool; server passes amount in metadata.prize_diamonds
    maxDiamonds: 10000,
    // monthlyDiamondCap intentionally absent — uncapped per Dan's decision 2026-08-06.
    // The 2.5M platform circuit breaker (PLATFORM_MONTHLY_BUDGET) still applies
    // because the route now flows through award_diamonds_v2.
    category: 'training',
    countsTowardDailyCap: false,
    lifetime: false,
    oncePerTarget: true,        // p_target_id = `<tournamentId>_<userId>` — one prize per tournament placement
    icon: 'Medal',
    gate: 'free',
    serverOnly: true,
    verifyNote:
      'Awarded by pages/api/trivia/tournament-lifecycle.js after tournament_participants row is locked. Amount passed in metadata.prize_diamonds.',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SECRET
  // ─────────────────────────────────────────────────────────────────────────
  easter_egg: {
    key: 'easter_egg',
    label: 'Hidden Achievement',
    description:
      'Discover a hidden achievement. Amount comes from the EASTER_EGGS map — 5 to 500 ◆ by rarity, drawing on a separate 1000 ◆ monthly egg budget that sits outside your daily cap.',
    diamonds: 0,
    maxDiamonds: 500,
    amountFrom: 'EASTER_EGGS',
    maxPerDay: 3,
    monthlyDiamondCap: EASTER_EGG_MONTHLY_CAP,
    category: 'secret',
    countsTowardDailyCap: false,
    lifetime: false,
    oncePerTarget: true,
    icon: 'Sparkles',
    gate: 'free',
    verifyNote:
      'p_target_id is the egg key. Amount is looked up from EASTER_EGGS, never sent by the client. Eggs with verifiable:false are staff-awarded and rejected at the public endpoint.',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL PROGRAM CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
export const REFERRAL = {
  referrer: 500,
  referee: 100,
  vipConversionBonus: 500,
  maxQualifiedPerMonth: 20,
};

// ═══════════════════════════════════════════════════════════════════════════
// EASTER EGGS — rebuilt for v2
// ═══════════════════════════════════════════════════════════════════════════
//
// WHAT CHANGED FROM v1
//   • DELETED every egg that paid users to defeat our own fraud signals or to
//     fiddle with the UI: 3-different-IPs, incognito login, refresh-during-
//     loading, mute toggling, UI-scale changes, idling on the reward screen,
//     credits scrolling, Button Masher, Dark Mode Detective, Binary King,
//     The Ghost User, Hardware Enthusiast. Paying people to rotate IPs and
//     browse in incognito is paying them to look exactly like a fraud ring.
// • RESCALED so NOTHING exceeds 500 ◆ ($5). v1 had a 10,000 ◆ ($100) egg.
//   • CUT the padded 100 down to a curated set of real achievements.
//   • Every egg now declares whether the SERVER can prove it.
//
// RARITY BANDS (hard requirement — assertCatalogIntegrity() enforces these)
//   common 5-15 | uncommon 20-40 | rare 50-100 | epic 125-250 | legendary 300-500
//
// verifiable:true  → server can prove it from its own tables; user-claimable.
// verifiable:false → requires human judgement (staff shout-out, shipped bug
//                    fix, featured tip). Staff-granted only; the public claim
//                    endpoint rejects these.
//
export const RARITY_BANDS = {
  common: { min: 5, max: 15 },
  uncommon: { min: 20, max: 40 },
  rare: { min: 50, max: 100 },
  epic: { min: 125, max: 250 },
  legendary: { min: 300, max: 500 },
};

export const EGG_CATEGORIES = {
  performance: 'Performance',
  strategy_mastery: 'Strategy Mastery',
  timing_loyalty: 'Timing & Loyalty',
  social_viral: 'Social',
  legacy_milestones: 'Milestones',
  discovery: 'Discovery',
};

export const EASTER_EGGS = {
  // ── PERFORMANCE ──────────────────────────────────────────────────────────
  gto_machine: {
    key: 'gto_machine',
    name: 'GTO Machine',
    rarity: 'epic',
    diamonds: 200,
    hint: 'Answer 100 training questions without ever asking for a hint.',
    category: 'performance',
    verifiable: true,
    icon: 'Bot',
  },
  speed_demon: {
    key: 'speed_demon',
    name: 'Speed Demon',
    rarity: 'rare',
    diamonds: 50,
    hint: 'Answer 20 questions correctly in under three seconds each.',
    category: 'performance',
    verifiable: true,
    icon: 'Zap',
  },
  the_optimizer: {
    key: 'the_optimizer',
    name: 'The Optimizer',
    rarity: 'uncommon',
    diamonds: 40,
    hint: 'Close out a Leak Signal on your very first corrective attempt.',
    category: 'performance',
    verifiable: true,
    icon: 'Wrench',
  },
  dead_reckoning: {
    key: 'dead_reckoning',
    name: 'Dead Reckoning',
    rarity: 'legendary',
    diamonds: 300,
    hint: 'Pass a Level 5 or higher session at 100% on your first attempt.',
    category: 'performance',
    verifiable: true,
    icon: 'Target',
  },
  calculated_risk: {
    key: 'calculated_risk',
    name: 'Calculated Risk',
    rarity: 'uncommon',
    diamonds: 30,
    hint: 'Choose five consecutive alternate lines that land within 1% EV of the solver.',
    category: 'performance',
    verifiable: true,
    icon: 'Ruler',
  },
  deep_diver: {
    key: 'deep_diver',
    name: 'Deep Diver',
    rarity: 'rare',
    diamonds: 60,
    hint: 'Spend more than an hour in the Charts section in a single day.',
    category: 'performance',
    verifiable: true,
    icon: 'Activity',
  },
  night_owl: {
    key: 'night_owl',
    name: 'The Night Owl',
    rarity: 'rare',
    diamonds: 50,
    hint: 'Finish a training session between 2AM and 5AM your local time.',
    category: 'performance',
    verifiable: true,
    icon: 'Moon',
  },
  perfectionist: {
    key: 'perfectionist',
    name: 'The Perfectionist',
    rarity: 'epic',
    diamonds: 150,
    hint: 'Clear five levels back to back without a single error.',
    category: 'performance',
    verifiable: true,
    icon: 'Sparkles',
  },
  comeback_kid: {
    key: 'comeback_kid',
    name: 'The Comeback Kid',
    rarity: 'rare',
    diamonds: 75,
    hint: 'Fail a level twice, then pass it at 95% or better.',
    category: 'performance',
    verifiable: true,
    icon: 'Dumbbell',
  },
  the_machine: {
    key: 'the_machine',
    name: 'The Machine',
    rarity: 'epic',
    diamonds: 125,
    hint: 'Complete a 50-question session with a median answer time under 1.5 seconds.',
    category: 'performance',
    verifiable: true,
    icon: 'Settings',
  },
  multi_level_master: {
    key: 'multi_level_master',
    name: 'Multi-Level Master',
    rarity: 'epic',
    diamonds: 250,
    hint: 'Clear ten training levels inside a single hour.',
    category: 'performance',
    verifiable: true,
    icon: 'Gauge',
  },

  // ── STRATEGY MASTERY ─────────────────────────────────────────────────────
  pure_strategy: {
    key: 'pure_strategy',
    name: 'Pure Strategy',
    rarity: 'rare',
    diamonds: 75,
    hint: 'Pick the 100%-frequency action 25 times in a row.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Shield',
  },
  mix_master: {
    key: 'mix_master',
    name: 'Mix Master',
    rarity: 'rare',
    diamonds: 50,
    hint: 'Correctly identify five mixed strategies in a row.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Sliders',
  },
  the_punisher: {
    key: 'the_punisher',
    name: 'The Punisher',
    rarity: 'uncommon',
    diamonds: 40,
    hint: 'Take the correct exploitative line against ten simulated whale spots.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Skull',
  },
  folding_legend: {
    key: 'folding_legend',
    name: 'Folding Legend',
    rarity: 'rare',
    diamonds: 60,
    hint: 'Find the solver-approved fold while holding top pair.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'LayoutDashboard',
  },
  value_extractor: {
    key: 'value_extractor',
    name: 'Value Extractor',
    rarity: 'epic',
    diamonds: 125,
    hint: 'Capture maximum EV on every single hand of a level.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'CircleDollarSign',
  },
  bluffcatcher: {
    key: 'bluffcatcher',
    name: 'The Bluffcatcher',
    rarity: 'rare',
    diamonds: 50,
    hint: 'Make the correct call facing a triple-barrel bluff.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Crosshair',
  },
  range_architect: {
    key: 'range_architect',
    name: 'Range Architect',
    rarity: 'uncommon',
    diamonds: 40,
    hint: 'Study the complete range for one position fifty times.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Building',
  },
  equity_expert: {
    key: 'equity_expert',
    name: 'Equity Expert',
    rarity: 'uncommon',
    diamonds: 30,
    hint: 'Estimate hand equity within 2% of the solver.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'TrendingUp',
  },
  blocker_pro: {
    key: 'blocker_pro',
    name: 'Blocker Pro',
    rarity: 'rare',
    diamonds: 50,
    hint: 'Win a hand by correctly reading your blockers.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'ShieldCheck',
  },
  overbet_outlaw: {
    key: 'overbet_outlaw',
    name: 'Overbet Outlaw',
    rarity: 'uncommon',
    diamonds: 35,
    hint: 'Fire a 2x-pot overbet at the correct frequency.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Flame',
  },
  minimum_defense: {
    key: 'minimum_defense',
    name: 'Minimum Defense',
    rarity: 'rare',
    diamonds: 55,
    hint: 'Nail the minimum defense frequency three times in one session.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Scale',
  },
  the_sniper: {
    key: 'the_sniper',
    name: 'The Sniper',
    rarity: 'epic',
    diamonds: 150,
    hint: 'Pass a level with under ten seconds left on the clock.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Crosshair',
  },
  check_raise_king: {
    key: 'check_raise_king',
    name: 'Check-Raise King',
    rarity: 'uncommon',
    diamonds: 40,
    hint: 'Find ten correct check-raise lines in a single session.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Crown',
  },
  postflop_wizard: {
    key: 'postflop_wizard',
    name: 'Post-Flop Wizard',
    rarity: 'epic',
    diamonds: 125,
    hint: 'Go a full day without missing a single turn or river decision.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Wand2',
  },
  preflop_bot: {
    key: 'preflop_bot',
    name: 'Pre-Flop Bot',
    rarity: 'legendary',
    diamonds: 300,
    hint: 'Make 500 preflop decisions at 100% accuracy.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Bot',
  },
  polarizer: {
    key: 'polarizer',
    name: 'Polarizer',
    rarity: 'rare',
    diamonds: 50,
    hint: 'Separate polarized from condensed ranges ten times without a miss.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Zap',
  },
  indifference_point: {
    key: 'indifference_point',
    name: 'Indifference Point',
    rarity: 'epic',
    diamonds: 125,
    hint: 'Build a line that makes your opponent exactly indifferent.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Scale',
  },
  small_baller: {
    key: 'small_baller',
    name: 'Small Baller',
    rarity: 'uncommon',
    diamonds: 30,
    hint: 'Clear an entire level using nothing but 33%-pot sizings.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Circle',
  },
  the_oracle: {
    key: 'the_oracle',
    name: 'The Oracle',
    rarity: 'epic',
    diamonds: 150,
    hint: 'Predict ten solver moves in a row before they are revealed.',
    category: 'strategy_mastery',
    verifiable: true,
    icon: 'Orbit',
  },

  // ── TIMING & LOYALTY ─────────────────────────────────────────────────────
  sunrise_grinder: {
    key: 'sunrise_grinder',
    name: 'Sunrise Grinder',
    rarity: 'rare',
    diamonds: 50,
    hint: 'Train within half an hour of sunrise where you live.',
    category: 'timing_loyalty',
    verifiable: true,
    icon: 'Sunrise',
  },
  the_anniversary: {
    key: 'the_anniversary',
    name: 'The Anniversary',
    rarity: 'epic',
    diamonds: 125,
    hint: 'Log in exactly one month after the day you signed up.',
    category: 'timing_loyalty',
    verifiable: true,
    icon: 'Cake',
  },
  weekend_warrior: {
    key: 'weekend_warrior',
    name: 'Weekend Warrior',
    rarity: 'epic',
    diamonds: 150,
    hint: 'Hit your daily diamond cap on both Saturday and Sunday.',
    category: 'timing_loyalty',
    verifiable: true,
    icon: 'Swords',
  },
  new_year: {
    key: 'new_year',
    name: 'New Year, New Ranges',
    rarity: 'rare',
    diamonds: 100,
    hint: 'Play a hand on January 1st.',
    category: 'timing_loyalty',
    verifiable: true,
    icon: 'PartyPopper',
  },
  the_ghost: {
    key: 'the_ghost',
    name: 'The Ghost',
    rarity: 'legendary',
    diamonds: 500,
    hint: 'Thirty straight days without missing a single daily task.',
    category: 'timing_loyalty',
    verifiable: true,
    icon: 'Ghost',
  },
  old_guard: {
    key: 'old_guard',
    name: 'Old Guard',
    rarity: 'legendary',
    diamonds: 300,
    hint: 'Be a member for one full year.',
    category: 'timing_loyalty',
    verifiable: true,
    icon: 'Shield',
  },
  the_centurion: {
    key: 'the_centurion',
    name: 'The Centurion',
    rarity: 'legendary',
    diamonds: 300,
    hint: 'Reach a 100-day login streak.',
    category: 'timing_loyalty',
    verifiable: true,
    icon: 'Award',
  },
  daily_legend: {
    key: 'daily_legend',
    name: 'Daily Legend',
    rarity: 'legendary',
    diamonds: 300,
    hint: 'Hit your daily cap thirty days in a row.',
    category: 'timing_loyalty',
    verifiable: true,
    icon: 'Star',
  },

  // ── SOCIAL ───────────────────────────────────────────────────────────────
  the_recruiter: {
    key: 'the_recruiter',
    name: 'The Recruiter',
    rarity: 'epic',
    diamonds: 200,
    hint: 'Two of your referrals reach Level 5 on the same day.',
    category: 'social_viral',
    verifiable: true,
    icon: 'Medal',
  },
  comment_king: {
    key: 'comment_king',
    name: 'Comment King',
    rarity: 'rare',
    diamonds: 100,
    hint: 'One of your strategy comments reaches fifty likes.',
    category: 'social_viral',
    verifiable: true,
    icon: 'MessageSquare',
  },
  squad_goals: {
    key: 'squad_goals',
    name: 'Squad Goals',
    rarity: 'epic',
    diamonds: 250,
    hint: 'Have five referrals active in the same week.',
    category: 'social_viral',
    verifiable: true,
    icon: 'Users',
  },
  wall_of_fame: {
    key: 'wall_of_fame',
    name: 'Wall Of Fame',
    rarity: 'legendary',
    diamonds: 300,
    hint: 'Be featured as the Daily Top Grinder.',
    category: 'social_viral',
    verifiable: true,
    icon: 'Trophy',
  },
  the_ambassador: {
    key: 'the_ambassador',
    name: 'The Ambassador',
    rarity: 'legendary',
    diamonds: 300,
    hint: 'Reach twenty qualified referrals.',
    category: 'social_viral',
    verifiable: true,
    icon: 'Medal',
  },
  the_diplomat: {
    key: 'the_diplomat',
    name: 'The Diplomat',
    rarity: 'rare',
    diamonds: 100,
    hint: 'Refer a player from a different country than your own.',
    category: 'social_viral',
    verifiable: true,
    icon: 'Globe',
  },
  group_chat_leader: {
    key: 'group_chat_leader',
    name: 'Group Chat Leader',
    rarity: 'uncommon',
    diamonds: 40,
    hint: 'Bring three players into a private study group.',
    category: 'social_viral',
    verifiable: true,
    icon: 'MessagesSquare',
  },
  poll_master: {
    key: 'poll_master',
    name: 'Poll Master',
    rarity: 'common',
    diamonds: 15,
    hint: 'Vote in ten Hand of the Day polls.',
    category: 'social_viral',
    verifiable: true,
    icon: 'BarChart2',
  },
  meme_lord: {
    key: 'meme_lord',
    name: 'Meme Lord',
    rarity: 'rare',
    diamonds: 100,
    hint: 'A meme you posted reaches twenty likes.',
    category: 'social_viral',
    verifiable: true,
    icon: 'Smile',
  },
  retweet_royalty: {
    key: 'retweet_royalty',
    name: 'Retweet Royalty',
    rarity: 'legendary',
    diamonds: 300,
    hint: 'A Smarter.Poker account shares something you posted.',
    category: 'social_viral',
    verifiable: false,
    icon: 'Crown',
  },
  feedback_loop: {
    key: 'feedback_loop',
    name: 'Feedback Loop',
    rarity: 'epic',
    diamonds: 250,
    hint: 'Report a bug that ends up shipping a fix.',
    category: 'social_viral',
    verifiable: false,
    icon: 'Bug',
  },
  ghost_writer: {
    key: 'ghost_writer',
    name: 'The Ghost Writer',
    rarity: 'legendary',
    diamonds: 300,
    hint: 'A tip you wrote makes it onto the loading screen.',
    category: 'social_viral',
    verifiable: false,
    icon: 'PenTool',
  },

  // ── MILESTONES ───────────────────────────────────────────────────────────
  millionaire: {
    key: 'millionaire',
    name: 'Millionaire',
    rarity: 'legendary',
    diamonds: 400,
    hint: 'Earn 100,000 diamonds over your lifetime.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'CircleDollarSign',
  },
  to_infinity: {
    key: 'to_infinity',
    name: 'To Infinity',
    rarity: 'legendary',
    diamonds: 500,
    hint: 'Earn 1,000,000 diamonds over your lifetime.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'Infinity',
  },
  the_finisher: {
    key: 'the_finisher',
    name: 'The Finisher',
    rarity: 'legendary',
    diamonds: 400,
    hint: 'Complete every training game in the library.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'Flag',
  },
  zero_leak: {
    key: 'zero_leak',
    name: 'Zero Leak',
    rarity: 'legendary',
    diamonds: 350,
    hint: 'Play a thousand hands without a single leak signal.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'Droplet',
  },
  the_whale: {
    key: 'the_whale',
    name: 'The Whale',
    rarity: 'legendary',
    diamonds: 500,
    hint: 'Reach one hundred qualified referrals.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'Waves',
  },
  level_100_boss: {
    key: 'level_100_boss',
    name: 'Level 100 Boss',
    rarity: 'legendary',
    diamonds: 300,
    hint: 'Reach Level 100.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'Crown',
  },
  high_roller: {
    key: 'high_roller',
    name: 'High Roller',
    rarity: 'epic',
    diamonds: 250,
    hint: 'Spend ten thousand diamonds in a single day.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'Dices',
  },
  diamond_hands: {
    key: 'diamond_hands',
    name: 'Diamond Hands',
    rarity: 'epic',
    diamonds: 250,
    hint: 'Hold a balance above five thousand diamonds for thirty days.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'Gem',
  },
  beta_tester: {
    key: 'beta_tester',
    name: 'Beta Tester',
    rarity: 'epic',
    diamonds: 250,
    hint: 'Be one of the first five hundred accounts ever created.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'FlaskConical',
  },
  server_first: {
    key: 'server_first',
    name: 'Server First',
    rarity: 'epic',
    diamonds: 200,
    hint: 'Be the first player anywhere to pass a newly released level.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'Medal',
  },
  the_collector: {
    key: 'the_collector',
    name: 'The Collector',
    rarity: 'epic',
    diamonds: 125,
    hint: 'Own three different table themes.',
    category: 'legacy_milestones',
    verifiable: true,
    icon: 'Palette',
  },

  // ── DISCOVERY ────────────────────────────────────────────────────────────
  the_librarian: {
    key: 'the_librarian',
    name: 'The Librarian',
    rarity: 'uncommon',
    diamonds: 30,
    hint: 'Run twenty distinct player or game searches.',
    category: 'discovery',
    verifiable: true,
    icon: 'Book',
  },
  data_miner: {
    key: 'data_miner',
    name: 'Data Miner',
    rarity: 'rare',
    diamonds: 50,
    hint: 'Export your hand history ten times.',
    category: 'discovery',
    verifiable: true,
    icon: 'Pickaxe',
  },
  window_shopper: {
    key: 'window_shopper',
    name: 'Window Shopper',
    rarity: 'uncommon',
    diamonds: 25,
    hint: 'Browse the Diamond Store on five different days without buying a thing.',
    category: 'discovery',
    verifiable: true,
    icon: 'ShoppingBag',
  },
  first_blood: {
    key: 'first_blood',
    name: 'First Blood',
    rarity: 'common',
    diamonds: 10,
    hint: 'Win your first Diamond Arena hand.',
    category: 'discovery',
    verifiable: true,
    icon: 'Swords',
  },
  road_tripper: {
    key: 'road_tripper',
    name: 'Road Tripper',
    rarity: 'uncommon',
    diamonds: 40,
    hint: 'Review poker rooms in three different states.',
    category: 'discovery',
    verifiable: true,
    icon: 'Map',
  },
  bankroll_builder: {
    key: 'bankroll_builder',
    name: 'Bankroll Builder',
    rarity: 'common',
    diamonds: 15,
    hint: 'Log thirty sessions in the Bankroll Manager.',
    category: 'discovery',
    verifiable: true,
    icon: 'Wallet',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Look up a reward definition by action key.
 * @param {string} key
 * @returns {object|null} frozen-ish definition, or null for unknown actions
 */
export function getReward(key) {
  if (!key || typeof key !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(REWARDS, key) ? REWARDS[key] : null;
}

/**
 * List reward definitions, optionally filtered by category.
 * @param {string} [category] one of CATEGORIES
 * @returns {object[]}
 */
export function listRewards(category) {
  const all = Object.values(REWARDS);
  if (!category) return all;
  return all.filter((r) => r.category === category);
}

/**
 * Total number of distinct ways to earn diamonds: catalog actions + hidden
 * achievements. Used for the "N ways to earn" headline in the UI.
 * @returns {number}
 */
export function totalWaysToEarn() {
  return Object.keys(REWARDS).length + Object.keys(EASTER_EGGS).length;
}

/**
 * Look up a hidden achievement by egg key.
 * @param {string} key
 * @returns {object|null}
 */
export function getEasterEgg(key) {
  if (!key || typeof key !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(EASTER_EGGS, key) ? EASTER_EGGS[key] : null;
}

/**
 * List hidden achievements, optionally filtered by category.
 * @param {string} [category] one of EGG_CATEGORIES
 * @returns {object[]}
 */
export function listEasterEggs(category) {
  const all = Object.values(EASTER_EGGS);
  if (!category) return all;
  return all.filter((e) => e.category === category);
}

/**
 * The largest payout any single egg in the catalog actually offers.
 * Derived, never typed by hand: user-facing copy that promises a number must
 * promise THIS one, not EASTER_EGG_MAX_SINGLE (the ceiling, currently well
 * above the catalog) and not EASTER_EGG_MONTHLY_CAP (a budget across eggs).
 * Conflating the three is how the store came to advertise a per-egg maximum
 * that was really the monthly budget, while SQL was truncating at 250.
 * @returns {number}
 */
export function biggestEggValue() {
  return Object.values(EASTER_EGGS).reduce((max, e) => Math.max(max, e.diamonds || 0), 0);
}

/**
 * Login streak award. THE ONLY place this formula lives in JS.
 * min(5 + (streak - 1) * 2, 25) — streak is TRUE consecutive America/Chicago
 * days, computed server-side from the ledger.
 * @param {number} streakDays 1-based streak length
 * @returns {number} diamonds before the share-streak multiplier
 */
export function loginStreakDiamonds(streakDays) {
  const s = Number.isFinite(streakDays) && streakDays > 0 ? Math.floor(streakDays) : 1;
  return Math.min(5 + (s - 1) * 2, 25);
}

/**
 * The daily cap for a user, POST-multiplier. The multiplier never raises it.
 * @param {boolean} isVip
 * @returns {number}
 */
export function dailyCapFor(isVip) {
  return isVip ? DAILY_CAP.vip : DAILY_CAP.free;
}

/**
 * The monthly cap for a user, POST-multiplier.
 * @param {boolean} isVip
 * @returns {number}
 */
export function monthlyCapFor(isVip) {
  return isVip ? MONTHLY_CAP.vip : MONTHLY_CAP.free;
}

/**
 * Theoretical maximum a user could earn in one day from capped actions,
 * ignoring the cap. If this ever drops BELOW the daily cap the cap stops
 * binding and the economics break — assertCatalogIntegrity() checks it.
 * @returns {number}
 */
export function maxDailyEarnable() {
  return listRewards()
    .filter((r) => r.countsTowardDailyCap && !r.lifetime && !r.serverOnly)
    .reduce((sum, r) => sum + (r.maxDiamonds || r.diamonds) * (r.maxPerDay || 1), 0);
}

/**
 * Self-check for CI / a unit test. Throws on any economic or shape violation.
 * Cheap enough to call at import time in tests; NOT called automatically.
 * @returns {true}
 */
export function assertCatalogIntegrity() {
  const problems = [];

  for (const [key, r] of Object.entries(REWARDS)) {
    if (r.key !== key) problems.push(`REWARDS.${key}.key mismatch ("${r.key}")`);
    for (const f of ['label', 'description', 'icon', 'gate', 'category']) {
      if (typeof r[f] !== 'string' || !r[f]) problems.push(`REWARDS.${key}.${f} missing`);
    }
    if (!Object.prototype.hasOwnProperty.call(CATEGORIES, r.category)) {
      problems.push(`REWARDS.${key}.category "${r.category}" is not in CATEGORIES`);
    }
    if (!Number.isInteger(r.diamonds) || r.diamonds < 0) {
      problems.push(`REWARDS.${key}.diamonds must be a non-negative integer`);
    }
    if (!Number.isInteger(r.maxPerDay) || r.maxPerDay < 1) {
      problems.push(`REWARDS.${key}.maxPerDay must be >= 1`);
    }
    if (typeof r.countsTowardDailyCap !== 'boolean') {
      problems.push(`REWARDS.${key}.countsTowardDailyCap must be boolean`);
    }
    if (typeof r.lifetime !== 'boolean') {
      problems.push(`REWARDS.${key}.lifetime must be boolean`);
    }
    const ceiling = r.maxDiamonds || r.diamonds;
    if (r.maxDiamonds && r.maxDiamonds < r.diamonds) {
      problems.push(`REWARDS.${key}.maxDiamonds < diamonds`);
    }
    // No single uncapped action may pay more than the free monthly cap.
    if (ceiling > MONTHLY_CAP.free) {
      problems.push(`REWARDS.${key} pays ${ceiling} ◆, above the free monthly cap`);
    }
  }

  for (const [key, e] of Object.entries(EASTER_EGGS)) {
    if (e.key !== key) problems.push(`EASTER_EGGS.${key}.key mismatch ("${e.key}")`);
    const band = RARITY_BANDS[e.rarity];
    if (!band) {
      problems.push(`EASTER_EGGS.${key}.rarity "${e.rarity}" is not a known band`);
    } else if (e.diamonds < band.min || e.diamonds > band.max) {
      problems.push(
        `EASTER_EGGS.${key} pays ${e.diamonds} ◆, outside the ${e.rarity} band ${band.min}-${band.max}`,
      );
    }
    // The binding ceiling on one egg is EASTER_EGG_MAX_SINGLE (c_egg_max_single
    // in SQL). The monthly cap is a budget across eggs, not a per-egg limit —
    // checking against it here would have wrongly passed the 16 eggs that SQL
    // was actually truncating at 250.
    if (e.diamonds > EASTER_EGG_MAX_SINGLE) {
      problems.push(`EASTER_EGGS.${key} pays more than EASTER_EGG_MAX_SINGLE`);
    }
    if (typeof e.verifiable !== 'boolean') {
      problems.push(`EASTER_EGGS.${key}.verifiable must be boolean`);
    }
    if (!Object.prototype.hasOwnProperty.call(EGG_CATEGORIES, e.category)) {
      problems.push(`EASTER_EGGS.${key}.category "${e.category}" is not in EGG_CATEGORIES`);
    }
    if (typeof e.hint !== 'string' || !e.hint) problems.push(`EASTER_EGGS.${key}.hint missing`);
  }

  // The daily cap must actually bind, otherwise it is decoration.
  if (maxDailyEarnable() <= DAILY_CAP.free) {
    problems.push(
      `maxDailyEarnable() = ${maxDailyEarnable()} does not exceed DAILY_CAP.free = ${DAILY_CAP.free}; the cap no longer binds`,
    );
  }
  if (DAILY_CAP.free * 30 !== MONTHLY_CAP.free) {
    problems.push('MONTHLY_CAP.free should equal DAILY_CAP.free * 30');
  }
  if (REFERRAL.referrer !== REWARDS.referral_qualified.diamonds) {
    problems.push('REFERRAL.referrer disagrees with REWARDS.referral_qualified.diamonds');
  }
  if (REFERRAL.referee !== REWARDS.referral_referee.diamonds) {
    problems.push('REFERRAL.referee disagrees with REWARDS.referral_referee.diamonds');
  }
  if (REFERRAL.vipConversionBonus !== REWARDS.referral_vip_conversion.diamonds) {
    problems.push('REFERRAL.vipConversionBonus disagrees with REWARDS.referral_vip_conversion.diamonds');
  }

  if (problems.length) {
    throw new Error(`diamondRewards catalog integrity failed:\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}
