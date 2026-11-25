/**
 * Smarter.Poker Weekly Wire V3 - Curation, Enrichment & Segmented Renderer
 *
 * Guarantees fresh, non-repeating content across editions:
 *   1. Exact UUID exclusion across all historical `newsletter_campaigns.article_ids`.
 *   2. Storyline fingerprinting + Jaccard/entity clustering across both the current
 *      issue AND historical issues (collapses rival blogs covering the same pot/winner,
 *      drops raw `Event #N:` schedule stubs, filters competitor sponsored posts,
 *      and caps any external outlet at <= 2 stories).
 *   3. Editorial headline normalization + title-echo suppression (`excerpt === title`)
 *      + SSRF-hardened meta-description enrichment for selected headlines.
 *   4. Lifetime single-use consumption of Smarter.Poker Platform Upgrade slugs,
 *      Spot of the Week slugs, and Weekly Tool Spotlight slugs via deterministic UUIDs
 *      stored in `article_ids`.
 *   5. Per-recipient Promo Banner segmentation, snooze honoring, Pulse telemetry strip,
 *      Live Series Radar, and Referral rewards block.
 */
import dns from 'dns';
import { DEFAULT_POSTAL_ADDRESS, normalizeDeliverableEmail, normalizeExplicitTestEmail } from '../promoCampaigns/dispatch.mjs';
import { buildPromoSignupUrl } from '../promoCampaigns/promoSignupToken.mjs';
import {
    WELCOME_BACK_CODE,
    WELCOME_BACK_INACTIVE_DAYS,
    buildWelcomeBackOfferUrl,
    deterministicUuid,
} from '../promoCampaigns/welcomeBackOffer.mjs';
import { isReferralInput } from '../pendingSignupCodes.mjs';
import { isCompetitorSponsoredPost, normalizeEditorialTitle } from './editorialCleaners.mjs';
import {
    buildMastheadCrestUrl,
    buildSignedEmailImageUrl,
    normalizeCandidateImageUrl,
} from './emailImageProxy.mjs';
import {
    ACTIVE_MEMBER_PROMO_ROTATION,
    PLATFORM_UPDATES_CATALOG,
    SPOT_OF_THE_WEEK_CATALOG,
    TOOL_SPOTLIGHT_CATALOG,
} from './weeklyWireCatalog.mjs';

const PAGE_SIZE = 1000;
const SYNTHETIC_USERNAME_RE = /^(?:deleted-|crest_cert_|postdeploy|reels_qa|trivia_canary|codex-)/i;
const SCHEDULE_STUB_RE = /^event\s*#\s*\d+\b/i;
const RESULT_SIGNAL_RE = /\b(wins?|winner|crowned|champion|champions|tops|defeats?|scoops?|captures?|shipped|claims?|bink)\b/i;

const STORY_STOPWORDS = new Set([
    'a', 'an', 'and', 'after', 'against', 'all', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'have', 'he', 'her', 'his', 'how', 'in', 'into', 'is', 'it', 'its', 'live', 'more',
    'new', 'news', 'of', 'on', 'online', 'or', 'out', 'over', 'player', 'players', 'poker',
    'pokernews', 'pot', 'hand', 'the', 'their', 'this', 'to', 'up', 'vs', 'week', 'what',
    'when', 'where', 'who', 'why', 'win', 'wins', 'with',
]);

export function deterministicMarkerUuid(namespace, slug) {
    return deterministicUuid(`sp-${String(namespace || '').trim().toLowerCase()}:${String(slug || '').trim().toLowerCase()}`);
}

export function updateMarkerUuid(slug) {
    return deterministicMarkerUuid('update', slug);
}

export function toolMarkerUuid(slug) {
    return deterministicMarkerUuid('tool', slug);
}

export function spotMarkerUuid(slug) {
    return deterministicMarkerUuid('spot', slug);
}

export function promoRotationMarkerUuid(index, slug) {
    return deterministicUuid(`sp-promo-rot:${index}:${String(slug || '').trim().toLowerCase()}`);
}

export function storylineMarkerUuid(fingerprint) {
    return deterministicUuid(`storyline:${String(fingerprint || '').trim().toLowerCase()}`);
}

