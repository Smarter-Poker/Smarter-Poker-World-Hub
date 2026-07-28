/* ═══════════════════════════════════════════════════════════════════════════
   SESSION TRACK API - Track/Update Current Session
   POST /api/auth/sessions/track
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

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
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  try {
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
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;

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
          const { data: existingSession } = await getSupabase()
              .from('user_sessions')
              .select('id')
              .eq('user_id', user.id)
              .eq('device_name', deviceName)
              .eq('ip_address', ipAddress)
              .maybeSingle();

          if (existingSession) {
              // Update existing session
              const { error: updateError } = await getSupabase()
                  .from('user_sessions')
                  .update({
                      last_active: new Date().toISOString(),
                      user_agent: userAgent
                  })
                  .eq('id', existingSession.id);

              if (updateError) {
                  console.warn('Error updating session:', updateError);
              }
          } else {
              // Insert new session
              const { error: insertError } = await getSupabase()
                  .from('user_sessions')
                  .insert({
                      user_id: user.id,
                      device_name: deviceName,
                      ip_address: ipAddress,
                      user_agent: userAgent,
                      last_active: new Date().toISOString()
                  });

              if (insertError) {
                  console.warn('Error inserting session:', insertError);
              }
          }

          return res.status(200).json({
              success: true,
              message: 'Session tracked'
          });

      } catch (error) {
          console.warn('Session track error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
