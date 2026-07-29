import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Table Templates API — Save & Load reusable table configurations
 * ═══════════════════════════════════════════════════════════════
 * POST /api/club-arena/table-templates
 *
 * Actions:
 *   - list:   Get all templates for a club
 *   - save:   Save current table config as a template
 *   - delete: Remove a template
 *   - use:    Increment use_count (called when creating from template)
 */

import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/table-templates')) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });

      // Verify JWT
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { action, clubId, templateId, name, config } = req.body;

      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify user is admin/owner of the club
      const { data: membership } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
          return res.status(403).json({ error: 'Admin access required' });
      }

      try {
          switch (action) {
              case 'list': {
                  const { data, error } = await getSupabase()
                      .from('table_templates')
                      .select('*')
                      .eq('club_id', clubId)
                      .order('use_count', { ascending: false })
                      .limit(50);
                  if (error) throw error;
                  return res.status(200).json({ success: true, templates: data || [] });
              }

              case 'save': {
                  if (!name?.trim()) return res.status(400).json({ error: 'Template name required' });
                  if (!config) return res.status(400).json({ error: 'Table config required' });

                  const templateData = {
                      club_id: clubId,
                      name: name.trim().slice(0, 60),
                      game_variant: config.game_variant || 'nlh',
                      game_type: config.game_type || 'cash',
                      small_blind: parseFloat(config.small_blind) || 1,
                      big_blind: parseFloat(config.big_blind) || 2,
                      ante: parseFloat(config.ante) || 0,
                      min_buy_in: parseFloat(config.min_buy_in) || 40,
                      max_buy_in: parseFloat(config.max_buy_in) || 200,
                      max_players: parseInt(config.max_players) || 9,
                      action_time_seconds: parseInt(config.action_time_seconds) || 30,
                      settings: config.settings || {},
                      created_by: user.id,
                  };

                  const { data, error } = await getSupabase()
                      .from('table_templates')
                      .insert(templateData)
                      .select()
                      .maybeSingle();
                  if (error) throw error;
                  return res.status(201).json({ success: true, template: data });
              }

              case 'delete': {
                  if (!templateId) return res.status(400).json({ error: 'templateId required' });
                  const { error } = await getSupabase()
                      .from('table_templates')
                      .delete()
                      .eq('id', templateId)
                      .eq('club_id', clubId);
                  if (error) throw error;
                  return res.status(200).json({ success: true });
              }

              case 'use': {
                  if (!templateId) return res.status(400).json({ error: 'templateId required' });
                  const { error } = await getSupabase()
                      .rpc('increment_column', {
                          table_name: 'table_templates',
                          column_name: 'use_count',
                          row_id: templateId,
                      });
                  // If RPC doesn't exist, fall back to manual update
                  if (error) {
                      const { error: err_table_templates_nqovg } = await getSupabase()
                        .from('table_templates')
                        .update({ use_count: getSupabase().raw('use_count + 1') })
                          .eq('id', templateId)
                          .eq('club_id', clubId);
                      if (err_table_templates_nqovg) console.warn('[Supabase] Silent mutation failed in table_templates:', err_table_templates_nqovg.message);
                  }
                  return res.status(200).json({ success: true });
              }

              case 'schedule': {
                  // Set/update/toggle schedule for a template
                  const { scheduleEnabled, scheduleDays, scheduleTime, scheduleTimezone } = req.body;
                  if (!templateId) return res.status(400).json({ error: 'templateId required' });

                  const updates = {};
                  if (scheduleEnabled !== undefined) updates.schedule_enabled = !!scheduleEnabled;
                  if (Array.isArray(scheduleDays)) updates.schedule_days = scheduleDays.filter(d => d >= 0 && d <= 6);
                  if (scheduleTime !== undefined) updates.schedule_time = scheduleTime; // 'HH:MM' or null
                  if (scheduleTimezone) updates.schedule_timezone = scheduleTimezone;
                  updates.updated_at = new Date().toISOString();

                  const { error: schedErr } = await getSupabase()
                      .from('table_templates')
                      .update(updates)
                      .eq('id', templateId)
                      .eq('club_id', clubId);

                  if (schedErr) throw schedErr;
                  return res.status(200).json({ success: true });
              }

              default:
                  return res.status(400).json({ error: `Unknown action: ${action}` });
          }
      } catch (err) {
          console.warn('[table-templates]', err);
          return res.status(500).json({ error: 'Internal error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
