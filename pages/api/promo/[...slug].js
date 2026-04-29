/**
 * /api/promo/* — Hono catch-all router (Phase 4.4 module #7, 2026-04-28)
 *
 * Consolidates 6 previously-separate handlers under a single Hono app.
 * Same pattern as employee/venues/kyc/hendonmob/trivia.
 *
 * Routes (mounted at /api/promo):
 *   POST /validate-promo-code     — public real-time validation for signup form
 *   POST /validate-referral-code  — public referral code lookup for signup
 *   POST /redeem                  — user redeems a code (rate-limited, JWT)
 *   POST /redeem-promo-code       — alt redeem with phone-gate for diamond promos
 *   GET    /admin-promo-codes     — admin/owner list all codes
 *   POST   /admin-promo-codes     — admin/owner create code (with audit log)
 *   PATCH  /admin-promo-codes     — admin/owner update code (with audit log)
 *   DELETE /admin-promo-codes     — admin/owner deactivate code (with audit log)
 *   POST /seed-premade            — owner/manager seeds 25 pre-made promos
 *
 * Replaces:
 *   pages/api/promo/admin-promo-codes.js     (229 LOC)
 *   pages/api/promo/redeem.js                (207 LOC)
 *   pages/api/promo/redeem-promo-code.js     (203 LOC)
 *   pages/api/promo/seed-premade.js          (131 LOC)
 *   pages/api/promo/validate-promo-code.js   ( 72 LOC)
 *   pages/api/promo/validate-referral-code.js( 68 LOC)
 *   = 910 LOC, now ~640 LOC with shared middleware.
 *
 * Auth pattern (per-route):
 *   - public:    validate-promo-code, validate-referral-code (rate-limited only)
 *   - user JWT:  redeem, redeem-promo-code (via getServerUserWithFallback)
 *   - role-gated: admin-promo-codes (owner/manager/admin/superadmin/god),
 *                 seed-premade (owner/manager only)
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');
const { logAdminAction } = require('../../../src/lib/antiAbuse');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function generateCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const PREMADE_PROMOS = [
  { code: 'WELCOME50', description: 'Welcome Bonus — 50 Diamonds for new players', reward_type: 'signup_bonus', reward_value: 50, max_uses: 500 },
  { code: 'FIRSTHOUR', description: 'First Hour Free — waive 1hr time charge for new members', reward_type: 'time_credit', reward_value: 60, max_uses: 200 },
  { code: 'NEWMEMBER', description: 'New Member Special — 100 bonus Diamonds on first membership', reward_type: 'signup_bonus', reward_value: 100, max_uses: 300 },
  { code: 'TRYNOW', description: 'Try The Room — 30 min free time for walk-ins', reward_type: 'time_credit', reward_value: 30, max_uses: 100 },
  { code: 'BRINGAFRIEND', description: 'Bring A Friend — both get 25 Diamonds', reward_type: 'referral_bonus', reward_value: 25, max_uses: 500 },
  { code: 'COMEBACK25', description: 'Come Back Bonus — 25 Diamonds for returning players (30+ days)', reward_type: 'retention_bonus', reward_value: 25, max_uses: 200 },
  { code: 'VIP100', description: 'VIP Reward — 100 Diamonds for VIP members', reward_type: 'vip_reward', reward_value: 100, max_uses: 50 },
  { code: 'LOYAL50', description: 'Loyalty Bonus — 50 Diamonds after 10th visit', reward_type: 'loyalty_bonus', reward_value: 50, max_uses: 300 },
  { code: 'WEEKLYGRIND', description: 'Weekly Grinder — 75 Diamonds for 5+ sessions in a week', reward_type: 'loyalty_bonus', reward_value: 75, max_uses: 100 },
  { code: 'ANNIVERSARY', description: 'Anniversary Bonus — 200 Diamonds on membership anniversary', reward_type: 'anniversary', reward_value: 200, max_uses: 500 },
  { code: 'FREEENTRY', description: 'Free Tournament Entry — one free tourney registration', reward_type: 'tournament_credit', reward_value: 1, max_uses: 50 },
  { code: 'REBUY50', description: 'Rebuy Discount — 50 Diamond rebuy bonus', reward_type: 'tournament_credit', reward_value: 50, max_uses: 100 },
  { code: 'SATNIGHT', description: 'Saturday Night Special — double Diamond earnings on tourney', reward_type: 'multiplier', reward_value: 2, max_uses: 100 },
  { code: 'CHAMPBONUS', description: 'Champion Bonus — extra 150 Diamonds for tournament winner', reward_type: 'tournament_credit', reward_value: 150, max_uses: 50 },
  { code: 'FINALTABLE', description: 'Final Table Bonus — 50 Diamonds for making final table', reward_type: 'tournament_credit', reward_value: 50, max_uses: 200 },
  { code: 'HAPPYHOUR', description: 'Happy Hour — 2 hours for the price of 1 (off-peak)', reward_type: 'time_credit', reward_value: 60, max_uses: 200 },
  { code: 'MARATHON', description: 'Marathon Session — bonus hour after 4+ hours played', reward_type: 'time_credit', reward_value: 60, max_uses: 100 },
  { code: 'EARLYBIRD', description: 'Early Bird — free 30 min for arriving before noon', reward_type: 'time_credit', reward_value: 30, max_uses: 300 },
  { code: 'LATENIGHT', description: 'Late Night Owl — 50% more time after midnight', reward_type: 'time_credit', reward_value: 30, max_uses: 200 },
  { code: 'WEEKDAY20', description: 'Weekday Special — 20% off time during Mon-Thu', reward_type: 'discount_percent', reward_value: 20, max_uses: 500 },
  { code: 'NEWYEAR100', description: 'New Year Celebration — 100 bonus Diamonds', reward_type: 'event_bonus', reward_value: 100, max_uses: 200 },
  { code: 'HOLIDAY75', description: 'Holiday Special — 75 Diamonds during holiday season', reward_type: 'event_bonus', reward_value: 75, max_uses: 300 },
  { code: 'GRANDOPEN', description: 'Grand Opening — 150 Diamonds for first 100 players', reward_type: 'event_bonus', reward_value: 150, max_uses: 100 },
  { code: 'SUPERBOWL', description: 'Super Bowl Special — double Diamonds during the big game', reward_type: 'multiplier', reward_value: 2, max_uses: 200 },
  { code: 'BIRTHDAY50', description: 'Birthday Bonus — 50 free Diamonds on your birthday', reward_type: 'birthday', reward_value: 50, max_uses: 500 },
];

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/promo');

// Rate-limit middleware (writes only) — applied to all routes
app.use('*', async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
});

// User auth middleware (for /redeem* + admin routes)
const userAuth = async (c, next) => {
  try {
    const req = c.env?.req;
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }
    c.set('user', user);
    await next();
  } catch (err) {
    console.warn('[promo] auth error:', err);
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
};

// Role-gated authorization helper
async function checkAdminAuthorized(supabase, userId, allowAdminRoles = true) {
  // Owner/manager via commander_staff
  const { data: staff } = await supabase
    .from('commander_staff')
    .select('id, role, venue_id')
    .eq('user_id', userId)
    .in('role', ['owner', 'manager'])
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (staff) return true;

  // Platform admin/superadmin/god (only for admin-promo-codes; seed-premade is owner/manager only)
  if (allowAdminRoles) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (profile && ['admin', 'superadmin', 'god'].includes(profile.role)) {
      return true;
    }
  }

  return false;
}

// ─── PUBLIC ROUTES ─────────────────────────────────────────────────────────

// POST /api/promo/validate-promo-code — public (signup form)
app.post('/validate-promo-code', async (c) => {
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;
    if (!code || typeof code !== 'string') {
      return c.json({ error: 'Promo code is required' }, 400);
    }

    const { data, error } = await supabase
      .from('promo_codes')
      .select('id, code, description, reward_type, reward_value, max_uses, times_used, is_active, expires_at')
      .eq('code', code.toUpperCase().trim())
      .maybeSingle();

    if (error || !data) {
      return c.json({ valid: false, error: 'Invalid promo code' }, 404);
    }
    if (!data.is_active) {
      return c.json({ valid: false, error: 'This promo code is no longer active' }, 400);
    }
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return c.json({ valid: false, error: 'This promo code has expired' }, 400);
    }
    if (data.max_uses !== null && data.times_used >= data.max_uses) {
      return c.json({ valid: false, error: 'This promo code has reached its usage limit' }, 400);
    }

    return c.json({
      valid: true,
      code: data.code,
      description: data.description,
      type: data.reward_type,
      value: data.reward_value,
    });
  } catch (err) {
    console.warn('[promo/validate-promo-code]', err);
    return c.json({ error: 'Server error' }, 500);
  }
});

// POST /api/promo/validate-referral-code — public (signup form)
app.post('/validate-referral-code', async (c) => {
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;
    if (!code) {
      return c.json({ error: 'Referral code is required' }, 400);
    }

    const playerNumber = parseInt(code, 10);
    if (isNaN(playerNumber) || playerNumber <= 0) {
      return c.json({ valid: false, error: 'Invalid referral code' }, 400);
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, username, player_number')
      .eq('player_number', playerNumber)
      .maybeSingle();

    if (error || !data) {
      return c.json({ valid: false, error: 'No player found with that referral code' }, 404);
    }

    const displayName = data.display_name || data.username || 'A Player';
    const parts = displayName.split(' ');
    const maskedName = parts.length > 1
      ? `${parts[0]} ${parts[parts.length - 1][0]}.`
      : parts[0];

    return c.json({
      valid: true,
      referrerId: data.id,
      playerNumber: data.player_number,
      referrerName: maskedName,
    });
  } catch (err) {
    console.warn('[promo/validate-referral-code]', err);
    return c.json({ error: 'Server error' }, 500);
  }
});

// ─── USER REDEMPTION ROUTES ───────────────────────────────────────────────

// POST /api/promo/redeem — user redeems (multi-reward, atomic)
app.post('/redeem', userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;
    if (!code || typeof code !== 'string') {
      return c.json({ success: false, error: 'Promo code is required' }, 400);
    }

    const normalizedCode = code.trim().toUpperCase();

    const { data: promo, error: lookupError } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (lookupError || !promo) {
      return c.json({ success: false, error: 'Invalid promo code' }, 404);
    }
    if (!promo.is_active) {
      return c.json({ success: false, error: 'This promo code is no longer active' }, 400);
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return c.json({ success: false, error: 'This promo code has expired' }, 400);
    }
    if (promo.max_uses !== null && promo.times_used >= promo.max_uses) {
      return c.json({ success: false, error: 'This promo code has reached its maximum redemptions' }, 400);
    }

    const { data: existing } = await supabase
      .from('promo_code_redemptions')
      .select('id')
      .eq('promo_code_id', promo.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return c.json({ success: false, error: 'You have already redeemed this code' }, 400);
    }

    const { error: redeemInsertErr } = await supabase
      .from('promo_code_redemptions')
      .insert({ promo_code_id: promo.id, user_id: user.id });

    if (redeemInsertErr) {
      if (redeemInsertErr.code === '23505') {
        return c.json({ success: false, error: 'You have already redeemed this code' }, 409);
      }
      throw redeemInsertErr;
    }

    const reward = {
      type: promo.reward_type,
      value: promo.reward_value,
      code: promo.code,
      description: promo.description,
    };

    if (promo.reward_type === 'diamonds') {
      const { error: diamondErr } = await supabase.rpc('add_diamonds_to_balance', {
        p_user_id: user.id,
        p_amount: promo.reward_value,
        p_type: 'promo_code',
        p_description: `Promo code: ${promo.code} — ${promo.description || 'Bonus'}`,
        p_reference_id: `promo_${promo.id}_${user.id}`,
      });
      if (diamondErr) {
        await supabase.rpc('add_diamonds_to_balance', {
          p_user_id: user.id,
          p_amount: promo.reward_value,
          p_type: 'promo_code',
          p_description: `Promo code: ${promo.code} — ${promo.description || 'Bonus'} (fallback)`,
          p_reference_id: `promo_${promo.id}_${user.id}`,
        }).catch(e => console.warn('[promo/redeem] Fallback RPC also failed:', e.message));
      }
      reward.message = `${promo.reward_value} diamonds added to your account!`;
    } else if (promo.reward_type === 'vip_days') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('vip_expires_at')
        .eq('id', user.id)
        .maybeSingle();
      const now = new Date();
      const currentExpiry = profile?.vip_expires_at ? new Date(profile.vip_expires_at) : now;
      const startDate = currentExpiry > now ? currentExpiry : now;
      const newExpiry = new Date(startDate.getTime() + promo.reward_value * 24 * 60 * 60 * 1000);
      await supabase
        .from('profiles')
        .update({ is_vip: true, vip_expires_at: newExpiry.toISOString() })
        .eq('id', user.id);
      reward.message = `${promo.reward_value} days of VIP access activated!`;
    } else if (promo.reward_type === 'free_trial') {
      const now = new Date();
      const trialEnd = new Date(now.getTime() + promo.reward_value * 24 * 60 * 60 * 1000);
      await supabase
        .from('profiles')
        .update({ is_vip: true, vip_expires_at: trialEnd.toISOString() })
        .eq('id', user.id);
      reward.message = `${promo.reward_value}-day free trial activated!`;
    } else if (promo.reward_type === 'commander_discount') {
      reward.message = `${promo.reward_value}% Commander discount applied!`;
    }

    await supabase
      .from('promo_code_redemptions')
      .update({ reward_applied: reward })
      .eq('promo_code_id', promo.id)
      .eq('user_id', user.id);

    await supabase
      .from('promo_codes')
      .update({ times_used: promo.times_used + 1 })
      .eq('id', promo.id);

    return c.json({ success: true, reward });
  } catch (err) {
    console.warn('[promo/redeem]', err);
    return c.json({ success: false, error: 'Failed to redeem promo code' }, 500);
  }
});

// POST /api/promo/redeem-promo-code — alt redeem with phone-gate
app.post('/redeem-promo-code', userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;
    const userId = user.id;
    if (!code) {
      return c.json({ success: false, error: 'Code is required' }, 400);
    }

    const { data: promo, error: promoError } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .maybeSingle();

    if (promoError || !promo) {
      return c.json({ success: false, error: 'Invalid promo code' }, 404);
    }
    if (!promo.is_active) {
      return c.json({ success: false, error: 'Code is no longer active' }, 400);
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return c.json({ success: false, error: 'Code has expired' }, 400);
    }
    if (promo.max_uses !== null && promo.times_used >= promo.max_uses) {
      return c.json({ success: false, error: 'Code usage limit reached' }, 400);
    }

    const { data: existing } = await supabase
      .from('promo_code_redemptions')
      .select('id')
      .eq('promo_code_id', promo.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return c.json({ success: false, error: 'You have already used this promo code' }, 400);
    }

    // Phone verification gate for diamond promos >= 500
    if (['signup_bonus', 'diamonds'].includes(promo.reward_type) && promo.reward_value >= 500) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('phone_verified')
        .eq('id', userId)
        .maybeSingle();
      if (!userProfile?.phone_verified) {
        return c.json({
          success: false,
          error: 'Phone verification required to redeem diamond promo codes. Please verify your phone number in Settings.',
          requiresPhoneVerification: true,
        }, 403);
      }
    }

    const { error: redemptionErr } = await supabase
      .from('promo_code_redemptions')
      .insert({ promo_code_id: promo.id, user_id: userId })
      .select('id')
      .maybeSingle();

    if (redemptionErr) {
      if (redemptionErr.code === '23505') {
        return c.json({ success: false, error: 'You have already used this promo code' }, 409);
      }
      throw redemptionErr;
    }

    let bonusApplied = '';
    switch (promo.reward_type) {
      case 'signup_bonus':
      case 'diamonds': {
        const { error: diamondErr } = await supabase.rpc('add_diamonds_to_balance', {
          p_user_id: userId,
          p_amount: promo.reward_value,
          p_type: 'promo_code',
          p_description: `Promo code: ${promo.code} — ${promo.description || 'Bonus diamonds'}`,
          p_reference_id: `promo_${promo.id}_${userId}`,
        });
        if (diamondErr) {
          console.warn('[promo/redeem-promo-code] Diamond credit RPC failed:', diamondErr.message);
          await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: promo.reward_value,
            p_type: 'promo_code',
            p_description: `Promo code: ${promo.code} — ${promo.description || 'Bonus diamonds'} (fallback)`,
            p_reference_id: `promo_${promo.id}_${userId}`,
          }).catch(e => console.warn('[promo/redeem-promo-code] Fallback RPC also failed:', e.message));
        }
        bonusApplied = `${promo.reward_value} diamonds added`;
        break;
      }
      case 'vip_trial':
      case 'vip_days': {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + promo.reward_value);
        await supabase
          .from('profiles')
          .update({ is_vip: true, vip_expires_at: trialEnd.toISOString() })
          .eq('id', userId);
        bonusApplied = `${promo.reward_value}-day VIP trial activated`;
        break;
      }
      case 'lifetime_commander_club_vip': {
        await supabase
          .from('profiles')
          .update({ is_vip: true, vip_expires_at: null })
          .eq('id', userId);
        bonusApplied = 'Lifetime VIP Card + Club Commander Club Level activated';
        break;
      }
      case 'lifetime_commander_charity': {
        bonusApplied = 'Lifetime Club Commander Charity Games pass activated';
        break;
      }
      default:
        bonusApplied = `Promo code ${promo.code} applied`;
    }

    await supabase
      .from('promo_codes')
      .update({ times_used: promo.times_used + 1 })
      .eq('id', promo.id);

    return c.json({
      success: true,
      message: bonusApplied,
      type: promo.reward_type,
      value: promo.reward_value,
    });
  } catch (err) {
    console.warn('[promo/redeem-promo-code]', err);
    return c.json({ success: false, error: 'Server error' }, 500);
  }
});

// ─── ADMIN ROUTES (admin-promo-codes) ─────────────────────────────────────

const adminAuth = async (c, next) => {
  // userAuth runs first via base middleware chain — c.get('user') is set
  const user = c.get('user');
  const supabase = getSupabase();
  const ok = await checkAdminAuthorized(supabase, user.id, true);
  if (!ok) {
    return c.json({ success: false, error: 'Only owners, managers, or platform admins can manage promo codes' }, 403);
  }
  await next();
};

// GET /api/promo/admin-promo-codes
app.get('/admin-promo-codes', userAuth, adminAuth, async (c) => {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*, promo_code_redemptions(count)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return c.json({ codes: data || [] });
  } catch (err) {
    console.warn('[promo/admin GET]', err);
    return c.json({ success: false, error: 'Failed to fetch promo codes' }, 500);
  }
});

// POST /api/promo/admin-promo-codes
app.post('/admin-promo-codes', userAuth, adminAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code, description, type, value, maxUses, expiresAt } = body;
    const promoCode = code?.toUpperCase().trim() || generateCode();

    const { data, error } = await supabase
      .from('promo_codes')
      .insert({
        code: promoCode,
        description: description || '',
        reward_type: type || 'signup_bonus',
        reward_value: parseInt(value) || 0,
        max_uses: maxUses ? parseInt(maxUses) : null,
        expires_at: expiresAt || null,
      })
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return c.json({ success: false, error: 'A promo code with this name already exists' }, 400);
      }
      throw error;
    }

    await logAdminAction(supabase, {
      admin_user_id: user.id,
      action: 'promo_code.created',
      target_type: 'promo_code',
      target_id: data.id,
      details: { code: promoCode, type, value, maxUses, expiresAt },
      after: data,
      req: c.env?.req,
    });

    return c.json({ code: data }, 201);
  } catch (err) {
    console.warn('[promo/admin POST]', err);
    return c.json({ success: false, error: 'Failed to create promo code' }, 500);
  }
});

// PATCH /api/promo/admin-promo-codes
app.patch('/admin-promo-codes', userAuth, adminAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { id, is_active, code, description, max_uses, reward_type, reward_value, expires_at } = body;
    if (!id) return c.json({ success: false, error: 'Code ID required' }, 400);

    const updates = {};
    if (is_active !== undefined) updates.is_active = is_active;
    if (code !== undefined) updates.code = code.toUpperCase().trim();
    if (description !== undefined) updates.description = description;
    if (max_uses !== undefined) updates.max_uses = max_uses === '' || max_uses === null ? null : parseInt(max_uses);
    if (reward_type !== undefined) updates.reward_type = reward_type;
    if (reward_value !== undefined) updates.reward_value = parseInt(reward_value) || 0;
    if (expires_at !== undefined) updates.expires_at = expires_at || null;

    if (Object.keys(updates).length === 0) {
      return c.json({ success: false, error: 'No updates provided' }, 400);
    }

    const { data, error } = await supabase
      .from('promo_codes')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return c.json({ success: false, error: 'A promo code with this name already exists' }, 400);
      }
      throw error;
    }

    await logAdminAction(supabase, {
      admin_user_id: user.id,
      action: 'promo_code.updated',
      target_type: 'promo_code',
      target_id: id,
      details: { updates },
      after: data,
      req: c.env?.req,
    });

    return c.json({ success: true, code: data });
  } catch (err) {
    console.warn('[promo/admin PATCH]', err);
    return c.json({ success: false, error: 'Failed to update promo code' }, 500);
  }
});

// DELETE /api/promo/admin-promo-codes
app.delete('/admin-promo-codes', userAuth, adminAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const id = c.req.query('id');
    if (!id) return c.json({ success: false, error: 'Code ID required' }, 400);

    const { error } = await supabase
      .from('promo_codes')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;

    await logAdminAction(supabase, {
      admin_user_id: user.id,
      action: 'promo_code.deactivated',
      target_type: 'promo_code',
      target_id: id,
      before: { is_active: true },
      after: { is_active: false },
      req: c.env?.req,
    });

    return c.json({ success: true });
  } catch (err) {
    console.warn('[promo/admin DELETE]', err);
    return c.json({ success: false, error: 'Failed to deactivate promo code' }, 500);
  }
});

// ─── SEED-PREMADE (owner/manager only) ────────────────────────────────────

app.post('/seed-premade', userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  // Owner/manager only — no platform-admin override (per original handler)
  const ok = await checkAdminAuthorized(supabase, user.id, false);
  if (!ok) {
    return c.json({ success: false, error: 'Only owners and managers can seed promo codes' }, 403);
  }

  try {
    const { data: existing } = await supabase
      .from('promo_codes')
      .select('code');
    const existingCodes = new Set((existing || []).map(p => p.code));

    const toInsert = PREMADE_PROMOS
      .filter(p => !existingCodes.has(p.code))
      .map(p => ({
        ...p,
        is_active: false,
        created_at: new Date().toISOString(),
      }));

    if (toInsert.length === 0) {
      return c.json({ success: true, message: 'All 25 promotions already exist', created: 0 });
    }

    const { data, error } = await supabase
      .from('promo_codes')
      .insert(toInsert)
      .select();

    if (error) throw error;

    return c.json({
      success: true,
      message: `Created ${data.length} pre-made promotions`,
      created: data.length,
      promos: data.map(p => ({ code: p.code, description: p.description })),
    }, 201);
  } catch (err) {
    console.warn('[promo/seed-premade]', err);
    return c.json({ success: false, error: 'Failed to seed promotions' }, 500);
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
      console.warn('[promo] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[promo] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
