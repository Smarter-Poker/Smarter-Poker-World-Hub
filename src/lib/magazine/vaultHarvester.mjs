/**
 * Smarter.Poker Monthly Magazine Continuous Vault Harvester
 *
 * Continuously banks curated monthly poker journalism, high-resolution photography,
 * Global POY Top 25 standings, Kings Club 25450 tournament results (Chips only),
 * GTO Strategy Spots + real community `[SPOT-VOTE]` tallies, Poker IQ Trivia,
 * curated Video Library breakdowns, Platform Highlights, 60-day Live Series schedules,
 * and Featured Poker Rooms into `public.magazine_vault_items`.
 *
 * Strictly enforces:
 *   - Public venue privacy (`redactPublicVenue` & `isUnverifiedSelfRegistration`).
 *   - Idempotent `upsert` on `(issue_period, source_type, source_id)` while
 *     preserving operator `is_pinned`, `is_excluded`, `vaulted_storage_path`,
 *     Weekly Wire provenance metadata, and peak `editorial_score`.
 *   - Hard 20-second external network budget so serverless executions never time out.
 *   - SSRF-hardened HTML paragraph extraction (`assertFetchableUrl` + `fetchGuarded`).
 *   - Zero em/en dashes (`stripMagazineDashes`) and Chips-only formatting (`formatChipsOnly`).
 */
import { assertFetchableUrl, fetchGuarded } from '../security/fetchableUrl.js';
import { isCompetitorSponsoredPost, normalizeEditorialTitle } from '../newsletter/editorialCleaners.mjs';
import {
    KINGS_CLUB_UUID,
    areSameStoryline,
    isEchoingOrEmptyBlurb,
    isLowValueScheduleStub,
} from '../newsletter/weeklyWireEngine.mjs';
import {
    PLATFORM_UPDATES_CATALOG,
    SPOT_OF_THE_WEEK_CATALOG,
    TOOL_SPOTLIGHT_CATALOG,
    TRIVIA_OF_THE_WEEK_CATALOG,
} from '../newsletter/weeklyWireCatalog.mjs';
import { buildSpotCardImageUrl } from '../newsletter/emailImageProxy.mjs';
import { SPOT_VOTE_SUBJECT_PREFIX, parseSpotVotesSummary } from '../newsletter/campaignTelemetry.mjs';
import { VIDEO_ROW_FIELDS, normaliseVideoRow, watchPath } from '../videoLibraryWatch.mjs';
import { BLOCKED_VIDEO_LIBRARY_IDS, isVideoLibraryVideoAllowed } from '../videoLibraryAvailability.js';
import {
    dedupeVideos,
    isCasinoGameFiledAsPoker,
    isCuratedFeedVideo,
    isDisplayableVideoTitle,
} from '../videoLibraryCuration.mjs';
import {
    isUnverifiedSelfRegistration,
    redactPublicVenue,
} from '../poker-near-me/publicVenuePrivacy.mjs';
import {
    MAGAZINE_SITE_URL,
    currentIssuePeriod,
    formatChipsOnly,
    isValidIssuePeriod,
    stripMagazineDashes,
} from './magazineSchema.mjs';
import { IMAGE_VAULT_FALLBACK_URL, vaultMagazineImage } from './imageVault.mjs';

const DEFAULT_EXTERNAL_BUDGET_MS = 20_000;
const MAX_ARTICLE_HTML_BYTES = 1_500_000;
const BLOCKED_VIDEO_SET = new Set(BLOCKED_VIDEO_LIBRARY_IDS);
const VERIFIED_SERIES_QUALITIES = ['scraped_verified', 'scraped_inferred', 'manual_research'];
const EXCLUDED_CARDROOM_VENUE_TYPES = ['series', 'tour', 'home_game'];

const BOILERPLATE_PATTERNS = [
    'table of contents',
    'related players',
    'share this',
    'follow us',
    'sign up for our newsletter',
    'subscribe to',
    'feature image courtesy',
    'related articles',
    'advertisement',
    'you may also like',
    'read more:',
    'cookie policy',
    'all rights reserved',
    'add as a preferred source on google',
];

export function stripScraperBylinePrefix(text) {
    let clean = stripMagazineDashes(text || '');
    if (!clean) return '';

    clean = clean
        .replace(
            /^[\s\S]{0,90}?\bPosted\s+on:\s*[A-Za-z]+\s+\d{1,2},\s*\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*[A-Z]{2,4})?)?\s*(?:Link\s+copied\s*)?(?:Add\s+as\s+a\s+preferred\s+source\s+on\s+Google\s*)?/i,
            ''
        )
        .replace(/^Link\s+copied\s*/i, '')
        .replace(/^Add\s+as\s+a\s+preferred\s+source\s+on\s+Google\s*/i, '')
        .replace(/^\d+\s+min(?:ute)?s?\s+read\s*[•·|-]?\s*/i, '');

    return stripMagazineDashes(clean);
}

async function getSupabaseClient(sb) {
    if (sb && typeof sb === 'object') return sb;
    const { createClient } = await import('../supabaseServerClient.js');
    return createClient();
}

export function computeIssuePeriodBounds(issuePeriod) {
    const clean = isValidIssuePeriod(issuePeriod) ? String(issuePeriod).trim() : currentIssuePeriod();
    const [yearStr, monthStr] = clean.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const startDate = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
    return {
        period: clean,
        year,
        monthIndex,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        startDateStr: startDate.toISOString().slice(0, 10),
        endDateStr: endDate.toISOString().slice(0, 10),
    };
}

function deterministicPeriodOffset(period, modulus) {
    if (!modulus || modulus <= 1) return 0;
    let hash = 0;
    const str = String(period || '');
    for (let i = 0; i < str.length; i += 1) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash % modulus;
}

function decodeBasicHtml(raw) {
    return stripScraperBylinePrefix(
        String(raw || '')
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
    );
}

export function buildCleanNonEchoingDeck({ title = '', rawSummary = '', rawExcerpt = '', paragraphs = [], sourceName = '', category = '' } = {}) {
    const cleanTitle = stripMagazineDashes(title);
    const candidates = [
        stripScraperBylinePrefix(rawSummary),
        stripScraperBylinePrefix(rawExcerpt),
        ...(Array.isArray(paragraphs) ? paragraphs.map((p) => stripScraperBylinePrefix(p)) : []),
    ];

    for (const cand of candidates) {
        if (!cand || cand.length < 32) continue;
        if (!isEchoingOrEmptyBlurb(cleanTitle, cand)) {
            return cand.slice(0, 280);
        }
    }

    const outlet = stripMagazineDashes(sourceName || 'Smarter.Poker News Desk');
    const cat = stripMagazineDashes(category || 'World Poker').toLowerCase();
    return stripMagazineDashes(
        `Full ${cat} breakdown via ${outlet}, examining field turnouts, tournament structures, and championship storylines.`
    ).slice(0, 280);
}

function isBoilerplateParagraph(text) {
    const lower = String(text || '').toLowerCase().trim();
    if (!lower || lower.length < 36) return true;
    return BOILERPLATE_PATTERNS.some((pat) => lower.startsWith(pat) || lower === pat);
}

export function parseCleanParagraphsFromHtml(html, maxParagraphs = 6) {
    if (!html || typeof html !== 'string') return [];

    const containerPatterns = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]*class="[^"]*(?:article-body|entry-content|post-content|story-body|content-body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i,
    ];

    let scopeHtml = '';
    for (const pattern of containerPatterns) {
        const match = html.match(pattern);
        if (match?.[1] && match[1].length > 220) {
            scopeHtml = match[1];
            break;
        }
    }
    if (!scopeHtml) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        scopeHtml = bodyMatch ? bodyMatch[1] : html;
    }

    const stripped = scopeHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[\s\S]*?<\/aside>/gi, '')
        .replace(/<figure[\s\S]*?<\/figure>/gi, '')
        .replace(/<form[\s\S]*?<\/form>/gi, '');

    const paragraphs = [];
    const seenPrefixes = new Set();
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pRegex.exec(stripped)) !== null && paragraphs.length < maxParagraphs) {
        const text = decodeBasicHtml(match[1]);
        if (isBoilerplateParagraph(text)) continue;
        if (isCompetitorSponsoredPost({ title: '', summary: text })) continue;
        const prefix = text.slice(0, 64).toLowerCase();
        if (seenPrefixes.has(prefix)) continue;
        seenPrefixes.add(prefix);
        paragraphs.push(text.slice(0, 700));
    }

    return paragraphs;
}

