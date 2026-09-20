/**
 * The Home Games moderation routes' wrapper.
 *
 *   export default withHgOperatorRoute(spec, handle);
 *
 * It is withOperatorRoute plus one thing: `userDb`, a client that speaks AS THE
 * CALLER rather than as the service role.
 *
 * WHY BOTH CLIENTS EXIST. The Home Games moderation RPCs open with
 *
 *     IF auth.uid() IS NULL OR auth.uid() <> p_caller_user_id THEN
 *       RAISE EXCEPTION 'UNAUTHORIZED';
 *
 * They are SECURITY DEFINER, so they do their own role check and do not need
 * the service role to read the tables, but they DO need auth.uid() to resolve.
 * Under the service-role key auth.uid() is NULL, so calling them with the
 * console's admin client raised UNAUTHORIZED every time and the whole Home
 * Games moderation page was non-functional. Passing the caller's JWT as the
 * Authorization header makes auth.uid() resolve to the operator who is actually
 * clicking the button, which is also the identity the functions attribute the
 * action to.
 *
 * So: `userDb` runs the RPCs, `db` (the service-role client from the wrapper)
 * writes the audit row, and the audit write never depends on the caller's own
 * grants.
 *
 * WHY THE CACHE. Before Phase 1 each of the four hg-* routes constructed a
 * brand new Supabase client on EVERY request. Clients are keyed by token here,
 * capped at MAX_TOKEN_CLIENTS with oldest-first eviction, and expire after
 * TOKEN_CLIENT_TTL_MS so a revoked session cannot keep a warm client alive for
 * longer than the window.
 */
import { withOperatorRoute } from './operatorRoute.js';
import { ApiError } from './apiEnvelope.js';
import { mapDbError } from './dbErrors.js';

export const MAX_TOKEN_CLIENTS = 200;
export const TOKEN_CLIENT_TTL_MS = 10 * 60 * 1000;

/** token -> { client, expiresAt }. Insertion order is eviction order. */
const clientCache = new Map();

/** A live cached client for this token, or null. Expired entries are dropped. */
export function cacheLookup(token, now = Date.now()) {
  const hit = clientCache.get(token);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    clientCache.delete(token);
    return null;
  }
  return hit.client;
}

/** Cache a client, evicting the oldest entry when the cap is reached. */
export function cacheStore(token, client, now = Date.now()) {
  clientCache.delete(token);
  while (clientCache.size >= MAX_TOKEN_CLIENTS) {
    const oldest = clientCache.keys().next().value;
    if (oldest === undefined) break;
    clientCache.delete(oldest);
  }
  clientCache.set(token, { client, expiresAt: now + TOKEN_CLIENT_TTL_MS });
  return client;
}

export function cacheSize() {
  return clientCache.size;
}

/** Test seam only. */
export function _resetHgClientCacheForTests() {
  clientCache.clear();
}

export function bearerTokenOf(req) {
  const header = req?.headers?.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length >= 20 ? token : null;
}

async function defaultCreateClient() {
  const mod = await import('../supabaseServerClient.js');
  return mod.createClient;
}

/**
 * The caller-scoped client for this token. `deps.createClient` is a test seam;
 * production callers never pass it.
 */
export async function getUserDb(token, deps = {}) {
  if (!token) {
    throw new ApiError(401, 'Authorization Required', 'unauthorized');
  }
  const cached = cacheLookup(token);
  if (cached) return cached;

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    console.error('[hgOperator] the anon key is missing; caller-scoped RPCs cannot run');
    throw new ApiError(
      503,
      'Home Games Moderation Is Not Configured On This Server',
      'anon_key_missing'
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
  const createClient = deps.createClient || (await defaultCreateClient());
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false },
  });
  return cacheStore(token, client);
}

/**
 * The one mapping for a failed caller-scoped RPC (re-verification L-6).
 *
 * The Home Games RPCs raise UNAUTHORIZED (SQLSTATE 42501) when auth.uid() does
 * not satisfy their own role check, and PostgREST answers PGRST301 / "JWT
 * expired" when the caller's token has lapsed. Four routes used to collapse
 * whose session had simply expired, or whom the RPC does not accept (any
 * granted non-legacy operator until those functions learn about grants), read
 * as an outage. Now:
 *
 *   42501 / UNAUTHORIZED / FORBIDDEN  -> 403 forbidden
 *   PGRST301 / JWT expired / invalid  -> 401 session_expired
 *   anything else                     -> mapDbError (409/400/403/404/503)
 *
 * `subject` is the Title Case thing the sentence is about ("The Appeal").
 * The raw database sentence is logged by mapDbError under the request id and
 * never returned.
 */
export function mapHgRpcError(error, subject = 'The Request', { requestId, route } = {}) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = [error?.message, error?.details, error?.hint].filter(Boolean).join(' | ');
  if (code === 'PGRST301' || /jwt (expired|invalid|malformed)|invalid jwt|token is expired/i.test(message)) {
    console.warn(`[hgOperator] ${route || ''} ${requestId || ''} caller session refused: ${message}`.trim());
    return new ApiError(401, 'Your Session Has Expired. Sign In Again', 'session_expired');
  }
  if (code === '42501' || /unauthorized|forbidden/i.test(message)) {
    console.warn(`[hgOperator] ${route || ''} ${requestId || ''} rpc refused the caller: ${message}`.trim());
    return new ApiError(403, `You Are Not Authorized To Act On ${subject}`, 'forbidden');
  }
  return mapDbError(error, subject, { requestId, route });
}

/**
 * withOperatorRoute, plus `userDb` and `callerToken` on the handler context.
 */
export function withHgOperatorRoute(spec, handler, deps) {
  if (!spec || typeof handler !== 'function') throw new Error('withHgOperatorRoute(spec, handler)');
  return withOperatorRoute(
    spec,
    async (ctx) => {
      const callerToken = bearerTokenOf(ctx.req);
      const userDb = await getUserDb(callerToken, spec.hgDeps || {});
      return handler({ ...ctx, userDb, callerToken });
    },
    deps
  );
}
