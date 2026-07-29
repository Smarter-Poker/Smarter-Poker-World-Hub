/**
 * 📊 HORSE ANALYTICS API
 * Returns metrics for the admin dashboard
 */

import { HorseAlertingService, ClipUsageTracker } from '../../../src/content-engine/pipeline/HorseAlertingService.js';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }
      // BUG #250 FIX: Require admin auth for analytics dashboard
      const _authSupa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: _authErr } = await _authSupa.auth.getUser(_token);
      const _authUser = authData?.user;
      if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      // BUG-G FIX: Require admin/superadmin/god role — analytics data is sensitive
      const { data: _profile } = await _authSupa.from('profiles').select('role').eq('id', _authUser.id).maybeSingle();
      if (!_profile || !['admin', 'superadmin', 'god'].includes(_profile.role)) {
          return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      const { days = '7', type = 'summary' } = req.query;
      const numDays = parseInt(days, 10);

      try {
          const alertingService = new HorseAlertingService(SUPABASE_URL, SUPABASE_KEY);

          if (type === 'summary') {
              const summary = await alertingService.getAnalyticsSummary(numDays);
              return res.json({
                  success: true,
                  data: summary
              });
          }

          if (type === 'errors') {
              const errors = await alertingService.getRecentErrors(20);
              const breakdown = await alertingService.getErrorBreakdown(numDays);
              return res.json({
                  success: true,
                  data: {
                      recent: errors,
                      breakdown
                  }
              });
          }

          if (type === 'top-horses') {
              const topHorses = await alertingService.getTopHorses(numDays, 10);
              return res.json({
                  success: true,
                  data: topHorses
              });
          }

          if (type === 'clips') {
              const tracker = new ClipUsageTracker(SUPABASE_URL, SUPABASE_KEY);
              const usedClips = await tracker.getRecentlyUsedClips(24);
              return res.json({
                  success: true,
                  data: {
                      usedInLast24h: usedClips.length,
                      clips: usedClips
                  }
              });
          }

          return res.status(400).json({ success: false, error: 'Invalid type parameter' });

      } catch (error) {
          console.warn('Analytics API error:', error);
          return res.status(500).json({
              success: false,
              error: error.message
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
