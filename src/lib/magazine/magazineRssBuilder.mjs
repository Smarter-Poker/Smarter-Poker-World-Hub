/**
 * Smarter.Poker Monthly Magazine RSS 2.0 Syndication Builder
 *
 * Pure XML builder shared by `/hub/magazine/rss.xml` and API callers.
 * Enforces strict `status === 'published'` filtering, accurate max `<lastBuildDate>`,
 * HTTPS `<enclosure>` cover imagery, valid XML escaping, and zero em/en dashes.
 */
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_SITE_URL,
    MAGAZINE_TAGLINE,
    formatPeriodLabel,
    stripMagazineDashes,
} from './magazineSchema.mjs';

export function escapeMagazineXml(value) {
    return String(value ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function parseTimestampMs(raw) {
    if (!raw) return 0;
    const d = new Date(raw);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

function toRfc2822Date(raw) {
    const ms = parseTimestampMs(raw);
    return ms > 0 ? new Date(ms).toUTCString() : '';
}

function resolveHttpsCoverUrl(row) {
    const candidate = String(
        row?.cover_image_url ?? row?.coverImageUrl ?? row?.manifest_json?.coverImageUrl ?? ''
    ).trim();
    if (!candidate) return '';
    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'https:') return '';
        return parsed.toString();
    } catch {
        return '';
    }
}

function resolveOptions(siteUrlOrOptions) {
    if (typeof siteUrlOrOptions === 'string') {
        return {
            siteUrl: siteUrlOrOptions || MAGAZINE_SITE_URL,
            selfPath: '/hub/magazine/rss.xml',
        };
    }
    if (siteUrlOrOptions && typeof siteUrlOrOptions === 'object') {
        return {
            siteUrl: siteUrlOrOptions.siteUrl || MAGAZINE_SITE_URL,
            selfPath: siteUrlOrOptions.selfPath || '/hub/magazine/rss.xml',
        };
    }
    return {
        siteUrl: MAGAZINE_SITE_URL,
        selfPath: '/hub/magazine/rss.xml',
    };
}

/**
 * Builds valid RSS 2.0 XML for published `magazine_issues` rows.
 */
export function buildMagazineRssXml(issues = [], siteUrl = MAGAZINE_SITE_URL) {
    const { siteUrl: rawOrigin, selfPath } = resolveOptions(siteUrl);
    const origin = String(rawOrigin || MAGAZINE_SITE_URL).replace(/\/+$/, '');
    const feedPath = String(selfPath || '/hub/magazine/rss.xml').startsWith('/')
        ? String(selfPath || '/hub/magazine/rss.xml')
        : `/${selfPath}`;

    const publishedRows = (Array.isArray(issues) ? issues : []).filter(
        (row) => Boolean(row) && row.status === 'published'
    );

    let maxBuildMs = 0;
    for (const r of publishedRows) {
        const ms = parseTimestampMs(r.published_at || r.publishedAt || r.updated_at || r.created_at);
        if (ms > maxBuildMs) maxBuildMs = ms;
    }
    const lastBuildDate = maxBuildMs > 0 ? new Date(maxBuildMs).toUTCString() : '';

    const itemBlocks = publishedRows
        .map((row, idx) => {
            const issueNum = Math.max(1, Number(row.issue_number ?? row.issueNumber ?? idx + 1));
            const period = String(row.issue_period ?? row.issuePeriod ?? '').trim();
            const slug = String(row.slug || period || issueNum).trim();
            const periodLabel = formatPeriodLabel(period);
            const link = `${origin}/hub/magazine/${encodeURIComponent(slug)}`;

            const rawTitle =
                row.title ||
                `${MAGAZINE_MASTHEAD} Issue #${issueNum} (${periodLabel})${row.cover_headline ? `: ${row.cover_headline}` : ''}`;
            const title = stripMagazineDashes(rawTitle);

            const rawDesc =
                row.cover_subheadline ||
                row.coverSubheadline ||
                row.cover_headline ||
                row.coverHeadline ||
                `${MAGAZINE_MASTHEAD} Issue #${issueNum} (${periodLabel}) - 44-page monthly strategy, POY standings, tournament results, and live poker room guide.`;
            const description = stripMagazineDashes(rawDesc);

            const pubDate = toRfc2822Date(row.published_at || row.publishedAt || row.updated_at || row.created_at);
            const enclosureUrl = resolveHttpsCoverUrl(row);

            return [
                '    <item>',
                `      <title>${escapeMagazineXml(title)}</title>`,
                `      <link>${escapeMagazineXml(link)}</link>`,
                `      <guid isPermaLink="true">${escapeMagazineXml(link)}</guid>`,
                pubDate ? `      <pubDate>${pubDate}</pubDate>` : '',
                `      <description>${escapeMagazineXml(description)}</description>`,
                enclosureUrl
                    ? `      <enclosure url="${escapeMagazineXml(enclosureUrl)}" length="0" type="image/jpeg" />`
                    : '',
                '    </item>',
            ]
                .filter(Boolean)
                .join('\n');
        })
        .filter(Boolean);

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        '  <channel>',
        `    <title>${escapeMagazineXml(MAGAZINE_MASTHEAD)}</title>`,
        `    <link>${escapeMagazineXml(origin)}/hub/magazine</link>`,
        `    <description>${escapeMagazineXml(stripMagazineDashes(MAGAZINE_TAGLINE))}</description>`,
        '    <language>en-us</language>',
        lastBuildDate ? `    <lastBuildDate>${lastBuildDate}</lastBuildDate>` : '',
        `    <atom:link href="${escapeMagazineXml(origin)}${escapeMagazineXml(feedPath)}" rel="self" type="application/rss+xml" />`,
        ...itemBlocks,
        '  </channel>',
        '</rss>',
        '',
    ]
        .filter((line) => line !== '')
        .join('\n');
}