export async function extractArticleBodySafe(
    sourceUrl,
    {
        deadlineMs = Date.now() + 4500,
        assertFetchableFn = assertFetchableUrl,
        fetchGuardedFn = fetchGuarded,
    } = {}
) {
    const remaining = deadlineMs - Date.now();
    if (remaining < 450 || !sourceUrl) return [];

    let parsed;
    try {
        parsed = new URL(String(sourceUrl).trim());
    } catch {
        return [];
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];

    try {
        const allowed = await assertFetchableFn(parsed);
        if (!allowed) return [];

        const timeoutMs = Math.min(4200, Math.max(400, deadlineMs - Date.now()));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetchGuardedFn(
                parsed.toString(),
                {
                    method: 'GET',
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; SmarterPokerMagazine/1.0; +https://smarter.poker)',
                        Accept: 'text/html,application/xhtml+xml',
                        'Accept-Language': 'en-US,en;q=0.9',
                    },
                },
                3
            );

            if (!response || !response.ok) return [];
            const ct = String(response.headers?.get?.('content-type') || '').toLowerCase();
            if (ct && !ct.includes('html') && !ct.includes('xml')) return [];

            let html = '';
            if (response.body && typeof response.body.getReader === 'function') {
                const reader = response.body.getReader();
                const chunks = [];
                let bytes = 0;
                try {
                    while (bytes < MAX_ARTICLE_HTML_BYTES) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const buf = Buffer.from(value);
                        bytes += buf.byteLength;
                        chunks.push(buf);
                    }
                    try {
                        await reader.cancel();
                    } catch {
                        /* ignore */
                    }
                } finally {
                    try {
                        reader.releaseLock?.();
                    } catch {
                        /* ignore */
                    }
                }
                html = Buffer.concat(chunks).toString('utf8');
            } else {
                const text = await response.text();
                html = text.slice(0, MAX_ARTICLE_HTML_BYTES);
            }

            return parseCleanParagraphsFromHtml(html, 6);
        } finally {
            clearTimeout(timer);
        }
    } catch {
        return [];
    }
}

function buildSynthesizedEditorialParagraphs(row, normalizedTitle) {
    const out = [];
    const rawContent = decodeBasicHtml(row?.content || '');
    const rawSummary = decodeBasicHtml(row?.summary || row?.excerpt || '');

    if (rawContent && rawContent.length >= 60) {
        const parts = rawContent
            .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/)
            .map((p) => stripMagazineDashes(p))
            .filter((p) => p.length >= 40);
        let acc = '';
        for (const sentence of parts) {
            acc = acc ? `${acc} ${sentence}` : sentence;
            if (acc.length >= 220) {
                out.push(acc);
                acc = '';
            }
            if (out.length >= 5) break;
        }
        if (acc && out.length < 5) out.push(acc);
    }

    if (out.length === 0 && rawSummary && rawSummary.length >= 30 && !isEchoingOrEmptyBlurb(normalizedTitle, rawSummary)) {
        out.push(rawSummary);
    }

    if (out.length < 2) {
        const outlet = stripMagazineDashes(row?.source_name || 'World Poker Desk');
        const category = stripMagazineDashes(row?.category || 'Tournament & Industry Report');
        out.push(
            `${normalizedTitle} headlines this month's ${category.toLowerCase()} coverage via ${outlet}, tracking key shifts in tournament fields, prize structures, and top-level competitive storylines.`
        );
    }

    return out.slice(0, 6);
}

async function loadExistingVaultMap(client, period) {
    const map = new Map();
    if (!client || typeof client.from !== 'function') return map;

    let query = client
        .from('magazine_vault_items')
        .select(
            'id, section, source_type, source_id, body_text, vaulted_image_url, vaulted_master_url, vaulted_storage_path, image_width, image_height, editorial_score, is_pinned, is_excluded, metadata_json'
        )
        .eq('issue_period', period);

    if (typeof query.order === 'function') {
        query = query
            .order('is_pinned', { ascending: false })
            .order('is_excluded', { ascending: false })
            .order('editorial_score', { ascending: false });
    }
    if (typeof query.limit === 'function') {
        query = query.limit(1000);
    }

    const { data, error } = await query;
    if (error) throw error;

    for (const row of data || []) {
        if (!row?.source_type || !row?.source_id) continue;
        const key = `${row.source_type}::${row.source_id}`;
        map.set(key, row);
    }
    return map;
}

async function upsertVaultItemsResilient(client, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { upsertedCount: 0, rows: [] };
    }

    // Deduplicate in-batch across (issue_period, section, source_type, source_id) & unique constraint
    // (issue_period, source_type, source_id), skipping empty cleaned headlines and clamping <= 500 chars.
    const seenSectionKeys = new Set();
    const dedupedByConflictKey = new Map();

    for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        const cleanHeadline = stripMagazineDashes(r.headline || '').slice(0, 500);
        if (!cleanHeadline) continue;

        const cleanPeriod = String(r.issue_period || '').trim();
        const cleanSection = String(r.section || 'news_brief').trim();
        const cleanSourceType = String(r.source_type || '').trim().slice(0, 64);
        const cleanSourceId = String(r.source_id || '').trim().slice(0, 256);
        if (!cleanPeriod || !cleanSourceType || !cleanSourceId) continue;

        const sectionKey = `${cleanPeriod}::${cleanSection}::${cleanSourceType}::${cleanSourceId}`;
        if (seenSectionKeys.has(sectionKey)) continue;
        seenSectionKeys.add(sectionKey);

        const conflictKey = `${cleanPeriod}::${cleanSourceType}::${cleanSourceId}`;
        const metaObj = r.metadata_json ?? r.metadata ?? r.payload_json ?? {};
        const dbRow = {
            issue_period: cleanPeriod,
            section: cleanSection,
            source_type: cleanSourceType,
            source_id: cleanSourceId,
            headline: cleanHeadline,
            deck: r.deck != null ? stripMagazineDashes(r.deck) : r.summary != null ? stripMagazineDashes(r.summary) : null,
            body_text: r.body_text ?? null,
            author_byline:
                r.author_byline ??
                (metaObj && typeof metaObj === 'object' && metaObj.byline ? stripMagazineDashes(metaObj.byline) : null),
            canonical_url: r.canonical_url ?? r.source_url ?? null,
            original_image_url: r.original_image_url ?? null,
            vaulted_image_url: r.vaulted_image_url ?? null,
            vaulted_master_url: r.vaulted_master_url ?? null,
            vaulted_storage_path: r.vaulted_storage_path ?? null,
            image_width: Number.isFinite(Number(r.image_width)) && Number(r.image_width) >= 1 ? Math.round(Number(r.image_width)) : null,
            image_height: Number.isFinite(Number(r.image_height)) && Number(r.image_height) >= 1 ? Math.round(Number(r.image_height)) : null,
            editorial_score: Number.isFinite(Number(r.editorial_score)) ? Number(r.editorial_score) : 0,
            is_pinned: Boolean(r.is_pinned),
            is_excluded: Boolean(r.is_excluded),
            metadata_json: metaObj && typeof metaObj === 'object' ? metaObj : {},
            updated_at: new Date().toISOString(),
        };

        const prior = dedupedByConflictKey.get(conflictKey);
        if (
            !prior ||
            (dbRow.is_pinned && !prior.is_pinned) ||
            dbRow.editorial_score >= prior.editorial_score
        ) {
            dedupedByConflictKey.set(conflictKey, dbRow);
        }
    }

    let currentRows = [...dedupedByConflictKey.values()];
    if (currentRows.length === 0) {
        return { upsertedCount: 0, rows: [] };
    }
    if (!client || typeof client.from !== 'function') {
        return { upsertedCount: currentRows.length, rows: currentRows };
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const query = client
            .from('magazine_vault_items')
            .upsert(currentRows, { onConflict: 'issue_period,source_type,source_id' });
        const result = typeof query.select === 'function' ? await query.select('*') : await query;
        if (!result?.error) {
            return {
                upsertedCount: currentRows.length,
                rows: Array.isArray(result?.data) ? result.data : currentRows,
            };
        }

        const msg = String(result.error.message || result.error.details || '');
        const missingColMatch =
            msg.match(/Could not find the '([^']+)' column/i) ||
            msg.match(/column "([^"]+)" of relation "magazine_vault_items" does not exist/i) ||
            msg.match(/column "([^"]+)" does not exist/i);

        if (missingColMatch?.[1]) {
            const missingCol = missingColMatch[1];
            currentRows = currentRows.map((row) => {
                const clone = { ...row };
                if (missingCol === 'metadata' && clone.metadata && !('payload_json' in clone)) {
                    clone.payload_json = clone.metadata;
                }
                delete clone[missingCol];
                return clone;
            });
            continue;
        }

        throw result.error;
    }

    return { upsertedCount: currentRows.length, rows: currentRows };
}

