/**
 * Shared Pure Schema, Constants, Signature Math & Vector Helpers for Smarter.Poker Magazine
 *
 * IMPORTANT: Keep this module 100% pure ESM (zero Node `fs`/`crypto`/`sharp` imports)
 * so both client-side Flipbook/Print React components and server-side Compilers/Sitemaps
 * can import it cleanly under Webpack and Node 24.
 */
import QRCodeCore from 'qrcode/lib/core/qrcode.js';

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

const US_STATE_CODES_SET = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC',
]);

const US_STATE_NAME_TO_CODE = Object.freeze({
    alabama: 'AL',
    alaska: 'AK',
    arizona: 'AZ',
    arkansas: 'AR',
    california: 'CA',
    colorado: 'CO',
    connecticut: 'CT',
    delaware: 'DE',
    florida: 'FL',
    georgia: 'GA',
    hawaii: 'HI',
    idaho: 'ID',
    illinois: 'IL',
    indiana: 'IN',
    iowa: 'IA',
    kansas: 'KS',
    kentucky: 'KY',
    louisiana: 'LA',
    maine: 'ME',
    maryland: 'MD',
    massachusetts: 'MA',
    michigan: 'MI',
    minnesota: 'MN',
    mississippi: 'MS',
    missouri: 'MO',
    montana: 'MT',
    nebraska: 'NE',
    nevada: 'NV',
    'new hampshire': 'NH',
    'new jersey': 'NJ',
    'new mexico': 'NM',
    'new york': 'NY',
    'north carolina': 'NC',
    'north dakota': 'ND',
    ohio: 'OH',
    oklahoma: 'OK',
    oregon: 'OR',
    pennsylvania: 'PA',
    'rhode island': 'RI',
    'south carolina': 'SC',
    'south dakota': 'SD',
    tennessee: 'TN',
    texas: 'TX',
    utah: 'UT',
    vermont: 'VT',
    virginia: 'VA',
    washington: 'WA',
    'west virginia': 'WV',
    wisconsin: 'WI',
    wyoming: 'WY',
    'district of columbia': 'DC',
    'washington dc': 'DC',
    'washington d.c.': 'DC',
});

const BLOCKED_ROOM_EMAIL_DOMAINS = new Set([
    'example.com',
    'example.org',
    'example.net',
    'example',
    'invalid',
    'local',
    'test',
    'localhost',
    'test.com',
    'email.com',
    'horse.ai',
    'hydra.bot',
    'mailinator.com',
    'tempmail.com',
    'smarter.poker',
]);

const BLOCKED_ROOM_EMAIL_SUFFIXES = [
    '.example.com',
    '.example.org',
    '.example.net',
    '.example',
    '.invalid',
    '.local',
    '.test',
    '.localhost',
    '.test.com',
    '.horse.ai',
    '.hydra.bot',
    '.mailinator.com',
    '.tempmail.com',
    '.smarter.poker',
];

