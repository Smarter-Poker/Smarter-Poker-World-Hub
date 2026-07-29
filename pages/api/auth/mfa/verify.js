/* ═══════════════════════════════════════════════════════════════════════════
   2FA VERIFY API - Verify TOTP Code and Enable 2FA
   POST /api/auth/mfa/verify
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
import speakeasy from 'speakeasy';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.auth)) return;
  try {
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          // Coerce: clients may send the code as a JSON number, where
          // .length is undefined and the old check rejected valid codes.
          const code = String(req.body?.code ?? '').trim();

          if (!/^\d{6}$/.test(code)) {
              return res.status(400).json({ error: 'Invalid verification code' });
          }

          // Get authenticated user from session
          const authHeader = req.headers.authorization;
          if (!authHeader) {
              return res.status(401).json({ error: 'Not authenticated' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;

          if (authErr || !user) {
              return res.status(401).json({ error: 'Invalid session' });
          }

          // Get stored secret
          const { data: mfaData, error: mfaError } = await getSupabase()
              .from('user_mfa_factors')
              .select('secret, enabled')
              .eq('user_id', user.id)
              .maybeSingle();

          if (mfaError || !mfaData) {
              return res.status(404).json({ error: '2FA not set up. Call /api/auth/mfa/setup first.' });
          }

          // Already enabled → refuse. Re-verifying would silently regenerate
          // and replace ALL backup codes with a bare session token; backup
          // code rotation must go through an explicit, step-up-gated flow.
          if (mfaData.enabled === true) {
              return res.status(409).json({ error: 'Two-factor authentication is already enabled.' });
          }

          // Verify the code
          const verified = speakeasy.totp.verify({
              secret: mfaData.secret,
              encoding: 'base32',
              token: code,
              window: 2 // Allow 2 time steps before/after for clock drift
          });

          if (!verified) {
              return res.status(400).json({ error: 'Invalid verification code' });
          }

          // Generate backup codes (10 codes)
          const backupCodes = Array.from({ length: 10 }, () =>
              crypto.randomBytes(4).toString('hex').toUpperCase()
          );

          // Hash backup codes before storing (in production, use bcrypt)
          const hashedBackupCodes = backupCodes.map(code =>
              crypto.createHash('sha256').update(code).digest('hex')
          );

          // Enable 2FA
          const { error: updateError } = await getSupabase()
              .from('user_mfa_factors')
              .update({
                  enabled: true,
                  verified_at: new Date().toISOString(),
                  backup_codes: hashedBackupCodes
              })
              .eq('user_id', user.id);

          if (updateError) {
              console.warn('Error enabling 2FA:', updateError);
              return res.status(500).json({ error: 'Failed to enable 2FA' });
          }

          // Return backup codes (only time they're shown unhashed)
          return res.status(200).json({
              success: true,
              backupCodes: backupCodes
          });

      } catch (error) {
          console.warn('2FA verification error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
