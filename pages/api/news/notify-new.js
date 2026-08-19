/**
 * News Hub API - Push Notification for New Articles
 *
 * Pushes recently published poker_news articles to the users who opted in via
 * the News page toggle (profiles.news_preferences.pushNotifications — see
 * src/services/newsPreferences.js).
 *
 * POST (or GET, for schedulers that can only issue GET) /api/news/notify-new
 *   Auth   : Authorization: Bearer $CRON_SECRET  OR  x-admin-key: $ADMIN_API_KEY
 *   Query  : ?dryRun=1   report what WOULD be pushed, send nothing
 *            ?hours=24   how far back to look for new articles (1..168)
 *            ?limit=3    max articles pushed per invocation (1..10)
 *
 * DEDUPE — why a marker table:
 *   An article must never push twice, and this route can be invoked by a cron,
 *   by an operator, and by a retry of either, possibly concurrently. In-memory
 *   state does not survive a serverless cold start, so the marker has to live
 *   in the database. The simplest durable option that needs no change to
 *   poker_news is a dedicated one-row-per-article table whose PRIMARY KEY does
 *   the work: the INSERT is the lock. We claim the article BEFORE sending, so
 *   two concurrent runs cannot both win — the loser gets a 23505 unique
 *   violation and skips. If the send then fails, the marker is rolled back so
 *   the next run retries.
 *
 *   Required table (run once in Supabase):
 *     create table if not exists news_push_log (
 *       article_id uuid primary key references poker_news(id) on delete cascade,
 *       sent_at timestamptz not null default now(),
 *       recipient_count integer not null default 0
 *     );
 *     alter table news_push_log enable row level security;  -- service role only
 *
 *   If that table is missing, this route sends NOTHING and returns 503 rather
 *   than pushing undeduplicated notifications to real devices.
 *
 * SAFETY: credentials required in every environment (no NODE_ENV escape
 * hatch), hard recipient cap, chunked sends, and structured logging.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { sendPushNotification, getOneSignalStatus } from '../../../src/lib/commander/pushNotifications';

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
// pushes to real devices, so there is deliberately no NODE_ENV escape hatch.
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

const DEDUPE_TABLE = 'news_push_log';
const DEFAULT_SITE_URL = 'https://smarter.poker';

// Hard caps — the blast radius of one invocation.
const MAX_RECIPIENTS = 20000;      // refuse to fan out wider than this
const RECIPIENT_PAGE_SIZE = 1000;  // PostgREST returns at most 1000 rows/request
const PUSH_CHUNK_SIZE = 500;       // per sendPushNotification call
const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_ARTICLE_LIMIT = 3;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(event, fields) {
    // Structured, greppable, and free of PII — counts and ids only.
    try {
        console.log('[News Push]', JSON.stringify({ event, ...fields }));
    } catch (_e) {
        console.log('[News Push]', event);
    }
}

/** A missing table / column reads as "the dedupe store is not installed". */
function isMissingRelation(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === '42P01' ||
        code === 'PGRST205' ||
        code === 'PGRST204' ||
        message.includes('does not exist') ||
        message.includes('could not find the table') ||
        message.includes('schema cache')
    );
}

function isUniqueViolation(error) {
    return String(error?.code || '') === '23505';
}

/**
 * Is push actually wired up?
 * Trusts an explicit boolean from the shared commander module when it exposes
 * one; otherwise falls back to the env vars, so an unfamiliar status shape can
 * never disable a working install (or green-light a broken one).
 */
async function resolvePushConfig() {
    const envConfigured = Boolean(
        (process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) &&
            (process.env.ONESIGNAL_REST_API_KEY ||
                process.env.ONESIGNAL_API_KEY ||
                process.env.ONESIGNAL_REST_KEY)
    );

    let status = null;
    try {
        if (typeof getOneSignalStatus === 'function') {
            status = await getOneSignalStatus();
        }
    } catch (error) {
        console.warn('[News Push] getOneSignalStatus failed:', error?.message || error);
    }

    const reported =
        status && typeof status === 'object'
            ? [status.configured, status.isConfigured, status.enabled, status.ready].find(
                  (v) => typeof v === 'boolean'
              )
            : undefined;

    return {
        configured: typeof reported === 'boolean' ? reported : envConfigured,
        envConfigured,
        status: status && typeof status === 'object' ? status : null
    };
}

