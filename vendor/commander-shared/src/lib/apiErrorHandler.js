/** Local API diagnostics and error responses. No external reporting transport. */
// The second argument is either the Next.js request or a diagnostics context
// such as { route: '/api/cron/marketplace-health' }. 73 call sites pass the
// context form; reading only req.url logged every one of them as
// route 'unknown', so unrelated failures shared one error group.
function routeOf(req) {
  if (typeof req?.url === 'string') return req.url.split('?')[0];
  if (typeof req?.route === 'string' && req.route.startsWith('/')) {
    return req.route.split('?')[0].slice(0, 200);
  }
  return 'unknown';
}

/** Logs only the error summary and route, never headers, body or user context. */
export function reportApiError(error, req) {
  try {
    console.error('[API Error]', {
      route: routeOf(req),
      method: req?.method || 'unknown',
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error',
    });
  } catch { /* A broken console must not change the API response. */ }
}

/** Preserves handler results, safe production errors and already-sent responses. */
export function withApiErrorHandler(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      reportApiError(error, req);
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : error?.message || 'Internal server error',
        });
      }
      return undefined;
    }
  };
}

export default { reportApiError, withApiErrorHandler };