const ROOM_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isBlockedMagazineRoomEmail(email) {
    const clean = String(email || '')
        .trim()
        .toLowerCase()
        .replace(/^[<("']+|[>)"',;]+$/g, '');
    const at = clean.lastIndexOf('@');
    if (at <= 0 || at === clean.length - 1) return true;
    const domain = clean.slice(at + 1).trim();
    if (!domain) return true;
    if (BLOCKED_ROOM_EMAIL_DOMAINS.has(domain)) return true;
    return BLOCKED_ROOM_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

export function normalizeMagazineRoomEmail(email) {
    const clean = String(email || '')
        .trim()
        .toLowerCase()
        .replace(/^[<("']+|[>)"',;]+$/g, '');
    if (!clean || clean.length < 3 || clean.length > 254) return null;
    if (!ROOM_EMAIL_RE.test(clean)) return null;
    if (isBlockedMagazineRoomEmail(clean)) return null;
    return clean;
}

export function normalizeMagazineUsState(code) {
    const raw = String(code ?? '').trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    if (US_STATE_CODES_SET.has(upper)) return upper;
    const mapped = US_STATE_NAME_TO_CODE[raw.toLowerCase().replace(/\s+/g, ' ')];
    return mapped || null;
}

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
    const candidate = date instanceof Date ? date : new Date(date);
    const d = Number.isNaN(candidate.getTime()) ? new Date() : candidate;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export function previousIssuePeriod(date = new Date()) {
    const candidate = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    const d = Number.isNaN(candidate.getTime()) ? new Date() : new Date(candidate.getTime());
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
    if (
        rawCount == null ||
        rawCount === '' ||
        typeof rawCount === 'boolean' ||
        !Number.isFinite(Number(rawCount)) ||
        Number(rawCount) <= 0
    ) {
        const def = Math.min(Math.max(MAGAZINE_TRIM.defaultPageCount, min), max);
        const remDef = def % 4;
        return remDef === 0 ? def : def + (4 - remDef);
    }
    const n = Math.max(16, Math.ceil(Number(rawCount)));
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

const createIsoQrCode =
    typeof QRCodeCore?.create === 'function'
        ? (text, opts) => QRCodeCore.create(text, opts)
        : (text, opts) => QRCodeCore.default.create(text, opts);

/**
 * Deterministic, pure-vector camera-scannable ISO/IEC 18004 Reed-Solomon QR SVG
 * (zero `<text>`/`<tspan>` tags inside SVG so sharp/librsvg and print engines render 100% identically).
 */
export function buildMagazineQrMatrixSvg(url, size = 84) {
    const cleanUrl = String(url || MAGAZINE_SITE_URL).trim() || MAGAZINE_SITE_URL;
    const pxSize = Math.max(32, Math.min(512, Math.round(Number(size) || 84)));
    const qr = createIsoQrCode(cleanUrl, { errorCorrectionLevel: 'M' });
    const modCount = qr.modules.size;
    const quiet = 4;
    const cell = 4;
    const vb = (modCount + quiet * 2) * cell;
    const rects = [];

    for (let r = 0; r < modCount; r += 1) {
        for (let c = 0; c < modCount; c += 1) {
            if (qr.modules.get(r, c)) {
                rects.push(
                    `<rect x="${(c + quiet) * cell}" y="${(r + quiet) * cell}" width="${cell}" height="${cell}" fill="#05070a"/>`
                );
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pxSize}" height="${pxSize}" viewBox="0 0 ${vb} ${vb}" data-qr-modules="${modCount}" shape-rendering="crispEdges"><rect width="${vb}" height="${vb}" rx="6" fill="#ffffff"/>${rects.join('')}</svg>`;
}

export function buildMagazineQrDataUri(url, size = 84) {
    const svg = buildMagazineQrMatrixSvg(url, size);
    if (typeof Buffer !== 'undefined') {
        return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    }
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ITEM_TEXT_KEYS = [
    'title',
    'headline',
    'subheadline',
    'subtitle',
    'summary',
    'description',
    'excerpt',
    'body_text',
    'question',
    'explanation',
    'label',
    'badge',
    'category',
    'categoryLabel',
    'sourceName',
    'byline',
    'outlet',
    'venueName',
    'city',
    'state',
    'dates',
    'prizePoolLabel',
    'buyInLabel',
    'eventDetail',
    'tour',
    'role',
    'name',
    'playerName',
    'tip',
    'caption',
];

function sanitizeManifestEntryObject(entry) {
    if (typeof entry === 'string') return stripMagazineDashes(entry);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const copy = { ...entry };
    for (const k of ITEM_TEXT_KEYS) {
        if (typeof copy[k] === 'string') {
            copy[k] = stripMagazineDashes(copy[k]);
        }
    }
    if (Array.isArray(copy.options)) {
        copy.options = copy.options.map((opt) =>
            opt && typeof opt === 'object'
                ? {
                      ...opt,
                      ...(typeof opt.label === 'string' ? { label: stripMagazineDashes(opt.label) } : {}),
                  }
                : opt
        );
    }
    return copy;
}

function sanitizeManifestStat(stat) {
    if (!stat || typeof stat !== 'object' || Array.isArray(stat)) return stat;
    return {
        ...stat,
        ...(typeof stat.label === 'string' ? { label: stripMagazineDashes(stat.label) } : {}),
        ...(typeof stat.value === 'string' ? { value: stripMagazineDashes(stat.value) } : {}),
        ...(typeof stat.detail === 'string' ? { detail: stripMagazineDashes(stat.detail) } : {}),
    };
}

function sanitizeTocEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const cleanTitle =
        typeof entry.title === 'string'
            ? stripMagazineDashes(entry.title)
            : typeof entry.headline === 'string'
              ? stripMagazineDashes(entry.headline)
              : undefined;
    const cleanSubtitle =
        typeof entry.subtitle === 'string'
            ? stripMagazineDashes(entry.subtitle)
            : typeof entry.subheadline === 'string'
              ? stripMagazineDashes(entry.subheadline)
              : undefined;
    const groupKey = entry.tocGroup || entry.group || 'departments';
    return {
        ...entry,
        ...(cleanTitle !== undefined ? { title: cleanTitle, headline: cleanTitle } : {}),
        ...(cleanSubtitle !== undefined ? { subtitle: cleanSubtitle, subheadline: cleanSubtitle } : {}),
        group: groupKey,
        tocGroup: groupKey,
        ...(typeof entry.groupLabel === 'string' ? { groupLabel: stripMagazineDashes(entry.groupLabel) } : {}),
        ...(typeof entry.department === 'string' ? { department: stripMagazineDashes(entry.department) } : {}),
    };
}

/**
 * Defensive normalizer ensuring reader, flipbook, and print pages always receive
 * a valid, complete manifest structure.
 */
export function normalizeIssueManifest(raw = {}, fallbackIssue = {}) {
    const m = raw && typeof raw === 'object' ? raw : {};
    const period = isValidIssuePeriod(m.issuePeriod || fallbackIssue.issue_period)
        ? String(m.issuePeriod || fallbackIssue.issue_period).trim()
        : currentIssuePeriod();
    const issueNumber = Math.max(1, Number(m.issueNumber || fallbackIssue.issue_number || 1));
    const volumeNumber = Math.max(1, Number(m.volumeNumber || fallbackIssue.volume_number || 1));
    const pages = Array.isArray(m.pages)
        ? m.pages.map((p, idx) => ({
              pageNumber: Number(p?.pageNumber) || idx + 1,
              kind: String(p?.kind || 'news_rail'),
              department: stripMagazineDashes(p?.department || 'Departments, POY & Final Table'),
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
              items: Array.isArray(p?.items) ? p.items.map(sanitizeManifestEntryObject) : [],
              paragraphs: Array.isArray(p?.paragraphs) ? p.paragraphs.map(stripMagazineDashes).filter(Boolean) : [],
              pullQuote: stripMagazineDashes(p?.pullQuote || ''),
              stats: Array.isArray(p?.stats) ? p.stats.map(sanitizeManifestStat) : [],
              spot: p?.spot && typeof p.spot === 'object' ? sanitizeManifestEntryObject(p.spot) : null,
              standings: Array.isArray(p?.standings) ? p.standings.map(sanitizeManifestEntryObject) : [],
              meta: p?.meta && typeof p.meta === 'object' ? p.meta : {},
          }))
        : [];
    const pageCount = normalizeSignaturePageCount(pages.length || m.pageCount || fallbackIssue.page_count || 44);
    const toc = Array.isArray(m.toc) ? m.toc.map(sanitizeTocEntry) : [];
    const slug = (String(m.slug || fallbackIssue.slug || period).trim() || period).slice(0, 128);
    const defaultTitle = `${MAGAZINE_MASTHEAD} - ${formatPeriodLabel(period)}`;
    const title = (stripMagazineDashes(m.title || fallbackIssue.title || defaultTitle) || defaultTitle).slice(0, 240);
    const coverHeadline = (
        stripMagazineDashes(m.coverHeadline || fallbackIssue.cover_headline || 'Inside The Month In Poker') ||
        'Inside The Month In Poker'
    ).slice(0, 240);

    return {
        masthead: MAGAZINE_MASTHEAD,
        issueNumber,
        volumeNumber,
        issuePeriod: period,
        periodLabel: stripMagazineDashes(m.periodLabel || formatPeriodLabel(period)) || formatPeriodLabel(period),
        slug,
        title,
        coverHeadline,
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
        stats: Array.isArray(m.stats) ? m.stats.map(sanitizeManifestStat) : [],
        meta: m.meta && typeof m.meta === 'object' ? m.meta : {},
        pages,
    };
}
