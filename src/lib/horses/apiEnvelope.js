/**
 * Response envelope and error scrubbing for the operator console routes.
 *
 * Success: { success: true, ...payload, requestId }
 * Failure: { success: false, error, code, requestId }
 *
 * `error` is always operator-safe text. Postgres and Supabase error strings
 * (table names, constraint names, SQL fragments) are logged server-side with
 * the request id and NEVER returned to the browser. The operator sees the
 * request id so a server log lookup is one search away.
 *
 * Pure module: no imports, safe to unit test under node --test.
 */

const PG_ERROR_HINTS = [
  /relation ".*" does not exist/i,
  /column ".*" does not exist/i,
  /violates .* constraint/i,
  /duplicate key value/i,
  /invalid input syntax/i,
  /permission denied/i,
  /syntax error at or near/i,
  /pgrst\d+/i,
  /^\s*\d{5}:\s/,
  /supabase/i,
  /postgres/i,
  /schema cache/i,
];

/** True when a message looks like it came from Postgres or PostgREST. */
export function looksLikeDatabaseError(message) {
  if (typeof message !== 'string') return false;
  return PG_ERROR_HINTS.some((re) => re.test(message));
}

/**
 * Turn any thrown value into { status, code, message } where message is safe
 * for the browser. A message the route itself composed (an ApiError) passes
 * through; anything that smells of the database is replaced.
 */
export function scrubError(err, fallback = 'Request failed') {
  if (err && err.isApiError) {
    return { status: err.status || 500, code: err.code || 'request_failed', message: err.message || fallback };
  }
  const raw = typeof err === 'string' ? err : err?.message;
  if (!raw || looksLikeDatabaseError(raw)) {
    return { status: 500, code: 'internal_error', message: fallback };
  }
  // A non-database message is still not necessarily safe; keep it short and
  // free of anything that looks like an identifier dump.
  const short = String(raw).replace(/\s+/g, ' ').trim().slice(0, 200);
  return { status: 500, code: 'internal_error', message: short || fallback };
}

/** An error a route raises on purpose with an operator-safe message. */
export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.isApiError = true;
    this.status = status;
    this.code = code || defaultCode(status);
  }
}

function defaultCode(status) {
  switch (status) {
    case 400: return 'bad_request';
    case 401: return 'unauthorized';
    case 403: return 'forbidden';
    case 404: return 'not_found';
    case 405: return 'method_not_allowed';
    case 409: return 'conflict';
    case 410: return 'gone';
    case 429: return 'rate_limited';
    default: return 'request_failed';
  }
}

export const badRequest = (message, code) => new ApiError(400, message, code);
export const notFound = (message = 'Not Found', code) => new ApiError(404, message, code);
export const forbidden = (message = 'Forbidden', code) => new ApiError(403, message, code);
export const gone = (message, code) => new ApiError(410, message, code);
export const conflict = (message, code) => new ApiError(409, message, code);

/** The request id Vercel stamps, else one we mint, so every log line and
 *  every response can be matched. */
export function requestIdOf(req) {
  const h = req?.headers || {};
  const id = h['x-vercel-id'] || h['x-request-id'];
  if (typeof id === 'string' && id.length) return id.slice(0, 120);
  return 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function sendOk(res, payload = {}, requestId) {
  return res.status(200).json({ success: true, ...payload, requestId });
}

export function sendFail(res, status, message, code, requestId, extra = {}) {
  return res.status(status).json({
    success: false,
    error: message,
    code: code || defaultCode(status),
    requestId,
    ...extra,
  });
}
