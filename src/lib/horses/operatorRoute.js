/**
 * The one wrapper every /horses API route is built on.
 *
 *   export default withOperatorRoute(
 *     {
 *       name: 'horses.stable-admin',
 *       methods: ['POST'],
 *       permission: PERMISSIONS.CONTENT_WRITE,        // or { GET: read, POST: write }
 *       limit: 'write',                                // LIMITS key, or { GET: 'read', POST: 'write' }
 *       durable: { max: 20, windowSeconds: 60 },       // optional DB-backed limiter (money, fleet)
 *     },
 *     async ({ req, res, op, db, body, query, requestId }) => {
 *       ...
 *       return { rows, total };                        // -> 200 { success: true, rows, total, requestId }
 *     }
 *   );
 *
 * Guarantees, in order:
 *   1. Method allowlist (405 with Allow header).
 *   2. In-memory dual-bucket rate limit (token + IP), per LIMITS.
 *   3. Operator auth: local JWT verify, service-role client that refuses to
 *      exist without SUPABASE_SERVICE_ROLE_KEY, role -> permission check.
 *   4. Optional durable rate limit keyed on the operator id, for the routes
 *      where "per lambda instance" is not good enough (mint, fleet).
 *   5. Handler runs; a returned object is sent as the success envelope; an
 *      ApiError becomes its status with its safe message; anything else is a
 *      500 with the raw error logged under the request id and NEVER echoed.
 *
 * Dependency injection (`deps`) exists for unit tests only.
 */
import { requireOperator } from './operatorAuth.js';
import { requestIdOf, scrubError, sendFail, sendOk } from './apiEnvelope.js';

async function defaultDeps() {
  const rl = await import('../apiRateLimit.js');
  let reportApiError = () => {};
  try {
    const sentry = await import('../sentryWrap.js');
    if (typeof sentry.reportApiError === 'function') reportApiError = sentry.reportApiError;
  } catch {
    /* sentry is optional in tests */
  }
  return {
    applyRateLimit: rl.applyRateLimit,
    applyDurableRateLimit: rl.applyDurableRateLimit,
    LIMITS: rl.LIMITS,
    reportApiError,
    requireOperator,
  };
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** A per-method map is an object keyed by HTTP method; anything else applies to every method. */
function pickForMethod(value, method) {
  if (value && typeof value === 'object' && !Array.isArray(value) && HTTP_METHODS.some((m) => m in value)) {
    return value[method];
  }
  return value;
}

export function withOperatorRoute(spec, handler, deps) {
  if (!spec || typeof handler !== 'function') throw new Error('withOperatorRoute(spec, handler)');
  const methods = (spec.methods || ['GET']).map((m) => m.toUpperCase());
  const name = spec.name || 'horses.route';

  return async function operatorRoute(req, res) {
    const requestId = requestIdOf(req);
    const method = String(req.method || 'GET').toUpperCase();
    const d = deps || (await defaultDeps());

    if (!methods.includes(method)) {
      res.setHeader('Allow', methods.join(', '));
      return sendFail(res, 405, 'Method Not Allowed', 'method_not_allowed', requestId);
    }

    const limitKey = pickForMethod(spec.limit, method) || (method === 'GET' ? 'read' : 'write');
    const limitCfg = d.LIMITS?.[limitKey] || d.LIMITS?.default;
    if (limitCfg && !d.applyRateLimit(req, res, limitCfg)) return undefined;

    const permission = pickForMethod(spec.permission, method);
    const op = await d.requireOperator(req, res, { permission, deps: spec.authDeps });
    if (!op) return undefined;

    const durable = pickForMethod(spec.durable, method);
    if (durable) {
      const okDurable = await d.applyDurableRateLimit(op.db, res, {
        key: `${name}:${method}:${op.user.id}`,
        max: durable.max,
        windowSeconds: durable.windowSeconds,
      });
      if (!okDurable) return undefined;
    }

    try {
      const payload = await handler({
        req,
        res,
        op,
        db: op.db,
        requestId: op.requestId || requestId,
        method,
        query: req.query || {},
        body: req.body && typeof req.body === 'object' ? req.body : {},
      });
      if (res.headersSent || res.writableEnded) return undefined;
      if (payload === undefined) return sendOk(res, {}, requestId);
      return sendOk(res, payload, requestId);
    } catch (err) {
      const scrubbed = scrubError(err);
      if (scrubbed.status >= 500) {
        console.error(`[${name}] ${requestId}:`, err?.message || err, err?.stack ? '\n' + err.stack : '');
        try {
          d.reportApiError(err, req, { userId: op.user.id, tags: { route: name, requestId } });
        } catch {
          /* never let error reporting break the response */
        }
      }
      if (res.headersSent || res.writableEnded) return undefined;
      return sendFail(res, scrubbed.status, scrubbed.message, scrubbed.code, requestId);
    }
  };
}
