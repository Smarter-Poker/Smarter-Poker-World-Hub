import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
// Admin CRUD for promo codes - GET (list), POST (create), DELETE (deactivate)
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { requestIdOf } from '../../../src/lib/horses/apiEnvelope.js';
import { operatorHoldsPermission } from '../../../src/lib/horses/operatorGate.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { randomInt } from 'crypto';

// promo_codes is a GLOBAL table with no venue_id column, so a code minted here
// grants diamonds platform-wide. Only an operator holding promo.write may touch
// it (re-verification M-3): the three legacy profile roles carry it until
// enforce_named_roles is on, a granted finance or operations operator carries
// it through the grant, and a narrowed legacy account does not.

// reward_type values the redemption paths actually understand
// (pages/api/promo/redeem.js, redeem-promo-code.js, seed-premade.js) plus the
// values already present in production. An unknown type would create a code
// that redeems into nothing.
//
// `vip_trial` IS NOT ONE OF THEM and must not be added. The /horses UI offered
// it as one of three choices, so picking it 400'd every time. The real VIP
// value is `vip_days` - that is what production's VIP30 code carries. The
// allowlist is echoed back on GET as `rewardTypes` so a UI can build its
// select from the truth instead of guessing.
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

// The audit client is SERVICE ROLE ONLY. getSupabase() above falls back to the
// anon key, and under that key operatorAudit's documented "direct service-role
// insert if the RPC is unavailable" runs under RLS and is denied - the fallback
// that exists to guarantee the row could never fire. null makes the helper log
// a dropped row loudly instead of appearing to write one.
let _auditDb;
function getAuditDb() {
    if (_auditDb === undefined) {
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) {
            console.error('[admin-promo-codes] SUPABASE_SERVICE_ROLE_KEY missing; promo audit rows cannot be written');
            _auditDb = null;
        } else {
            const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
            _auditDb = createClient(url, key);
        }
    }
    return _auditDb;
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
  // [Phase 6.1.15] Rate limit writes - prevents enumeration + drain attacks.
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

      const gate = await operatorHoldsPermission(
          getAuditDb() || getSupabase(),
          { userId: user.id, profileRole: profile?.role || null },
          PERMISSIONS.PROMO_WRITE
      );
      if (!profile || !gate.ok) {
          return res.status(403).json({ success: false, error: 'Platform admin access required' });
      }

      // The operator context the shared audit helper wants. Auth above is
      // unchanged; this only gives the audit rows the same actor, role, ip,
      // user agent, request id and before/after stamp every other console
      // write now carries.
      const auditOp = {
          user: { id: user.id },
          role: profile.role,
          db: getAuditDb(),
          requestId: requestIdOf(req),
      };

      // GET - List all promo codes
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

              // The embedded count was fetched and then thrown away, so the
              // UI could only show `times_used` - a counter incremented by the
              // redemption paths, which already disagrees with reality in
              // production (WELCOME500 reads times_used 1 with zero rows in
              // promo_code_redemptions). `redemption_count` is the measured
              // number of redemption rows; both are returned so the drift is
              // visible rather than hidden.
              const codes = (data || []).map(c => {
                  const embed = Array.isArray(c.promo_code_redemptions) ? c.promo_code_redemptions : [];
                  const redemptionCount = embed.length > 0 ? (embed[0]?.count ?? 0) : 0;
                  const { promo_code_redemptions: _embed, ...rest } = c;
                  return {
                      ...rest,
                      redemption_count: redemptionCount,
                      // True when the stored counter disagrees with the rows.
                      redemption_count_mismatch: (c.times_used || 0) !== redemptionCount,
                  };
              });

              return res.status(200).json({
                  success: true,
                  codes,
                  // Source of truth for a reward-type select.
                  rewardTypes: VALID_REWARD_TYPES,
                  maxRewardValue: MAX_REWARD_VALUE,
              });
          } catch (err) {
              console.warn('List promo codes error:', err);
              return res.status(500).json({ success: false, error: 'Failed to fetch promo codes' });
          }
      }

      // POST - Create a new promo code
      if (req.method === 'POST') {
          const { code, description, type, value, maxUses, expiresAt } = req.body || {};

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

              // Audit log. A promo code is a bearer token for diamonds, so who
              // minted it and for how much is part of the record.
              await auditOperatorAction(auditOp, req, {
                  action: 'promo.create',
                  targetType: 'promo_code',
                  targetId: data?.id,
                  details: { code: promoCode, type: rewardType, value: clampRewardValue(value), maxUses, expiresAt: expiresAtIso },
                  after: data,
              });

              return res.status(201).json({ code: data });
          } catch (err) {
              console.warn('Create promo code error:', err);
              return res.status(500).json({ success: false, error: 'Failed to create promo code' });
          }
      }

      // DELETE - Deactivate a promo code
      if (req.method === 'DELETE') {
          const { id } = req.query;
          if (!id) return res.status(400).json({ success: false, error: 'Code ID required' });

          try {
              const { error } = await getSupabase()
                  .from('promo_codes')
                  .update({ is_active: false })
                  .eq('id', id);

              if (error) throw error;

              // Audit log. DELETE is a soft deactivate, and the action name
              // says which direction it went: 'promo.toggle' left a reader of
              // the Audit tab unable to tell a code being switched off from one
              // being switched back on, and the tab filters on the name.
              await auditOperatorAction(auditOp, req, {
                  action: 'promo.deactivate',
                  targetType: 'promo_code',
                  targetId: id,
                  details: { via: 'delete', is_active: false },
                  before: { is_active: true },
                  after: { is_active: false },
              });

              return res.status(200).json({ success: true });
          } catch (err) {
              console.warn('Deactivate promo code error:', err);
              return res.status(500).json({ success: false, error: 'Failed to deactivate promo code' });
          }
      }

      // PATCH - Update promo code (toggle, rename, set max uses, etc.)
      //
      // BODY SHAPE (application/json). `id` is REQUIRED; every other key is
      // OPTIONAL and only the keys actually present are written, so a partial
      // edit never blanks a field it did not mention. At least one editable
      // key must be present or the call 400s with 'No updates provided'.
      //
      //   id            string (uuid)  REQUIRED - promo_codes.id
      //   is_active     boolean        written as-is
      //   code          string         upper-cased and trimmed, must match
      //                                /^[A-Z0-9]{4,20}$/, unique (409-style
      //                                400 'already exists' on collision)
      //   description   string         written as-is
      //   max_uses      number|string|null|''  '' or null clears the cap,
      //                                otherwise parseInt base 10
      //   reward_type   string         must be in VALID_REWARD_TYPES
      //   reward_value  number|string  clamped to 0..MAX_REWARD_VALUE (10000)
      //   expires_at    ISO date string|null|''  '' or null clears the expiry,
      //                                otherwise must parse as a date. Unlike
      //                                POST, PATCH does NOT require a future
      //                                date, so an expiry can be backdated to
      //                                retire a code.
      //
      // Note the casing split, which is deliberate and must be matched by the
      // caller: POST takes camelCase (type, value, maxUses, expiresAt), PATCH
      // takes the snake_case column names above.
      //
      // Response: 200 { success: true, code: <full updated row> }.
      if (req.method === 'PATCH') {
          const { id, is_active, code, description, max_uses, reward_type, reward_value, expires_at } = req.body || {};
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

              // Audit log. A PATCH that only moves is_active is filed under the
              // direction it moved - promo.activate or promo.deactivate - so
              // the action name alone says what happened; any other edit can
              // re-price the code and is filed as an update.
              const isToggleOnly = Object.keys(updates).length === 1 && updates.is_active !== undefined;
              const toggleAction = updates.is_active ? 'promo.activate' : 'promo.deactivate';
              await auditOperatorAction(auditOp, req, {
                  action: isToggleOnly ? toggleAction : 'promo.update',
                  targetType: 'promo_code',
                  targetId: id,
                  details: { updates },
                  after: data,
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
