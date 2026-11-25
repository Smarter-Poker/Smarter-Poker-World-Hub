/**
 * Weekly Wire RSS 2.0 Syndication Feed (`/api/news/wire-rss`)
 *
 * Public, read-only feed of published Smarter.Poker Weekly Wire editions. It reads only
 * `newsletter_campaigns` and `poker_news`, and numbers
 * editions exactly the way `/hub/wire` and `/hub/wire/[edition]` do so every `<link>` resolves.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { isWeeklyWireDigestCampaign } from '../../../src/lib/newsletter/weeklyWireEngine.mjs';

const UUID_SHAPE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FEED_LIMIT = 25;

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

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

function cleanCopy(value) {
    return String(value == null ? '' : value)
        .replace(/[\u2014\u2013]/g, ' - ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseSubjectEditionNumber(subject) {
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

function toRfc2822(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toUTCString();
}

/**
 * Pure RSS 2.0 builder. `editions` are newest first:
 * `{ editionNumber, subject, publishedAt, headlines: string[] }`.
 */
export function buildWeeklyWireRssXml(editions, { siteUrl = 'https://smarter.poker' } = {}) {
    const origin = String(siteUrl || 'https://smarter.poker').replace(/\/+$/, '');
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
        `    <atom:link href="${escapeXml(origin)}/api/news/wire-rss" rel="self" type="application/rss+xml" />`,
        ...items,
        '  </channel>',
        '</rss>',
        '',
    ]
        .filter((line) => line !== '')
        .join('\n');
}

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    try {
        const sb = getSupabase();
        const { data: rows, error } = await sb
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
            // in-list: bounded <= 150
            const { data: newsRows } = await sb
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

        const xml = buildWeeklyWireRssXml(editions);
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=1800, stale-while-revalidate=86400');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(xml);
    } catch (error) {
        try { reportApiError(error, req); } catch (_e) { /* noop */ }
        console.warn('[wire-rss] failed:', error?.message || error);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(500).json({ error: 'WIRE_RSS_UNAVAILABLE' });
    }
}
