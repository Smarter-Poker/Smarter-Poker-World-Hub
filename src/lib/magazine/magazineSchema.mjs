/**
 * Shared Pure Schema, Constants, Signature Math & Vector Helpers for Smarter.Poker Magazine
 *
 * IMPORTANT: Keep this module 100% pure ESM (zero Node `fs`/`crypto`/`sharp` imports)
 * so both client-side Flipbook/Print React components and server-side Compilers/Sitemaps
 * can import it cleanly under Webpack and Node 24.
 */

export const MAGAZINE_MASTHEAD = 'Smarter.Poker Magazine';
export const MAGAZINE_TAGLINE = 'Strategy, Tournaments, Live Series & The Modern Poker Ecosystem';
export const MAGAZINE_SITE_URL = 'https://smarter.poker';
export const MAGAZINE_STORAGE_BUCKET = 'magazine-assets';
export const MAGAZINE_POSTAL_ADDRESS = 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453';

export const MAGAZINE_TRIM = Object.freeze({
    widthIn: 8.375,
    heightIn: 10.875,
    bleedIn: 0.125,
    safeMarginIn: 0.5,
    aspectRatio: '8.375 / 10.875',
    defaultPageCount: 44,
    minPageCount: 36,
    maxPageCount: 48,
});

export const MAGAZINE_SECTIONS = Object.freeze([
    'cover_candidate',
    'news_brief',
    'feature_story',
    'photo_essay',
    'tournament_result',
    'poy_snapshot',
    'strategy_spot',
    'trivia_quiz',
    'video_highlight',
    'platform_highlight',
    'series_calendar',
    'featured_venue',
]);

export const MAGAZINE_TOC_GROUPS = Object.freeze([
    { key: 'features', label: 'Features & Cover Stories' },
    { key: 'departments', label: 'Departments, POY & Final Table' },
    { key: 'strategy', label: 'The Strategy Lab' },
]);

export const MAGAZINE_PAGE_KINDS = Object.freeze([
    'front_cover',
    'house_promo_spread',
    'editor_first_hand',
    'toc_left',
    'toc_right',
    'news_rail',
    'capture_the_moment_left',
    'capture_the_moment_right',
    'cover_feature',
    'secondary_feature',
    'platform_feature',
    'poy_standings',
    'final_table_live',
    'kings_club_champions',
    'strategy_nlh',
    'strategy_icm',
    'strategy_plo',
    'strategy_ai_coach',
    'the_test_quiz',
    'video_tool_spotlight',
    'live_series_radar',
    'poker_rooms_directory',
    'cardroom_bundle_cta',
    'back_cover',
]);

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