/**
 * Single adapter around the shared push helper.
 *
 * The implementation lives in the '@smarter-poker/commander-shared' workspace
 * package (src/lib/commander/pushNotifications.js is only a re-export shim), so
 * the payload below is deliberately generous: it carries both the singular and
 * plural audience keys and both body-text keys that helper signatures in this
 * codebase use. If the shared signature ever changes, THIS is the only call
 * site to update.
 */
async function dispatchPush(userIds, payload) {
    return sendPushNotification({
        userIds,
        externalUserIds: userIds,
        userId: userIds.length === 1 ? userIds[0] : undefined,
        title: payload.title,
        message: payload.message,
        body: payload.message,
        url: payload.url,
        data: payload.data
    });
}

export default async function handler(req, res) {
  // GET is accepted because scheduled cron invocations issue GET with the
  // CRON_SECRET bearer header; auth below is what gates the send.
  if (!['GET', 'POST'].includes(req.method)) {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
      log('unauthorized', { method: req.method });
      return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
      const dryRun = ['1', 'true', 'yes'].includes(String(safeQ(req.query.dryRun) || '').toLowerCase());
      const hours = clampInt(safeQ(req.query.hours), DEFAULT_WINDOW_HOURS, 1, 168);
      const articleLimit = clampInt(safeQ(req.query.limit), DEFAULT_ARTICLE_LIMIT, 1, 10);

      const pushConfig = await resolvePushConfig();
      if (!pushConfig.configured) {
          log('not_configured', { reason: 'VAPID keys missing' });
          return res.status(503).json({
              success: false,
              error: 'Push is not configured (VAPID keys missing). No notification was sent.'
          });
      }

      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      // ── Candidate articles ──────────────────────────────────────────────
      const { data: articleRows, error: articleError } = await getSupabase()
          .from('poker_news')
          .select('id, title, summary, excerpt, source_name, category, published_at')
          .eq('is_published', true)
          .gte('published_at', since)
          .order('published_at', { ascending: false })
          .limit(articleLimit);

      if (articleError) throw articleError;

      // Non-UUID ids would be placeholder rows; they can never be claimed by
      // the uuid-keyed marker table, so drop them here.
      const candidates = (articleRows || []).filter(
          (a) => a && typeof a.id === 'string' && UUID_RE.test(a.id) && a.title
      );

      if (candidates.length === 0) {
          log('skipped', { reason: 'no new articles', hours });
          return res.status(200).json({
              success: true,
              dryRun,
              pushed: 0,
              recipients: 0,
              articles: [],
              message: `No new published articles in the last ${hours} hour(s).`
          });
      }

      // ── Recipients: users who opted in ──────────────────────────────────
      // news_preferences is a JSONB column; ->> compares the value as text.
      const userIds = [];
      for (let offset = 0; offset < MAX_RECIPIENTS; offset += RECIPIENT_PAGE_SIZE) {
          const upper = Math.min(offset + RECIPIENT_PAGE_SIZE, MAX_RECIPIENTS) - 1;
          const { data: page, error: prefError } = await getSupabase()
              .from('profiles')
              .select('id')
              .eq('news_preferences->>pushNotifications', 'true')
              .order('id', { ascending: true })
              .range(offset, upper);

          if (prefError) throw prefError;
          if (!page || page.length === 0) break;

          for (const row of page) {
              if (row?.id) userIds.push(String(row.id));
          }

          if (page.length < RECIPIENT_PAGE_SIZE) break;
      }

      const recipients = userIds.length;

      // ── Dry run: report, claim nothing, send nothing ────────────────────
      if (dryRun) {
          const { data: alreadySent, error: logError } = await getSupabase()
              .from(DEDUPE_TABLE)
              .select('article_id')
              .in(
                  'article_id',
                  candidates.map((a) => a.id)
              );

          const dedupeStoreReady = !logError;
          const sentIds = new Set((alreadySent || []).map((r) => r.article_id));
          const pending = candidates.filter((a) => !sentIds.has(a.id));

          if (logError) {
              console.warn('[News Push] Dedupe store unreadable:', logError.message);
          }

          log('dry_run', {
              recipients,
              candidates: candidates.length,
              pending: pending.length,
              dedupeStoreReady,
              pushConfigured: pushConfig.configured
          });

          return res.status(200).json({
              success: true,
              dryRun: true,
              recipients,
              pushed: 0,
              pushConfigured: pushConfig.configured,
              dedupeStoreReady,
              articles: pending.map((a) => ({ id: a.id, title: a.title })),
              message: 'Dry run — no notification was sent.'
          });
      }

      if (recipients === 0) {
          // Nothing to send to. Do NOT claim the articles: leaving them
          // unclaimed means they still go out once someone opts in.
          log('skipped', { reason: 'no opted-in users', candidates: candidates.length });
          return res.status(200).json({
              success: true,
              dryRun: false,
              pushed: 0,
              recipients: 0,
              articles: [],
              message: 'No users have news push notifications enabled — nothing sent.'
          });
      }

      // ── Send ────────────────────────────────────────────────────────────
      const pushedArticles = [];
      const skipped = [];
      let failures = 0;

      for (const article of candidates) {
          // Claim first: the primary key INSERT is the dedupe lock.
          const { error: claimError } = await getSupabase()
              .from(DEDUPE_TABLE)
              .insert({ article_id: article.id, recipient_count: recipients });

          if (claimError) {
              if (isUniqueViolation(claimError)) {
                  skipped.push({ id: article.id, reason: 'already_sent' });
                  continue;
              }
              if (isMissingRelation(claimError)) {
                  // Without a durable marker we cannot promise "once", so we
                  // send nothing at all rather than risk duplicate pushes.
                  log('not_configured', {
                      reason: `${DEDUPE_TABLE} table missing`,
                      pushed: pushedArticles.length
                  });
                  return res.status(503).json({
                      success: false,
                      error: `Dedupe store '${DEDUPE_TABLE}' is missing; refusing to send undeduplicated push notifications. See the comment at the top of this file for the table definition.`,
                      pushed: pushedArticles.length,
                      articles: pushedArticles
                  });
              }
              throw claimError;
          }

          const payload = {
              title: article.source_name ? `Poker News: ${article.source_name}` : 'New Poker News',
              message: String(article.title).slice(0, 180),
              url: `${siteUrl}/hub/article?id=${encodeURIComponent(article.id)}`,
              data: { type: 'news_article', articleId: article.id, category: article.category || null }
          };

          let delivered = 0;
          let sendError = null;

          for (let i = 0; i < userIds.length; i += PUSH_CHUNK_SIZE) {
              const chunk = userIds.slice(i, i + PUSH_CHUNK_SIZE);
              try {
                  const result = await dispatchPush(chunk, payload);
                  if (result && result.success === false) {
                      throw new Error(result.error || 'Push provider reported failure');
                  }
                  delivered += chunk.length;
              } catch (error) {
                  sendError = error?.message || String(error);
                  break;
              }
          }

          if (sendError && delivered === 0) {
              // Roll the claim back so the next run can retry this article.
              const { error: rollbackError } = await getSupabase()
                  .from(DEDUPE_TABLE)
                  .delete()
                  .eq('article_id', article.id);
              if (rollbackError) {
                  console.warn('[News Push] Claim rollback failed:', rollbackError.message);
              }
              failures += 1;
              skipped.push({ id: article.id, reason: 'send_failed' });
              log('send_failed', { articleId: article.id, error: sendError, rolledBack: !rollbackError });
              continue;
          }

          // Partial delivery keeps its claim: re-sending would double-notify
          // everyone in the chunks that already succeeded.
          pushedArticles.push({ id: article.id, title: article.title, delivered, partial: Boolean(sendError) });
          log('pushed', { articleId: article.id, delivered, partial: Boolean(sendError) });
      }

      return res.status(200).json({
          success: failures === 0,
          dryRun: false,
          pushed: pushedArticles.length,
          recipients,
          articles: pushedArticles,
          skipped
      });
  } catch (error) {
      try { reportApiError(error, req); } catch (_e) { /* noop */ }
      console.warn('[News Push] Error:', error?.message || error);
      return res.status(500).json({ success: false, error: 'Push notification run failed' });
  }
}
