/**
 * Weekly Wire RSS 2.0 Syndication Builder
 *
 * Shared builder used by:
 *   - /hub/wire/rss.xml (Crawlable SSR route under /hub/wire/ Allowed by robots.txt)
 *   - /api/news/wire-rss (Backwards-compatible API route)
 */
import { isWeeklyWireDigestCampaign } from './wireCampaignPredicate.mjs';

const UUID_SHAPE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FEED_LIMIT = 25;

export function escapeXml(value) {
    return String(value == null ? '' : value)
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function cleanCopy(value) {
    return String(value == null ? '' : value)
        .replace(/[\u2014\u2013]/g, ' - ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function parseSubjectEditionNumber(subject) {
    const match = String(subject || '').match(/wire\s*#(\d+)/i);
    if (!match) return null;
    const n = parseInt(match[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Assigns edition numbers using the same rule as the web archive: the `Wire #N` subject number
 * when unused, otherwise the 1-based position. Input rows must be oldest first.
 */
export function numberWeeklyWireEditions(rows) {
    const used = new Set();
    return (rows || []).map((row, idx) => {
        const fromSubject = parseSubjectEditionNumber(row.subject);
        let editionNumber = fromSubject && !used.has(fromSubject) ? fromSubject : idx + 1;
        while (used.has(editionNumber)) editionNumber += 1;
        used.add(editionNumber);
        return { ...row, editionNumber };
    });
}

export function toRfc2822(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toUTCString();
}

export function renderWeeklyWireRssXml(editions, { siteUrl = 'https://smarter.poker', selfPath = '/hub/wire/rss.xml' } = {}) {
    const origin = String(siteUrl || 'https://smarter.poker').replace(/\/+$/, '');
    const path = selfPath.startsWith('/') ? selfPath : `/${selfPath}`;
    const list = Array.isArray(editions) ? editions : [];
    const newestDate = list.map((ed) => toRfc2822(ed?.publishedAt)).find(Boolean) || '';

    const items = list
        .map((ed) => {
            const num = Number(ed?.editionNumber);
            if (!Number.isFinite(num) || num < 1) return '';
            const url = `${origin}/hub/wire/${num}`;
            const title = cleanCopy(ed.subject) || `Smarter.Poker Weekly Wire #${num}`;
            const headlines = (Array.isArray(ed.headlines) ? ed.headlines : []).map(cleanCopy).filter(Boolean).slice(0, 5);
            const description = headlines.length
                ? `Edition #${num} headlines: ${headlines.join('; ')}.`
                : `Smarter.Poker Weekly Wire Edition #${num}: platform upgrades, solver spot of the week, world poker news, and pro calculator spotlights.`;
            const pubDate = toRfc2822(ed.publishedAt);
            return [
                '    <item>',
                `      <title>${escapeXml(title)}</title>`,
                `      <link>${escapeXml(url)}</link>`,
                `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
                pubDate ? `      <pubDate>${pubDate}</pubDate>` : '',
                `      <description>${escapeXml(description)}</description>`,
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
        '    <title>Smarter.Poker Weekly Wire</title>',
        `    <link>${escapeXml(origin)}/hub/wire</link>`,
        '    <description>Curated world poker news, solver decision spots, pro calculator spotlights, and platform upgrades from Smarter.Poker.</description>',
        '    <language>en-us</language>',
        newestDate ? `    <lastBuildDate>${newestDate}</lastBuildDate>` : '',
        `    <atom:link href="${escapeXml(origin)}${escapeXml(path)}" rel="self" type="application/rss+xml" />`,
        ...items,
        '  </channel>',
        '</rss>',
        '',
    ]
        .filter((line) => line !== '')
        .join('\n');
}

export function buildEmptyWeeklyWireRssXml({ siteUrl = 'https://smarter.poker', selfPath = '/hub/wire/rss.xml' } = {}) {
    const origin = String(siteUrl || 'https://smarter.poker').replace(/\/+$/, '');
    const path = selfPath.startsWith('/') ? selfPath : `/${selfPath}`;
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        '  <channel>',
        '    <title>Smarter.Poker Weekly Wire</title>',
        `    <link>${escapeXml(origin)}/hub/wire</link>`,
        '    <description>Curated world poker news, solver decision spots, pro calculator spotlights, and platform upgrades from Smarter.Poker.</description>',
        '    <language>en-us</language>',
        `    <atom:link href="${escapeXml(origin)}${escapeXml(path)}" rel="self" type="application/rss+xml" />`,
        '  </channel>',
        '</rss>',
        '',
    ].join('\n');
}

export async function buildWeeklyWireRssXml(supabaseOrEditions, { siteUrl = 'https://smarter.poker', selfPath = '/hub/wire/rss.xml' } = {}) {
    if (Array.isArray(supabaseOrEditions)) {
        return renderWeeklyWireRssXml(supabaseOrEditions, { siteUrl, selfPath });
    }
    const supabase = supabaseOrEditions;
    if (!supabase || typeof supabase.from !== 'function') {
        return buildEmptyWeeklyWireRssXml({ siteUrl, selfPath });
    }

    const { data: rows, error } = await supabase
        .from('newsletter_campaigns')
        .select('id, subject, status, article_ids, sent_count, completed_at, created_at')
        .in('status', ['sent', 'partial'])
        .order('created_at', { ascending: true })
        .limit(200);
    if (error) throw error;

    const numbered = numberWeeklyWireEditions((rows || []).filter(isWeeklyWireDigestCampaign));
    const latest = numbered.slice(-FEED_LIMIT).reverse();

    const realIds = [];
    for (const ed of latest) {
        for (const id of (Array.isArray(ed.article_ids) ? ed.article_ids : []).slice(0, 3)) {
            const clean = String(id || '').trim().toLowerCase();
            if (UUID_SHAPE_RE.test(clean) && !realIds.includes(clean)) realIds.push(clean);
        }
    }

    const titleById = new Map();
    if (realIds.length > 0) {
        const { data: newsRows } = await supabase
            .from('poker_news')
            .select('id, title, category')
            .in('id', realIds.slice(0, 150));
        for (const row of newsRows || []) {
            if (row?.id && row.category !== 'platform_update' && row.title) {
                titleById.set(String(row.id).toLowerCase(), row.title);
            }
        }
    }

    const editions = latest.map((ed) => ({
        editionNumber: ed.editionNumber,
        subject: ed.subject,
        publishedAt: ed.completed_at || ed.created_at || null,
        headlines: (Array.isArray(ed.article_ids) ? ed.article_ids : [])
            .map((id) => titleById.get(String(id || '').trim().toLowerCase()))
            .filter(Boolean),
    }));

    return renderWeeklyWireRssXml(editions, { siteUrl, selfPath });
}
