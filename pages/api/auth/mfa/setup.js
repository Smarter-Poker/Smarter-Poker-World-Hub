/* ═══════════════════════════════════════════════════════════════════════════
   2FA SETUP API - Generate TOTP Secret and QR Code
   POST /api/auth/mfa/setup
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
import QRCode from 'qrcode';

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.auth)) return;
  try {
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
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

          // [2026-07-25] Refuse to overwrite an ENABLED factor with a bare
          // session token. Without this check, a stolen access token could
          // rotate the victim's TOTP secret (upsert below flips
          // enabled=false and hands the caller a fresh secret) — bypassing
          // the disable endpoint's requirement to present a current code.
          const { data: existingFactor } = await getSupabase()
              .from('user_mfa_factors')
              .select('enabled')
              .eq('user_id', user.id)
              .maybeSingle();
          if (existingFactor?.enabled === true) {
              return res.status(409).json({
                  error: 'Two-factor authentication is already enabled. Disable it first (requires a current code) before re-enrolling.',
              });
          }

          // Generate TOTP secret
          const secret = speakeasy.generateSecret({
              name: `Smarter.Poker (${user.email})`,
              issuer: 'Smarter.Poker',
              length: 32
          });

          // Generate QR code as data URL
          const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

          // Store unverified secret in database
          const { error: dbError } = await getSupabase()
              .from('user_mfa_factors')
              .upsert({
                  user_id: user.id,
                  secret: secret.base32,
                  enabled: false,
                  created_at: new Date().toISOString()
              }, {
                  onConflict: 'user_id'
              });

          if (dbError) {
              console.warn('Error storing MFA secret:', dbError);
              return res.status(500).json({ error: 'Failed to setup 2FA' });
          }

          // Return QR code and manual entry key
          return res.status(200).json({
              qrCode: qrCodeDataURL,
              secret: secret.base32,
              manualEntryKey: secret.base32.match(/.{1,4}/g).join('-') // Format as XXXX-XXXX-XXXX-XXXX
          });

      } catch (error) {
          console.warn('2FA setup error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
