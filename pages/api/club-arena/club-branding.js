import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Club Branding API — Save and retrieve custom club themes
 * ═══════════════════════════════════════════════════════════════
 * POST /api/club-arena/club-branding
 *
 * Actions:
 *   - get:    Get club's custom branding/theme
 *   - save:   Save custom branding/theme settings
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

// Default theme (SmarterPoker standard)
const DEFAULT_THEME = {
    primaryColor: '#2374E1',
    accentColor: '#31A24C',
    cardBg: '#242526',
    background: '#18191A',
    textPrimary: '#E4E6EB',
    borderColor: '#3E4042',
    logoUrl: null,
    bannerUrl: null,
    tableFelt: 'default', // default, green, blue, red, purple
    chipStyle: 'default', // default, classic, modern, neon
    fontFamily: 'system', // system, inter, roboto, outfit
};

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/club-branding')) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { action, clubId, theme } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      try {
          if (action === 'get') {
              // Anyone in the club can read the theme
              const { data: membership } = await getSupabase()
                  .from('club_members')
                  .select('role')
                  .eq('club_id', clubId)
                  .eq('user_id', user.id)
                  .maybeSingle();
              if (!membership) return res.status(403).json({ error: 'Must be a club member' });

              const { data: clubData } = await getSupabase()
                  .from('clubs')
                  .select('settings')
                  .eq('id', clubId)
                  .maybeSingle();

              const savedTheme = clubData?.settings?.branding || {};
              return res.status(200).json({
                  success: true,
                  theme: { ...DEFAULT_THEME, ...savedTheme },
              });
          }

          if (action === 'save') {
              // Only admin/owner can save
              const { data: membership } = await getSupabase()
                  .from('club_members')
                  .select('role')
                  .eq('club_id', clubId)
                  .eq('user_id', user.id)
                  .maybeSingle();
              if (!membership || !['owner', 'admin'].includes(membership.role)) {
                  return res.status(403).json({ error: 'Admin access required' });
              }

              if (!theme) return res.status(400).json({ error: 'theme object required' });

              // Validate theme colors (basic hex check)
              const colorFields = ['primaryColor', 'accentColor', 'cardBg', 'background', 'textPrimary', 'borderColor'];
              for (const field of colorFields) {
                  if (theme[field] && !/^#[0-9a-fA-F]{6}$/.test(theme[field])) {
                      return res.status(400).json({ error: `Invalid hex color for ${field}` });
                  }
              }

              // Merge with existing settings
              const { data: existingClub } = await getSupabase()
                  .from('clubs')
                  .select('settings')
                  .eq('id', clubId)
                  .maybeSingle();

              const existingSettings = existingClub?.settings || {};
              const newSettings = {
                  ...existingSettings,
                  branding: {
                      ...(existingSettings.branding || {}),
                      ...theme,
                      updatedAt: new Date().toISOString(),
                      updatedBy: user.id,
                  },
              };

              const { error } = await getSupabase()
                  .from('clubs')
                  .update({ settings: newSettings })
                  .eq('id', clubId);

              if (error) throw error;
              return res.status(200).json({ success: true, theme: newSettings.branding });
          }

          return res.status(400).json({ error: `Unknown action: ${action}` });
      } catch (err) {
          console.warn('[club-branding]', err);
          return res.status(500).json({ error: 'Internal error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