function stripEmDashes(value) {
    return String(value == null ? '' : value)
        .replace(/\s*\u2014\s*/g, ' - ')
        .replace(/&mdash;|&#8212;|&#x2014;/gi, ' - ');
}

export function escapeHtml(value) {
    return stripEmDashes(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function truncateText(value, max = 180) {
    const clean = stripEmDashes(value).replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}...` : clean;
}

function normalizeComparable(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/&[a-z#0-9]+;/gi, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Returns true if `candidateBlurb` is empty, trivially short, or merely repeats
 * `title` (including truncated prefixes like `... Super High Roller Champio`).
 */
export function isEchoingOrEmptyBlurb(title, candidateBlurb) {
    const normTitle = normalizeComparable(title);
    const normBlurb = normalizeComparable(candidateBlurb);
    if (!normBlurb || normBlurb.length < 24) return true;
    if (!normTitle) return false;
    if (normBlurb === normTitle) return true;
    if (normTitle.startsWith(normBlurb) || normBlurb.startsWith(normTitle)) {
        const extraChars = normBlurb.length - normTitle.length;
        if (extraChars < 28) return true;
    }
    const titleWords = new Set(normTitle.split(' ').filter((w) => w.length > 2));
    const blurbWords = normBlurb.split(' ').filter((w) => w.length > 2);
    if (blurbWords.length === 0) return true;
    let overlap = 0;
    for (const w of blurbWords) {
        if (titleWords.has(w)) overlap += 1;
    }
    return overlap / blurbWords.length >= 0.82 && blurbWords.length <= titleWords.size + 4;
}

/**
 * Extract normalized semantic tokens from a poker headline, normalizing dollar
 * figures (`$2.6 million`, `2.65m`, `$1.66m`) so cross-outlet coverage of the
 * same big pot or event shares deterministic tokens.
 */
export function extractStoryTokens(title) {
    const raw = String(title || '').toLowerCase();
    const tokens = new Set();

    // Normalize million-dollar mentions into coarse magnitude buckets (`amt_2m`, `amt_3m`)
    const millionMatches = raw.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(?:m|million)\b/gi);
    for (const m of millionMatches) {
        const val = Number(m[1]);
        if (Number.isFinite(val) && val > 0) {
            tokens.add(`amt_${Math.round(val)}m`);
        }
    }

    const words = raw
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !STORY_STOPWORDS.has(w) && !/^\d+$/.test(w));

    for (const word of words) {
        const stemmed = word.endsWith('s') && word.length > 4 ? word.slice(0, -1) : word;
        tokens.add(stemmed);
    }
    return tokens;
}

export function computeStoryFingerprint(title) {
    const sorted = [...extractStoryTokens(title)].sort().slice(0, 6);
    return sorted.join('|') || normalizeComparable(title).slice(0, 64);
}

export function areSameStoryline(titleA, titleB) {
    const normA = normalizeComparable(titleA);
    const normB = normalizeComparable(titleB);
    if (!normA || !normB) return false;
    if (normA === normB) return true;

    const tokA = extractStoryTokens(titleA);
    const tokB = extractStoryTokens(titleB);
    if (tokA.size === 0 || tokB.size === 0) return false;

    let shared = 0;
    let sharedAmt = 0;
    for (const t of tokA) {
        if (tokB.has(t)) {
            shared += 1;
            if (t.startsWith('amt_')) sharedAmt += 1;
        }
    }
    if (shared >= 3) return true;
    if (shared >= 2 && sharedAmt >= 1) return true;
    const union = tokA.size + tokB.size - shared;
    return union > 0 && shared / union >= 0.36;
}

export function isLowValueScheduleStub(article) {
    const title = String(article?.title || '').trim();
    if (!title) return true;
    if (SCHEDULE_STUB_RE.test(title) && !RESULT_SIGNAL_RE.test(title)) {
        return true;
    }
    return false;
}

function isPrivateIp(address) {
    const ip = String(address || '').toLowerCase();
    if (!ip) return true;
    if (ip.includes(':')) {
        return (
            ip === '::' ||
            ip === '::1' ||
            ip.startsWith('fe80') ||
            ip.startsWith('fc') ||
            ip.startsWith('fd') ||
            ip.startsWith('::ffff:127.') ||
            ip.startsWith('::ffff:10.') ||
            ip.startsWith('::ffff:192.168.')
        );
    }
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
}

function decodeHtmlEntities(str) {
    return String(str || '')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&rsquo;|&lsquo;/gi, "'")
        .replace(/&ldquo;|&rdquo;/gi, '"')
        .replace(/&ndash;|&mdash;/gi, '-')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#(\d+);/g, (_m, code) => {
            const n = Number(code);
            return Number.isFinite(n) && n >= 32 && n <= 126 ? String.fromCharCode(n) : ' ';
        });
}

/**
 * Canonical Weekly Wire campaign classifier shared by `loadZeroRepeatLedger`,
 * `/hub/wire`, and `/hub/wire/[edition]`.
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
    if (/^\[(?:promo|lifecycle|sms|test)\b/i.test(subj)) return false;
    const ids = Array.isArray(row.article_ids)
        ? row.article_ids.filter((id) => typeof id === 'string' && id.trim().length > 0)
        : [];
    if (ids.length === 0) return false;
    return true;
}

/**
 * Enforces `pages/auth/signup.js`'s `isReferralInput` contract:
 * `signup.js` copies `?ref=` into `formData.promoCode` and treats ONLY all-digit
 * player numbers (`12345`) or dash-containing Crew codes (`SP-56737B`) as referrals;
 * any other string (such as `WIRE` or a bare username) is sent to `/api/promo/validate-promo-code`
 * and triggers a `400 Invalid promo code` error banner on `/auth/signup`.
 */
export function formatValidSignupReferralCode(raw) {
    if (raw == null) return '';
    const clean = String(raw).trim().toUpperCase();
    if (!isReferralInput(clean)) return '';
    return clean;
}

/**
 * SSRF-hardened editorial metadata fetcher to backfill missing/echoed summaries
 * AND missing/broken `og:image` thumbnails on selected digest stories in one pass.
 */
export async function fetchArticleEditorialMetadata(
    sourceUrl,
    title,
    { fetchImpl = fetch, timeoutMs = 2800 } = {}
) {
    try {
        const parsed = new URL(String(sourceUrl || '').trim());
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return { summary: '', imageUrl: '' };
        }
        const lookup = await dns.promises.lookup(parsed.hostname, { all: true });
        if (!lookup?.length || lookup.some((entry) => isPrivateIp(entry.address))) {
            return { summary: '', imageUrl: '' };
        }

        const res = await fetchImpl(parsed.toString(), {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SmarterPokerWire/3.0; +https://smarter.poker)',
                Accept: 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return { summary: '', imageUrl: '' };
        const html = (await res.text()).slice(0, 140_000);

        let summary = '';
        const descPatterns = [
            /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{25,500})["']/i,
            /<meta[^>]+content=["']([^"']{25,500})["'][^>]+property=["']og:description["']/i,
            /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{25,500})["']/i,
            /<meta[^>]+content=["']([^"']{25,500})["'][^>]+name=["']description["']/i,
        ];
        for (const re of descPatterns) {
            const m = html.match(re);
            if (m?.[1]) {
                const candidate = truncateText(decodeHtmlEntities(m[1]), 190);
                if (!isEchoingOrEmptyBlurb(title, candidate)) {
                    summary = candidate;
                    break;
                }
            }
        }

        let imageUrl = '';
        const imgPatterns = [
            /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']{8,800})["']/i,
            /<meta[^>]+content=["']([^"']{8,800})["'][^>]+property=["']og:image(?::secure_url)?["']/i,
            /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']{8,800})["']/i,
            /<meta[^>]+content=["']([^"']{8,800})["'][^>]+name=["']twitter:image(?::src)?["']/i,
        ];
        for (const re of imgPatterns) {
            const m = html.match(re);
            if (m?.[1]) {
                try {
                    const resolved = new URL(decodeHtmlEntities(m[1]).trim(), parsed.toString()).toString();
                    const normalized = normalizeCandidateImageUrl(resolved);
                    if (normalized) {
                        imageUrl = normalized;
                        break;
                    }
                } catch {
                    /* ignore malformed meta image */
                }
            }
        }

        return { summary, imageUrl };
    } catch {
        return { summary: '', imageUrl: '' };
    }
}

export async function fetchCleanArticleMetaDescription(sourceUrl, title, opts = {}) {
    const meta = await fetchArticleEditorialMetadata(sourceUrl, title, opts);
    return meta.summary || '';
}

export async function verifyUpstreamImageReachable(imageUrl, { fetchImpl = fetch, timeoutMs = 2200 } = {}) {
    const clean = normalizeCandidateImageUrl(imageUrl);
    if (!clean) return false;
    try {
        const parsed = new URL(clean);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
        const lookup = await dns.promises.lookup(parsed.hostname, { all: true });
        if (!lookup?.length || lookup.some((entry) => isPrivateIp(entry.address))) return false;

        const headRes = await fetchImpl(parsed.toString(), {
            method: 'HEAD',
            redirect: 'follow',
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (headRes.ok) {
            const ct = String(headRes.headers?.get?.('content-type') || '').toLowerCase();
            if (!ct || ct.startsWith('image/') || ct.includes('octet-stream')) return true;
            if (ct.includes('text/html') || ct.includes('application/json')) return false;
        }
        if (headRes.status === 405 || headRes.status === 403) {
            const getRes = await fetchImpl(parsed.toString(), {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                    Range: 'bytes=0-1023',
                },
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!getRes.ok && getRes.status !== 206) return false;
            const ct = String(getRes.headers?.get?.('content-type') || '').toLowerCase();
            return !ct.includes('text/html') && !ct.includes('application/json');
        }
        return false;
    } catch {
        return false;
    }
}

async function fetchPaged(queryBuilderFactory, maxRows = 15000) {
    const rows = [];
    for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
        const upper = Math.min(offset + PAGE_SIZE, maxRows) - 1;
        const { data, error } = await queryBuilderFactory(offset, upper);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
    }
    return rows;
}

/**
 * Load the complete historical consumption ledger from `newsletter_campaigns` +
 * historical `poker_news` rows referenced by past campaigns.
 */
export async function loadZeroRepeatLedger(sb) {
    const consumedIds = new Set();
    const historicalTitles = [];
    let digestSendCount = 0;

    const { data: campaigns, error } = await sb
        .from('newsletter_campaigns')
        .select('id, subject, status, article_ids, created_at')
        .in('status', ['sent', 'partial', 'sending'])
        .order('created_at', { ascending: false })
        .limit(250);

    if (error) throw error;

    const rawArticleUuidList = [];
    for (const c of campaigns || []) {
        if (!isWeeklyWireDigestCampaign(c)) continue;
        const ids = Array.isArray(c?.article_ids) ? c.article_ids : [];
        digestSendCount += 1;
        for (const id of ids) {
            if (typeof id === 'string' && id.trim()) {
                const clean = id.trim().toLowerCase();
                consumedIds.add(clean);
                rawArticleUuidList.push(clean);
            }
        }
    }

    // Fetch titles of up to 150 recently mailed poker_news rows so cross-outlet
    // follow-up articles on the same story are blocked across weeks too.
    const uniqueRecentArticleIds = [...new Set(rawArticleUuidList)].slice(0, 150);
    if (uniqueRecentArticleIds.length > 0) {
        try {
            const { data: pastArticles } = await sb
                .from('poker_news')
                .select('id, title')
                .in('id', uniqueRecentArticleIds.slice(0, 150));
            for (const row of pastArticles || []) {
                if (row?.title) historicalTitles.push(String(row.title));
            }
        } catch {
            /* non-fatal in lightweight test mocks */
        }
    }

    return {
        consumedIds,
        historicalTitles,
        editionNumber: digestSendCount + 1,
    };
}

/**
 * Curate an entire non-repeating Weekly Wire V3 edition:
 *   - 2-3 fresh Smarter.Poker Platform Upgrades (custom queued rows first, then built-in catalog)
 *   - 4-5 fresh, storyline-deduplicated World Poker News articles with normalized titles & clean summaries
 *   - 1 fresh Spot of the Week (from 16-spot solver catalog)
 *   - 1 fresh Tool / Trainer Spotlight (from 35+ catalog)
 *   - Up to 3 upcoming live Poker Series from `poker_series`
 *   - Next Active-Player Promo Spotlight in deterministic rotation
 */
export async function curateWeeklyWireEdition(
    sb,
    {
        days = 7,
        articleLimit = 5,
        updateLimit = 2,
        pinnedArticleIds = [],
        excludedArticleIds = [],
        enrichMetaDescriptions = true,
        fetchImpl = fetch,
    } = {}
) {
    const ledger = await loadZeroRepeatLedger(sb);
    const manualExcluded = new Set((excludedArticleIds || []).map((x) => String(x || '').trim().toLowerCase()));
    const pinnedSet = new Set((pinnedArticleIds || []).map((x) => String(x || '').trim().toLowerCase()));

    // 1. Custom queued Platform Updates stored in poker_news (category = 'platform_update')
    let customQueueUpdates = [];
    try {
        const { data: queuedRows } = await sb
            .from('poker_news')
            .select('id, slug, title, summary, excerpt, source_url, image_caption, published_at')
            .eq('category', 'platform_update')
            .order('published_at', { ascending: true })
            .limit(50);
        customQueueUpdates = (queuedRows || [])
            .filter((r) => r?.id && r?.title && !ledger.consumedIds.has(String(r.id).toLowerCase()))
            .map((r) => ({
                id: String(r.id).toLowerCase(),
                slug: r.slug || String(r.id).toLowerCase(),
                badge: stripEmDashes(r.image_caption || 'Platform Update'),
                title: normalizeEditorialTitle(r.title),
                summary: stripEmDashes(r.summary || r.excerpt || ''),
                ctaLabel: 'Explore On Smarter.Poker',
                ctaUrl: String(r.source_url || 'https://smarter.poker/hub').split('#')[0],
                source: 'custom_queue',
            }));
    } catch {
        /* non-fatal */
    }

    const catalogUpdates = PLATFORM_UPDATES_CATALOG.map((u) => ({
        ...u,
        id: updateMarkerUuid(u.slug),
        source: 'catalog',
    })).filter((u) => !ledger.consumedIds.has(u.id));

    const platformUpdates = [...customQueueUpdates, ...catalogUpdates].slice(0, Math.max(1, Math.min(updateLimit, 4)));

    // 2. Curate fresh, storyline-deduplicated World Poker News
    const sinceIso = new Date(Date.now() - Math.max(1, Math.min(days, 30)) * 86_400_000).toISOString();
    const { data: candidateRows, error: newsErr } = await sb
        .from('poker_news')
        .select('id, title, summary, excerpt, content, source_name, source_url, image_url, category, is_featured, view_count, published_at')
        .eq('is_published', true)
        .neq('category', 'platform_update')
        .gte('published_at', sinceIso)
        .order('published_at', { ascending: false })
        .limit(80);

    if (newsErr) throw newsErr;

    let skippedCompetitorAds = 0;
    const eligibleRows = [];
    for (const row of candidateRows || []) {
        if (!row?.id || !row?.title) continue;
        if (isCompetitorSponsoredPost(row)) {
            skippedCompetitorAds += 1;
            continue;
        }
        eligibleRows.push(row);
    }

    const scoredCandidates = eligibleRows
        .map((a) => {
            const id = String(a.id).toLowerCase();
            const hasRichBlurb = !isEchoingOrEmptyBlurb(a.title, a.summary || a.excerpt || a.content || '');
            const score =
                (pinnedSet.has(id) ? 1000 : 0) +
                (a.is_featured ? 35 : 0) +
                (a.image_url ? 20 : 0) +
                (hasRichBlurb ? 25 : 0) +
                Math.min(25, Math.floor(Number(a.view_count || 0) / 10));
            return { ...a, id, _score: score };
        })
        .sort((a, b) => b._score - a._score || Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0));

    const selectedArticles = [];
    const sourceCounts = new Map();
    let skippedPreviouslySent = 0;
    let skippedStoryDuplicates = 0;
    let skippedStubs = 0;

    for (const candidate of scoredCandidates) {
        if (selectedArticles.length >= articleLimit) break;
        if (manualExcluded.has(candidate.id)) continue;

        const cleanCandidateTitle = normalizeEditorialTitle(candidate.title);
        const fp = computeStoryFingerprint(cleanCandidateTitle);
        const fpUuid = storylineMarkerUuid(fp);

        if (ledger.consumedIds.has(candidate.id) || ledger.consumedIds.has(fpUuid)) {
            skippedPreviouslySent += 1;
            continue;
        }
        if (!pinnedSet.has(candidate.id) && isLowValueScheduleStub(candidate)) {
            skippedStubs += 1;
            continue;
        }
        if (ledger.historicalTitles.some((oldTitle) => areSameStoryline(oldTitle, cleanCandidateTitle))) {
            skippedPreviouslySent += 1;
            continue;
        }
        if (selectedArticles.some((chosen) => areSameStoryline(chosen.title, cleanCandidateTitle))) {
            skippedStoryDuplicates += 1;
            continue;
        }

        const srcKey = String(candidate.source_name || 'Poker Wire').trim().toLowerCase();
        const usedFromSource = sourceCounts.get(srcKey) || 0;
        if (!pinnedSet.has(candidate.id) && usedFromSource >= 2) {
            continue;
        }

        sourceCounts.set(srcKey, usedFromSource + 1);
        selectedArticles.push({
            ...candidate,
            title: cleanCandidateTitle,
            rawOriginalTitle: candidate.title,
            storyFingerprint: fp,
            storyFingerprintUuid: fpUuid,
        });
    }

    // Backfill real meta-descriptions AND verify/heal upstream og:image URLs on selected stories
    const enrichedArticles = await Promise.all(
        selectedArticles.map(async (article) => {
            const rawBlurb = article.summary || article.excerpt || article.content || '';
            const normalizedTitle = normalizeEditorialTitle(article.title);
            const echoes =
                isEchoingOrEmptyBlurb(article.rawOriginalTitle || normalizedTitle, rawBlurb) ||
                isEchoingOrEmptyBlurb(normalizedTitle, rawBlurb);
            let cleanSummary = echoes ? '' : truncateText(rawBlurb, 190);
            let cleanImageUrl = normalizeCandidateImageUrl(article.image_url || '');

            if (enrichMetaDescriptions) {
                let imageHealthy = cleanImageUrl
                    ? await verifyUpstreamImageReachable(cleanImageUrl, { fetchImpl })
                    : false;
                const needsMetaFetch = Boolean(article.source_url && (!cleanSummary || !imageHealthy));
                if (needsMetaFetch) {
                    const meta = await fetchArticleEditorialMetadata(article.source_url, normalizedTitle, { fetchImpl });
                    const dbPatch = {};
                    if (!cleanSummary && meta.summary) {
                        cleanSummary = meta.summary;
                        dbPatch.summary = meta.summary;
                    }
                    if (!imageHealthy && meta.imageUrl) {
                        const backfilledOk = await verifyUpstreamImageReachable(meta.imageUrl, { fetchImpl });
                        if (backfilledOk) {
                            cleanImageUrl = meta.imageUrl;
                            imageHealthy = true;
                            dbPatch.image_url = meta.imageUrl;
                        }
                    }
                    if (!imageHealthy) {
                        cleanImageUrl = '';
                    }
                    if (Object.keys(dbPatch).length > 0) {
                        try {
                            await sb.from('poker_news').update(dbPatch).eq('id', article.id);
                        } catch {
                            /* non-fatal cache write */
                        }
                    }
                } else if (!imageHealthy) {
                    cleanImageUrl = '';
                }
            }

            const signedThumbUrl = buildSignedEmailImageUrl(cleanImageUrl, { mode: 'thumb' });

            return {
                id: article.id,
                title: normalizedTitle,
                summary: stripEmDashes(cleanSummary),
                source_name: stripEmDashes(article.source_name || 'Poker Wire'),
                source_url: article.source_url || '',
                image_url: cleanImageUrl,
                email_image_url: signedThumbUrl,
                category: String(article.category || 'news').toUpperCase(),
                published_at: article.published_at || null,
                storyFingerprintUuid: article.storyFingerprintUuid,
            };
        })
    );

    // 3. Select 1 unconsumed Spot of the Week (recycling to [0] only when all 16 are consumed)
    const spotCandidates = SPOT_OF_THE_WEEK_CATALOG.map((s) => ({
        ...s,
        markerUuid: spotMarkerUuid(s.slug),
    }));
    const spotOfTheWeek =
        spotCandidates.find((s) => !ledger.consumedIds.has(s.markerUuid)) ||
        spotCandidates[0] ||
        null;

    // 4. Select 1 un-sent Tool Spotlight from the 35-tool catalog
    const toolSpotlight =
        TOOL_SPOTLIGHT_CATALOG.map((t) => ({
            ...t,
            markerUuid: toolMarkerUuid(t.slug),
        })).find((t) => !ledger.consumedIds.has(t.markerUuid)) || null;

    // 5. Query upcoming live poker_series safely (graceful fallback if unavailable in mock DB)
    let upcomingSeries = [];
    try {
        const todayIsoDate = new Date().toISOString().slice(0, 10);
        const { data: seriesRows, error: seriesErr } = await sb
            .from('poker_series')
            .select('id, series_name, venue_name, city, state, start_date, end_date, is_suppressed')
            .gte('end_date', todayIsoDate)
            .order('start_date', { ascending: true })
            .limit(12);
        if (!seriesErr && Array.isArray(seriesRows)) {
            upcomingSeries = seriesRows
                .filter((row) => row && row.is_suppressed !== true && row.series_name)
                .slice(0, 3)
                .map((row) => ({
                    id: row.id,
                    series_name: normalizeEditorialTitle(row.series_name),
                    venue_name: stripEmDashes(row.venue_name || '').trim(),
                    city: stripEmDashes(row.city || '').trim(),
                    state: stripEmDashes(row.state || '').trim(),
                    start_date: row.start_date || null,
                    end_date: row.end_date || null,
                }));
        }
    } catch {
        upcomingSeries = [];
    }

    // 6. Select rotating Active-Player Promo Spotlight
    const rotIdx = (ledger.editionNumber - 1) % ACTIVE_MEMBER_PROMO_ROTATION.length;
    const activePromo = {
        ...ACTIVE_MEMBER_PROMO_ROTATION[rotIdx],
        markerUuid: promoRotationMarkerUuid(ledger.editionNumber, ACTIVE_MEMBER_PROMO_ROTATION[rotIdx].slug),
    };

    // Collect every ledger UUID to persist atomically into newsletter_campaigns.article_ids on send
    const ledgerUuidsToRecord = [
        ...enrichedArticles.map((a) => a.id),
        ...enrichedArticles.map((a) => a.storyFingerprintUuid),
        ...platformUpdates.map((u) => u.id),
        ...(spotOfTheWeek ? [spotOfTheWeek.markerUuid] : []),
        ...(toolSpotlight ? [toolSpotlight.markerUuid] : []),
        activePromo.markerUuid,
    ];

    const leadUpdate = platformUpdates[0];
    const leadStory = enrichedArticles[0];
    const subject = renderWeeklyWireSubject({
        editionNumber: ledger.editionNumber,
        leadUpdateTitle: leadUpdate?.title || '',
        leadStoryTitle: leadStory?.title || '',
    });

    return {
        editionNumber: ledger.editionNumber,
        subject,
        platformUpdates,
        articles: enrichedArticles,
        spotOfTheWeek,
        toolSpotlight,
        upcomingSeries,
        activePromo,
        ledgerUuidsToRecord: [...new Set(ledgerUuidsToRecord)],
        diagnostics: {
            previouslyConsumedCount: ledger.consumedIds.size,
            skippedPreviouslySent,
            skippedStoryDuplicates,
            skippedStubs,
            skippedCompetitorAds,
        },
    };
}

export function renderWeeklyWireSubject({ editionNumber = 1, leadUpdateTitle = '', leadStoryTitle = '' } = {}) {
    if (leadUpdateTitle && leadStoryTitle) {
        const shortUpdate = truncateText(leadUpdateTitle, 52);
        const shortStory = truncateText(leadStoryTitle, 62);
        return truncateText(`${shortUpdate} + ${shortStory} | Smarter.Poker Wire #${editionNumber}`, 190);
    }
    if (leadUpdateTitle) {
        return truncateText(`${leadUpdateTitle} | Smarter.Poker Weekly Wire #${editionNumber}`, 190);
    }
    if (leadStoryTitle) {
        return truncateText(`${leadStoryTitle} | Smarter.Poker Weekly Wire #${editionNumber}`, 190);
    }
    return `Smarter.Poker Weekly Wire #${editionNumber}`;
}

function parseSnoozeUntilMs(source) {
    const raw = String(source || '').trim();
    if (!raw.toLowerCase().startsWith('snooze:')) return 0;
    const token = raw.slice('snooze:'.length).trim();
    if (!token) return 0;
    if (/^\d+$/.test(token)) {
        const num = Number(token);
        if (!Number.isFinite(num)) return 0;
        return token.length <= 10 ? num * 1000 : num;
    }
    const parsed = Date.parse(token);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Resolve all opted-in Weekly Wire recipients, honor snooze windows while keeping
 * `pref:wire_only` active, attach personalization metadata, and classify each into:
 *   - 'non_account'   -> receives 25 Free Chips + 30-Day VIP + 500 Diamonds Signup CTA (?pt=...)
 *   - 'inactive_21d'  -> receives personal Accept Welcome-Back Offer CTA (?wb=...)
 *   - 'active_member' -> receives rotating Club Arena / Daily Challenge Spotlight CTA
 */
export async function resolveWeeklyWireRecipients(
    sb,
    {
        audienceMode = 'opted_in_all',
        nowMs = Date.now(),
        minInactiveDays = WELCOME_BACK_INACTIVE_DAYS,
    } = {}
) {
    const suppressedEmails = new Set();
    const hardEmailMutedUsers = new Set();
    const marketingDisabledUsers = new Set();
    const alreadyClaimedWbUsers = new Set();

    const inactiveSubs = await fetchPaged((from, to) =>
        sb
            .from('newsletter_subscribers')
            .select('id, email, is_active, source')
            .eq('is_active', false)
            .order('id', { ascending: true })
            .range(from, to)
    );
    for (const row of inactiveSubs) {
        const raw = String(row?.email || '').trim().toLowerCase();
        if (raw && !raw.startsWith('sms:')) suppressedEmails.add(raw);
    }

    try {
        const prefs = await fetchPaged((from, to) =>
            sb
                .from('notification_preferences')
                .select('user_id, mute_all, marketing_enabled, email_enabled')
                .order('user_id', { ascending: true })
                .range(from, to)
        );
        for (const p of prefs) {
            if (!p?.user_id) continue;
            const uid = String(p.user_id);
            if (p.mute_all === true || p.email_enabled === false) {
                hardEmailMutedUsers.add(uid);
            }
            if (p.marketing_enabled === false) {
                marketingDisabledUsers.add(uid);
            }
        }
    } catch {
        /* optional in mocks */
    }

    try {
        const { data: wbCodes } = await sb
            .from('promo_codes')
            .select('id, code')
            .in('code', [WELCOME_BACK_CODE, 'sp_welcome_back_202611']);
        const wbCodeIds = (wbCodes || []).map((r) => r?.id).filter(Boolean);
        if (wbCodeIds.length > 0) {
            // in-list: bounded by welcome-back code variants (<= 2)
            const redemptions = await fetchPaged((from, to) =>
                sb
                    .from('promo_code_redemptions')
                    .select('id, promo_code_id, user_id, reward_applied')
                    .in('promo_code_id', wbCodeIds.slice(0, 10))
                    .order('id', { ascending: true })
                    .range(from, to)
            );
            for (const r of redemptions) {
                if (r?.user_id && r?.reward_applied) alreadyClaimedWbUsers.add(String(r.user_id));
            }
        }
    } catch {
        /* optional in mocks */
    }

    const maxTs = (...vals) => {
        let best = 0;
        for (const v of vals) {
            if (!v) continue;
            const ms = typeof v === 'number' ? v : Date.parse(String(v));
            if (Number.isFinite(ms) && ms > best) best = ms;
        }
        return best;
    };

    const cutoffMs = nowMs - Math.max(1, Number(minInactiveDays) || WELCOME_BACK_INACTIVE_DAYS) * 86_400_000;
    const accountByEmail = new Map();

    const profiles = await fetchPaged(
        (from, to) =>
            sb
                .from('profiles')
                .select('id, username, email, phone, phone_verified, diamonds, is_vip, vip_expires_at, player_number, is_horse, created_at, last_active')
                .order('id', { ascending: true })
                .range(from, to),
        25000
    );

    const authById = new Map();
    if (sb?.auth?.admin?.listUsers) {
        try {
            for (let page = 1; page <= 20; page += 1) {
                const { data: authPage, error: authErr } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
                if (authErr || !authPage?.users?.length) break;
                for (const u of authPage.users) {
                    if (u?.id) authById.set(String(u.id), u);
                }
                if (authPage.users.length < 1000) break;
            }
        } catch {
            /* graceful fallback */
        }
    }

    const clubActivityByUser = new Map();
    const browserSeenByUser = new Map();
    const trainingSeenByUser = new Map();
    try {
        const clubRows = await fetchPaged(
            (from, to) =>
                sb
                    .from('club_members')
                    .select('user_id, is_bot, last_active_at, last_active')
                    .order('user_id', { ascending: true })
                    .range(from, to),
            25000
        );
        for (const m of clubRows) {
            if (!m?.user_id || m.is_bot === true) continue;
            const uid = String(m.user_id);
            clubActivityByUser.set(uid, Math.max(clubActivityByUser.get(uid) || 0, maxTs(m.last_active_at, m.last_active)));
        }
    } catch {
        /* optional in mocks */
    }
    try {
        const bindings = await fetchPaged(
            (from, to) =>
                sb
                    .from('ca_browser_bindings')
                    .select('user_id, last_seen')
                    .order('user_id', { ascending: true })
                    .range(from, to),
            25000
        );
        for (const b of bindings) {
            if (!b?.user_id) continue;
            const uid = String(b.user_id);
            browserSeenByUser.set(uid, Math.max(browserSeenByUser.get(uid) || 0, maxTs(b.last_seen)));
        }
    } catch {
        /* optional in mocks */
    }
    try {
        const trainingRows = await fetchPaged(
            (from, to) =>
                sb
                    .from('training_progress')
                    .select('user_id, last_played_at')
                    .order('user_id', { ascending: true })
                    .range(from, to),
            25000
        );
        for (const t of trainingRows) {
            if (!t?.user_id) continue;
            const uid = String(t.user_id);
            trainingSeenByUser.set(uid, Math.max(trainingSeenByUser.get(uid) || 0, maxTs(t.last_played_at)));
        }
    } catch {
        /* optional in mocks */
    }

    for (const p of profiles) {
        const id = String(p?.id || '');
        const uname = String(p?.username || '').trim();
        const authUser = authById.get(id);
        if (
            !id ||
            id.startsWith('00000000-0000-0000-0000-') ||
            p?.is_horse === true ||
            authUser?.is_anonymous === true ||
            SYNTHETIC_USERNAME_RE.test(uname)
        ) {
            continue;
        }
        const cleanEmail = normalizeDeliverableEmail(p.email || authUser?.email || '');
        if (!cleanEmail) continue;

        const lastTouchMs = maxTs(
            p.created_at,
            p.last_active,
            authUser?.created_at,
            authUser?.last_sign_in_at,
            clubActivityByUser.get(id) || 0,
            browserSeenByUser.get(id) || 0,
            trainingSeenByUser.get(id) || 0
        );
        const isInactive21d = lastTouchMs < cutoffMs && !alreadyClaimedWbUsers.has(id);
        const referralCode = formatValidSignupReferralCode(
            p?.player_number ? String(p.player_number) : ''
        );
        accountByEmail.set(cleanEmail, {
            userId: id,
            hardMuted: hardEmailMutedUsers.has(id),
            muted: hardEmailMutedUsers.has(id) || marketingDisabledUsers.has(id),
            segment: isInactive21d ? 'inactive_21d' : 'active_member',
            username: uname,
            diamonds: Number(p?.diamonds || 0),
            isVip: Boolean(p?.is_vip),
            vipExpiresAt: p?.vip_expires_at || null,
            referralCode,
        });
    }

    const recipientsMap = new Map();
    const segmentCounts = { non_account: 0, inactive_21d: 0, active_member: 0 };
    let droppedInvalid = 0;

    const activeSubs = await fetchPaged((from, to) =>
        sb
            .from('newsletter_subscribers')
            .select('id, email, is_active, source')
            .like('email', '%@%')
            .or('is_active.is.null,is_active.eq.true')
            .order('id', { ascending: true })
            .range(from, to)
    );

    for (const row of activeSubs) {
        const clean = normalizeDeliverableEmail(row?.email);
        if (!clean) {
            droppedInvalid += 1;
            continue;
        }
        const rawSource = String(row?.source || '').trim();
        const snoozedUntilMs = parseSnoozeUntilMs(rawSource);
        if (snoozedUntilMs > nowMs) {
            suppressedEmails.add(clean);
            continue;
        }
        if (suppressedEmails.has(clean) || recipientsMap.has(clean)) continue;
        const acct = accountByEmail.get(clean);
        // If subscriber explicitly chose `pref:wire_only` or `pref:all` in Email Preferences,
        // `marketing_enabled === false` only suppresses promo/lifecycle blasts while Weekly Wire stays active.
        const explicitWireOptIn = rawSource === 'pref:wire_only' || rawSource === 'pref:all';
        if (acct && (explicitWireOptIn ? acct.hardMuted : acct.muted)) continue;
        const segment = acct ? acct.segment : 'non_account';
        recipientsMap.set(clean, {
            email: clean,
            userId: acct?.userId || '',
            segment,
            username: acct?.username || '',
            diamonds: acct ? acct.diamonds : 0,
            isVip: acct ? acct.isVip : false,
            vipExpiresAt: acct ? acct.vipExpiresAt : null,
            referralCode: acct?.referralCode || '',
        });
        segmentCounts[segment] += 1;
    }

    if (audienceMode !== 'subscribers_only') {
        for (const [email, acct] of accountByEmail.entries()) {
            if (acct.muted || suppressedEmails.has(email) || recipientsMap.has(email)) continue;
            recipientsMap.set(email, {
                email,
                userId: acct.userId,
                segment: acct.segment,
                username: acct.username,
                diamonds: acct.diamonds,
                isVip: acct.isVip,
                vipExpiresAt: acct.vipExpiresAt,
                referralCode: acct.referralCode,
            });
            segmentCounts[acct.segment] += 1;
        }
    }

    return {
        recipients: [...recipientsMap.values()],
        segmentCounts,
        droppedInvalid,
    };
}

export function buildPromoBlockForSegment(
    segment = 'non_account',
    { userId = '', activePromo = ACTIVE_MEMBER_PROMO_ROTATION[0], siteUrl = 'https://smarter.poker' } = {}
) {
    if (segment === 'inactive_21d') {
        return {
            eyebrow: 'Exclusive Welcome-Back Invitation',
            headline: '25 Free Chips + 500 Free Diamonds + 1-Month Free VIP',
            body: 'Your seat in Kings Club (Code 25450) is waiting. Click below to accept your personal Welcome-Back Offer and unlock all three rewards immediately.',
            ctaLabel: 'Accept Your Offer',
            ctaUrl: buildWelcomeBackOfferUrl(`${siteUrl}/promo/welcome-back`, { userId, siteUrl }),
        };
    }
    if (segment === 'active_member' && activePromo) {
        return {
            eyebrow: stripEmDashes(activePromo.eyebrow),
            headline: stripEmDashes(activePromo.headline),
            body: stripEmDashes(activePromo.body),
            ctaLabel: stripEmDashes(activePromo.ctaLabel),
            ctaUrl: activePromo.ctaUrl,
        };
    }
    return {
        eyebrow: 'New-Player Exclusive Bonus',
        headline: '25 Free Chips + 30-Day Free VIP + 500 Free Diamonds',
        body: 'Create your free Smarter.Poker account through this invitation and verify your phone number to unlock 25 Free Chips in Kings Club (Code 25450), 30 Days of VIP, and 500 Free Diamonds.',
        ctaLabel: 'Claim Your Free Rewards',
        ctaUrl: buildPromoSignupUrl(`${siteUrl}/auth/signup?redirect=%2Fhub%2Fclub-arena%2F%3Fjoin%3D25450`, { siteUrl }),
    };
}

function buildWirePreheader(edition, promo) {
    const upg = stripEmDashes(edition?.platformUpdates?.[0]?.title || 'GTO & Club Arena Upgrades').trim();
    const prm = stripEmDashes(promo?.headline || 'Free Player Rewards').trim();
    const spt = stripEmDashes(edition?.spotOfTheWeek?.title || 'Weekly Solver Decision Spot').trim();

    let summary = `${upg.slice(0, 34).trim()} | ${prm.slice(0, 32).trim()} | Spot: ${spt}`
        .replace(/\s+/g, ' ')
        .trim();
    const suffix = ' | Kings Club 25450 & Live Series Radar On Smarter.Poker';
    if (summary.length < 92) {
        summary = `${summary}${suffix}`;
    }
    if (summary.length > 108) {
        const cut = summary.slice(0, 105);
        const lastSpace = cut.lastIndexOf(' ');
        summary = `${(lastSpace >= 90 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
    }
    if (summary.length < 90) {
        summary = `${summary} - Smarter.Poker Weekly Intelligence`.slice(0, 108);
    }
    return summary.slice(0, 110);
}

export function renderWeeklyWireEmail({
    edition = {},
    promoBlock,
    siteUrl = 'https://smarter.poker',
    postalAddress = DEFAULT_POSTAL_ADDRESS,
    unsubscribeUrl = 'https://smarter.poker/api/news/subscribe?unsubscribe=preview',
    preferencesUrl = '',
    recipientMeta = null,
    subjectOverride = '',
} = {}) {
    const cleanSite = String(siteUrl || 'https://smarter.poker').replace(/\/+$/, '');
    const editionNum = Number(edition.editionNumber || 1);
    const subject = stripEmDashes(subjectOverride || edition.subject || `Smarter.Poker Weekly Wire #${editionNum}`);
    const promo = promoBlock || buildPromoBlockForSegment('non_account', { activePromo: edition.activePromo, siteUrl: cleanSite });
    const preheaderText = buildWirePreheader(edition, promo);
    const webEditionUrl = `${cleanSite}/hub/wire/${editionNum}`;
    const webArchiveUrl = `${cleanSite}/hub/wire`;
    const prefsHref = preferencesUrl || unsubscribeUrl;

    const showPulse = Boolean(
        recipientMeta &&
            (recipientMeta.username || Number(recipientMeta.diamonds) > 0 || Boolean(recipientMeta.isVip))
    );
    const pulseUsername = recipientMeta?.username
        ? `@${String(recipientMeta.username).replace(/^@+/, '')}`
        : 'Smarter Member';
    const pulseDiamonds = Number(recipientMeta?.diamonds || 0).toLocaleString('en-US');
    const pulseMembership = recipientMeta?.isVip ? 'VIP Active' : 'Standard Member';

    const pulseHtml = showPulse
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;background:#0f1824;border:1px solid #1e3246;border-radius:12px;">
<tr><td colspan="3" style="padding:12px 16px 6px 16px;">
<div style="color:#4fc1b3;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">Your Smarter.Poker Pulse</div>
</td></tr>
<tr>
<td width="34%" valign="top" style="padding:6px 12px 14px 16px;border-right:1px solid #1a2a3a;">
<div style="color:#8da2b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Player</div>
<div style="color:#ffffff;font-size:14px;font-weight:800;margin-top:3px;">${escapeHtml(pulseUsername)}</div>
</td>
<td width="33%" valign="top" style="padding:6px 12px 14px 12px;border-right:1px solid #1a2a3a;">
<div style="color:#8da2b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Diamond Balance</div>
<div style="color:#60a5fa;font-size:14px;font-weight:800;margin-top:3px;">${escapeHtml(pulseDiamonds)} Diamonds</div>
</td>
<td width="33%" valign="top" style="padding:6px 16px 14px 12px;">
<div style="color:#8da2b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Membership</div>
<div style="color:#ffffff;font-size:14px;font-weight:800;margin-top:3px;">${escapeHtml(pulseMembership)}</div>
<div style="margin-top:3px;"><a href="${escapeHtml(cleanSite)}/hub/club-arena/" style="color:#4fc1b3;font-size:11.5px;font-weight:700;text-decoration:none;">Club Arena -&gt;</a></div>
</td>
</tr>
</table>`
        : '';

    const updatesHtml = (edition.platformUpdates || [])
        .map(
            (u) => `<tr><td style="padding:0 0 12px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101a25;border:1px solid #1e3246;border-radius:10px;">
<tr><td style="padding:16px 18px;">
<span style="display:inline-block;background:#132d3b;color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;padding:3px 9px;border-radius:999px;">${escapeHtml(u.badge || 'Platform Upgrade')}</span>
<div style="margin:9px 0 6px 0;font-size:16px;font-weight:800;color:#ffffff;line-height:1.3;">${escapeHtml(u.title)}</div>
<div style="color:#b7cadc;font-size:13.5px;line-height:1.55;margin-bottom:10px;">${escapeHtml(u.summary)}</div>
<a href="${escapeHtml(u.ctaUrl)}" style="color:#4fc1b3;font-size:13px;font-weight:700;text-decoration:none;">${escapeHtml(u.ctaLabel || 'Try It Now')} -&gt;</a>
</td></tr>
</table>
</td></tr>`
        )
        .join('');

    const mastheadCrestSrc = buildMastheadCrestUrl({ siteUrl: cleanSite });

    const articlesHtml = (edition.articles || [])
        .map((a) => {
            const href = `${cleanSite}/hub/article?id=${encodeURIComponent(a.id)}`;
            const thumbSrc = buildSignedEmailImageUrl(a.email_image_url || a.image_url || '', {
                siteUrl: cleanSite,
                mode: 'thumb',
            });
            const altTitle = truncateText(a.title || 'Smarter.Poker News Story', 90);
            return `<tr><td style="padding:0 0 14px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1824;border:1px solid #1a2938;border-radius:10px;">
<tr>
<td width="124" valign="top" style="padding:14px 0 14px 14px;"><a href="${escapeHtml(href)}" style="text-decoration:none;"><img src="${escapeHtml(thumbSrc)}" alt="${escapeHtml(altTitle)}" width="112" height="78" border="0" style="display:block;width:112px;height:78px;border-radius:8px;border:1px solid #223548;background:#0b1520;" /></a></td>
<td valign="top" style="padding:14px 16px;">
<div style="color:#4fc1b3;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(a.category || 'POKER NEWS')} &middot; <span style="color:#8da2b8;font-weight:600;">${escapeHtml(a.source_name || 'Poker Wire')}</span></div>
<div style="margin:5px 0 6px 0;"><a href="${escapeHtml(href)}" style="color:#ffffff;font-size:15.5px;font-weight:700;line-height:1.35;text-decoration:none;">${escapeHtml(a.title)}</a></div>
${a.summary ? `<div style="color:#adc0d4;font-size:13px;line-height:1.5;">${escapeHtml(a.summary)}</div>` : ''}
</td>
</tr>
</table>
</td></tr>`;
        })
        .join('');

    const spot = edition.spotOfTheWeek;
    const spotBaseUrl = spot ? String(spot.targetUrl || `${cleanSite}/hub/training/hand-lab`).split('?')[0] : '';
    const spotOptionsHtml = spot
        ? (spot.options || [])
              .map((opt) => {
                  const pickUrl = `${spotBaseUrl}?spot=${encodeURIComponent(spot.slug)}&pick=${encodeURIComponent(opt.key)}`;
                  return `<a href="${escapeHtml(pickUrl)}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 14px;background:#101a25;border:1px solid #255c56;border-radius:999px;color:#4fc1b3;font-size:12.5px;font-weight:700;text-decoration:none;">${escapeHtml(opt.key)}. ${escapeHtml(opt.label)}</a>`;
              })
              .join('')
        : '';

    const spotHtml = spot
        ? `<tr><td style="padding:8px 0 14px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1824;border:1px solid #255c56;border-radius:12px;">
<tr><td style="padding:18px 20px;">
<div style="color:#4fc1b3;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">Spot Of The Week &middot; ${escapeHtml(spot.category || 'GTO Hand Lab')}</div>
<div style="margin:6px 0 8px 0;color:#ffffff;font-size:17px;font-weight:800;line-height:1.3;">${escapeHtml(spot.title)}</div>
<div style="color:#bdcde0;font-size:13.5px;line-height:1.55;margin-bottom:14px;">${escapeHtml(spot.situation)}</div>
<div>${spotOptionsHtml}</div>
</td></tr>
</table>
</td></tr>`
        : '';

    const tool = edition.toolSpotlight;
    const toolHtml = tool
        ? `<tr><td style="padding:6px 0 14px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1824;border:1px solid #1e3246;border-radius:12px;">
<tr><td style="padding:18px 20px;">
<div style="color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">Tool Spotlight Of The Week &middot; ${escapeHtml(tool.category)}</div>
<div style="margin:6px 0 6px 0;color:#ffffff;font-size:17px;font-weight:800;">${escapeHtml(tool.title)}</div>
<div style="color:#bdcde0;font-size:13.5px;line-height:1.55;margin-bottom:12px;">${escapeHtml(tool.tip)}</div>
<a href="${escapeHtml(tool.url)}" style="display:inline-block;background:#1c324a;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 16px;border-radius:7px;">Open Free Tool -&gt;</a>
</td></tr>
</table>
</td></tr>`
        : '';

    const seriesItems = Array.isArray(edition.upcomingSeries) ? edition.upcomingSeries : [];
    const seriesListHtml = seriesItems.length
        ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #1a2a3a;">
<div style="color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">Upcoming Live Tournament Series</div>
${seriesItems
    .map((s) => {
        const loc = [s.city, s.state].filter(Boolean).join(', ');
        return `<div style="color:#ffffff;font-size:13px;font-weight:700;line-height:1.6;">&bull; ${escapeHtml(s.series_name)}${loc ? ` &middot; <span style="color:#9fb3c8;font-weight:600;">${escapeHtml(loc)}</span>` : ''}</div>`;
    })
    .join('')}
</div>`
        : '';

    const radarHtml = `<tr><td style="padding:4px 0 14px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101a25;border:1px solid #1e3246;border-radius:12px;">
<tr><td style="padding:18px 20px;">
<div style="color:#4fc1b3;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">Kings Club &amp; Live Series Radar</div>
<div style="margin:6px 0 6px 0;color:#ffffff;font-size:16.5px;font-weight:800;line-height:1.3;">Nightly Cash, PLO &amp; Spin Action In Kings Club (Code 25450)</div>
<div style="color:#bdcde0;font-size:13.5px;line-height:1.55;">Take a seat in nightly NLH, PLO4, PLO5, and fast 3-handed Spin tables inside Kings Club (Code 25450) with live Bad Beat Jackpot tracking and tournament action.</div>
${seriesListHtml}
<div style="margin-top:12px;">
<a href="${escapeHtml(cleanSite)}/hub/club-arena/?join=25450" style="color:#4fc1b3;font-size:13px;font-weight:700;text-decoration:none;margin-right:16px;">Join Kings Club (Code 25450) -&gt;</a>
<a href="${escapeHtml(cleanSite)}/hub/poker-near-me" style="color:#60a5fa;font-size:13px;font-weight:700;text-decoration:none;">Live Series Radar -&gt;</a>
</div>
</td></tr>
</table>
</td></tr>`;

    const validRefCode = formatValidSignupReferralCode(recipientMeta?.referralCode);
    const referralUrl = validRefCode
        ? `${cleanSite}/auth/signup?ref=${encodeURIComponent(validRefCode)}`
        : `${cleanSite}/auth/signup?utm_source=weekly_wire&utm_medium=email&utm_campaign=crew_share`;
    const referralHtml = `<tr><td style="padding:4px 0 6px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1824;border:1px solid #255c56;border-radius:12px;">
<tr><td style="padding:18px 20px;">
<div style="color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">Share &amp; Earn Free Diamonds</div>
<div style="margin:6px 0 6px 0;color:#ffffff;font-size:16px;font-weight:800;line-height:1.3;">Invite Your Poker Crew To Smarter.Poker</div>
<div style="color:#bdcde0;font-size:13px;line-height:1.55;margin-bottom:12px;">Forward this issue or share your personal invite link below so friends can train with GTO tools and join you at the tables while stacking Diamond rewards.</div>
<a href="${escapeHtml(referralUrl)}" style="display:inline-block;background:#4fc1b3;color:#041e1b;text-decoration:none;font-weight:800;font-size:13px;padding:10px 18px;border-radius:8px;">Share Invite Link -&gt;</a>
<div style="margin-top:8px;font-size:12px;color:#8da2b8;word-break:break-all;"><a href="${escapeHtml(referralUrl)}" style="color:#60a5fa;text-decoration:underline;">${escapeHtml(referralUrl)}</a></div>
</td></tr>
</table>
</td></tr>`;

    const rawHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#05070a;color:#e7edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:1px;color:#05070a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheaderText)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#0b1118;border:1px solid #1b2c3d;border-radius:16px;">
<tr><td style="padding:28px 24px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #1a2a3a;padding-bottom:18px;margin-bottom:22px;">
<tr>
<td width="46" valign="middle" style="padding-right:12px;">
<a href="${escapeHtml(cleanSite)}" style="text-decoration:none;"><img src="${escapeHtml(mastheadCrestSrc)}" alt="Smarter.Poker" width="36" height="36" border="0" style="display:block;width:36px;height:36px;border-radius:9px;" /></a>
</td>
<td valign="middle">
<div style="color:#4fc1b3;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">SMARTER.POKER WEEKLY WIRE</div>
<div style="color:#ffffff;font-size:21px;font-weight:800;margin-top:4px;line-height:1.25;">Edition #${editionNum} &middot; Upgrades, Promos &amp; Poker Intelligence</div>
</td>
<td valign="top" align="right" style="white-space:nowrap;padding-left:12px;">
<a href="${escapeHtml(webEditionUrl)}" style="color:#60a5fa;font-size:12px;font-weight:700;text-decoration:none;">View Web Edition -&gt;</a>
</td>
</tr>
</table>

${pulseHtml}

${updatesHtml ? `<div style="color:#60a5fa;font-size:12px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;margin:0 0 10px 0;">New On Smarter.Poker &middot; Upgrades &amp; Enhancements</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${updatesHtml}</table>` : ''}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 24px 0;background:linear-gradient(135deg,#0c2624 0%,#0f1d2d 100%);border:1px solid #255c56;border-radius:12px;">
<tr><td style="padding:20px 22px;">
<div style="color:#4fc1b3;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">${escapeHtml(promo.eyebrow)}</div>
<div style="color:#ffffff;font-size:19px;font-weight:800;margin:6px 0 8px 0;line-height:1.3;">${escapeHtml(promo.headline)}</div>
<div style="color:#d1e3e0;font-size:14px;line-height:1.55;margin-bottom:16px;">${escapeHtml(promo.body)}</div>
<a href="${escapeHtml(promo.ctaUrl)}" style="display:inline-block;background:#4fc1b3;color:#041e1b;text-decoration:none;font-weight:800;font-size:14px;padding:12px 22px;border-radius:8px;">${escapeHtml(promo.ctaLabel)}</a>
</td></tr>
</table>

${articlesHtml ? `<div style="color:#4fc1b3;font-size:12px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;margin:0 0 10px 0;">This Week In Poker</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${articlesHtml}</table>` : ''}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${spotHtml}
${toolHtml}
${radarHtml}
${referralHtml}
</table>

<div style="border-top:1px solid #1c2a38;margin-top:22px;padding-top:16px;color:#7f93a8;font-size:12px;line-height:1.6;">
<div>Smarter.Poker &middot; ${escapeHtml(postalAddress || DEFAULT_POSTAL_ADDRESS)}</div>
<div style="margin-top:6px;">
<a href="${escapeHtml(prefsHref)}" style="color:#9fb3c8;text-decoration:underline;">Email Preferences</a> &middot;
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#9fb3c8;text-decoration:underline;">Unsubscribe</a> &middot;
<a href="${escapeHtml(webArchiveUrl)}" style="color:#9fb3c8;text-decoration:underline;">Web Archive</a> &middot;
<a href="${escapeHtml(cleanSite)}/hub/news" style="color:#9fb3c8;text-decoration:underline;">News Hub</a> &middot;
<a href="${escapeHtml(cleanSite)}/hub/club-arena/" style="color:#9fb3c8;text-decoration:underline;">Club Arena</a>
</div>
</div>

</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const textLines = [
        `SMARTER.POKER WEEKLY WIRE - EDITION #${editionNum}`,
        `View Web Edition -> ${webEditionUrl}`,
        '',
        ...(showPulse
            ? [
                  `YOUR SMARTER.POKER PULSE: ${pulseUsername} | ${pulseDiamonds} Diamonds | ${pulseMembership}`,
                  '',
              ]
            : []),
        ...(edition.platformUpdates?.length
            ? [
                  '=== NEW ON SMARTER.POKER ===',
                  ...edition.platformUpdates.map((u) => `* [${u.badge}] ${u.title}\n  ${u.summary}\n  ${u.ctaUrl}`),
                  '',
              ]
            : []),
        `=== ${promo.eyebrow.toUpperCase()} ===`,
        promo.headline,
        promo.body,
        `${promo.ctaLabel}: ${promo.ctaUrl}`,
        '',
        ...(edition.articles?.length
            ? [
                  '=== THIS WEEK IN POKER ===',
                  ...edition.articles.map(
                      (a) =>
                          `- ${a.title} (${a.source_name})${a.summary ? `\n  ${a.summary}` : ''}\n  ${cleanSite}/hub/article?id=${encodeURIComponent(a.id)}`
                  ),
                  '',
              ]
            : []),
        ...(spot
            ? [
                  `=== SPOT OF THE WEEK: ${spot.title.toUpperCase()} ===`,
                  spot.situation,
                  ...(spot.options || []).map(
                      (opt) =>
                          `  [${opt.key}] ${opt.label}: ${spotBaseUrl}?spot=${encodeURIComponent(spot.slug)}&pick=${encodeURIComponent(opt.key)}`
                  ),
                  '',
              ]
            : []),
        ...(tool
            ? [
                  `=== TOOL SPOTLIGHT: ${tool.title.toUpperCase()} ===`,
                  tool.tip,
                  tool.url,
                  '',
              ]
            : []),
        '=== KINGS CLUB & LIVE SERIES RADAR ===',
        `Nightly NLH, PLO4/5 & Spin Action in Kings Club (Code 25450): ${cleanSite}/hub/club-arena/?join=25450`,
        ...seriesItems.map((s) => {
            const loc = [s.city, s.state].filter(Boolean).join(', ');
            return `- ${s.series_name}${loc ? ` (${loc})` : ''}`;
        }),
        '',
        '=== SHARE & EARN FREE DIAMONDS ===',
        `Invite Friends: ${referralUrl}`,
        '',
        `Smarter.Poker | ${postalAddress || DEFAULT_POSTAL_ADDRESS}`,
        `Email Preferences: ${prefsHref}`,
        `Unsubscribe: ${unsubscribeUrl}`,
        `Web Archive: ${webArchiveUrl}`,
    ];

    return {
        subject,
        html: stripEmDashes(rawHtml),
        text: stripEmDashes(textLines.join('\n')),
    };
}

export { normalizeExplicitTestEmail };
