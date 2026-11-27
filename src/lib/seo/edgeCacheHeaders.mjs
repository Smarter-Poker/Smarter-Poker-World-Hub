/**
 * Shared Vercel Edge CDN cache helper for pure public SEO HTML routes that
 * use getServerSideProps solely for Markdown content negotiation or static
 * directory rendering without user/cookie personalization.
 *
 * Without an explicit Cache-Control header on the HTML branch, Next.js defaults
 * getServerSideProps responses to `private, no-cache, no-store, max-age=0`,
 * disabling Vercel Edge caching completely.
 *
 * Always preserves/appends `Vary: Accept` so HTML and `text/markdown` variants
 * never collide in CDN caches.
 */
export function setPublicSeoHtmlCache(
  res,
  { sMaxAge = 3600, staleWhileRevalidate = 86400, varyAccept = true } = {}
) {
  if (!res || typeof res.setHeader !== 'function') return;
  res.setHeader(
    'Cache-Control',
    `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`
  );
  if (varyAccept) {
    const existing = typeof res.getHeader === 'function' ? res.getHeader('Vary') : null;
    if (!existing) {
      res.setHeader('Vary', 'Accept');
    } else {
      const tokens = String(existing)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (!tokens.some((t) => t.toLowerCase() === 'accept')) {
        tokens.push('Accept');
        res.setHeader('Vary', tokens.join(', '));
      }
    }
  }
}
