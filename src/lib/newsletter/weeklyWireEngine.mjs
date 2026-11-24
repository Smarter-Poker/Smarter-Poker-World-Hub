/**
 * Smarter.Poker Weekly Wire V2 — Zero-Repeat Curation, Enrichment & Segmented Renderer
 *
 * Guarantees that NOTHING repeats within or across editions:
 *   1. Exact UUID exclusion across all historical `newsletter_campaigns.article_ids`.
 *   2. Storyline fingerprinting + Jaccard/entity clustering across both the current
 *      issue AND historical issues (collapses rival blogs covering the same pot/winner,
 *      drops raw `Event #N:` schedule stubs, and caps any external outlet at <= 2 stories).
 *   3. Title-echo suppression (`excerpt === title`) + SSRF-hardened meta-description
 *      enrichment for selected headlines.
 *   4. Lifetime single-use consumption of Smarter.Poker Platform Upgrade slugs and
 *      Weekly Tool Spotlight slugs via deterministic UUIDs stored in `article_ids`.
 *   5. Per-recipient Promo Banner segmentation (`non_account` -> 25 Free Chips Signup
 *      CTA, `inactive_21d` -> Accept Welcome-Back Offer CTA, `active_member` ->
 *      rotating non-repeating Arena / Challenge spotlight).
 */
