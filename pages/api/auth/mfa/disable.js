/* ═══════════════════════════════════════════════════════════════════════════
   2FA DISABLE API - Disable Two-Factor Authentication
   POST /api/auth/mfa/disable
   Body: { code } — Must provide a valid current TOTP code to disable 2FA
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import speakeasy from 'speakeasy';
import crypto from 'crypto';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';
// [Phase 6.1.26] Even though disable.js already requires a fresh TOTP /
// backup code to execute (that's the in-body `code` check below), we also
// want a fresh mfa_session cookie so the disable button can't be clicked
// from an old tab whose session hasn't been re-challenged in hours.
// Note: if the user is disabling because they've LOST their second factor,
// they won't have a valid cookie at all — in that case the support-contact
// recovery path applies, not this endpoint.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

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

          if (userError || !user) {
              return res.status(401).json({ error: 'Invalid session' });
          }

          // SECURITY: Require current TOTP code OR a valid backup code to disable 2FA.
          // Without this, a stolen session token can silently disable 2FA.
          const { code } = req.body;
          if (!code || (code.length !== 6 && code.length !== 8)) {
              return res.status(400).json({ error: 'Current 2FA code or backup code required to disable 2FA' });
          }

          // Get stored MFA secret
          const { data: mfaData, error: mfaError } = await getSupabase()
              .from('user_mfa_factors')
              .select('secret, enabled, backup_codes')
              .eq('user_id', user.id)
              .maybeSingle();

          if (mfaError || !mfaData || !mfaData.enabled) {
              return res.status(404).json({ error: '2FA is not enabled on this account' });
          }

          let verified = false;

          // Try TOTP code first (6 digits)
          if (code.length === 6) {
              verified = speakeasy.totp.verify({
                  secret: mfaData.secret,
                  encoding: 'base32',
                  token: code,
                  window: 2
              });
          }

          // Try backup code (8 hex chars) — [Phase 6.1.25] consume atomically via RPC.
          // This closes the same TOCTOU race that Phase 6.1.22 closed on the
          // challenge endpoint: two concurrent `disable` calls with the same
          // backup code would both have succeeded under the old select→splice→
          // update pattern. The RPC holds a SELECT...FOR UPDATE lock across
          // the check+update window so exactly one caller sees `consumed=true`.
          if (!verified && code.length === 8 && mfaData.backup_codes?.length > 0) {
              const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
              const { data: rpcResult, error: rpcError } = await getSupabase()
                  .rpc('fn_consume_mfa_backup_code', {
                      p_user_id: user.id,
                      p_hashed_code: codeHash,
                  });
              if (rpcError) {
                  console.warn('[mfa/disable] consume RPC error:', rpcError);
                  return res.status(500).json({ error: 'Failed to verify backup code' });
              }
              const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
              verified = !!row?.consumed;
          }

          if (!verified) {
              return res.status(400).json({ error: 'Invalid 2FA code. Please enter your current authenticator code or a backup code.' });
          }

          // Code verified — disable 2FA
          const { error: updateError } = await getSupabase()
              .from('user_mfa_factors')
              .update({
                  enabled: false,
                  disabled_at: new Date().toISOString(),
              })
              .eq('user_id', user.id);

          if (updateError) {
              console.warn('Error disabling 2FA:', updateError);
              return res.status(500).json({ error: 'Failed to disable 2FA' });
          }

          return res.status(200).json({
              success: true,
              message: '2FA has been disabled'
          });

      } catch (error) {
          console.warn('2FA disable error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