async function loadSpotVotesMap(client) {
    const votesBySlug = {};
    try {
        let query = client
            .from('newsletter_campaigns')
            .select('subject, error_summary')
            .eq('status', 'cancelled');
        if (typeof query.ilike === 'function') {
            query = query.ilike('subject', `${SPOT_VOTE_SUBJECT_PREFIX}%`);
        } else if (typeof query.like === 'function') {
            query = query.like('subject', `${SPOT_VOTE_SUBJECT_PREFIX}%`);
        }
        const { data } = await query.limit(60);
        for (const row of data || []) {
            const subj = String(row?.subject || '').trim();
            if (!subj.toUpperCase().startsWith(SPOT_VOTE_SUBJECT_PREFIX)) continue;
            const slug = subj.slice(SPOT_VOTE_SUBJECT_PREFIX.length).trim();
            if (!slug) continue;
            const counts = parseSpotVotesSummary(row?.error_summary);
            const existing = votesBySlug[slug] || { A: 0, B: 0, C: 0 };
            votesBySlug[slug] = {
                A: existing.A + counts.A,
                B: existing.B + counts.B,
                C: existing.C + counts.C,
            };
        }
    } catch {
        /* non-blocking */
    }
    return votesBySlug;
}

function mergePreservedFlags(candidateRow, existingMap) {
    const key = `${candidateRow.source_type}::${candidateRow.source_id}`;
    const prev = existingMap.get(key);
    if (!prev) return candidateRow;

    const prevMeta =
        prev.metadata_json && typeof prev.metadata_json === 'object'
            ? prev.metadata_json
            : prev.metadata && typeof prev.metadata === 'object'
              ? prev.metadata
              : {};
    const candMeta =
        candidateRow.metadata_json && typeof candidateRow.metadata_json === 'object'
            ? candidateRow.metadata_json
            : candidateRow.metadata && typeof candidateRow.metadata === 'object'
              ? candidateRow.metadata
              : {};
    const mergedMeta = {
        ...candMeta,
        ...(prevMeta.wireEditionNumber != null && candMeta.wireEditionNumber == null
            ? { wireEditionNumber: prevMeta.wireEditionNumber }
            : {}),
        ...(prevMeta.campaignId != null && candMeta.campaignId == null
            ? { campaignId: prevMeta.campaignId }
            : {}),
    };

    return {
        ...candidateRow,
        vaulted_storage_path: candidateRow.vaulted_storage_path || prev.vaulted_storage_path || null,
        editorial_score: Math.max(
            Number(prev.editorial_score || 0),
            Number(candidateRow.editorial_score || 0)
        ),
        is_pinned: Boolean(prev.is_pinned),
        is_excluded: Boolean(prev.is_excluded),
        metadata: mergedMeta,
        metadata_json: mergedMeta,
    };
}

async function queryPokerNewsWindow(client, startIso, endIso, limit) {
    const fullSelect =
        'id, slug, title, summary, excerpt, content, source_name, source_url, image_url, category, is_featured, views, view_count, published_at';
    const fallbackSelect =
        'id, slug, title, summary, excerpt, content, source_name, source_url, image_url, category, is_featured, view_count, published_at';

    const primary = await client
        .from('poker_news')
        .select(fullSelect)
        .eq('is_published', true)
        .neq('category', 'platform_update')
        .gte('published_at', startIso)
        .lt('published_at', endIso)
        .order('published_at', { ascending: false })
        .limit(limit);

    if (!primary?.error) {
        return Array.isArray(primary?.data) ? primary.data : [];
    }

    const fallback = await client
        .from('poker_news')
        .select(fallbackSelect)
        .eq('is_published', true)
        .neq('category', 'platform_update')
        .gte('published_at', startIso)
        .lt('published_at', endIso)
        .order('published_at', { ascending: false })
        .limit(limit);
    return Array.isArray(fallback?.data) ? fallback.data : [];
}

/**
 * Harvests all monthly magazine sections into `public.magazine_vault_items`.
 */