import crypto from 'crypto';
import dns from 'dns';
import { DEFAULT_POSTAL_ADDRESS, normalizeDeliverableEmail, normalizeExplicitTestEmail } from '../promoCampaigns/dispatch.mjs';
import { buildPromoSignupUrl } from '../promoCampaigns/promoSignupToken.mjs';
import {
    WELCOME_BACK_CODE,
    WELCOME_BACK_INACTIVE_DAYS,
    buildWelcomeBackOfferUrl,
    deterministicUuid,
} from '../promoCampaigns/welcomeBackOffer.mjs';
import {
    ACTIVE_MEMBER_PROMO_ROTATION,
    PLATFORM_UPDATES_CATALOG,
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

export function updateMarkerUuid(slug) {
    return deterministicUuid(`sp-update:${String(slug || '').trim().toLowerCase()}`);
}

export function toolMarkerUuid(slug) {
    return deterministicUuid(`sp-tool:${String(slug || '').trim().toLowerCase()}`);
}

export function promoRotationMarkerUuid(index, slug) {
    return deterministicUuid(`sp-promo-rot:${index}:${String(slug || '').trim().toLowerCase()}`);
}

export function storylineMarkerUuid(fingerprint) {
    return deterministicUuid(`storyline:${String(fingerprint || '').trim().toLowerCase()}`);
}

export function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function truncateText(value, max = 180) {
    const clean = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
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
 * SSRF-hardened meta-description fetcher to backfill missing/echoed summaries
 * on the 4-5 selected digest stories (and cache onto `poker_news.summary`).
 */
export async function fetchCleanArticleMetaDescription(sourceUrl, title, { fetchImpl = fetch, timeoutMs = 2500 } = {}) {
    try {
        const parsed = new URL(String(sourceUrl || '').trim());
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
        const lookup = await dns.promises.lookup(parsed.hostname, { all: true });
        if (!lookup?.length || lookup.some((entry) => isPrivateIp(entry.address))) return '';

        const res = await fetchImpl(parsed.toString(), {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SmarterPokerWire/2.0; +https://smarter.poker)',
                Accept: 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return '';
        const html = (await res.text()).slice(0, 120_000);
        const patterns = [
            /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{25,500})["']/i,
            /<meta[^>]+content=["']([^"']{25,500})["'][^>]+property=["']og:description["']/i,
            /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{25,500})["']/i,
            /<meta[^>]+content=["']([^"']{25,500})["'][^>]+name=["']description["']/i,
        ];
        for (const re of patterns) {
            const m = html.match(re);
            if (m?.[1]) {
                const candidate = truncateText(decodeHtmlEntities(m[1]), 190);
                if (!isEchoingOrEmptyBlurb(title, candidate)) {
                    return candidate;
                }
            }
        }
        return '';
    } catch {
        return '';
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
 * Load the complete Zero-Repeat Ledger from `newsletter_campaigns` + historical
 * `poker_news` rows referenced by past campaigns.
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
        const ids = Array.isArray(c?.article_ids) ? c.article_ids : [];
        if (ids.length > 0) digestSendCount += 1;
        for (const id of ids) {
            if (typeof id === 'string' && id.trim()) {
                const clean = id.trim().toLowerCase();
                consumedIds.add(clean);
                rawArticleUuidList.push(clean);
            }
        }
    }

    // Fetch titles of up to 200 recently mailed poker_news rows so cross-outlet
    // follow-up articles on the same story are blocked across weeks too.
    const uniqueRecentArticleIds = [...new Set(rawArticleUuidList)].slice(0, 200);
    if (uniqueRecentArticleIds.length > 0) {
        try {
            // in-list: bounded by slice(0, 200)
            const { data: pastArticles } = await sb
                .from('poker_news')
                .select('id, title')
                .in('id', uniqueRecentArticleIds.slice(0, 200));
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
 * Curate an entire non-repeating Weekly Wire V2 edition:
 *   - 2–3 fresh Smarter.Poker Platform Upgrades (custom queued rows first, then built-in catalog)
 *   - 4–5 fresh, storyline-deduplicated World Poker News articles with non-echoing summaries
 *   - 1 fresh Tool / Trainer Spotlight (from 35+ catalog)
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
                badge: r.image_caption || 'Platform Update',
                title: r.title,
                summary: r.summary || r.excerpt || '',
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

    const scoredCandidates = (candidateRows || [])
        .filter((a) => a?.id && a?.title)
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

        const fp = computeStoryFingerprint(candidate.title);
        const fpUuid = storylineMarkerUuid(fp);

        if (ledger.consumedIds.has(candidate.id) || ledger.consumedIds.has(fpUuid)) {
            skippedPreviouslySent += 1;
            continue;
        }
        if (!pinnedSet.has(candidate.id) && isLowValueScheduleStub(candidate)) {
            skippedStubs += 1;
            continue;
        }
        if (ledger.historicalTitles.some((oldTitle) => areSameStoryline(oldTitle, candidate.title))) {
            skippedPreviouslySent += 1;
            continue;
        }
        if (selectedArticles.some((chosen) => areSameStoryline(chosen.title, candidate.title))) {
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
            storyFingerprint: fp,
            storyFingerprintUuid: fpUuid,
        });
    }

    // Backfill real meta-descriptions for selected stories whose summary/excerpt echoed the title
    const enrichedArticles = await Promise.all(
        selectedArticles.map(async (article) => {
            const rawBlurb = article.summary || article.excerpt || article.content || '';
            let cleanSummary = isEchoingOrEmptyBlurb(article.title, rawBlurb) ? '' : truncateText(rawBlurb, 190);

            if (!cleanSummary && enrichMetaDescriptions && article.source_url) {
                const fetched = await fetchCleanArticleMetaDescription(article.source_url, article.title, { fetchImpl });
                if (fetched) {
                    cleanSummary = fetched;
                    try {
                        await sb.from('poker_news').update({ summary: fetched }).eq('id', article.id);
                    } catch {
                        /* non-fatal cache write */
                    }
                }
            }

            return {
                id: article.id,
                title: String(article.title).trim(),
                summary: cleanSummary,
                source_name: article.source_name || 'Poker Wire',
                source_url: article.source_url || '',
                image_url: article.image_url || '',
                category: String(article.category || 'news').toUpperCase(),
                published_at: article.published_at || null,
                storyFingerprintUuid: article.storyFingerprintUuid,
            };
        })
    );

    // 3. Select 1 un-sent Tool Spotlight from the 35-tool catalog
    const toolSpotlight =
        TOOL_SPOTLIGHT_CATALOG.map((t) => ({
            ...t,
            markerUuid: toolMarkerUuid(t.slug),
        })).find((t) => !ledger.consumedIds.has(t.markerUuid)) || null;

    // 4. Select rotating Active-Player Promo Spotlight
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
        toolSpotlight,
        activePromo,
        ledgerUuidsToRecord: [...new Set(ledgerUuidsToRecord)],
        diagnostics: {
            previouslyConsumedCount: ledger.consumedIds.size,
            skippedPreviouslySent,
            skippedStoryDuplicates,
            skippedStubs,
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

/**
 * Resolve all opted-in Weekly Wire recipients and classify each into:
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
    const emailMutedUsers = new Set();
    const alreadyClaimedWbUsers = new Set();

    const inactiveSubs = await fetchPaged((from, to) =>
        sb
            .from('newsletter_subscribers')
            .select('email')
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
            if (p.mute_all === true || p.marketing_enabled === false || p.email_enabled === false) {
                emailMutedUsers.add(String(p.user_id));
            }
        }
    } catch {
        /* optional in mocks */
    }

    try {
        const { data: wbCode } = await sb
            .from('promo_codes')
            .select('id')
            .eq('code', WELCOME_BACK_CODE)
            .maybeSingle();
        if (wbCode?.id) {
            const redemptions = await fetchPaged((from, to) =>
                sb
                    .from('promo_code_redemptions')
                    .select('user_id, reward_applied')
                    .eq('promo_code_id', wbCode.id)
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
                .select('id, email, username, is_horse, created_at, last_login, last_active, last_seen')
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

    for (const p of profiles) {
        const id = String(p?.id || '');
        const uname = String(p?.username || '');
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
            p.last_login,
            p.last_active,
            p.last_seen,
            authUser?.created_at,
            authUser?.last_sign_in_at,
            clubActivityByUser.get(id) || 0
        );
        const isInactive21d = lastTouchMs < cutoffMs && !alreadyClaimedWbUsers.has(id);
        accountByEmail.set(cleanEmail, {
            userId: id,
            muted: emailMutedUsers.has(id),
            segment: isInactive21d ? 'inactive_21d' : 'active_member',
        });
    }

    const recipientsMap = new Map();
    const segmentCounts = { non_account: 0, inactive_21d: 0, active_member: 0 };
    let droppedInvalid = 0;

    const activeSubs = await fetchPaged((from, to) =>
        sb
            .from('newsletter_subscribers')
            .select('id, email, is_active')
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
        if (suppressedEmails.has(clean) || recipientsMap.has(clean)) continue;
        const acct = accountByEmail.get(clean);
        if (acct?.muted) continue;
        const segment = acct ? acct.segment : 'non_account';
        recipientsMap.set(clean, {
            email: clean,
            userId: acct?.userId || '',
            segment,
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
            eyebrow: activePromo.eyebrow,
            headline: activePromo.headline,
            body: activePromo.body,
            ctaLabel: activePromo.ctaLabel,
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

export function renderWeeklyWireEmail({
    edition,
    promoBlock,
    siteUrl = 'https://smarter.poker',
    postalAddress = DEFAULT_POSTAL_ADDRESS,
    unsubscribeUrl = 'https://smarter.poker/api/news/subscribe?unsubscribe=preview',
    subjectOverride = '',
} = {}) {
    const cleanSite = String(siteUrl || 'https://smarter.poker').replace(/\/+$/, '');
    const subject = subjectOverride || edition.subject;

    const updatesHtml = (edition.platformUpdates || [])
        .map(
            (u) => `<tr><td style="padding:0 0 12px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101a25;border:1px solid #1e3246;border-radius:10px;">
<tr><td style="padding:16px 18px;">
<span style="display:inline-block;background:#132d3b;color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;padding:3px 9px;border-radius:999px;">${escapeHtml(u.badge || 'Platform Upgrade')}</span>
<div style="margin:9px 0 6px 0;font-size:16px;font-weight:800;color:#ffffff;line-height:1.3;">${escapeHtml(u.title)}</div>
<div style="color:#b7cadc;font-size:13.5px;line-height:1.55;margin-bottom:10px;">${escapeHtml(u.summary)}</div>
<a href="${escapeHtml(u.ctaUrl)}" style="color:#4fc1b3;font-size:13px;font-weight:700;text-decoration:none;">${escapeHtml(u.ctaLabel || 'Try It Now')} &rarr;</a>
</td></tr>
</table>
</td></tr>`
        )
        .join('');

    const promo = promoBlock || buildPromoBlockForSegment('non_account', { activePromo: edition.activePromo, siteUrl: cleanSite });

    const articlesHtml = (edition.articles || [])
        .map((a) => {
            const href = `${cleanSite}/hub/article?id=${encodeURIComponent(a.id)}`;
            const hasImg = Boolean(a.image_url && /^https?:\/\//i.test(a.image_url));
            return `<tr><td style="padding:0 0 14px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d151f;border:1px solid #1a2938;border-radius:10px;">
<tr>
${hasImg ? `<td width="116" valign="top" style="padding:14px 0 14px 14px;"><a href="${escapeHtml(href)}" style="text-decoration:none;"><img src="${escapeHtml(a.image_url)}" alt="" width="104" height="72" style="display:block;width:104px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #223548;" /></a></td>` : ''}
<td valign="top" style="padding:14px 16px;">
<div style="color:#4fc1b3;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(a.category || 'POKER NEWS')} &middot; <span style="color:#8da2b8;font-weight:600;">${escapeHtml(a.source_name || 'Poker Wire')}</span></div>
<div style="margin:5px 0 6px 0;"><a href="${escapeHtml(href)}" style="color:#f1f6fb;font-size:15.5px;font-weight:700;line-height:1.35;text-decoration:none;">${escapeHtml(a.title)}</a></div>
${a.summary ? `<div style="color:#adc0d4;font-size:13px;line-height:1.5;">${escapeHtml(a.summary)}</div>` : ''}
</td>
</tr>
</table>
</td></tr>`;
        })
        .join('');

    const tool = edition.toolSpotlight;
    const toolHtml = tool
        ? `<tr><td style="padding:10px 0 6px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101726;border:1px solid #273452;border-radius:12px;">
<tr><td style="padding:18px 20px;">
<div style="color:#c084fc;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">Tool Spotlight Of The Week &middot; ${escapeHtml(tool.category)}</div>
<div style="margin:6px 0 6px 0;color:#ffffff;font-size:17px;font-weight:800;">${escapeHtml(tool.title)}</div>
<div style="color:#bdcde0;font-size:13.5px;line-height:1.55;margin-bottom:12px;">${escapeHtml(tool.tip)}</div>
<a href="${escapeHtml(tool.url)}" style="display:inline-block;background:#233252;color:#e9f1fb;text-decoration:none;font-weight:700;font-size:13px;padding:9px 16px;border-radius:7px;">Open Free Tool &rarr;</a>
</td></tr>
</table>
</td></tr>`
        : '';

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#05070a;color:#e7edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#0b1118;border:1px solid #1b2c3d;border-radius:16px;">
<tr><td style="padding:28px 24px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #1a2a3a;padding-bottom:18px;margin-bottom:22px;">
<tr>
<td>
<div style="color:#4fc1b3;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">SMARTER.POKER WEEKLY WIRE</div>
<div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:4px;line-height:1.25;">Edition #${Number(edition.editionNumber || 1)} &middot; Upgrades, Promos &amp; Poker Intelligence</div>
</td>
</tr>
</table>

${updatesHtml ? `<div style="color:#60a5fa;font-size:12px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;margin:0 0 10px 0;">New On Smarter.Poker &middot; Upgrades &amp; Enhancements</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${updatesHtml}</table>` : ''}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 24px 0;background:linear-gradient(135deg,#0c2624 0%,#0f1d2d 100%);border:1px solid #255c56;border-radius:12px;">
<tr><td style="padding:20px 22px;">
<div style="color:#fbbf24;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">${escapeHtml(promo.eyebrow)}</div>
<div style="color:#ffffff;font-size:19px;font-weight:800;margin:6px 0 8px 0;line-height:1.3;">${escapeHtml(promo.headline)}</div>
<div style="color:#d1e3e0;font-size:14px;line-height:1.55;margin-bottom:16px;">${escapeHtml(promo.body)}</div>
<a href="${escapeHtml(promo.ctaUrl)}" style="display:inline-block;background:#4fc1b3;color:#041e1b;text-decoration:none;font-weight:800;font-size:14px;padding:12px 22px;border-radius:8px;">${escapeHtml(promo.ctaLabel)}</a>
</td></tr>
</table>

${articlesHtml ? `<div style="color:#4fc1b3;font-size:12px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;margin:0 0 10px 0;">This Week In Poker</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${articlesHtml}</table>` : ''}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${toolHtml}</table>

<div style="border-top:1px solid #1c2a38;margin-top:22px;padding-top:16px;color:#7f93a8;font-size:12px;line-height:1.6;">
<div>Smarter.Poker &middot; ${escapeHtml(postalAddress || DEFAULT_POSTAL_ADDRESS)}</div>
<div style="margin-top:6px;">
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#9fb3c8;text-decoration:underline;">Unsubscribe</a> &middot;
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
        `SMARTER.POKER WEEKLY WIRE - EDITION #${Number(edition.editionNumber || 1)}`,
        '',
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
        ...(tool
            ? [
                  `=== TOOL SPOTLIGHT: ${tool.title.toUpperCase()} ===`,
                  tool.tip,
                  tool.url,
                  '',
              ]
            : []),
        `Smarter.Poker | ${postalAddress || DEFAULT_POSTAL_ADDRESS}`,
        `Unsubscribe: ${unsubscribeUrl}`,
    ];

    return {
        subject,
        html,
        text: textLines.join('\n'),
    };
}

export { normalizeExplicitTestEmail };
