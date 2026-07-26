/**
 * News Hub API - Weekly Email Digest
 *
 * Sends the recent poker_news headlines to the active newsletter subscribers.
 *
 * POST (or GET, for schedulers that can only issue GET) /api/news/digest
 *   Auth   : Authorization: Bearer $CRON_SECRET  OR  x-admin-key: $ADMIN_API_KEY
 *   Query  : ?dryRun=1   count recipients + render the subject, send nothing
 *            ?days=7     look-back window for articles (1..30)
 *            ?limit=8    headlines per email (1..20)
 *
 * SAFETY (this endpoint has a real, irreversible side effect):
 *   - Credentials are required in EVERY environment. There is no NODE_ENV
 *     escape hatch, so a preview deploy can never mail the real list.
 *   - Recipients come only from rows this route read back and re-validated;
 *     an address that fails EMAIL_RE is dropped rather than sent to.
 *   - MAX_RECIPIENTS / SEND_BATCH_SIZE are hard ceilings on blast radius.
 *   - Nothing is sent when there are no articles — no empty digests.
 *   - Every email carries a working unsubscribe link (CAN-SPAM).
 *
 * NOTE ON THE TABLE NAME: the shared contract called this list
 * 'news_subscribers', but pages/api/news/subscribe.js — the only writer —
 * actually writes 'newsletter_subscribers' (columns: id, email, source,
 * is_active, unsubscribed_at). This route reads the real table; inventing
 * a second one would have made the digest silently mail nobody.
 */
import crypto from 'crypto';
import { Resend } from 'resend';
import { createClient } from '../../../src/lib/supabaseServerClient';
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

// Admin/maintenance guard: CRON_SECRET bearer (cron jobs) or x-admin-key
// (operators). Credentials are required in EVERY environment — this route
// sends real email, so there is deliberately no NODE_ENV escape hatch.
function isAuthorized(req) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) return true;
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && req.headers['x-admin-key'] === adminKey) return true;
    return false;
}

function clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

const safeQ = (v) => (Array.isArray(v) ? String(v[0]) : v == null ? v : String(v));

// Practical email shape check — identical to subscribe.js.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

// Used only when NEWS_DIGEST_FROM is unset. Clearly named so an operator can
// grep for it if digests start bouncing from an unverified domain.
const DEFAULT_DIGEST_FROM = 'Smarter.Poker News <news@smarter.poker>';
const DEFAULT_SITE_URL = 'https://smarter.poker';

// Hard caps — the blast radius of one invocation.
const MAX_RECIPIENTS = 5000;     // refuse to mail a list larger than this
const RECIPIENT_PAGE_SIZE = 1000; // PostgREST returns at most 1000 rows/request
const SEND_BATCH_SIZE = 100;      // Resend's batch endpoint limit

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_ARTICLE_COUNT = 8;

function log(event, fields) {
    // Structured, greppable, and free of PII — counts only, never addresses.
    try {
        console.log('[News Digest]', JSON.stringify({ event, ...fields }));
    } catch (_e) {
        console.log('[News Digest]', event);
    }
}

// ── Unsubscribe tokens ──────────────────────────────────────────────────────
// Verified by pages/api/news/subscribe.js. The two helpers are intentionally
// duplicated there rather than shared through src/lib — an unsubscribe secret
// must never be reachable from anything a page can import, and pages/api/** is
// the only place these files are ever loaded. Keep the two copies identical.
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
 * Mint a signed, stateless unsubscribe token for an address.
 * Falls back to the bare email when no secret is configured — subscribe.js
 * accepts both forms, so the link keeps working either way.
 */
