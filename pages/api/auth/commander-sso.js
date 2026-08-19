/**
 * POST /api/auth/commander-sso
 *
 * Smarter.Poker → Club Commander single-sign-on bridge.
 *
 * The Club Commander lives at commander.smarter.poker — a different origin from
 * smarter.poker. Because localStorage and cookies are origin-scoped, a user
 * already authenticated on smarter.poker cannot silently access Commander.
 *
 * This endpoint issues a one-time SSO token that the Commander login page
 * exchanges for a full Supabase session on its own origin.
 *
 * Flow:
 *   1. Commander login page detects localStorage['smarter-poker-auth'] exists
 *      (user is already logged in on THIS origin via the smarter.poker bundle).
 *   2. Commander login page sends the access_token to this endpoint.
 *   3. This endpoint validates the JWT + stores a short-lived one-time token
 *      in Supabase (sso_bridge_tokens table).
 *   4. This endpoint returns a redirect URL to commander.smarter.poker/auth/sso?token=<token>
 *   5. Commander /auth/sso exchanges token, loads session, redirects to dashboard.
 *
 * Security:
 *   - Token is 32 bytes (256-bit) of crypto-random data
 *   - TTL is 60 seconds — single-use window
 *   - Token is hashed in the DB; raw value only exists in-transit and in the URL
 *   - Only users with a valid Supabase JWT can create tokens
 *   - Commander /auth/sso deletes the token row on use (consumed-once)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import crypto from 'crypto';

// Admin client (service-role) — module-scoped, created once
let _adminClient = null;
function getAdminClient() {
  if (!_adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('[commander-sso] SUPABASE_SERVICE_ROLE_KEY not configured');
    _adminClient = createClient(url, key);
  }
  return _adminClient;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate the caller's Supabase session using the canonical hub pattern
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(url, key);

    const { user, error: authError } = await getServerUserWithFallback(req, supabase);

    if (authError || !user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const admin = getAdminClient();

    // Generate a crypto-random one-time token
    const rawToken = crypto.randomBytes(32).toString('hex');
    // Hash it before storing so the DB never holds the raw value
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString(); // 60s TTL

    // Store the hashed token in Supabase
    // Table: sso_bridge_tokens — created by supabase/migrations/20260819_sso_bridge_tokens.sql
    const { error: insertError } = await admin
      .from('sso_bridge_tokens')
      .insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used: false,
      });

    if (insertError) {
      console.error('[commander-sso] Failed to store SSO token:', insertError);
      return res.status(500).json({ error: 'Failed to create SSO token' });
    }

    // Return the Commander SSO URL with the raw (unhashed) token in the query string
    const commanderOrigin = process.env.NEXT_PUBLIC_COMMANDER_URL || 'https://commander.smarter.poker';
    const ssoUrl = `${commanderOrigin}/auth/sso?token=${rawToken}&uid=${user.id}`;

    return res.status(200).json({ url: ssoUrl, email: user.email });
  } catch (err) {
    console.error('[commander-sso] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
