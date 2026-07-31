import { getServerUserWithFallback } from '../../src/lib/serverAuth';
// Admin CRUD for promo codes — GET (list), POST (create), DELETE (deactivate)
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { logAdminAction, extractClientIP } = require('../../../src/lib/antiAbuse');
import { reportApiError } from '../../../src/lib/sentryWrap';

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
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
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

      // Verify user is owner/manager at a venue OR a platform admin/superadmin
      let isAuthorized = false;

      // Check commander_staff first (venue owners/managers)
      const { data: staff } = await getSupabase()
          .from('commander_staff')
          .select('id, role, venue_id')
          .eq('user_id', user.id)
          .in('role', ['owner', 'manager'])
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

      if (staff) {
          isAuthorized = true;
      } else {
          // Fallback: check profiles table for admin/superadmin role
          const { data: profile } = await getSupabase()
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .maybeSingle();

          if (profile && ['admin', 'superadmin', 'god'].includes(profile.role)) {
              isAuthorized = true;
          }
      }

      if (!isAuthorized) {
          return res.status(403).json({ success: false, error: 'Only owners, managers, or platform admins can manage promo codes' });
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

              return res.status(200).json({ codes: data || [] });
          } catch (err) {
              console.warn('List promo codes error:', err);
              return res.status(500).json({ success: false, error: 'Failed to fetch promo codes' });
          }
      }

      // POST — Create a new promo code
      if (req.method === 'POST') {
          const { code, description, type, value, maxUses, expiresAt } = req.body;

          try {
              const promoCode = code?.toUpperCase().trim() || generateCode();

              const { data, error } = await getSupabase()
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
                      return res.status(400).json({ success: false, error: 'A promo code with this name already exists' });
                  }
                  throw error;
              }

              // Audit log (Phase 6.1.8 — routed via fn_log_admin_action RPC)
              await logAdminAction(getSupabase(), {
                  admin_user_id: user.id,
                  action: 'promo_code.created',
                  target_type: 'promo_code',
                  target_id: data.id,
                  details: { code: promoCode, type, value, maxUses, expiresAt },
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
              if (code !== undefined) updates.code = code.toUpperCase().trim();
              if (description !== undefined) updates.description = description;
              if (max_uses !== undefined) updates.max_uses = max_uses === '' || max_uses === null ? null : parseInt(max_uses);
              if (reward_type !== undefined) updates.reward_type = reward_type;
              if (reward_value !== undefined) updates.reward_value = parseInt(reward_value) || 0;
              if (expires_at !== undefined) updates.expires_at = expires_at || null;

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