export function stripMagazineDashes(value) {
    return String(value ?? '')
        .replace(/&mdash;|&ndash;|&#8212;|&#8211;|&#x2014;|&#x2013;/gi, ' - ')
        .replace(/\s*[\u2014\u2013]\s*/g, ' - ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export function isValidIssuePeriod(period) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || '').trim());
}

export function currentIssuePeriod(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export function previousIssuePeriod(date = new Date()) {
    const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return currentIssuePeriod(d);
}

export function formatPeriodLabel(period) {
    const clean = String(period || '').trim();
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(clean);
    if (!match) return 'Current Edition';
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    return `${MONTH_NAMES[monthIndex] || 'Monthly'} ${year}`;
}

/**
 * Enforces commercial saddle-stitch 4-page signature divisibility (36, 40, 44, 48...).
 */
export function normalizeSignaturePageCount(rawCount, min = 36, max = 48) {
    const n = Number.isFinite(Number(rawCount)) ? Math.max(16, Math.ceil(Number(rawCount))) : MAGAZINE_TRIM.defaultPageCount;
    const bounded = Math.min(Math.max(n, min), max);
    const rem = bounded % 4;
    return rem === 0 ? bounded : bounded + (4 - rem);
}

/**
 * Formats Club Arena / Kings Club chip amounts strictly in Chips (NEVER with a `$` sign).
 */
export function formatChipsOnly(amount) {
    const num = Number(amount || 0);
    if (!Number.isFinite(num) || num <= 0) return '0 Chips';
    return `${Math.round(num).toLocaleString('en-US')} Chips`;
}

/**
 * Deterministic, pure-vector scannable-style visual matrix + explicit short URL badge
 * (zero `<text>` tags inside SVG so sharp/librsvg and print engines render 100% identically).
 */
export function buildMagazineQrMatrixSvg(url, size = 84) {
    const target = String(url || MAGAZINE_SITE_URL);
    const grid = 21;
    let hash = 2166136261;
    for (let i = 0; i < target.length; i += 1) {
        hash ^= target.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    const isFinder = (r, c, top, left) => {
        const dr = r - top;
        const dc = c - left;
        if (dr < 0 || dr > 6 || dc < 0 || dc > 6) return null;
        if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true;
        if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) return true;
        return false;
    };

    const rects = [];
    const cell = 4;
    const quiet = 2;
    const vb = (grid + quiet * 2) * cell;

    for (let r = 0; r < grid; r += 1) {
        for (let c = 0; c < grid; c += 1) {
            const f1 = isFinder(r, c, 0, 0);
            const f2 = isFinder(r, c, 0, grid - 7);
            const f3 = isFinder(r, c, grid - 7, 0);
            let on = false;
            if (f1 !== null) on = f1;
            else if (f2 !== null) on = f2;
            else if (f3 !== null) on = f3;
            else if ((r === 7 && (c < 8 || c >= grid - 8)) || (c === 7 && (r < 8 || r >= grid - 8)) || (r === grid - 8 && c < 8)) {
                on = false;
            } else {
                const mix = Math.imul(hash ^ ((r + 1) * 73856093) ^ ((c + 1) * 19349663) ^ target.charCodeAt((r * grid + c) % target.length), 2654435761);
                on = ((mix >>> 0) & 3) !== 0 && ((r + c + (mix >>> 5)) % 2 === 0);
            }
            if (on) {
                rects.push(`<rect x="${(c + quiet) * cell}" y="${(r + quiet) * cell}" width="${cell}" height="${cell}" fill="#05070a"/>`);
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" shape-rendering="crispEdges"><rect width="${vb}" height="${vb}" rx="6" fill="#ffffff"/>${rects.join('')}</svg>`;
}

export function buildMagazineQrDataUri(url, size = 84) {
    const svg = buildMagazineQrMatrixSvg(url, size);
    if (typeof Buffer !== 'undefined') {
        return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    }
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Defensive normalizer ensuring reader, flipbook, and print pages always receive
 * a valid, complete manifest structure.
 */
export function normalizeIssueManifest(raw = {}, fallbackIssue = {}) {
    const m = raw && typeof raw === 'object' ? raw : {};
    const period = isValidIssuePeriod(m.issuePeriod || fallbackIssue.issue_period)
        ? (m.issuePeriod || fallbackIssue.issue_period)
        : currentIssuePeriod();
    const issueNumber = Math.max(1, Number(m.issueNumber || fallbackIssue.issue_number || 1));
    const volumeNumber = Math.max(1, Number(m.volumeNumber || fallbackIssue.volume_number || 1));
    const pages = Array.isArray(m.pages)
        ? m.pages.map((p, idx) => ({
              pageNumber: Number(p?.pageNumber) || idx + 1,
              kind: String(p?.kind || 'news_rail'),
              department: String(p?.department || 'Departments, POY & Final Table'),
              tocGroup: p?.tocGroup || 'departments',
              runningHeader: stripMagazineDashes(p?.runningHeader || MAGAZINE_MASTHEAD),
              headline: stripMagazineDashes(p?.headline || ''),
              subheadline: stripMagazineDashes(p?.subheadline || ''),
              byline: stripMagazineDashes(p?.byline || ''),
              imageUrl: String(p?.imageUrl || '/api/news/email-image?fallback=1&w=960&h=540'),
              masterImageUrl: String(p?.masterImageUrl || p?.imageUrl || '/api/news/email-image?fallback=1&w=960&h=540'),
              ctaLabel: stripMagazineDashes(p?.ctaLabel || ''),
              ctaUrl: String(p?.ctaUrl || '/hub/magazine'),
              qrUrl: String(p?.qrUrl || p?.ctaUrl || `${MAGAZINE_SITE_URL}/hub/magazine`),
              items: Array.isArray(p?.items) ? p.items : [],
              paragraphs: Array.isArray(p?.paragraphs) ? p.paragraphs.map(stripMagazineDashes).filter(Boolean) : [],
              pullQuote: stripMagazineDashes(p?.pullQuote || ''),
              stats: Array.isArray(p?.stats) ? p.stats : [],
              spot: p?.spot && typeof p.spot === 'object' ? p.spot : null,
              standings: Array.isArray(p?.standings) ? p.standings : [],
              meta: p?.meta && typeof p.meta === 'object' ? p.meta : {},
          }))
        : [];
    const pageCount = normalizeSignaturePageCount(pages.length || m.pageCount || fallbackIssue.page_count || 44);
    const toc = Array.isArray(m.toc) ? m.toc : [];

    return {
        masthead: MAGAZINE_MASTHEAD,
        issueNumber,
        volumeNumber,
        issuePeriod: period,
        periodLabel: m.periodLabel || formatPeriodLabel(period),
        slug: String(m.slug || fallbackIssue.slug || period),
        title: stripMagazineDashes(m.title || fallbackIssue.title || `${MAGAZINE_MASTHEAD} - ${formatPeriodLabel(period)}`),
        coverHeadline: stripMagazineDashes(m.coverHeadline || fallbackIssue.cover_headline || 'Inside The Month In Poker'),
        coverSubheadline: stripMagazineDashes(
            m.coverSubheadline || fallbackIssue.cover_subheadline || 'Major Champions, Solver Strategy, POY Standings & Live Tour Radar'
        ),
        coverLines: Array.isArray(m.coverLines) ? m.coverLines.map(stripMagazineDashes).filter(Boolean) : [],
        coverImageUrl: String(
            m.coverImageUrl || fallbackIssue.cover_image_url || '/api/news/email-image?fallback=1&w=960&h=540'
        ),
        editorNote: stripMagazineDashes(m.editorNote || fallbackIssue.editor_note || ''),
        pageCount,
        toc,
        stats: Array.isArray(m.stats) ? m.stats : [],
        pages,
    };
}