export async function harvestMonthlyMagazineVault(
    sb,
    {
        issuePeriod = '',
        externalBudgetMs = DEFAULT_EXTERNAL_BUDGET_MS,
        maxNewsItems = 22,
        fetchImpl = fetch,
        assertFetchableFn = assertFetchableUrl,
        nowMs = Date.now(),
    } = {}
) {
    const client = await getSupabaseClient(sb);
    const bounds = computeIssuePeriodBounds(issuePeriod || currentIssuePeriod(new Date(nowMs)));
    const period = bounds.period;
    const externalDeadlineMs = Date.now() + Math.min(25_000, Math.max(1_000, Number(externalBudgetMs) || DEFAULT_EXTERNAL_BUDGET_MS));

    const existingMap = await loadExistingVaultMap(client, period);
    const stagedRows = [];

    // 1. Harvest `poker_news` stories for target `issuePeriod`
    let rawNews = [];
    try {
        rawNews = await queryPokerNewsWindow(client, bounds.startIso, bounds.endIso, 100);

        // If early in the month (< 8 stories inside strict UTC month window), supplement from trailing 35d ending at bounds.endIso
        if (rawNews.length < 8) {
            const fallbackStartIso = new Date(Date.parse(bounds.endIso) - 35 * 86_400_000).toISOString();
            const recentData = await queryPokerNewsWindow(client, fallbackStartIso, bounds.endIso, 60);
            const seenIds = new Set(rawNews.map((r) => String(r?.id || '')));
            for (const extra of recentData) {
                if (extra?.id && !seenIds.has(String(extra.id))) {
                    seenIds.add(String(extra.id));
                    rawNews.push(extra);
                }
            }
        }
    } catch {
        rawNews = [];
    }

    const clusteredStories = [];
    for (const row of rawNews) {
        if (!row?.id || !row?.title) continue;
        if (isCompetitorSponsoredPost(row)) continue;
        if (isLowValueScheduleStub(row)) continue;

        const cleanTitle = stripMagazineDashes(normalizeEditorialTitle(row.title)).slice(0, 500);
        if (!cleanTitle) continue;
        if (clusteredStories.some((c) => areSameStoryline(c.cleanTitle, cleanTitle))) continue;

        const popularityViews = Math.max(Number(row.views || 0), Number(row.view_count || 0));
        const isPodcastOrVideoStub =
            /\bpodcast\b|\bepisode\s*#?\d+\b/i.test(cleanTitle) || cleanTitle.includes('|');
        const isMajorTourStory =
            /\b(wsop|wsopc|wpt|ept|triton|mspt|apt|pgt|main event|championship|high roller|final table|trophy)\b/i.test(
                cleanTitle
            );
        const baseScore =
            (row.is_featured ? 32 : 0) +
            (row.image_url ? 18 : 0) +
            (row.content && String(row.content).length > 300 ? 20 : 0) +
            (isMajorTourStory ? 18 : 0) +
            Math.min(25, Math.floor(popularityViews / 12)) -
            (isPodcastOrVideoStub ? 16 : 0);

        clusteredStories.push({ row, cleanTitle, baseScore, isPodcastOrVideoStub, isMajorTourStory });
    }

    clusteredStories.sort(
        (a, b) => b.baseScore - a.baseScore || Date.parse(b.row.published_at || 0) - Date.parse(a.row.published_at || 0)
    );

    const topStories = clusteredStories.slice(0, Math.max(6, Math.min(maxNewsItems, 26)));
    let coverCount = 0;
    let photoEssayCount = 0;
    let featureCount = 0;

    for (let idx = 0; idx < topStories.length; idx += 1) {
        const { row, cleanTitle, baseScore, isPodcastOrVideoStub } = topStories[idx];
        const sourceId = String(row.id);
        const existing = existingMap.get(`poker_news::${sourceId}`);

        let paragraphs = [];
        if (existing?.body_text && String(existing.body_text).split('\n\n').filter(Boolean).length >= 2) {
            paragraphs = String(existing.body_text)
                .split('\n\n')
                .map((p) => stripScraperBylinePrefix(p))
                .filter((p) => p.length >= 36 && !isEchoingOrEmptyBlurb(cleanTitle, p));
        }
        if (paragraphs.length < 2 && Date.now() < externalDeadlineMs - 600 && row.source_url && idx < 10) {
            paragraphs = await extractArticleBodySafe(row.source_url, { deadlineMs: externalDeadlineMs });
            paragraphs = paragraphs
                .map((p) => stripScraperBylinePrefix(p))
                .filter((p) => p.length >= 36 && !isEchoingOrEmptyBlurb(cleanTitle, p));
        }
        if (paragraphs.length < 2) {
            paragraphs = buildSynthesizedEditorialParagraphs(row, cleanTitle);
        }

        let vaultImg;
        if (
            existing?.vaulted_image_url &&
            existing.vaulted_image_url !== IMAGE_VAULT_FALLBACK_URL &&
            existing?.vaulted_master_url
        ) {
            vaultImg = {
                vaultedImageUrl: existing.vaulted_image_url,
                vaultedMasterUrl: existing.vaulted_master_url,
                storagePath: existing.vaulted_storage_path || null,
                width: Number(existing.image_width || 1200),
                height: Number(existing.image_height || 800),
                usedFallback: false,
            };
        } else {
            const allowRemoteImg = Date.now() < externalDeadlineMs - 400;
            vaultImg = await vaultMagazineImage(client, {
                sourceUrl: allowRemoteImg ? row.image_url || '' : '',
                issuePeriod: period,
                hintKey: `news:${sourceId}`,
                fallbackHeadline: cleanTitle,
                fallbackTag: row.category || 'News',
                fetchImpl,
                assertFetchableFn,
                timeoutMs: Math.min(5500, Math.max(500, externalDeadlineMs - Date.now())),
            });
        }

        const isHighResPhoto = !vaultImg.usedFallback && Number(vaultImg.width || 0) >= 1000;
        const isDeepDive =
            paragraphs.join(' ').length >= 420 ||
            /\b(wsop|wpt|ept|triton|main event|championship|high roller|million|final table|industry)\b/i.test(cleanTitle);

        let section = 'news_brief';
        if (coverCount < 3 && !isPodcastOrVideoStub && (row.is_featured || idx < 4) && (!vaultImg.usedFallback || idx === 0)) {
            section = 'cover_candidate';
            coverCount += 1;
        } else if (isHighResPhoto && !isPodcastOrVideoStub && photoEssayCount < 3) {
            section = 'photo_essay';
            photoEssayCount += 1;
        } else if (isDeepDive && !isPodcastOrVideoStub && featureCount < 5) {
            section = 'feature_story';
            featureCount += 1;
        }

        const editorialScore =
            baseScore +
            (isHighResPhoto ? 22 : 0) +
            Math.min(20, paragraphs.length * 4) +
            (section === 'cover_candidate' ? 15 : 0);

        const summaryText = buildCleanNonEchoingDeck({
            title: cleanTitle,
            rawSummary: decodeBasicHtml(row.summary || ''),
            rawExcerpt: decodeBasicHtml(row.excerpt || ''),
            paragraphs,
            sourceName: row.source_name || 'Smarter.Poker News Desk',
            category: row.category || 'Tournament & Industry',
        });

        stagedRows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section,
                    source_type: 'poker_news',
                    source_id: sourceId,
                    headline: cleanTitle,
                    summary: summaryText,
                    body_text: paragraphs.join('\n\n'),
                    source_url: String(row.source_url || `${MAGAZINE_SITE_URL}/hub/news`),
                    original_image_url: String(row.image_url || ''),
                    vaulted_image_url: vaultImg.vaultedImageUrl,
                    vaulted_master_url: vaultImg.vaultedMasterUrl,
                    vaulted_storage_path: vaultImg.storagePath ?? existing?.vaulted_storage_path ?? null,
                    image_width: Number(vaultImg.width || 1200),
                    image_height: Number(vaultImg.height || 800),
                    editorial_score: editorialScore,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        byline: stripMagazineDashes(row.source_name || 'Smarter.Poker News Desk'),
                        category: stripMagazineDashes(row.category || 'Poker News'),
                        publishedAt: row.published_at || null,
                        usedFallbackImage: Boolean(vaultImg.usedFallback),
                    },
                },
                existingMap
            )
        );
    }

    // 2. Harvest `poy_leaderboard` Top 25 (`section: 'poy_snapshot'`, `source_type: 'poy_leaderboard'`)
    try {
        const { data: poyRows } = await client
            .from('poy_leaderboard')
            .select('id, player_name, points, rank, year, source, updated_at')
            .eq('year', bounds.year)
            .order('rank', { ascending: true })
            .limit(25);

        const list = Array.isArray(poyRows) ? poyRows.slice(0, 25) : [];
        if (list.length > 0) {
            const standings = list.map((r, idx) => ({
                rank: Number(r.rank || idx + 1),
                playerName: stripMagazineDashes(r.player_name || `Contender #${idx + 1}`),
                points: Math.round(Number(r.points || 0) * 100) / 100,
                year: Number(r.year || bounds.year),
                source: stripMagazineDashes(r.source || 'gpi_licensed_feed'),
            }));
            const leader = standings[0];
            const runnerUp = standings[1];
            stagedRows.push(
                mergePreservedFlags(
                    {
                        issue_period: period,
                        section: 'poy_snapshot',
                        source_type: 'poy_leaderboard',
                        source_id: `poy-top25-${bounds.year}-${period}`,
                        headline: stripMagazineDashes(
                            `${leader.playerName} Leads ${bounds.year} Global Player Of The Year Standings`
                        ),
                        summary: stripMagazineDashes(
                            `Top 25 Global POY leaderboard snapshot paced by #1 ${leader.playerName} (${leader.points.toLocaleString('en-US')} pts)${runnerUp ? ` and #2 ${runnerUp.playerName} (${runnerUp.points.toLocaleString('en-US')} pts)` : ''}.`
                        ),
                        body_text: standings
                            .slice(0, 10)
                            .map((s) => `#${s.rank} ${s.playerName} - ${s.points.toLocaleString('en-US')} Points`)
                            .join('\n\n'),
                        source_url: `${MAGAZINE_SITE_URL}/hub/leaderboards`,
                        original_image_url: '',
                        vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_storage_path: null,
                        image_width: 960,
                        image_height: 540,
                        editorial_score: 92,
                        is_pinned: false,
                        is_excluded: false,
                        metadata: {
                            year: bounds.year,
                            standings,
                        },
                    },
                    existingMap
                )
            );
        }
    } catch {
        /* non-blocking */
    }

    // 3. Completed Kings Club 25450 tournaments (`section: 'tournament_result'`, strictly Chips, zero `$`)
    try {
        const lookbackStartIso = new Date(Date.parse(bounds.startIso) - 14 * 86_400_000).toISOString();
        let kcQuery = client
            .from('tournaments')
            .select('id, name, club_id, game_type, buy_in_amount, buy_in_fee, prize_pool, guaranteed_prize, current_players, start_time, status')
            .eq('club_id', KINGS_CLUB_UUID)
            .eq('status', 'COMPLETED')
            .gte('start_time', lookbackStartIso)
            .lt('start_time', bounds.endIso);
        if (typeof kcQuery.gt === 'function') {
            kcQuery = kcQuery.gt('prize_pool', 0);
        }
        const { data: kcRows } = await kcQuery.order('prize_pool', { ascending: false }).limit(12);

        for (const row of (kcRows || []).filter((r) => Number(r?.prize_pool || 0) > 0).slice(0, 10)) {
            const cleanTourneyName = stripMagazineDashes(String(row.name || 'Kings Club Championship').replace(/\$/g, ''));
            if (!cleanTourneyName) continue;
            const prizeLabel = formatChipsOnly(row.prize_pool);
            const buyInLabel =
                Number(row.buy_in_amount || 0) > 0 ? formatChipsOnly(row.buy_in_amount) : 'Freeroll (0 Chips)';
            const gameType = stripMagazineDashes(String(row.game_type || 'NLH').replace(/\$/g, ''));
            const players = Math.max(0, Math.round(Number(row.current_players || 0)));

            stagedRows.push(
                mergePreservedFlags(
                    {
                        issue_period: period,
                        section: 'tournament_result',
                        source_type: 'kings_club_tournament',
                        source_id: String(row.id),
                        headline: `${cleanTourneyName} - ${prizeLabel} Prize Pool`.slice(0, 500),
                        summary: `Kings Club 25450 ${gameType} tournament completed with ${prizeLabel} awarded (${buyInLabel} entry${players > 0 ? `, ${players} entries` : ''}).`,
                        body_text: `${cleanTourneyName} concluded inside Kings Club (Club Code 25450) on Club Arena with a ${prizeLabel} total prize pool across ${gameType} competition.`,
                        source_url: `${MAGAZINE_SITE_URL}/hub/club-arena/?join=25450`,
                        original_image_url: '',
                        vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_storage_path: null,
                        image_width: 960,
                        image_height: 540,
                        editorial_score: 84,
                        is_pinned: false,
                        is_excluded: false,
                        metadata: {
                            clubCode: '25450',
                            name: cleanTourneyName,
                            gameType,
                            buyInChips: Math.round(Number(row.buy_in_amount || 0)),
                            buyInLabel,
                            prizePoolChips: Math.round(Number(row.prize_pool || 0)),
                            prizePoolLabel: prizeLabel,
                            players,
                            startTime: row.start_time || null,
                        },
                    },
                    existingMap
                )
            );
        }
    } catch {
        /* non-blocking */
    }

    // 4. Strategy Spots (`SPOT_OF_THE_WEEK_CATALOG`: NLH, ICM/Tournament, PLO4/PLO5) + real `[SPOT-VOTE]` tallies
    const spotVotesMap = await loadSpotVotesMap(client);
    const nlhSpots = SPOT_OF_THE_WEEK_CATALOG.filter(
        (s) => s.variant === 'nlh' && !/icm|satellite|pko/i.test(`${s.category} ${s.slug}`)
    );
    const icmSpots = SPOT_OF_THE_WEEK_CATALOG.filter((s) => /icm|satellite|pko/i.test(`${s.category} ${s.slug}`));
    const ploSpots = SPOT_OF_THE_WEEK_CATALOG.filter((s) => s.variant === 'plo4' || s.variant === 'plo5');

    const pickedSpots = [
        nlhSpots[deterministicPeriodOffset(period, nlhSpots.length)],
        icmSpots[deterministicPeriodOffset(period, icmSpots.length)],
        ploSpots[deterministicPeriodOffset(period, ploSpots.length)],
        nlhSpots[deterministicPeriodOffset(`${period}:b`, nlhSpots.length)],
    ].filter(Boolean);

    const seenSpotSlugs = new Set();
    for (const spot of pickedSpots) {
        if (!spot?.slug || seenSpotSlugs.has(spot.slug)) continue;
        seenSpotSlugs.add(spot.slug);

        const votes = spotVotesMap[spot.slug] || { A: 0, B: 0, C: 0 };
        const totalVotes = votes.A + votes.B + votes.C;
        const correctKey = spot.correctKey || 'A';
        const solverAgreementPct =
            totalVotes > 0 ? Math.round(((Number(votes[correctKey] || 0)) / totalVotes) * 100) : null;
        const cardImageUrl = buildSpotCardImageUrl(spot.slug, { relative: true });

        const cleanSituation = stripMagazineDashes(String(spot.situation || '').replace(/\$/g, ''));
        const cleanEv = stripMagazineDashes(String(spot.evSummary || '').replace(/\$/g, ''));

        stagedRows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: 'strategy_spot',
                    source_type: 'strategy_spot',
                    source_id: spot.slug,
                    headline: stripMagazineDashes(spot.title),
                    summary: cleanSituation,
                    body_text: `${cleanSituation}\n\nSolver Verdict (${stripMagazineDashes(spot.solverFrequency)}): ${cleanEv}`,
                    source_url: `${MAGAZINE_SITE_URL}/hub/training/hand-lab?spot=${encodeURIComponent(spot.slug)}`,
                    original_image_url: cardImageUrl,
                    vaulted_image_url: cardImageUrl,
                    vaulted_master_url: cardImageUrl,
                    vaulted_storage_path: null,
                    image_width: 600,
                    image_height: 240,
                    editorial_score: 90,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        slug: spot.slug,
                        category: stripMagazineDashes(spot.category),
                        variant: spot.variant || 'nlh',
                        heroCards: spot.heroCards || [],
                        boardCards: spot.boardCards || [],
                        options: (spot.options || []).map((o) => ({
                            key: o.key,
                            label: stripMagazineDashes(o.label),
                        })),
                        correctKey,
                        solverFrequency: stripMagazineDashes(spot.solverFrequency || ''),
                        evSummary: cleanEv,
                        cardImageUrl,
                        communityVotes: {
                            A: votes.A,
                            B: votes.B,
                            C: votes.C,
                            total: totalVotes,
                            solverAgreementPct,
                        },
                    },
                },
                existingMap
            )
        );
    }

    // 5. Monthly Trivia (`TRIVIA_OF_THE_WEEK_CATALOG`, `section: 'trivia_quiz'`)
    const triviaOffset = deterministicPeriodOffset(period, TRIVIA_OF_THE_WEEK_CATALOG.length);
    for (let i = 0; i < Math.min(6, TRIVIA_OF_THE_WEEK_CATALOG.length); i += 1) {
        const q = TRIVIA_OF_THE_WEEK_CATALOG[(triviaOffset + i) % TRIVIA_OF_THE_WEEK_CATALOG.length];
        if (!q?.slug) continue;
        stagedRows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: 'trivia_quiz',
                    source_type: 'trivia_quiz',
                    source_id: q.slug,
                    headline: stripMagazineDashes(q.question),
                    summary: stripMagazineDashes(q.explanation),
                    body_text: stripMagazineDashes(q.explanation),
                    source_url: `${MAGAZINE_SITE_URL}/hub/trivia?wire_q=${encodeURIComponent(q.slug)}`,
                    original_image_url: '',
                    vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_storage_path: null,
                    image_width: 960,
                    image_height: 540,
                    editorial_score: 82,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        slug: q.slug,
                        badge: stripMagazineDashes(q.badge || 'Poker IQ'),
                        categoryLabel: stripMagazineDashes(q.categoryLabel || 'Theory & Math'),
                        question: stripMagazineDashes(q.question),
                        options: (q.options || []).map((o) => ({
                            key: o.key,
                            label: stripMagazineDashes(o.label),
                        })),
                        answerKey: q.answerKey || 'A',
                        explanation: stripMagazineDashes(q.explanation || ''),
                    },
                },
                existingMap
            )
        );
    }

    // 6. Curated Strategy Videos (`video_library_public_catalog` passing `isCuratedFeedVideo`)
    try {
        const { data: rawVideos } = await client
            .from('video_library_public_catalog')
            .select(VIDEO_ROW_FIELDS)
            // in-list: bounded 2 poker video types
            .in('type', ['cash', 'tournament'])
            .order('views_count', { ascending: false })
            .order('scraped_at', { ascending: false })
            .limit(36);

        const curatedVideos = [];
        for (const row of rawVideos || []) {
            if (!row?.youtube_video_id && !row?.videoId) continue;
            const v = row.youtube_video_id ? normaliseVideoRow(row) : row;
            if (!v?.videoId || BLOCKED_VIDEO_SET.has(v.videoId)) continue;
            if (!isCuratedFeedVideo(v)) continue;
            if (!isVideoLibraryVideoAllowed(v)) continue;
            if (!isDisplayableVideoTitle(v.rawTitle ?? v.title)) continue;
            if (isCasinoGameFiledAsPoker(v)) continue;
            curatedVideos.push(v);
        }

        for (const v of dedupeVideos(curatedVideos).slice(0, 4)) {
            const vidId = String(v.videoId);
            const cleanVideoTitle = stripMagazineDashes(normalizeEditorialTitle(v.title)).slice(0, 500);
            if (!cleanVideoTitle) continue;
            const existingVid = existingMap.get(`video_library::${vidId}`);
            let vidVault;
            if (existingVid?.vaulted_image_url && existingVid.vaulted_image_url !== IMAGE_VAULT_FALLBACK_URL) {
                vidVault = {
                    vaultedImageUrl: existingVid.vaulted_image_url,
                    vaultedMasterUrl: existingVid.vaulted_master_url || existingVid.vaulted_image_url,
                    storagePath: existingVid.vaulted_storage_path || null,
                    width: Number(existingVid.image_width || 1200),
                    height: Number(existingVid.image_height || 800),
                };
            } else {
                const allowRemoteThumb = Date.now() < externalDeadlineMs - 400;
                vidVault = await vaultMagazineImage(client, {
                    sourceUrl: allowRemoteThumb ? v.thumbnail || '' : '',
                    issuePeriod: period,
                    hintKey: `video:${vidId}`,
                    fallbackHeadline: cleanVideoTitle,
                    fallbackTag: 'Strategy Video',
                    fetchImpl,
                    assertFetchableFn,
                    timeoutMs: Math.min(4000, Math.max(400, externalDeadlineMs - Date.now())),
                });
            }

            const vPath = watchPath(v) || `/hub/video-library/watch/${encodeURIComponent(vidId)}`;
            stagedRows.push(
                mergePreservedFlags(
                    {
                        issue_period: period,
                        section: 'video_highlight',
                        source_type: 'video_library',
                        source_id: vidId,
                        headline: cleanVideoTitle,
                        summary: stripMagazineDashes(
                            `${v.sourceName || 'Curated Creator'}${v.duration ? ` • ${v.duration}` : ''}`
                        ),
                        body_text: stripMagazineDashes(
                            `Featured in the Smarter.Poker Video Library from ${v.sourceName || 'Verified Poker Creator'}. Scan or click to watch the full hand-by-hand breakdown.`
                        ),
                        source_url: vPath.startsWith('http') ? vPath : `${MAGAZINE_SITE_URL}${vPath}`,
                        original_image_url: String(v.thumbnail || ''),
                        vaulted_image_url: vidVault.vaultedImageUrl,
                        vaulted_master_url: vidVault.vaultedMasterUrl,
                        vaulted_storage_path: vidVault.storagePath ?? existingVid?.vaulted_storage_path ?? null,
                        image_width: Number(vidVault.width || 1200),
                        image_height: Number(vidVault.height || 800),
                        editorial_score: 80,
                        is_pinned: false,
                        is_excluded: false,
                        metadata: {
                            videoId: vidId,
                            sourceName: stripMagazineDashes(v.sourceName || ''),
                            duration: v.duration || '',
                            watchPath: vPath,
                        },
                    },
                    existingMap
                )
            );
        }
    } catch {
        /* non-blocking */
    }

    // 7. Smarter.Poker Platform Highlights (`PLATFORM_UPDATES_CATALOG` + `TOOL_SPOTLIGHT_CATALOG`)
    const platOffset = deterministicPeriodOffset(period, PLATFORM_UPDATES_CATALOG.length);
    for (let i = 0; i < Math.min(4, PLATFORM_UPDATES_CATALOG.length); i += 1) {
        const u = PLATFORM_UPDATES_CATALOG[(platOffset + i) % PLATFORM_UPDATES_CATALOG.length];
        stagedRows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: 'platform_highlight',
                    source_type: 'platform_update',
                    source_id: u.slug,
                    headline: stripMagazineDashes(u.title),
                    summary: stripMagazineDashes(u.summary),
                    body_text: stripMagazineDashes(u.summary),
                    source_url: u.ctaUrl || `${MAGAZINE_SITE_URL}/hub`,
                    original_image_url: '',
                    vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_storage_path: null,
                    image_width: 960,
                    image_height: 540,
                    editorial_score: 86,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        kind: 'platform_update',
                        badge: stripMagazineDashes(u.badge || 'Platform Upgrade'),
                        ctaLabel: stripMagazineDashes(u.ctaLabel || 'Explore Now'),
                        ctaUrl: u.ctaUrl || `${MAGAZINE_SITE_URL}/hub`,
                    },
                },
                existingMap
            )
        );
    }

    const toolOffset = deterministicPeriodOffset(period, TOOL_SPOTLIGHT_CATALOG.length);
    for (let i = 0; i < Math.min(4, TOOL_SPOTLIGHT_CATALOG.length); i += 1) {
        const t = TOOL_SPOTLIGHT_CATALOG[(toolOffset + i) % TOOL_SPOTLIGHT_CATALOG.length];
        const cleanTip = stripMagazineDashes(String(t.tip || '').replace(/\$/g, ''));
        stagedRows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: 'platform_highlight',
                    source_type: 'tool_spotlight',
                    source_id: t.slug,
                    headline: stripMagazineDashes(t.title),
                    summary: cleanTip,
                    body_text: cleanTip,
                    source_url: t.url || `${MAGAZINE_SITE_URL}/tools`,
                    original_image_url: '',
                    vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_storage_path: null,
                    image_width: 960,
                    image_height: 540,
                    editorial_score: 83,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        kind: 'tool_spotlight',
                        category: stripMagazineDashes(t.category || 'Pro Calculator'),
                        ctaLabel: 'Open Calculator',
                        ctaUrl: t.url || `${MAGAZINE_SITE_URL}/tools`,
                    },
                },
                existingMap
            )
        );
    }

    // 8. Upcoming 60-day `poker_series` + `tournament_series` + `unified_events_calendar` (`section: 'series_calendar'`)
    // NOTE: `poker_series` has NO `venue_name` column (uses `series_name, city, state, tour_code`), while `tournament_series` uses `name, venue_name, city, state`.
    const todayIsoDate = new Date(nowMs).toISOString().slice(0, 10);
    const sixtyDaysIsoDate = new Date(nowMs + 60 * 86_400_000).toISOString().slice(0, 10);
    try {
        let psQuery = client
            .from('poker_series')
            .select('id, series_name, city, state, start_date, end_date, tour_code, main_event_buyin, total_guaranteed, data_quality, is_suppressed');
        if (typeof psQuery.in === 'function') {
            // in-list: bounded 3 verified poker_series data_quality constants
            psQuery = psQuery.in('data_quality', VERIFIED_SERIES_QUALITIES.slice(0, 3));
        }

        let tsQuery = client
            .from('tournament_series')
            .select('id, name, venue_name, city, state, start_date, end_date, tour_code, main_event_buyin, main_event_guaranteed, data_quality, is_suppressed');
        if (typeof tsQuery.in === 'function') {
            // in-list: bounded 3 verified tournament_series data_quality constants
            tsQuery = tsQuery.in('data_quality', VERIFIED_SERIES_QUALITIES.slice(0, 3));
        }

        const [psRes, tsRes] = await Promise.all([
            psQuery
                .gte('end_date', todayIsoDate)
                .lte('start_date', sixtyDaysIsoDate)
                .order('start_date', { ascending: true })
                .limit(24),
            Promise.resolve(
                tsQuery
                    .gte('end_date', todayIsoDate)
                    .lte('start_date', sixtyDaysIsoDate)
                    .order('start_date', { ascending: true })
                    .limit(24)
            ).catch(() => ({ data: [], error: null })),
        ]);

        const combinedRawSeries = [
            ...(Array.isArray(psRes?.data)
                ? psRes.data.map((r) => ({ ...r, _sourceType: 'poker_series', _seriesName: r.series_name }))
                : []),
            ...(Array.isArray(tsRes?.data)
                ? tsRes.data.map((r) => ({ ...r, _sourceType: 'tournament_series', _seriesName: r.name }))
                : []),
        ];

        const filteredSeries = combinedRawSeries
            .filter((r) => {
                if (!r || r.is_suppressed === true || !r._seriesName) return false;
                if (r.data_quality && !VERIFIED_SERIES_QUALITIES.includes(String(r.data_quality))) return false;
                // Exclude year-long 2026-01-01..2026-12-31 recurring house promos (> 90 days) so real multi-day series stops lead
                if (r.start_date && r.end_date) {
                    const spanDays = (Date.parse(r.end_date) - Date.parse(r.start_date)) / 86_400_000;
                    if (Number.isFinite(spanDays) && spanDays > 90) return false;
                }
                if (r.end_date && String(r.end_date).slice(0, 10) < todayIsoDate) return false;
                if (r.start_date && String(r.start_date).slice(0, 10) > sixtyDaysIsoDate) return false;
                return true;
            })
            .sort((a, b) => {
                const aUpcoming = String(a.start_date || '') >= todayIsoDate ? 0 : 1;
                const bUpcoming = String(b.start_date || '') >= todayIsoDate ? 0 : 1;
                if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming;
                return String(a.start_date || '').localeCompare(String(b.start_date || ''));
            })
            .slice(0, 14);

        for (const s of filteredSeries) {
            const cleanSeriesTitle = stripMagazineDashes(normalizeEditorialTitle(s._seriesName)).slice(0, 500);
            if (!cleanSeriesTitle) continue;
            const locParts = [s.venue_name, s.city, s.state].map(stripMagazineDashes).filter(Boolean);
            const loc = locParts.join(', ') || stripMagazineDashes(s.tour_code || 'Regional Championship Stop');
            const dates = [s.start_date, s.end_date].filter(Boolean).join(' to ');
            stagedRows.push(
                mergePreservedFlags(
                    {
                        issue_period: period,
                        section: 'series_calendar',
                        source_type: s._sourceType,
                        source_id: String(s.id),
                        headline: cleanSeriesTitle,
                        summary: stripMagazineDashes(`${loc}${dates ? ` • ${dates}` : ''}`),
                        body_text: stripMagazineDashes(`${cleanSeriesTitle} at ${loc}. Dates: ${dates || 'Upcoming'}.`),
                        source_url: `${MAGAZINE_SITE_URL}/hub/poker-near-me`,
                        original_image_url: '',
                        vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_storage_path: null,
                        image_width: 960,
                        image_height: 540,
                        editorial_score: 82,
                        is_pinned: false,
                        is_excluded: false,
                        metadata: {
                            venueName: stripMagazineDashes(s.venue_name || s.tour_code || ''),
                            city: stripMagazineDashes(s.city || ''),
                            state: stripMagazineDashes(s.state || ''),
                            startDate: s.start_date || null,
                            endDate: s.end_date || null,
                        },
                    },
                    existingMap
                )
            );
        }
    } catch {
        /* non-blocking */
    }

    try {
        let calQuery = client
            .from('unified_events_calendar')
            .select(
                'source, native_id, venue_id, venue_name, event_name, start_time, buy_in, guaranteed, game_type, day_of_week, specific_date, is_recurring, city, state'
            )
            .eq('is_active', true)
            .eq('is_suppressed', false);
        if (typeof calQuery.or === 'function') {
            calQuery = calQuery.or(
                `is_recurring.eq.true,and(specific_date.gte.${todayIsoDate},specific_date.lte.${sixtyDaysIsoDate})`
            );
        }
        if (typeof calQuery.order === 'function') {
            calQuery = calQuery.order('specific_date', { ascending: true, nullsFirst: false });
        }
        const { data: calEvents } = await calQuery.limit(40);

        const upcomingEvents = (calEvents || [])
            .filter((ev) => {
                if (!ev?.event_name || !ev?.venue_name) return false;
                const startDate = String(ev.start_date || ev.specific_date || '').slice(0, 10);
                const endDate = String(ev.end_date || startDate || '').slice(0, 10);
                if (startDate) {
                    return (endDate >= todayIsoDate || startDate >= todayIsoDate) && startDate <= sixtyDaysIsoDate;
                }
                return ev.is_recurring === true && Boolean(ev.day_of_week);
            })
            .sort((a, b) => {
                const aStart = String(a.start_date || a.specific_date || '9999-12-31');
                const bStart = String(b.start_date || b.specific_date || '9999-12-31');
                return aStart.localeCompare(bStart);
            })
            .slice(0, 8);

        for (const ev of upcomingEvents) {
            const cleanEventTitle = stripMagazineDashes(normalizeEditorialTitle(ev.event_name)).slice(0, 500);
            if (!cleanEventTitle) continue;
            const sourceId = String(
                ev.native_id ? `${ev.source || 'ev'}:${ev.native_id}` : `${ev.venue_name}-${ev.event_name}`
            ).slice(0, 120);
            const loc = [ev.venue_name, ev.city, ev.state].map(stripMagazineDashes).filter(Boolean).join(', ');
            const whenLabel = stripMagazineDashes(ev.specific_date || ev.start_date || ev.day_of_week || 'Weekly');
            stagedRows.push(
                mergePreservedFlags(
                    {
                        issue_period: period,
                        section: 'series_calendar',
                        source_type: 'live_event',
                        source_id: sourceId,
                        headline: cleanEventTitle,
                        summary: stripMagazineDashes(`${loc} • ${whenLabel}`),
                        body_text: stripMagazineDashes(`${ev.event_name} hosted at ${loc} (${whenLabel}).`),
                        source_url: `${MAGAZINE_SITE_URL}/hub/poker-near-me`,
                        original_image_url: '',
                        vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_storage_path: null,
                        image_width: 960,
                        image_height: 540,
                        editorial_score: 72,
                        is_pinned: false,
                        is_excluded: false,
                        metadata: {
                            venueName: stripMagazineDashes(ev.venue_name || ''),
                            city: stripMagazineDashes(ev.city || ''),
                            state: stripMagazineDashes(ev.state || ''),
                            gameType: stripMagazineDashes(ev.game_type || 'NLH'),
                            schedule: whenLabel,
                            startDate: ev.specific_date || ev.start_date || null,
                            endDate: ev.end_date || null,
                        },
                    },
                    existingMap
                )
            );
        }
    } catch {
        /* non-blocking */
    }

    // 9. Top `poker_venues` (`section: 'featured_venue'`, strictly redacted via publicVenuePrivacy.mjs)
    try {
        const { data: venues } = await client
            .from('poker_venues')
            .select(
                'id, name, slug, city, state, poker_tables, games_offered, stakes_cash, has_tournaments, is_featured, trust_score, is_active, is_suppressed, source, data_quality, venue_type, canonical_venue_id'
            )
            .eq('is_active', true)
            .eq('is_suppressed', false)
            .order('is_featured', { ascending: false })
            .order('trust_score', { ascending: false })
            .limit(36);

        const safeVenues = (venues || [])
            .filter((rawVenue) => {
                if (!rawVenue?.id || !rawVenue?.name) return false;
                if (rawVenue.is_active === false || rawVenue.is_suppressed === true) return false;
                if (Number(rawVenue.id) === 3109) return false;
                if (rawVenue.canonical_venue_id != null) return false;
                const vType = String(rawVenue.venue_type || '').toLowerCase();
                if (EXCLUDED_CARDROOM_VENUE_TYPES.includes(vType)) return false;
                if (isUnverifiedSelfRegistration(rawVenue)) return false;
                return true;
            })
            .map((rawVenue) => redactPublicVenue(rawVenue))
            .slice(0, 12);

        for (const v of safeVenues) {
            const cleanVenueName = stripMagazineDashes(v.name).slice(0, 500);
            if (!cleanVenueName) continue;
            const loc = [v.city, v.state].map(stripMagazineDashes).filter(Boolean).join(', ');
            const tables = Number(v.poker_tables || 0);
            const venuePath = v.slug ? `/hub/venues/${encodeURIComponent(v.slug)}` : `/hub/poker-near-me`;
            const gamesStr = Array.isArray(v.games_offered)
                ? v.games_offered.map(stripMagazineDashes).join(', ')
                : stripMagazineDashes(v.games_offered || 'NLH & PLO Cash + Daily MTTs');

            stagedRows.push(
                mergePreservedFlags(
                    {
                        issue_period: period,
                        section: 'featured_venue',
                        source_type: 'poker_venue',
                        source_id: String(v.id),
                        headline: cleanVenueName,
                        summary: stripMagazineDashes(
                            `${loc}${tables > 0 ? ` • ${tables} Tables` : ''} • ${gamesStr || 'Live Cash & Tournaments'}`
                        ),
                        body_text: stripMagazineDashes(
                            `${cleanVenueName} (${loc}) features ${tables > 0 ? `${tables} live poker tables` : 'active live action'} running ${gamesStr || 'No-Limit Holdem and Pot-Limit Omaha'}.`
                        ),
                        source_url: `${MAGAZINE_SITE_URL}${venuePath}`,
                        original_image_url: '',
                        vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_storage_path: null,
                        image_width: 960,
                        image_height: 540,
                        editorial_score: v.is_featured ? 88 : 76,
                        is_pinned: false,
                        is_excluded: false,
                        metadata: {
                            venueId: v.id,
                            slug: v.slug || '',
                            city: stripMagazineDashes(v.city || ''),
                            state: stripMagazineDashes(v.state || ''),
                            tables,
                            gamesOffered: gamesStr,
                            hasTournaments: Boolean(v.has_tournaments),
                            venueUrl: `${MAGAZINE_SITE_URL}${venuePath}`,
                        },
                    },
                    existingMap
                )
            );
        }
    } catch {
        /* non-blocking */
    }

    const persisted = await upsertVaultItemsResilient(client, stagedRows);

    const countsBySection = {};
    for (const r of persisted.rows) {
        countsBySection[r.section] = (countsBySection[r.section] || 0) + 1;
    }

    return {
        issuePeriod: period,
        harvestedCount: persisted.upsertedCount,
        countsBySection,
        items: persisted.rows,
    };
}

