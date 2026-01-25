// Health Check Endpoint: Header Stats
// Ping this from uptime monitors to alert when header is broken
// GET /api/health/header

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Known test user with profile data (Danny Bek)
const TEST_USER_ID = '3bb71bfe-f723-427c-aac7-a853ba04a014';

export default async function handler(req, res) {
    const startTime = Date.now();

    // Allow GET for easy monitoring
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(405).json({ status: 'error', message: 'Method not allowed' });
    }

    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({
            status: 'error',
            message: 'Service key not configured',
            latency_ms: Date.now() - startTime
        });
    }

    try {
        const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);

        // Test profile fetch with known user
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, xp_total, diamonds')
            .eq('id', TEST_USER_ID)
            .single();

        const latency = Date.now() - startTime;

        if (error) {
            console.error('[health/header] Database error:', error);
            return res.status(500).json({
                status: 'error',
                message: 'Database query failed',
                error: error.message,
                latency_ms: latency
            });
        }

        if (!profile) {
            return res.status(500).json({
                status: 'error',
                message: 'Test user profile not found',
                latency_ms: latency
            });
        }

        // Health check passed
        return res.status(200).json({
            status: 'ok',
            message: 'Header stats API is healthy',
            latency_ms: latency,
            test_data: {
                diamonds: profile.diamonds,
                xp: profile.xp_total,
                level: Math.max(1, Math.floor(Math.sqrt((profile.xp_total || 0) / 231)))
            }
        });

    } catch (e) {
        console.error('[health/header] Exception:', e);
        return res.status(500).json({
            status: 'error',
            message: e.message,
            latency_ms: Date.now() - startTime
        });
    }
}
