/* ═══════════════════════════════════════════════════════════════════════════
   SESSION TRACK API - Track/Update Current Session
   POST /api/auth/sessions/track
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from '../../../../src/lib/supabase';

// Helper to parse user agent for device name
function getDeviceName(userAgent) {
    if (!userAgent) return 'Unknown Device';

    // Browser detection
    let browser = 'Unknown Browser';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';

    // OS detection
    let os = 'Unknown OS';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';

    return `${browser} on ${os}`;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { fingerprint } = req.body;

        // Get authenticated user from session
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return res.status(401).json({ error: 'Invalid session' });
        }

        // Get IP address and user agent
        const ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'Unknown';
        const userAgent = req.headers['user-agent'] || '';
        const deviceName = getDeviceName(userAgent);

        // Create a unique session identifier based on fingerprint or IP+UA
        const sessionKey = fingerprint || `${ipAddress}-${userAgent}`;

        // Upsert session (update if exists, insert if new)
        // We'll use a combination of user_id and device_name as a pseudo-unique key
        const { data: existingSession } = await supabase
            .from('user_sessions')
            .select('id')
            .eq('user_id', user.id)
            .eq('device_name', deviceName)
            .eq('ip_address', ipAddress)
            .single();

        if (existingSession) {
            // Update existing session
            const { error: updateError } = await supabase
                .from('user_sessions')
                .update({
                    last_active: new Date().toISOString(),
                    user_agent: userAgent
                })
                .eq('id', existingSession.id);

            if (updateError) {
                console.error('Error updating session:', updateError);
            }
        } else {
            // Insert new session
            const { error: insertError } = await supabase
                .from('user_sessions')
                .insert({
                    user_id: user.id,
                    device_name: deviceName,
                    ip_address: ipAddress,
                    user_agent: userAgent,
                    last_active: new Date().toISOString()
                });

            if (insertError) {
                console.error('Error inserting session:', insertError);
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Session tracked'
        });

    } catch (error) {
        console.error('Session track error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
