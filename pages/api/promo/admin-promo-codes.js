import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
// Admin CRUD for promo codes — GET (list), POST (create), DELETE (deactivate)
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { logAdminAction } = require('../../../src/lib/antiAbuse');
import { reportApiError } from '../../../src/lib/sentryWrap';
import { randomInt } from 'crypto';

// promo_codes is a GLOBAL table with no venue_id column, so a code minted here
// grants diamonds platform-wide. Only platform admins may touch it.
const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

// reward_type values the redemption paths actually understand
// (pages/api/promo/redeem.js, redeem-promo-code.js, seed-premade.js) plus the
// values already present in production. An unknown type would create a code
// that redeems into nothing.
const VALID_REWARD_TYPES = [
    'signup_bonus', 'diamonds', 'vip_days', 'free_trial', 'commander_discount',
    'time_credit', 'referral_bonus', 'retention_bonus', 'vip_reward',
    'loyalty_bonus', 'anniversary', 'tournament_credit', 'multiplier',
    'discount_percent', 'event_bonus', 'birthday',
    'lifetime_commander_charity', 'lifetime_commander_club_vip',
];

// Hard ceiling on a single code's payout. Without it a typo (or a hostile
// caller) can mint a code granting 999,999,999 diamonds.
const MAX_REWARD_VALUE = 10000;

function clampRewardValue(value) {
    return Math.min(Math.max(parseInt(value, 10) || 0, 0), MAX_REWARD_VALUE);
}

