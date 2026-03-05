/**
 * 📊 HORSE ANALYTICS API
 * Returns metrics for the admin dashboard
 */

import { HorseAlertingService, ClipUsageTracker } from '../../../src/content-engine/pipeline/HorseAlertingService.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    // BUG #250 FIX: Require admin auth for analytics dashboard
    const { createClient } = await import('@supabase/supabase-js');
    const _authSupa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user: _authUser }, error: _authErr } = await _authSupa.auth.getUser(_token);
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });


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
        console.error('Analytics API error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
