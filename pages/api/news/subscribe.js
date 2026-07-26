/**
 * Newsletter Subscription API
 */
import crypto from 'crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Practical email shape check (single @, no whitespace, dot in domain)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

// One generic message for every success path so responses cannot be used to
// enumerate who is already on the subscriber list.
const GENERIC_SUCCESS = 'Successfully subscribed!';

// Same generic-response rationale as GENERIC_SUCCESS: an unsubscribe link that
// answered "that address isn't on the list" would be an enumeration oracle.
const GENERIC_UNSUBSCRIBED = 'You have been unsubscribed from the Smarter.Poker news digest.';

// ── Unsubscribe tokens ──────────────────────────────────────────────────────
// CAN-SPAM requires a working unsubscribe link in every digest email. The
// digest (pages/api/news/digest.js) mints these tokens; this route verifies
// them. The two helpers below are intentionally duplicated in digest.js rather
// than shared through src/lib — an unsubscribe secret must never be reachable
// from anything a page can import, and pages/api/** is the only place these
// files are ever loaded. Keep the two copies byte-identical.
//
// Token = base64url(email) + '.' + base64url(HMAC-SHA256(payload, secret)).
// It is stateless, so no schema change is needed to ship the link.
const UNSUB_SIG_LENGTH = 43; // base64url of a 32-byte HMAC, unpadded

function unsubscribeSecret() {
    return (
        process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
        process.env.CRON_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        ''
    );
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify a signed unsubscribe token.
 * @returns {string|null} the normalized email, or null if the token is
 *   malformed / unsigned / tampered with.
 */
function verifyUnsubscribeToken(token) {
    const secret = unsubscribeSecret();
    if (!secret || typeof token !== 'string') return null;

    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;

    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (sig.length !== UNSUB_SIG_LENGTH) return null;

    const expected = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    // timingSafeEqual throws on a length mismatch, and a multi-byte character
    // in `sig` can make the byte lengths differ despite equal string lengths.
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    let email;
    try {
        email = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } catch (_e) {
        return null;
    }

    email = email.trim().toLowerCase();
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) return null;
    return email;
}

/**
 * Resolve the ?unsubscribe= value to an email address.
 * Accepts a signed token (preferred) or a bare email address — the contract
 * allows both, and a bare address is the standard fallback for forwarded mail.
 * Unsubscribing is the safe direction of a false positive, so a bare address
 * is accepted, but it is logged and rate limited like a write.
 */
function resolveUnsubscribeTarget(raw) {
    const value = String(raw).trim();
    if (!value || value.length > 2048) return null;

    const fromToken = verifyUnsubscribeToken(value);
    if (fromToken) return { email: fromToken, verified: true };

    const email = value.toLowerCase();
    if (email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email)) {
        return { email, verified: false };
    }
    return null;
}

// Minimal confirmation page for the browser click-through. No user input is
// interpolated, so there is nothing here to escape.
function unsubscribeHtml(message) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Unsubscribed - Smarter.Poker</title>
</head>
<body style="margin:0;background:#0a0e17;color:#e6f7ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center">
<h1 style="font-size:22px;margin:0 0 12px">Smarter.Poker News</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 28px;color:#9fb3c8">${message}</p>
<a href="/hub/news" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#5ef5f0;color:#0a0e17;text-decoration:none;font-weight:600">Back to the News Hub</a>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      // /api/news/subscribe?unsubscribe=<token-or-email>
      // One-click unsubscribe target for the link every digest email carries.
      // GET handles the human clicking the link; POST is required because the
      // digest also sets 'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
      // which makes mail providers POST to this same URL. A POST without
      // ?unsubscribe= is still an ordinary subscribe, exactly as before, and a
      // plain GET with no ?unsubscribe= still 405s exactly as before.
      const rawUnsub = Array.isArray(req.query?.unsubscribe)
          ? req.query.unsubscribe[0]
          : req.query?.unsubscribe;

      if (['GET', 'POST'].includes(req.method) && typeof rawUnsub === 'string' && rawUnsub) {
          // This GET mutates, so it is rate limited like a write. POST already
          // went through the limiter above — don't charge it twice.
          if (req.method === 'GET' && !applyRateLimit(req, res, LIMITS.write)) return;

          const wantsJson =
              String(req.query.format || '') === 'json' ||
              String(req.headers.accept || '').includes('application/json');

          const respond = (status, ok, message) => {
              if (wantsJson) {
                  return res
                      .status(status)
                      .json(ok ? { success: true, message } : { success: false, error: message });
              }
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              return res.status(status).send(unsubscribeHtml(message));
          };

          const target = resolveUnsubscribeTarget(rawUnsub);
          if (!target) {
              return respond(400, false, 'That unsubscribe link is not valid or has expired.');
          }

          try {
              const { error } = await getSupabase()
                  .from('newsletter_subscribers')
                  .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
                  .eq('email', target.email);

              if (error) {
                  console.warn('[Newsletter] Unsubscribe failed:', error.message);
                  return respond(500, false, 'We could not process that request. Please try again.');
              }
          } catch (error) {
              try { reportApiError(error, req); } catch (_e) { /* noop */ }
              console.warn('[Newsletter] Unsubscribe exception:', error?.message || error);
              return respond(500, false, 'We could not process that request. Please try again.');
          }

          console.log(
              '[Newsletter] unsubscribe',
              JSON.stringify({ verified: target.verified, at: new Date().toISOString() })
          );

          // Deliberately generic: never confirm whether the address was on the
          // list (see GENERIC_SUCCESS).
          return respond(200, true, GENERIC_UNSUBSCRIBED);
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const { email, source } = req.body || {};

          if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email.trim())) {
              return res.status(400).json({ success: false, error: 'Valid email required' });
          }
          const normalizedEmail = email.trim().toLowerCase();

          // Sanitize untrusted source tag: short slug or the default
          const safeSource = (typeof source === 'string' && /^[a-z0-9_-]{1,50}$/i.test(source))
              ? source
              : 'news_hub';

          // Check if already subscribed
          const { data: existing } = await getSupabase()
              .from('newsletter_subscribers')
              .select('id, is_active')
              .eq('email', normalizedEmail)
              .maybeSingle();

          if (existing) {
              if (!existing.is_active) {
                  // Reactivate subscription
                  const { error: reactivateError } = await getSupabase()
                    .from('newsletter_subscribers')
                    .update({ is_active: true, unsubscribed_at: null })
                      .eq('id', existing.id);
                  if (reactivateError) {
                      // BUG FIX: previously logged and still reported success
                      console.warn('[Newsletter] Reactivation failed:', reactivateError.message);
                      return res.status(500).json({ success: false, error: 'Subscription failed' });
                  }
              }
              return res.status(200).json({ success: true, message: GENERIC_SUCCESS });
          }

          // New subscription
          const { error } = await getSupabase()
              .from('newsletter_subscribers')
              .insert({ email: normalizedEmail, source: safeSource });

          if (error) throw error;

          return res.status(200).json({ success: true, message: GENERIC_SUCCESS });
      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('Newsletter subscription error:', error);
          return res.status(500).json({ success: false, error: 'Subscription failed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
