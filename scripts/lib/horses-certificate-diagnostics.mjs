// Only fixed application endpoint names may appear in certificate diagnostics.
// This is a receipt privacy boundary, never permission to send a request.
const KNOWN_PATHS = new Set([
  '/api/horses/stable-admin',
  '/api/auth/ensure-profile',
  '/api/user/get-header-stats',
  '/api/pwa/prompt-status',
  '/api/rewards/eggs/evaluate',
]);

export function sanitizedMutationPath(requestUrl, productionOrigin) {
  return requestUrl.origin === productionOrigin && KNOWN_PATHS.has(requestUrl.pathname)
    ? requestUrl.pathname : '[redacted]';
}
