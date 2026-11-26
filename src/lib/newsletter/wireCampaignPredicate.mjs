/**
 * Pure, zero-dependency Weekly Wire campaign classifier.
 *
 * Safe for both Node.js and browser Webpack bundles (zero `node:*` or `sharp`
 * imports), shared across `weeklyWireEngine.mjs`, `sitemapBuilders.mjs`,
 * `wireRssBuilder.mjs`, `/hub/wire`, and `/hub/wire/[edition]`.
 *
 * Excludes `[PROMO EMAIL+SMS]`, `[Promo]`, `[Lifecycle]`, `[SMS]`, and `[TEST]`
 * audit rows (case-insensitively) AND requires at least one recorded item UUID in
 * `article_ids` so empty promotional broadcasts can never hijack edition numbers
 * or render blank web archive issues.
 */
export function isWeeklyWireDigestCampaign(row) {
    if (!row || typeof row !== 'object') return false;
    const subj = String(row.subject || '').trim();
    if (!subj) return false;
    if (/^\[(?:promo|lifecycle|sms|test|spot-vote)\b/i.test(subj)) return false;
    const ids = Array.isArray(row.article_ids)
        ? row.article_ids.filter((id) => typeof id === 'string' && id.trim().length > 0)
        : [];
    if (ids.length === 0) return false;
    return true;
}