/**
 * Post-send Weekly Wire hook: banks curated winners, stories, strategy spot,
 * trivia, video, and platform updates from a live Weekly Wire edition into
 * `public.magazine_vault_items` for the active monthly issue period.
 */
export async function harvestWeeklyWireEditionToVault(
    sb,
    edition,
    {
        issuePeriod = '',
        campaignId = null,
        externalBudgetMs = 8_000,
        fetchImpl = fetch,
        assertFetchableFn = assertFetchableUrl,
        nowMs = Date.now(),
    } = {}
) {
    if (!edition || typeof edition !== 'object') {
        return { issuePeriod: currentIssuePeriod(new Date(nowMs)), bankedCount: 0 };
    }

    const client = await getSupabaseClient(sb);
    const period = isValidIssuePeriod(issuePeriod)
        ? String(issuePeriod).trim()
        : currentIssuePeriod(new Date(nowMs));
    const deadlineMs = Date.now() + Math.min(12_000, Math.max(1_000, Number(externalBudgetMs) || 8_000));
    const existingMap = await loadExistingVaultMap(client, period);
    const rows = [];

    // 1. Curated Weekly Wire articles
    const articles = Array.isArray(edition.articles) ? edition.articles : [];
    for (let i = 0; i < articles.length; i += 1) {
        const a = articles[i];
        if (!a?.id || !a?.title) continue;
        if (isCompetitorSponsoredPost(a)) continue;
        const cleanTitle = stripMagazineDashes(normalizeEditorialTitle(a.title)).slice(0, 500);
        if (!cleanTitle) continue;
        const allowNet = Date.now() < deadlineMs - 500;
        const vaultImg = await vaultMagazineImage(client, {
            sourceUrl: allowNet ? a.image_url || '' : '',
            issuePeriod: period,
            hintKey: `wire-art:${a.id}`,
            fallbackHeadline: cleanTitle,
            fallbackTag: 'Weekly Wire Pick',
            fetchImpl,
            assertFetchableFn,
            timeoutMs: Math.min(3500, Math.max(400, deadlineMs - Date.now())),
        });

        let bodyParagraphs = [];
        if (allowNet && a.source_url && i < 2) {
            bodyParagraphs = await extractArticleBodySafe(a.source_url, { deadlineMs });
            bodyParagraphs = bodyParagraphs
                .map((p) => stripScraperBylinePrefix(p))
                .filter((p) => p.length >= 36 && !isEchoingOrEmptyBlurb(cleanTitle, p));
        }
        if (bodyParagraphs.length === 0) {
            bodyParagraphs = buildSynthesizedEditorialParagraphs(a, cleanTitle);
        }

        const wireDeck = buildCleanNonEchoingDeck({
            title: cleanTitle,
            rawSummary: a.summary || '',
            paragraphs: bodyParagraphs,
            sourceName: a.source_name || 'Weekly Wire',
            category: a.category || 'Tournament & Industry',
        });

        rows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: i === 0 ? 'cover_candidate' : i <= 2 ? 'feature_story' : 'news_brief',
                    source_type: 'poker_news',
                    source_id: String(a.id),
                    headline: cleanTitle,
                    summary: wireDeck,
                    body_text: bodyParagraphs.join('\n\n'),
                    source_url: String(a.source_url || `${MAGAZINE_SITE_URL}/hub/news`),
                    original_image_url: String(a.image_url || ''),
                    vaulted_image_url: vaultImg.vaultedImageUrl,
                    vaulted_master_url: vaultImg.vaultedMasterUrl,
                    vaulted_storage_path: vaultImg.storagePath ?? null,
                    image_width: Number(vaultImg.width || 1200),
                    image_height: Number(vaultImg.height || 800),
                    editorial_score: 95 - i * 3,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        byline: stripMagazineDashes(a.source_name || 'Weekly Wire'),
                        wireEditionNumber: edition.editionNumber || null,
                        campaignId: campaignId || null,
                    },
                },
                existingMap
            )
        );
    }

    // 2. Spot of the Week
    if (edition.spotOfTheWeek?.slug) {
        const s = edition.spotOfTheWeek;
        const cardUrl = buildSpotCardImageUrl(s.slug, { relative: true });
        const cleanSituation = stripMagazineDashes(String(s.situation || '').replace(/\$/g, ''));
        const cleanEv = stripMagazineDashes(String(s.evSummary || '').replace(/\$/g, ''));
        rows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: 'strategy_spot',
                    source_type: 'strategy_spot',
                    source_id: s.slug,
                    headline: stripMagazineDashes(s.title),
                    summary: cleanSituation,
                    body_text: `${cleanSituation}\n\nSolver Verdict (${stripMagazineDashes(s.solverFrequency || '')}): ${cleanEv}`,
                    source_url: `${MAGAZINE_SITE_URL}/hub/training/hand-lab?spot=${encodeURIComponent(s.slug)}`,
                    original_image_url: cardUrl,
                    vaulted_image_url: cardUrl,
                    vaulted_master_url: cardUrl,
                    vaulted_storage_path: null,
                    image_width: 600,
                    image_height: 240,
                    editorial_score: 94,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        slug: s.slug,
                        category: stripMagazineDashes(s.category || 'GTO Lab'),
                        variant: s.variant || 'nlh',
                        heroCards: s.heroCards || [],
                        boardCards: s.boardCards || [],
                        options: (s.options || []).map((o) => ({ key: o.key, label: stripMagazineDashes(o.label) })),
                        correctKey: s.correctKey || 'A',
                        solverFrequency: stripMagazineDashes(s.solverFrequency || ''),
                        evSummary: cleanEv,
                        cardImageUrl: cardUrl,
                        wireEditionNumber: edition.editionNumber || null,
                        campaignId: campaignId || null,
                    },
                },
                existingMap
            )
        );
    }

    // 3. Trivia of the Week
    if (edition.triviaOfTheWeek?.slug) {
        const q = edition.triviaOfTheWeek;
        rows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: 'trivia_quiz',
                    source_type: 'trivia_quiz',
                    source_id: q.slug,
                    headline: stripMagazineDashes(q.question),
                    summary: stripMagazineDashes(q.explanation || ''),
                    body_text: stripMagazineDashes(q.explanation || ''),
                    source_url: `${MAGAZINE_SITE_URL}/hub/trivia?wire_q=${encodeURIComponent(q.slug)}`,
                    original_image_url: '',
                    vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_storage_path: null,
                    image_width: 960,
                    image_height: 540,
                    editorial_score: 88,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        slug: q.slug,
                        badge: stripMagazineDashes(q.badge || 'Poker IQ'),
                        categoryLabel: stripMagazineDashes(q.categoryLabel || 'Theory'),
                        question: stripMagazineDashes(q.question),
                        options: (q.options || []).map((o) => ({ key: o.key, label: stripMagazineDashes(o.label) })),
                        answerKey: q.answerKey || 'A',
                        explanation: stripMagazineDashes(q.explanation || ''),
                        wireEditionNumber: edition.editionNumber || null,
                        campaignId: campaignId || null,
                    },
                },
                existingMap
            )
        );
    }

    // 4. Kings Club recent winners (strictly Chips, zero `$`)
    for (const w of Array.isArray(edition.recentWinners) ? edition.recentWinners : []) {
        if (!w?.id || !w?.name) continue;
        const cleanName = stripMagazineDashes(String(w.name).replace(/\$/g, ''));
        if (!cleanName) continue;
        const prizeLabel = formatChipsOnly(w.prize_pool);
        rows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: 'tournament_result',
                    source_type: 'kings_club_tournament',
                    source_id: String(w.id),
                    headline: `${cleanName} - ${prizeLabel} Prize Pool`.slice(0, 500),
                    summary: `Kings Club 25450 completed tournament awarding ${prizeLabel}.`,
                    body_text: `${cleanName} wrapped up inside Kings Club (Code 25450) awarding ${prizeLabel}.`,
                    source_url: `${MAGAZINE_SITE_URL}/hub/club-arena/?join=25450`,
                    original_image_url: '',
                    vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_storage_path: null,
                    image_width: 960,
                    image_height: 540,
                    editorial_score: 86,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        clubCode: '25450',
                        name: cleanName,
                        gameType: stripMagazineDashes(String(w.game_type || 'NLH').replace(/\$/g, '')),
                        buyInChips: Math.round(Number(w.buy_in_amount || 0)),
                        prizePoolChips: Math.round(Number(w.prize_pool || 0)),
                        prizePoolLabel: prizeLabel,
                        buyInLabel: formatChipsOnly(w.buy_in_amount),
                        wireEditionNumber: edition.editionNumber || null,
                        campaignId: campaignId || null,
                    },
                },
                existingMap
            )
        );
    }

    // 5. Platform Updates & Tool Spotlight
    for (const u of Array.isArray(edition.platformUpdates) ? edition.platformUpdates : []) {
        const sid = String(u.slug || u.id || '').trim();
        if (!sid || !u.title) continue;
        rows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: 'platform_highlight',
                    source_type: 'platform_update',
                    source_id: sid,
                    headline: stripMagazineDashes(u.title),
                    summary: stripMagazineDashes(u.summary || ''),
                    body_text: stripMagazineDashes(u.summary || ''),
                    source_url: u.ctaUrl || `${MAGAZINE_SITE_URL}/hub`,
                    original_image_url: '',
                    vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_storage_path: null,
                    image_width: 960,
                    image_height: 540,
                    editorial_score: 89,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        kind: 'platform_update',
                        badge: stripMagazineDashes(u.badge || 'Platform Upgrade'),
                        ctaUrl: u.ctaUrl || `${MAGAZINE_SITE_URL}/hub`,
                        wireEditionNumber: edition.editionNumber || null,
                        campaignId: campaignId || null,
                    },
                },
                existingMap
            )
        );
    }

    const persisted = await upsertVaultItemsResilient(client, rows);
    return {
        issuePeriod: period,
        bankedCount: persisted.upsertedCount,
    };
}