const CODE_PATTERN = /^[A-Z0-9]{4,20}$/;

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
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 for readability
    // crypto.randomInt, not Math.random: these codes are bearer tokens for
    // diamonds, so a predictable PRNG makes them guessable.
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(randomInt(chars.length));
    }
    return code;
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  try {
      // Verify user is authenticated
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const token = authHeader.replace('Bearer ', '');
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

      // PLATFORM ADMINS ONLY.
      //
      // This route previously authorized ANY active commander_staff row with
      // role owner|manager at ANY venue, then applied no venue scoping at all.
      // Because promo_codes is a global diamond-granting table with no
      // venue_id column, that let any venue manager on the platform list,
      // create, re-price and deactivate EVERY promo code. That branch is
      // deleted; this surface is reached only from /horses.
      const { data: profile } = await getSupabase()
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      if (!profile || !ADMIN_ROLES.includes(profile.role)) {
          return res.status(403).json({ success: false, error: 'Platform admin access required' });
      }

      // GET — List all promo codes
      if (req.method === 'GET') {
          try {
              const { data, error } = await getSupabase()
                  .from('promo_codes')
                  .select(`
                      *,
                      promo_code_redemptions(count)
                  `)
                  .order('created_at', { ascending: false })
                  .limit(100);

              if (error) throw error;

              return res.status(200).json({ success: true, codes: data || [] });
          } catch (err) {
              console.warn('List promo codes error:', err);
              return res.status(500).json({ success: false, error: 'Failed to fetch promo codes' });
          }
      }

      // POST — Create a new promo code
      if (req.method === 'POST') {
          const { code, description, type, value, maxUses, expiresAt } = req.body;

          try {
              // ── Validate before minting. A promo code is a bearer token for
              // diamonds, so nothing here is trusted from the client. ──
              const rawCode = typeof code === 'string' ? code.toUpperCase().trim() : '';
              const promoCode = rawCode || generateCode();
              if (!CODE_PATTERN.test(promoCode)) {
                  return res.status(400).json({ success: false, error: 'Code must be 4-20 characters, letters A-Z and digits 0-9 only' });
              }

              const rewardType = type || 'signup_bonus';
              if (!VALID_REWARD_TYPES.includes(rewardType)) {
                  return res.status(400).json({ success: false, error: `Invalid reward type. Must be one of: ${VALID_REWARD_TYPES.join(', ')}` });
              }

              let expiresAtIso = null;
              if (expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
                  const parsed = new Date(expiresAt);
                  if (Number.isNaN(parsed.getTime())) {
                      return res.status(400).json({ success: false, error: 'expiresAt is not a valid date' });
                  }
                  if (parsed.getTime() <= Date.now()) {
                      return res.status(400).json({ success: false, error: 'expiresAt must be in the future' });
                  }
                  expiresAtIso = parsed.toISOString();
              }

              const { data, error } = await getSupabase()
                  .from('promo_codes')
                  .insert({
                      code: promoCode,
                      description: description || '',
                      reward_type: rewardType,
                      reward_value: clampRewardValue(value),
                      max_uses: maxUses ? parseInt(maxUses, 10) : null,
                      expires_at: expiresAtIso,
                  })
                  .select()
                  .maybeSingle();

              if (error) {
                  if (error.code === '23505') {
                      return res.status(400).json({ success: false, error: 'A promo code with this name already exists' });
                  }
                  throw error;
              }

              // Audit log (Phase 6.1.8 — routed via fn_log_admin_action RPC)
              await logAdminAction(getSupabase(), {
                  admin_user_id: user.id,
                  action: 'promo_code.created',
                  target_type: 'promo_code',
                  target_id: data?.id,
                  details: { code: promoCode, type: rewardType, value: clampRewardValue(value), maxUses, expiresAt: expiresAtIso },
                  after: data,
                  req,
              });

              return res.status(201).json({ code: data });
          } catch (err) {
              console.warn('Create promo code error:', err);
              return res.status(500).json({ success: false, error: 'Failed to create promo code' });
          }
      }

      // DELETE — Deactivate a promo code
      if (req.method === 'DELETE') {
          const { id } = req.query;
          if (!id) return res.status(400).json({ success: false, error: 'Code ID required' });

          try {
              const { error } = await getSupabase()
                  .from('promo_codes')
                  .update({ is_active: false })
                  .eq('id', id);

              if (error) throw error;

              // Audit log (Phase 6.1.8)
              await logAdminAction(getSupabase(), {
                  admin_user_id: user.id,
                  action: 'promo_code.deactivated',
                  target_type: 'promo_code',
                  target_id: id,
                  before: { is_active: true },
                  after: { is_active: false },
                  req,
              });

              return res.status(200).json({ success: true });
          } catch (err) {
              console.warn('Deactivate promo code error:', err);
              return res.status(500).json({ success: false, error: 'Failed to deactivate promo code' });
          }
      }

      // PATCH — Update promo code (toggle, rename, set max uses, etc.)
      if (req.method === 'PATCH') {
          const { id, is_active, code, description, max_uses, reward_type, reward_value, expires_at } = req.body;
          if (!id) return res.status(400).json({ success: false, error: 'Code ID required' });

          try {
              const updates = {};
              if (is_active !== undefined) updates.is_active = is_active;
              if (code !== undefined) {
                  const nextCode = String(code).toUpperCase().trim();
                  if (!CODE_PATTERN.test(nextCode)) {
                      return res.status(400).json({ success: false, error: 'Code must be 4-20 characters, letters A-Z and digits 0-9 only' });
                  }
                  updates.code = nextCode;
              }
              if (description !== undefined) updates.description = description;
              if (max_uses !== undefined) updates.max_uses = max_uses === '' || max_uses === null ? null : parseInt(max_uses, 10);
              if (reward_type !== undefined) {
                  if (!VALID_REWARD_TYPES.includes(reward_type)) {
                      return res.status(400).json({ success: false, error: `Invalid reward type. Must be one of: ${VALID_REWARD_TYPES.join(', ')}` });
                  }
                  updates.reward_type = reward_type;
              }
              // Clamped: an unbounded re-price is the same diamond-minting hole
              // as an unbounded create.
              if (reward_value !== undefined) updates.reward_value = clampRewardValue(reward_value);
              if (expires_at !== undefined) {
                  if (expires_at === null || expires_at === '') {
                      updates.expires_at = null;
                  } else {
                      const parsed = new Date(expires_at);
                      if (Number.isNaN(parsed.getTime())) {
                          return res.status(400).json({ success: false, error: 'expires_at is not a valid date' });
                      }
                      updates.expires_at = parsed.toISOString();
                  }
              }

              if (Object.keys(updates || {}).length === 0) {
                  return res.status(400).json({ success: false, error: 'No updates provided' });
              }

              const { data, error } = await getSupabase()
                  .from('promo_codes')
                  .update(updates)
                  .eq('id', id)
                  .select()
                  .maybeSingle();

              if (error) {
                  if (error.code === '23505') {
                      return res.status(400).json({ success: false, error: 'A promo code with this name already exists' });
                  }
                  throw error;
              }

              // Audit log for PATCH (Phase 6.1.8)
              await logAdminAction(getSupabase(), {
                  admin_user_id: user.id,
                  action: 'promo_code.updated',
                  target_type: 'promo_code',
                  target_id: id,
                  details: { updates },
                  after: data,
                  req,
              });

              return res.status(200).json({ success: true, code: data });
          } catch (err) {
              console.warn('Update promo code error:', err);
              return res.status(500).json({ success: false, error: 'Failed to update promo code' });
          }
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