function makeUnsubscribeToken(email) {
    const secret = unsubscribeSecret();
    const normalized = String(email).trim().toLowerCase();
    if (!secret) return normalized;
    const payload = b64url(Buffer.from(normalized, 'utf8'));
    const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
    return `${payload}.${sig}`;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function truncate(value, max) {
    const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function articleUrl(siteUrl, article) {
    return `${siteUrl}/hub/article?id=${encodeURIComponent(article.id)}`;
}

/** Subject line is derived from the real lead headline — never a placeholder. */
function renderSubject(articles) {
    const lead = truncate(articles[0]?.title || '', 70);
    const others = articles.length - 1;
    if (!lead) return 'Your Smarter.Poker news digest';
    return others > 0
        ? `${lead} (+${others} more) - Smarter.Poker`
        : `${lead} - Smarter.Poker`;
}

function renderHtml(articles, siteUrl, unsubscribeUrl) {
    const items = articles
        .map((a) => {
            const title = escapeHtml(a.title || 'Untitled');
            const blurb = escapeHtml(truncate(a.summary || a.excerpt || a.content || '', 180));
            const source = escapeHtml(a.source_name || 'Smarter.Poker');
            const href = escapeHtml(articleUrl(siteUrl, a));
            return `<tr><td style="padding:0 0 22px">
<a href="${href}" style="color:#5ef5f0;font-size:17px;font-weight:600;text-decoration:none">${title}</a>
<div style="color:#7f93a8;font-size:12px;margin:4px 0 6px">${source}</div>
${blurb ? `<div style="color:#b9c9d8;font-size:14px;line-height:1.5">${blurb}</div>` : ''}
</td></tr>`;
        })
        .join('\n');

    const unsub = escapeHtml(unsubscribeUrl);
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;background:#0a0e17;color:#e6f7ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e17">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 0 24px">
<div style="font-size:20px;font-weight:700">Smarter.Poker News</div>
<div style="color:#7f93a8;font-size:13px;margin-top:4px">This week in poker</div>
</td></tr>
${items}
<tr><td style="padding:8px 0 0;border-top:1px solid #1c2734">
<div style="color:#7f93a8;font-size:12px;line-height:1.6;padding-top:16px">
You are receiving this because you subscribed to the Smarter.Poker news digest.<br />
<a href="${unsub}" style="color:#7f93a8">Unsubscribe</a> &middot;
<a href="${escapeHtml(siteUrl)}/hub/news" style="color:#7f93a8">Read the News Hub</a>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function renderText(articles, siteUrl, unsubscribeUrl) {
    const lines = articles.map(
        (a) => `- ${truncate(a.title || 'Untitled', 120)}\n  ${articleUrl(siteUrl, a)}`
    );
    return [
        'Smarter.Poker News - this week in poker',
        '',
        ...lines,
        '',
        `Unsubscribe: ${unsubscribeUrl}`
    ].join('\n');
}

/**
 * Send one Resend batch.
 * Retries once without the optional List-Unsubscribe headers, because some
 * Resend API versions reject unknown per-message fields in batch mode and we
 * would rather ship the digest than lose it over a deliverability nicety.
 */
async function sendBatch(resend, messages) {
    const attempt = async (payload) => {
        const result = await resend.batch.send(payload);
        if (result?.error) throw new Error(result.error.message || 'Resend batch error');
        return result;
    };

    try {
        await attempt(messages);
        return { sent: messages.length, failed: 0, error: null };
    } catch (error) {
        try {
            await attempt(messages.map(({ headers, ...rest }) => rest));
            return { sent: messages.length, failed: 0, error: null };
        } catch (retryError) {
            return {
                sent: 0,
                failed: messages.length,
                error: retryError?.message || String(retryError)
            };
        }
    }
}

export default async function handler(req, res) {
  // GET is accepted because Vercel Cron (and GitHub Actions curl) issue GET
  // with the CRON_SECRET bearer header; auth below is what gates the send.
  if (!['GET', 'POST'].includes(req.method)) {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
      log('unauthorized', { method: req.method });
      return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
      const dryRun = ['1', 'true', 'yes'].includes(String(safeQ(req.query.dryRun) || '').toLowerCase());
      const days = clampInt(safeQ(req.query.days), DEFAULT_WINDOW_DAYS, 1, 30);
      const articleLimit = clampInt(safeQ(req.query.limit), DEFAULT_ARTICLE_COUNT, 1, 20);

      const apiKey = process.env.RESEND_API_KEY;
      // A dry run touches no mail provider, so it is allowed to answer even
      // without a key (that is how you verify the recipient count on a machine
      // that has no secrets); the response flags emailConfigured: false so the
      // caller cannot mistake it for a working send path.
      if (!apiKey && !dryRun) {
          // Degrade gracefully: no crash, no partial send, and the key itself
          // is never echoed back.
          log('not_configured', { reason: 'RESEND_API_KEY missing' });
          return res.status(503).json({
              success: false,
              error: 'Email is not configured (RESEND_API_KEY is not set). No digest was sent.'
          });
      }

      const from = process.env.NEWS_DIGEST_FROM || DEFAULT_DIGEST_FROM;
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // ── Articles ────────────────────────────────────────────────────────
      const { data: articleRows, error: articleError } = await getSupabase()
          .from('poker_news')
          .select('id, title, summary, excerpt, content, source_name, source_url, category, published_at')
          .eq('is_published', true)
          .gte('published_at', since)
          .order('published_at', { ascending: false })
          .limit(articleLimit);

      if (articleError) throw articleError;

      const articles = (articleRows || []).filter((a) => a && a.id && a.title);

      if (articles.length === 0) {
          // Never mail an empty or padded digest. Real data or nothing.
          log('skipped', { reason: 'no articles in window', days });
          return res.status(200).json({
              success: true,
              dryRun,
              sent: 0,
              recipients: 0,
              articles: 0,
              subject: null,
              message: `No published articles in the last ${days} day(s) — nothing sent.`
          });
      }

      const subject = renderSubject(articles);

      // ── Recipients ──────────────────────────────────────────────────────
      // Paged read: PostgREST caps a response at 1000 rows, so a single
      // select would silently truncate a larger list.
      const emails = [];
      const seen = new Set();
      let dropped = 0;

      for (let offset = 0; offset < MAX_RECIPIENTS; offset += RECIPIENT_PAGE_SIZE) {
          const upper = Math.min(offset + RECIPIENT_PAGE_SIZE, MAX_RECIPIENTS) - 1;
          const { data: page, error: subError } = await getSupabase()
              .from('newsletter_subscribers')
              .select('id, email, is_active')
              // Rows inserted by subscribe.js rely on the column default, which
              // can leave is_active NULL — treat NULL as active, and only
              // exclude an explicit false.
              .or('is_active.is.null,is_active.eq.true')
              .order('id', { ascending: true })
              .range(offset, upper);

          if (subError) throw subError;
          if (!page || page.length === 0) break;

          for (const row of page) {
              const email = typeof row?.email === 'string' ? row.email.trim().toLowerCase() : '';
              // Re-validate every address we read back. A malformed row must
              // never reach the mail provider.
              if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
                  dropped += 1;
                  continue;
              }
              if (seen.has(email)) continue;
              seen.add(email);
              emails.push(email);
          }

          if (page.length < RECIPIENT_PAGE_SIZE) break;
      }

      const recipients = emails.length;

      if (dryRun) {
          log('dry_run', { recipients, articles: articles.length, dropped, days });
          return res.status(200).json({
              success: true,
              dryRun: true,
              recipients,
              subject,
              articles: articles.length,
              droppedInvalid: dropped,
              from,
              emailConfigured: Boolean(apiKey),
              sent: 0,
              message: 'Dry run — no email was sent.'
          });
      }

      if (recipients === 0) {
          log('skipped', { reason: 'no active subscribers', dropped });
          return res.status(200).json({
              success: true,
              dryRun: false,
              sent: 0,
              recipients: 0,
              articles: articles.length,
              subject,
              message: 'No active subscribers — nothing sent.'
          });
      }

      // ── Send ────────────────────────────────────────────────────────────
      const resend = new Resend(apiKey);
      let sent = 0;
      let failed = 0;
      const errors = [];

      for (let i = 0; i < emails.length; i += SEND_BATCH_SIZE) {
          const chunk = emails.slice(i, i + SEND_BATCH_SIZE);
          const messages = chunk.map((email) => {
              const unsubscribeUrl =
                  `${siteUrl}/api/news/subscribe?unsubscribe=${encodeURIComponent(makeUnsubscribeToken(email))}`;
              return {
                  from,
                  to: [email],
                  subject,
                  html: renderHtml(articles, siteUrl, unsubscribeUrl),
                  text: renderText(articles, siteUrl, unsubscribeUrl),
                  headers: {
                      'List-Unsubscribe': `<${unsubscribeUrl}>`,
                      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                  }
              };
          });

          const result = await sendBatch(resend, messages);
          sent += result.sent;
          failed += result.failed;
          if (result.error && errors.length < 5) errors.push(result.error);
      }

      log('sent', { sent, failed, recipients, articles: articles.length, dropped });

      return res.status(200).json({
          success: failed === 0,
          dryRun: false,
          sent,
          failed,
          recipients,
          articles: articles.length,
          droppedInvalid: dropped,
          subject,
          errors: errors.length ? errors : undefined
      });
  } catch (error) {
      try { reportApiError(error, req); } catch (_e) { /* noop */ }
      console.warn('[News Digest] Error:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Digest failed' });
  }
}
