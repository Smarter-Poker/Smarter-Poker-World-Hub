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
 *   - Idempotent `upsert` on `(issue_period, source_type, source_id)` while
 *     preserving operator `is_pinned` and `is_excluded` flags on existing rows.
 *   - Hard 20-second external network budget so serverless executions never time out.
 *   - SSRF-hardened HTML paragraph extraction (`assertFetchableUrl` + `fetchGuarded`).
 *   - Zero em/en dashes (`stripMagazineDashes`) and Chips-only formatting (`formatChipsOnly`).
 */
import { assertFetchableUrl, fetchGuarded } from '../security/fetchableUrl.js';
import { isCompetitorSponsoredPost, normalizeEditorialTitle } from '../newsletter/editorialCleaners.mjs';
import {
    KINGS_CLUB_UUID,
    areSameStoryline,
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
];

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
    return stripMagazineDashes(
        String(raw || '')
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
            .replace(/&ldquo;|&rdquo;/gi, '"')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&#(\d+);/g, (_m, code) => {
                const n = Number(code);
                return Number.isFinite(n) && n >= 32 && n <= 126 ? String.fromCharCode(n) : ' ';
            })
            .replace(/\s+/g, ' ')
    );
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

        let response;
        try {
            response = await fetchGuardedFn(
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
        } finally {
            clearTimeout(timer);
        }

        if (!response || !response.ok) return [];
        const ct = String(response.headers?.get?.('content-type') || '').toLowerCase();
        if (ct && !ct.includes('html') && !ct.includes('xml')) return [];

        let html = '';
        if (response.body && typeof response.body.getReader === 'function') {
            const reader = response.body.getReader();
            const chunks = [];
            let bytes = 0;
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
            html = Buffer.concat(chunks).toString('utf8');
        } else {
            const text = await response.text();
            html = text.slice(0, MAX_ARTICLE_HTML_BYTES);
        }

        return parseCleanParagraphsFromHtml(html, 6);
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

    if (out.length === 0 && rawSummary && rawSummary.length >= 30) {
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
    try {
        const { data } = await client
            .from('magazine_vault_items')
            .select('*')
            .eq('issue_period', period)
            .limit(500);
        for (const row of data || []) {
            if (!row?.source_type || !row?.source_id) continue;
            const key = `${row.source_type}::${row.source_id}`;
            map.set(key, row);
        }
    } catch {
        /* graceful fallback when table is empty or mocked */
    }
    return map;
}

async function upsertVaultItemsResilient(client, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { upsertedCount: 0, rows: [] };
    }
    if (!client || typeof client.from !== 'function') {
        return { upsertedCount: rows.length, rows };
    }

    // Deduplicate in-batch on (issue_period, source_type, source_id) so Postgres ON CONFLICT never sees two identical keys
    const dedupedByKey = new Map();
    for (const r of rows) {
        const key = `${r.issue_period}::${r.source_type}::${r.source_id}`;
        dedupedByKey.set(key, r);
    }
    let currentRows = [...dedupedByKey.values()];

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
    return {
        ...candidateRow,
        is_pinned: Boolean(prev.is_pinned),
        is_excluded: Boolean(prev.is_excluded),
    };
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
        const { data } = await client
            .from('poker_news')
            .select('id, slug, title, summary, excerpt, content, source_name, source_url, image_url, category, is_featured, view_count, published_at')
            .eq('is_published', true)
            .neq('category', 'platform_update')
            .gte('published_at', bounds.startIso)
            .lt('published_at', bounds.endIso)
            .order('published_at', { ascending: false })
            .limit(100);
        rawNews = Array.isArray(data) ? data : [];

        // If early in the month (< 8 stories inside strict UTC month window), supplement from trailing 30d ending at bounds.endIso
        if (rawNews.length < 8) {
            const fallbackStartIso = new Date(Date.parse(bounds.endIso) - 35 * 86_400_000).toISOString();
            const { data: recentData } = await client
                .from('poker_news')
                .select('id, slug, title, summary, excerpt, content, source_name, source_url, image_url, category, is_featured, view_count, published_at')
                .eq('is_published', true)
                .neq('category', 'platform_update')
                .gte('published_at', fallbackStartIso)
                .lt('published_at', bounds.endIso)
                .order('published_at', { ascending: false })
                .limit(60);
            const seenIds = new Set(rawNews.map((r) => String(r?.id || '')));
            for (const extra of recentData || []) {
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

        const cleanTitle = stripMagazineDashes(normalizeEditorialTitle(row.title));
        if (!cleanTitle) continue;
        if (clusteredStories.some((c) => areSameStoryline(c.cleanTitle, cleanTitle))) continue;

        const baseScore =
            (row.is_featured ? 32 : 0) +
            (row.image_url ? 18 : 0) +
            (row.content && String(row.content).length > 300 ? 20 : 0) +
            Math.min(25, Math.floor(Number(row.view_count || 0) / 12));

        clusteredStories.push({ row, cleanTitle, baseScore });
    }

    clusteredStories.sort(
        (a, b) => b.baseScore - a.baseScore || Date.parse(b.row.published_at || 0) - Date.parse(a.row.published_at || 0)
    );

    const topStories = clusteredStories.slice(0, Math.max(6, Math.min(maxNewsItems, 26)));
    let coverCount = 0;
    let photoEssayCount = 0;
    let featureCount = 0;

    for (let idx = 0; idx < topStories.length; idx += 1) {
        const { row, cleanTitle, baseScore } = topStories[idx];
        const sourceId = String(row.id);
        const existing = existingMap.get(`poker_news::${sourceId}`);

        let paragraphs = [];
        if (existing?.body_text && String(existing.body_text).split('\n\n').filter(Boolean).length >= 2) {
            paragraphs = String(existing.body_text).split('\n\n').map(stripMagazineDashes).filter(Boolean);
        } else if (Date.now() < externalDeadlineMs - 600 && row.source_url && idx < 10) {
            paragraphs = await extractArticleBodySafe(row.source_url, { deadlineMs: externalDeadlineMs });
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
        if (coverCount < 3 && (row.is_featured || idx < 3) && (!vaultImg.usedFallback || idx === 0)) {
            section = 'cover_candidate';
            coverCount += 1;
        } else if (isHighResPhoto && photoEssayCount < 3) {
            section = 'photo_essay';
            photoEssayCount += 1;
        } else if (isDeepDive && featureCount < 5) {
            section = 'feature_story';
            featureCount += 1;
        }

        const editorialScore =
            baseScore +
            (isHighResPhoto ? 22 : 0) +
            Math.min(20, paragraphs.length * 4) +
            (section === 'cover_candidate' ? 15 : 0);

        const summaryText = stripMagazineDashes(
            decodeBasicHtml(row.summary || row.excerpt || paragraphs[0] || cleanTitle)
        ).slice(0, 320);

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
                        source_url: `${MAGAZINE_SITE_URL}/hub/news`,
                        original_image_url: '',
                        vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
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
                        headline: `${cleanTourneyName} - ${prizeLabel} Prize Pool`,
                        summary: `Kings Club 25450 ${gameType} tournament completed with ${prizeLabel} awarded (${buyInLabel} entry${players > 0 ? `, ${players} entries` : ''}).`,
                        body_text: `${cleanTourneyName} concluded inside Kings Club (Club Code 25450) on Club Arena with a ${prizeLabel} total prize pool across ${gameType} competition.`,
                        source_url: `${MAGAZINE_SITE_URL}/hub/club-arena/?join=25450`,
                        original_image_url: '',
                        vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                        image_width: 960,
                        image_height: 540,
                        editorial_score: 84,
                        is_pinned: false,
                        is_excluded: false,
                        metadata: {
                            clubCode: '25450',
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
            const cleanVideoTitle = stripMagazineDashes(normalizeEditorialTitle(v.title));
            const existingVid = existingMap.get(`video_library::${vidId}`);
            let vidVault;
            if (existingVid?.vaulted_image_url && existingVid.vaulted_image_url !== IMAGE_VAULT_FALLBACK_URL) {
                vidVault = {
                    vaultedImageUrl: existingVid.vaulted_image_url,
                    vaultedMasterUrl: existingVid.vaulted_master_url || existingVid.vaulted_image_url,
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

    // 8. Upcoming 60-day `poker_series` + `unified_events_calendar` (`section: 'series_calendar'`)
    const todayIsoDate = new Date(nowMs).toISOString().slice(0, 10);
    const sixtyDaysIsoDate = new Date(nowMs + 60 * 86_400_000).toISOString().slice(0, 10);
    try {
        const { data: seriesRows } = await client
            .from('poker_series')
            .select('id, series_name, venue_name, city, state, start_date, end_date, is_suppressed')
            .gte('end_date', todayIsoDate)
            .lte('start_date', sixtyDaysIsoDate)
            .order('start_date', { ascending: true })
            .limit(20);

        for (const s of (seriesRows || []).filter((r) => r && r.is_suppressed !== true && r.series_name).slice(0, 12)) {
            const loc = [s.venue_name, s.city, s.state].map(stripMagazineDashes).filter(Boolean).join(', ');
            const dates = [s.start_date, s.end_date].filter(Boolean).join(' to ');
            stagedRows.push(
                mergePreservedFlags(
                    {
                        issue_period: period,
                        section: 'series_calendar',
                        source_type: 'poker_series',
                        source_id: String(s.id),
                        headline: stripMagazineDashes(normalizeEditorialTitle(s.series_name)),
                        summary: stripMagazineDashes(`${loc}${dates ? ` (${dates})` : ''}`),
                        body_text: stripMagazineDashes(`${s.series_name} at ${loc}. Dates: ${dates || 'Upcoming'}.`),
                        source_url: `${MAGAZINE_SITE_URL}/hub/poker-near-me`,
                        original_image_url: '',
                        vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                        image_width: 960,
                        image_height: 540,
                        editorial_score: 78,
                        is_pinned: false,
                        is_excluded: false,
                        metadata: {
                            venueName: stripMagazineDashes(s.venue_name || ''),
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
        const { data: calEvents } = await client
            .from('unified_events_calendar')
            .select('id, venue_id, venue_name, event_name, start_time, buy_in, guaranteed, game_type, day_of_week, specific_date, city, state')
            .eq('is_active', true)
            .eq('is_suppressed', false)
            .limit(16);

        for (const ev of (calEvents || []).filter((e) => e?.event_name && e?.venue_name).slice(0, 8)) {
            const sourceId = String(ev.id || `${ev.venue_name}-${ev.event_name}`).slice(0, 120);
            const loc = [ev.venue_name, ev.city, ev.state].map(stripMagazineDashes).filter(Boolean).join(', ');
            const whenLabel = stripMagazineDashes(ev.specific_date || ev.day_of_week || 'Weekly');
            stagedRows.push(
                mergePreservedFlags(
                    {
                        issue_period: period,
                        section: 'series_calendar',
                        source_type: 'live_event',
                        source_id: sourceId,
                        headline: stripMagazineDashes(normalizeEditorialTitle(ev.event_name)),
                        summary: stripMagazineDashes(`${loc} • ${whenLabel}`),
                        body_text: stripMagazineDashes(`${ev.event_name} hosted at ${loc} (${whenLabel}).`),
                        source_url: `${MAGAZINE_SITE_URL}/hub/poker-near-me`,
                        original_image_url: '',
                        vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
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
                        },
                    },
                    existingMap
                )
            );
        }
    } catch {
        /* non-blocking */
    }

    // 9. Top `poker_venues` (`section: 'featured_venue'`)
    try {
        const { data: venues } = await client
            .from('poker_venues')
            .select('id, name, slug, city, state, poker_tables, games_offered, stakes_cash, has_tournaments, is_featured, trust_score, is_active, is_suppressed')
            .eq('is_active', true)
            .eq('is_suppressed', false)
            .order('is_featured', { ascending: false })
            .order('trust_score', { ascending: false })
            .limit(18);

        for (const v of (venues || []).filter((r) => r?.id && r?.name).slice(0, 12)) {
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
                        headline: stripMagazineDashes(v.name),
                        summary: stripMagazineDashes(
                            `${loc}${tables > 0 ? ` • ${tables} Tables` : ''} • ${gamesStr || 'Live Cash & Tournaments'}`
                        ),
                        body_text: stripMagazineDashes(
                            `${v.name} (${loc}) features ${tables > 0 ? `${tables} live poker tables` : 'active live action'} running ${gamesStr || 'No-Limit Holdem and Pot-Limit Omaha'}.`
                        ),
                        source_url: `${MAGAZINE_SITE_URL}${venuePath}`,
                        original_image_url: '',
                        vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                        vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
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
    for (const r of stagedRows) {
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
        const cleanTitle = stripMagazineDashes(normalizeEditorialTitle(a.title));
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
        }
        if (bodyParagraphs.length === 0) {
            bodyParagraphs = buildSynthesizedEditorialParagraphs(a, cleanTitle);
        }

        rows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: i === 0 ? 'cover_candidate' : i <= 2 ? 'feature_story' : 'news_brief',
                    source_type: 'poker_news',
                    source_id: String(a.id),
                    headline: cleanTitle,
                    summary: stripMagazineDashes(a.summary || cleanTitle),
                    body_text: bodyParagraphs.join('\n\n'),
                    source_url: String(a.source_url || `${MAGAZINE_SITE_URL}/hub/news`),
                    original_image_url: String(a.image_url || ''),
                    vaulted_image_url: vaultImg.vaultedImageUrl,
                    vaulted_master_url: vaultImg.vaultedMasterUrl,
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
        const prizeLabel = formatChipsOnly(w.prize_pool);
        rows.push(
            mergePreservedFlags(
                {
                    issue_period: period,
                    section: 'tournament_result',
                    source_type: 'kings_club_tournament',
                    source_id: String(w.id),
                    headline: `${cleanName} - ${prizeLabel} Prize Pool`,
                    summary: `Kings Club 25450 completed tournament awarding ${prizeLabel}.`,
                    body_text: `${cleanName} wrapped up inside Kings Club (Code 25450) awarding ${prizeLabel}.`,
                    source_url: `${MAGAZINE_SITE_URL}/hub/club-arena/?join=25450`,
                    original_image_url: '',
                    vaulted_image_url: IMAGE_VAULT_FALLBACK_URL,
                    vaulted_master_url: IMAGE_VAULT_FALLBACK_URL,
                    image_width: 960,
                    image_height: 540,
                    editorial_score: 86,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        clubCode: '25450',
                        gameType: stripMagazineDashes(String(w.game_type || 'NLH').replace(/\$/g, '')),
                        prizePoolChips: Math.round(Number(w.prize_pool || 0)),
                        prizePoolLabel: prizeLabel,
                        buyInLabel: formatChipsOnly(w.buy_in_amount),
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
                    image_width: 960,
                    image_height: 540,
                    editorial_score: 89,
                    is_pinned: false,
                    is_excluded: false,
                    metadata: {
                        kind: 'platform_update',
                        badge: stripMagazineDashes(u.badge || 'Platform Upgrade'),
                        ctaUrl: u.ctaUrl || `${MAGAZINE_SITE_URL}/hub`,
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
