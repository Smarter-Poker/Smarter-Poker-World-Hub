import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import crypto from 'crypto';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const MFA_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function signMfaToken(userId, issuedAt, secret) {
    const payload = `${userId}.${issuedAt}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${hmac}`;
}

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.auth)) return;
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        const user = authUser;
        if (authErr || !user) {
            return res.status(401).json({ error: 'Invalid session' });
        }

        // Check for trusted device cookie
        const cookieStr = req.headers.cookie || '';
        const match = cookieStr.match(/(?:^|;\s*)mfa_trusted_device=([^;]+)/);
        const trustedToken = match ? match[1] : null;

        if (!trustedToken) {
            return res.status(200).json({ trusted: false });
        }

        const secret =
            process.env.MFA_SESSION_SECRET ||
            process.env.SUPABASE_JWT_SECRET ||
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!secret) {
            return res.status(500).json({ error: 'MFA service not configured' });
        }

        const parts = trustedToken.split('.');
        if (parts.length !== 3) {
            return res.status(200).json({ trusted: false });
        }

        const [tokenId, tokenTime, tokenHmac] = parts;
        if (tokenId !== user.id) {
            return res.status(200).json({ trusted: false });
        }

        const expectedHmac = crypto.createHmac('sha256', secret).update(`${tokenId}.${tokenTime}`).digest('hex');
        if (tokenHmac !== expectedHmac) {
            return res.status(200).json({ trusted: false });
        }

        const issuedAtMs = parseInt(tokenTime, 10);
        if (isNaN(issuedAtMs)) {
            return res.status(200).json({ trusted: false });
        }

        // Must be less than 30 days old
        const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - issuedAtMs > TRUSTED_DEVICE_TTL_MS) {
            return res.status(200).json({ trusted: false, reason: 'expired' });
        }

        // It is trusted! Issue a fresh mfa_session cookie so the rest of the app works flawlessly.
        const issuedAt = Date.now();
        const mfaToken = signMfaToken(user.id, issuedAt, secret);

        res.setHeader(
            'Set-Cookie',
            `mfa_session=${mfaToken}; Path=/; Max-Age=${MFA_TOKEN_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`
        );

        return res.status(200).json({
            trusted: true,
            mfaVerifiedUntil: new Date(issuedAt + MFA_TOKEN_TTL_MS).toISOString()
        });
    } catch (err) {
        console.warn('[mfa/check-trusted] Error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
