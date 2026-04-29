/**
 * /api/rewards/* — Hono catch-all router (Phase 4.4 module #12, 2026-04-29)
 *
 * Consolidates 15 reward-trigger handlers under a single Hono app.
 * Same pattern as messenger/news/video/live-help/promo/employee/venues/kyc/hendonmob/trivia.
 *
 * Routes (mounted at /api/rewards):
 *   POST /birthday-reward    300d, once/year, account 60+d, birthday match
 *   POST /comment             5d, max 3/d, 2-min cooldown, 10-char min
 *   POST /daily-login        5-50d (streak-scaled), 1/d, account 1+h
 *   POST /daily-trivia        15d, 1/d, account 24+h
 *   POST /follow              5d, max 3/d, 1-min cooldown, no double-target
 *   POST /hendonmob-link     25d, lifetime once, profile.hendonmob set
 *   POST /profile-complete   50d, lifetime once, all 3 fields set
 *   POST /profile-pic        10d, lifetime once, avatar_url set
 *   POST /reaction            2d, max 10/d, 30-sec cooldown, not own post
 *   POST /referral          500d, lifetime once per pair, BYPASSES daily cap
 *   POST /share              10d, 1/d, account 24+h
 *   POST /social-post        10d, 1/d, 10-min cooldown, 20-char min
 *   POST /venue-review       25d, lifetime per venue, 200m geofence, max 2/d
 *   POST /video-favorite      2d, max 3/d, 1-min cooldown, 1/video lifetime
 *   POST /video-watch         3d, max 5/d, 5-min watch min, 1/video lifetime
 *
 * Replaces: 15 files, 2519 LOC -> ~1450 LOC ([...slug].js with shared middleware).
 * Net: -1069 LOC.
 *
 * Auth: shared userAuth via getServerUserWithFallback (Phase 4.1d ESM-clean).
 * Rate-limit: shared writeLimit on all routes.
 *
 * Bonus fix: 9 of 15 source files had `supabase.from(...)` typos (should be
 * `getSupabase().from(...)`) — would ReferenceError in the catch block on
 * first call. The router uses the local `supabase` const consistently so
 * those latent bugs are gone.
 *
 * No DB schema changes — uses existing tables (diamond_reward_claims, profiles,
 * social_posts, social_comments, social_connections, social_interactions,
 * poker_venues, video_favorites, video_watch_history) and RPC
 * (add_diamonds_to_balance) — all already in production.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ─── Shared helpers ────────────────────────────────────────────────────────
function todayCST() {
  const now = new Date();
  const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return `${cst.getFullYear()}-${String(cst.getMonth() + 1).padStart(2, '0')}-${String(cst.getDate()).padStart(2, '0')}`;
}

async function getDailyTotalNonReferral(supabase, userId, today) {
  const { data: claims } = await supabase
    .from('diamond_reward_claims')
    .select('diamonds_awarded')
    .eq('user_id', userId)
    .eq('claim_date', today)
    .neq('reward_type', 'referral')
    .limit(200);
  return (claims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
}

async function getClaimsCountToday(supabase, userId, type, today) {
  const { count } = await supabase
    .from('diamond_reward_claims')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('reward_type', type)
    .eq('claim_date', today);
  return count || 0;
}

async function getLastClaimAt(supabase, userId, type) {
  const { data } = await supabase
    .from('diamond_reward_claims')
    .select('claimed_at')
    .eq('user_id', userId)
    .eq('reward_type', type)
    .order('claimed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.claimed_at ? new Date(data.claimed_at) : null;
}

async function isAccountOlderThan(supabase, userId, ms) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.created_at) return true; // No date = assume older (don't block)
  return (Date.now() - new Date(profile.created_at).getTime()) >= ms;
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/rewards');

const userAuth = async (c, next) => {
  try {
    const req = c.env?.req;
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return c.json({ success: false, error: 'Auth required' }, 401);
    c.set('user', user);
    await next();
  } catch (err) {
    console.warn('[rewards] auth err:', err);
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
};

const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

// All routes go through writeLimit + userAuth
app.use('*', writeLimit, userAuth);

// ─── Routes ───────────────────────────────────────────────────────────────

// POST /api/rewards/birthday-reward — 300d, once/year, account 60+d, bday match
app.post('/birthday-reward', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 300;

  try {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const claimKey = `birthday_reward_${currentYear}`;

    const { data: existing } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', claimKey)
      .maybeSingle();

    if (existing) return c.json({ success: true, alreadyClaimed: true, message: 'Birthday reward already claimed this year' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, birthday, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return c.json({ success: false, error: 'Profile not found' }, 404);
    if (!profile.birthday) return c.json({ success: false, error: 'No birthday set on profile' }, 400);

    const createdAt = new Date(profile.created_at);
    const daysSince = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    if (daysSince < 60) {
      return c.json({ success: false, error: 'Account must be at least 60 days old to claim birthday reward', daysRemaining: 60 - daysSince }, 403);
    }

    const [bYear, bMonth, bDay] = profile.birthday.split('-').map(Number);
    if (bMonth !== now.getUTCMonth() + 1 || bDay !== now.getUTCDate()) {
      return c.json({ success: false, error: 'Today is not your birthday' }, 400);
    }

    const today = todayCST();
    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: claimKey, diamonds_awarded: REWARD, claim_date: today,
      metadata: { birthday: profile.birthday, account_age_days: daysSince },
    });

    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'birthday_reward',
      p_description: `Happy Birthday! 🎂 ${REWARD} diamonds awarded`, p_reference_id: null,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD, message: `Happy Birthday! You received ${REWARD} diamonds!` });
  } catch (err) {
    console.warn('[rewards/birthday-reward]', err);
    return c.json({ success: false, error: 'Failed to claim birthday reward' }, 500);
  }
});

// POST /api/rewards/comment — 5d, max 3/d, 2-min cooldown, 10-char min
app.post('/comment', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 5;
  const MAX_PER_DAY = 3;
  const COOLDOWN_MS = 2 * 60 * 1000;
  const MIN_LENGTH = 10;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { commentId } = body;

    if (!(await isAccountOlderThan(supabase, userId, 24 * 60 * 60 * 1000))) {
      return c.json({ success: false, message: 'Account must be 24 hours old to earn comment rewards' });
    }

    if (commentId) {
      const { data: comment } = await supabase
        .from('social_comments')
        .select('content')
        .eq('id', commentId)
        .maybeSingle();
      if (!comment) return c.json({ success: false, message: 'Comment not found' });
      if ((comment.content || '').trim().length < MIN_LENGTH) {
        return c.json({ success: false, message: `Comment must be at least ${MIN_LENGTH} characters to earn rewards` });
      }
    }

    const today = todayCST();
    const count = await getClaimsCountToday(supabase, userId, 'strategy_comment', today);
    if (count >= MAX_PER_DAY) {
      return c.json({ success: true, alreadyClaimed: true, message: `Comment reward limit reached (${MAX_PER_DAY}/day)` });
    }

    const lastClaim = await getLastClaimAt(supabase, userId, 'strategy_comment');
    if (lastClaim && Date.now() - lastClaim.getTime() < COOLDOWN_MS) {
      return c.json({ success: false, cooldown: true, message: `Please wait ${COOLDOWN_MS / 60000} minutes between reward-eligible comments` });
    }

    const todayTotal = await getDailyTotalNonReferral(supabase, userId, today);
    if (todayTotal + REWARD > 500) {
      return c.json({ success: false, dailyCapReached: true, message: 'Daily diamond cap (500 diamonds) reached' });
    }

    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'strategy_comment', diamonds_awarded: REWARD, claim_date: today,
      metadata: { comment_id: commentId || null },
    });

    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'strategy_comment',
      p_description: `Strategy comment reward — ${REWARD} diamonds`, p_reference_id: commentId || null,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD, claimsToday: count + 1, maxPerDay: MAX_PER_DAY });
  } catch (err) {
    console.warn('[rewards/comment]', err);
    return c.json({ success: false, error: 'Failed to claim comment reward' }, 500);
  }
});

// POST /api/rewards/daily-login — 5-50d (streak-scaled), 1/d, account 1+h
app.post('/daily-login', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;

  try {
    if (!(await isAccountOlderThan(supabase, userId, 60 * 60 * 1000))) {
      return c.json({ success: false, message: 'Welcome! Daily login rewards start after your first hour.' });
    }

    const today = todayCST();
    const { data: existing } = await supabase
      .from('diamond_reward_claims')
      .select('id, diamonds_awarded')
      .eq('user_id', userId)
      .eq('reward_type', 'daily_login')
      .eq('claim_date', today)
      .maybeSingle();

    if (existing) {
      return c.json({ success: true, alreadyClaimed: true, diamondsAwarded: existing.diamonds_awarded, message: 'Daily login already claimed today' });
    }

    // Streak calc
    const { data: streakRow } = await supabase
      .from('diamond_reward_claims')
      .select('claim_date')
      .eq('user_id', userId)
      .eq('reward_type', 'daily_login')
      .order('claim_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    let streak = 1;
    if (streakRow) {
      const lastDate = new Date(streakRow.claim_date + 'T12:00:00');
      const todayDate = new Date(today + 'T12:00:00');
      const diffDays = Math.round((todayDate - lastDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        const { count } = await supabase
          .from('diamond_reward_claims')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('reward_type', 'daily_login')
          .gte('claim_date', new Date(todayDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .limit(200);
        streak = (count || 0) + 1;
      }
    }

    const diamonds = Math.min(5 + Math.max(0, streak - 1) * 7, 50);

    const claimRow = { user_id: userId, reward_type: 'daily_login', diamonds_awarded: diamonds, claim_date: today };
    let result1 = await supabase.from('diamond_reward_claims').insert({ ...claimRow, metadata: { streak, base: 5 } });
    let insertError = result1.error;
    if (insertError && insertError.message?.includes('metadata')) {
      const result2 = await supabase.from('diamond_reward_claims').insert(claimRow);
      insertError = result2.error;
    }

    if (insertError) {
      if (insertError.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw insertError;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: diamonds, p_type: 'daily_login',
      p_description: streak > 1 ? `Daily login reward (${streak}-day streak) — ${diamonds} diamonds` : `Daily login reward — ${diamonds} diamonds`,
      p_reference_id: null,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: diamonds, streak });
  } catch (err) {
    console.warn('[rewards/daily-login]', err);
    return c.json({ success: false, error: 'Failed to claim daily login reward' }, 500);
  }
});

// POST /api/rewards/daily-trivia — 15d, 1/d, account 24+h
app.post('/daily-trivia', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 15;

  try {
    if (!(await isAccountOlderThan(supabase, userId, 24 * 60 * 60 * 1000))) {
      return c.json({ claimed: false, reason: 'Account too new' });
    }

    const today = todayCST();
    const { data: existingClaim } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'daily_trivia')
      .eq('claim_date', today)
      .maybeSingle();

    if (existingClaim) return c.json({ claimed: false, reason: 'Already claimed today', diamondsAwarded: 0 });

    const { data: todayClaims } = await supabase
      .from('diamond_reward_claims')
      .select('diamonds_awarded')
      .eq('user_id', userId)
      .eq('claim_date', today);
    const todayTotal = (todayClaims || []).reduce((sum, x) => sum + (x.diamonds_awarded || 0), 0);
    if (todayTotal >= 500) return c.json({ claimed: false, reason: 'Daily cap reached', diamondsAwarded: 0 });

    const diamonds = Math.min(REWARD, 500 - todayTotal);

    const { error: claimErr } = await supabase
      .from('diamond_reward_claims')
      .insert({ user_id: userId, reward_type: 'daily_trivia', diamonds_awarded: diamonds, claim_date: today, metadata: { source: 'daily_trivia_challenge' } });

    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ claimed: false, reason: 'Already claimed', diamondsAwarded: 0 });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: diamonds, p_type: 'daily_trivia',
      p_description: `Daily Trivia Challenge reward — ${diamonds} diamonds`, p_reference_id: null,
    });

    return c.json({ claimed: true, diamondsAwarded: diamonds, reward: 'daily_trivia' });
  } catch (err) {
    console.warn('[rewards/daily-trivia]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/rewards/follow — 5d, max 3/d, 1-min cooldown, no double-target
app.post('/follow', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 5;
  const MAX_PER_DAY = 3;
  const COOLDOWN_MS = 60 * 1000;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { followingId } = body;
    if (!followingId) return c.json({ success: false, error: 'followingId required' }, 400);
    if (userId === followingId) return c.json({ success: false, message: 'Cannot follow yourself' });

    if (!(await isAccountOlderThan(supabase, userId, 24 * 60 * 60 * 1000))) {
      return c.json({ success: false, message: 'Account must be 24h old' });
    }

    const { data: connection } = await supabase
      .from('social_connections')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', followingId)
      .maybeSingle();
    if (!connection) return c.json({ success: false, message: 'Follow connection not found' });

    const today = todayCST();
    const { data: existingClaim } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'follow')
      .eq('claim_date', today)
      .contains('metadata', { following_id: followingId })
      .maybeSingle();
    if (existingClaim) return c.json({ success: true, alreadyClaimed: true, message: 'Already earned for this follow today' });

    const count = await getClaimsCountToday(supabase, userId, 'follow', today);
    if (count >= MAX_PER_DAY) {
      return c.json({ success: true, alreadyClaimed: true, message: `Follow limit (${MAX_PER_DAY}/day) reached` });
    }

    const lastClaim = await getLastClaimAt(supabase, userId, 'follow');
    if (lastClaim && Date.now() - lastClaim.getTime() < COOLDOWN_MS) {
      return c.json({ success: false, cooldown: true });
    }

    const todayTotal = await getDailyTotalNonReferral(supabase, userId, today);
    if (todayTotal + REWARD > 500) return c.json({ success: false, dailyCapReached: true });

    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'follow', diamonds_awarded: REWARD, claim_date: today,
      metadata: { following_id: followingId },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'follow',
      p_description: `Follow reward — ${REWARD} diamonds`, p_reference_id: followingId,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD });
  } catch (err) {
    console.warn('[rewards/follow]', err);
    return c.json({ success: false, error: 'Failed to claim follow reward' }, 500);
  }
});

// POST /api/rewards/hendonmob-link — 25d lifetime once
app.post('/hendonmob-link', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 25;

  try {
    const { data: existing } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'hendonmob_link')
      .maybeSingle();
    if (existing) return c.json({ success: true, alreadyClaimed: true, message: 'HendonMob link reward already claimed' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('hendonmob_url, hendon_mob_url, hendonmob_id, social_links')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) return c.json({ success: false, message: 'Profile not found' });

    const hendonmobValue = profile.hendonmob_url
      || profile.hendon_mob_url
      || profile.hendonmob_id
      || (profile.social_links && (profile.social_links.hendonmob || profile.social_links.hendon_mob));

    if (!hendonmobValue || String(hendonmobValue).trim().length < 5) {
      return c.json({ success: false, message: `Link your HendonMob profile to earn ${REWARD} diamonds!` });
    }

    const today = todayCST();
    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'hendonmob_link', diamonds_awarded: REWARD, claim_date: today,
      metadata: { hendonmob: String(hendonmobValue).substring(0, 100) },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'hendonmob_link',
      p_description: `HendonMob link reward — ${REWARD} diamonds`, p_reference_id: null,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD, message: `+${REWARD} diamonds HendonMob Linked!` });
  } catch (err) {
    console.warn('[rewards/hendonmob-link]', err);
    return c.json({ success: false, error: 'Failed to claim HendonMob link reward' }, 500);
  }
});

// POST /api/rewards/profile-complete — 50d lifetime once
app.post('/profile-complete', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 50;

  try {
    const { data: existing } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'profile_complete')
      .maybeSingle();
    if (existing) return c.json({ success: true, alreadyClaimed: true });

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, avatar_url, bio')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) return c.json({ success: false, message: 'Profile not found' });

    const hasUsername = profile.username && profile.username.trim().length >= 3;
    const hasAvatar = profile.avatar_url && profile.avatar_url.trim().length > 0;
    const hasBio = profile.bio && profile.bio.trim().length >= 10;

    if (!hasUsername || !hasAvatar || !hasBio) {
      const missing = [];
      if (!hasUsername) missing.push('username (3+ chars)');
      if (!hasAvatar) missing.push('profile picture');
      if (!hasBio) missing.push('bio (10+ chars)');
      return c.json({ success: false, message: `Complete your profile to earn ${REWARD} diamonds! Missing: ${missing.join(', ')}` });
    }

    const today = todayCST();
    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'profile_complete', diamonds_awarded: REWARD, claim_date: today,
      metadata: { username: profile.username, has_avatar: true, bio_length: profile.bio.trim().length },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'profile_complete',
      p_description: `Profile completion reward — ${REWARD} diamonds`, p_reference_id: null,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD, message: `+${REWARD} diamonds Profile Complete!` });
  } catch (err) {
    console.warn('[rewards/profile-complete]', err);
    return c.json({ success: false, error: 'Failed to claim profile completion reward' }, 500);
  }
});

// POST /api/rewards/profile-pic — 10d lifetime once
app.post('/profile-pic', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 10;

  try {
    const { data: existing } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'profile_pic')
      .maybeSingle();
    if (existing) return c.json({ success: true, alreadyClaimed: true });

    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (!profile?.avatar_url || profile.avatar_url.trim().length === 0) {
      return c.json({ success: false, message: `Upload a profile picture to earn ${REWARD} diamonds!` });
    }

    const today = todayCST();
    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'profile_pic', diamonds_awarded: REWARD, claim_date: today,
      metadata: { avatar_url: profile.avatar_url.substring(0, 100) },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'profile_pic',
      p_description: `Profile picture reward — ${REWARD} diamonds`, p_reference_id: null,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD, message: `+${REWARD} diamonds Profile Pic Uploaded!` });
  } catch (err) {
    console.warn('[rewards/profile-pic]', err);
    return c.json({ success: false, error: 'Failed to claim profile pic reward' }, 500);
  }
});

// POST /api/rewards/reaction — 2d, max 10/d, 30-sec cooldown, not own post
app.post('/reaction', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 2;
  const MAX_PER_DAY = 10;
  const COOLDOWN_MS = 30 * 1000;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { postId, interactionType } = body;
    if (!postId) return c.json({ success: false, error: 'postId required' }, 400);

    if (!(await isAccountOlderThan(supabase, userId, 24 * 60 * 60 * 1000))) {
      return c.json({ success: false, message: 'Account must be 24h old' });
    }

    const { data: post } = await supabase
      .from('social_posts')
      .select('author_id')
      .eq('id', postId)
      .maybeSingle();
    if (post?.author_id === userId) {
      return c.json({ success: false, message: 'Cannot earn diamonds from own posts' });
    }

    const { data: interaction } = await supabase
      .from('social_interactions')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!interaction) return c.json({ success: false, message: 'Interaction not found' });

    const today = todayCST();
    const count = await getClaimsCountToday(supabase, userId, 'reaction', today);
    if (count >= MAX_PER_DAY) {
      return c.json({ success: true, alreadyClaimed: true, message: `Reaction limit (${MAX_PER_DAY}/day) reached` });
    }

    const lastClaim = await getLastClaimAt(supabase, userId, 'reaction');
    if (lastClaim && Date.now() - lastClaim.getTime() < COOLDOWN_MS) {
      return c.json({ success: false, cooldown: true, message: 'Please wait before liking again for rewards' });
    }

    const todayTotal = await getDailyTotalNonReferral(supabase, userId, today);
    if (todayTotal + REWARD > 500) return c.json({ success: false, dailyCapReached: true });

    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'reaction', diamonds_awarded: REWARD, claim_date: today,
      metadata: { post_id: postId, type: interactionType || 'like' },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'reaction',
      p_description: `Reaction reward — ${REWARD} diamonds`, p_reference_id: postId,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD });
  } catch (err) {
    console.warn('[rewards/reaction]', err);
    return c.json({ success: false, error: 'Failed to claim reaction reward' }, 500);
  }
});

// POST /api/rewards/referral — 500d, lifetime once per pair, BYPASSES daily cap
app.post('/referral', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const REWARD = 500;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { referrerId, referredUserId } = body;

    if (referrerId !== user.id && referredUserId !== user.id) {
      return c.json({ success: false, error: 'Cannot claim referral rewards for unrelated accounts' }, 403);
    }
    if (!referrerId || !referredUserId) return c.json({ success: false, error: 'referrerId and referredUserId required' }, 400);
    if (referrerId === referredUserId) return c.json({ success: false, error: 'Cannot refer yourself' }, 400);

    const { data: existing } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', referrerId)
      .eq('reward_type', 'referral')
      .contains('metadata', { referred_user_id: referredUserId })
      .maybeSingle();
    if (existing) return c.json({ success: true, alreadyClaimed: true, message: 'Referral reward already claimed for this user' });

    const today = todayCST();
    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: referrerId, reward_type: 'referral', diamonds_awarded: REWARD, claim_date: today,
      metadata: { referred_user_id: referredUserId, bypasses_cap: true },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: referrerId, p_amount: REWARD, p_type: 'referral',
      p_description: `Referral reward — ${REWARD} diamonds (bypasses daily cap)`, p_reference_id: referredUserId,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD, message: `+${REWARD} diamonds Referral Reward!` });
  } catch (err) {
    console.warn('[rewards/referral]', err);
    return c.json({ success: false, error: 'Failed to claim referral reward' }, 500);
  }
});

// POST /api/rewards/share — 10d, 1/d, account 24+h
app.post('/share', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 10;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { shareType, contentId } = body;

    if (!(await isAccountOlderThan(supabase, userId, 24 * 60 * 60 * 1000))) {
      return c.json({ success: false, message: 'Account must be 24h old' });
    }

    const today = todayCST();
    const { data: existing } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'share')
      .eq('claim_date', today)
      .maybeSingle();
    if (existing) return c.json({ success: true, alreadyClaimed: true, message: 'Share reward already claimed today' });

    const todayTotal = await getDailyTotalNonReferral(supabase, userId, today);
    if (todayTotal + REWARD > 500) return c.json({ success: false, dailyCapReached: true });

    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'share', diamonds_awarded: REWARD, claim_date: today,
      metadata: { share_type: shareType || 'score_card', content_id: contentId || null },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'share',
      p_description: `Share reward — ${REWARD} diamonds`, p_reference_id: contentId || null,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD });
  } catch (err) {
    console.warn('[rewards/share]', err);
    return c.json({ success: false, error: 'Failed to claim share reward' }, 500);
  }
});

// POST /api/rewards/social-post — 10d, 1/d, 10-min cooldown, 20-char min
app.post('/social-post', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 10;
  const COOLDOWN_MS = 10 * 60 * 1000;
  const MIN_LENGTH = 20;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { postId } = body;

    if (!(await isAccountOlderThan(supabase, userId, 24 * 60 * 60 * 1000))) {
      return c.json({ success: false, message: 'Account must be 24 hours old to earn post rewards' });
    }

    if (postId) {
      const { data: post } = await supabase
        .from('social_posts')
        .select('content')
        .eq('id', postId)
        .maybeSingle();
      if (!post) return c.json({ success: false, message: 'Post not found' });
      if ((post.content || '').trim().length < MIN_LENGTH) {
        return c.json({ success: false, message: `Post must be at least ${MIN_LENGTH} characters to earn rewards` });
      }
    }

    const today = todayCST();
    const { data: existing } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'social_post')
      .eq('claim_date', today)
      .maybeSingle();
    if (existing) return c.json({ success: true, alreadyClaimed: true, message: 'Social post reward already claimed today' });

    const lastClaim = await getLastClaimAt(supabase, userId, 'social_post');
    if (lastClaim && Date.now() - lastClaim.getTime() < COOLDOWN_MS) {
      return c.json({ success: false, cooldown: true, message: `Please wait ${COOLDOWN_MS / 60000} minutes between reward-eligible posts` });
    }

    const todayTotal = await getDailyTotalNonReferral(supabase, userId, today);
    if (todayTotal + REWARD > 500) {
      return c.json({ success: false, dailyCapReached: true, message: 'Daily diamond cap (500 diamonds) reached' });
    }

    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'social_post', diamonds_awarded: REWARD, claim_date: today,
      metadata: { post_id: postId || null },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'social_post',
      p_description: `Social post reward — ${REWARD} diamonds`, p_reference_id: postId || null,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD, message: `+${REWARD} diamonds Post Reward!` });
  } catch (err) {
    console.warn('[rewards/social-post]', err);
    return c.json({ success: false, error: 'Failed to claim social post reward' }, 500);
  }
});

// POST /api/rewards/venue-review — 25d, 200m geofence, max 2/d, lifetime per venue
app.post('/venue-review', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 25;
  const MAX_PER_DAY = 2;
  const RADIUS_M = 200;

  // Haversine
  const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  try {
    const body = await c.req.json().catch(() => ({}));
    const { venueId, latitude, longitude } = body;
    if (!venueId) return c.json({ error: 'venueId required' }, 400);
    if (latitude == null || longitude == null) {
      return c.json({ claimed: false, reason: 'GPS location required for venue review diamonds', diamondsAwarded: 0 });
    }

    if (!(await isAccountOlderThan(supabase, userId, 24 * 60 * 60 * 1000))) {
      return c.json({ claimed: false, reason: 'Account too new', diamondsAwarded: 0 });
    }

    const { data: venue } = await supabase
      .from('poker_venues')
      .select('latitude, longitude, name')
      .eq('id', venueId)
      .maybeSingle();
    if (!venue?.latitude || !venue?.longitude) {
      return c.json({ claimed: false, reason: 'Venue location not available', diamondsAwarded: 0 });
    }

    const distance = haversine(parseFloat(latitude), parseFloat(longitude), parseFloat(venue.latitude), parseFloat(venue.longitude));
    if (distance > RADIUS_M) {
      return c.json({
        claimed: false,
        reason: `You must be at ${venue.name || 'the venue'} to earn review diamonds (${Math.round(distance)}m away, need <${RADIUS_M}m)`,
        diamondsAwarded: 0,
      });
    }

    const { data: existingVenueClaim } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'venue_review')
      .eq('metadata->>venueId', String(venueId))
      .maybeSingle();
    if (existingVenueClaim) {
      return c.json({ claimed: false, reason: 'Already earned review diamonds for this venue', diamondsAwarded: 0 });
    }

    const today = todayCST();
    const { data: todayVenueClaims } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'venue_review')
      .eq('claim_date', today)
      .limit(200);
    if ((todayVenueClaims || []).length >= MAX_PER_DAY) {
      return c.json({ claimed: false, reason: `Max ${MAX_PER_DAY} venue review rewards per day`, diamondsAwarded: 0 });
    }

    const { data: allTodayClaims } = await supabase
      .from('diamond_reward_claims')
      .select('diamonds_awarded')
      .eq('user_id', userId)
      .eq('claim_date', today)
      .limit(200);
    const todayTotal = (allTodayClaims || []).reduce((sum, x) => sum + (x.diamonds_awarded || 0), 0);
    if (todayTotal >= 500) return c.json({ claimed: false, reason: 'Daily cap reached', diamondsAwarded: 0 });

    const diamonds = Math.min(REWARD, 500 - todayTotal);

    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'venue_review', diamonds_awarded: diamonds, claim_date: today,
      metadata: {
        venueId: String(venueId),
        venueName: venue.name || 'Unknown',
        distanceMeters: Math.round(distance),
        userLat: latitude,
        userLng: longitude,
      },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ claimed: false, reason: 'Already claimed', diamondsAwarded: 0 });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: diamonds, p_type: 'venue_review',
      p_description: `Venue review reward at ${venue.name || 'venue'} — ${diamonds} diamonds (${Math.round(distance)}m away)`,
      p_reference_id: String(venueId),
    });

    return c.json({ claimed: true, diamondsAwarded: diamonds, reward: 'venue_review', distance: Math.round(distance), venueName: venue.name });
  } catch (err) {
    console.warn('[rewards/venue-review]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /api/rewards/video-favorite — 2d, max 3/d, 1-min cooldown, 1/video lifetime
app.post('/video-favorite', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 2;
  const MAX_PER_DAY = 3;
  const COOLDOWN_MS = 60 * 1000;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { videoId } = body;
    if (!videoId) return c.json({ success: false, error: 'videoId required' }, 400);

    const { data: fav } = await supabase
      .from('video_favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('video_id', videoId)
      .maybeSingle();
    if (!fav) return c.json({ success: false, message: 'Favorite not found' });

    const { data: videoClaim } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'video_favorite')
      .contains('metadata', { video_id: videoId })
      .maybeSingle();
    if (videoClaim) return c.json({ success: true, alreadyClaimed: true, message: 'Already earned for this video' });

    const today = todayCST();
    const count = await getClaimsCountToday(supabase, userId, 'video_favorite', today);
    if (count >= MAX_PER_DAY) {
      return c.json({ success: true, alreadyClaimed: true, message: `Favorite limit (${MAX_PER_DAY}/day) reached` });
    }

    const lastClaim = await getLastClaimAt(supabase, userId, 'video_favorite');
    if (lastClaim && Date.now() - lastClaim.getTime() < COOLDOWN_MS) {
      return c.json({ success: false, cooldown: true });
    }

    const todayTotal = await getDailyTotalNonReferral(supabase, userId, today);
    if (todayTotal + REWARD > 500) return c.json({ success: false, dailyCapReached: true });

    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'video_favorite', diamonds_awarded: REWARD, claim_date: today,
      metadata: { video_id: videoId },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'video_favorite',
      p_description: `Video favorite reward — ${REWARD} diamonds`, p_reference_id: videoId,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD });
  } catch (err) {
    console.warn('[rewards/video-favorite]', err);
    return c.json({ success: false, error: 'Failed to claim video favorite reward' }, 500);
  }
});

// POST /api/rewards/video-watch — 3d, max 5/d, 5-min watch min, 1/video lifetime
app.post('/video-watch', async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  const userId = user.id;
  const REWARD = 3;
  const MAX_PER_DAY = 5;
  const MIN_SECONDS = 300;

  try {
    const body = await c.req.json().catch(() => ({}));
    const { videoId } = body;
    if (!videoId) return c.json({ success: false, error: 'videoId required' }, 400);

    const { data: watch } = await supabase
      .from('video_watch_history')
      .select('watch_duration_seconds')
      .eq('user_id', userId)
      .eq('video_id', videoId)
      .maybeSingle();
    if (!watch || (watch.watch_duration_seconds || 0) < MIN_SECONDS) {
      return c.json({ success: false, message: `Must watch at least ${MIN_SECONDS / 60} minutes` });
    }

    const { data: videoClaim } = await supabase
      .from('diamond_reward_claims')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'video_watch')
      .contains('metadata', { video_id: videoId })
      .maybeSingle();
    if (videoClaim) return c.json({ success: true, alreadyClaimed: true, message: 'Already earned for this video' });

    const today = todayCST();
    const count = await getClaimsCountToday(supabase, userId, 'video_watch', today);
    if (count >= MAX_PER_DAY) {
      return c.json({ success: true, alreadyClaimed: true, message: `Video watch limit (${MAX_PER_DAY}/day) reached` });
    }

    const todayTotal = await getDailyTotalNonReferral(supabase, userId, today);
    if (todayTotal + REWARD > 500) return c.json({ success: false, dailyCapReached: true });

    const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
      user_id: userId, reward_type: 'video_watch', diamonds_awarded: REWARD, claim_date: today,
      metadata: { video_id: videoId, watch_seconds: watch.watch_duration_seconds },
    });
    if (claimErr) {
      if (claimErr.code === '23505') return c.json({ success: true, alreadyClaimed: true });
      throw claimErr;
    }

    await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: userId, p_amount: REWARD, p_type: 'video_watch',
      p_description: `Video watch reward — ${REWARD} diamonds`, p_reference_id: videoId,
    });

    return c.json({ success: true, claimed: true, diamondsAwarded: REWARD });
  } catch (err) {
    console.warn('[rewards/video-watch]', err);
    return c.json({ success: false, error: 'Failed to claim video watch reward' }, 500);
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[rewards] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[rewards] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
