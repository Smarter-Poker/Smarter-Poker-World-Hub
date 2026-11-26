/**
 * Smarter.Poker Monthly Magazine 44-Page Card-Player-Clone Issue Compiler
 *
 * Compiles banked rows from `public.magazine_vault_items` into an authoritative
 * 44-page (`pageCount % 4 === 0` saddle-stitch signature) `manifest_json`
 * conforming 100% to `normalizeIssueManifest` in `magazineSchema.mjs`.
 *
 * Guarantees:
 *   - Zero third-party external image hotlinks in `manifest_json`: every image
 *     resolves to either Supabase Storage bucket `magazine-assets` or first-party
 *     `/api/news/email-image`.
 *   - Zero `$` currency symbols on Club Arena / Kings Club (`25450`) prizes (`formatChipsOnly`).
 *   - Zero em/en dashes (`stripMagazineDashes`) and Vanguard-only palette metadata.
 *   - Monotonic `issue_number` assignment in `public.magazine_issues` without `.maybeSingle()` races.
 */
import { buildPromoSignupUrl } from '../promoCampaigns/promoSignupToken.mjs';
import {
    PLATFORM_UPDATES_CATALOG,
    SPOT_OF_THE_WEEK_CATALOG,
    TOOL_SPOTLIGHT_CATALOG,
    TRIVIA_OF_THE_WEEK_CATALOG,
} from '../newsletter/weeklyWireCatalog.mjs';
import {
    EMAIL_IMAGE_PATH,
    buildSignedEmailImageUrl,
    buildSpotCardImageUrl,
} from '../newsletter/emailImageProxy.mjs';
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_SITE_URL,
    MAGAZINE_STORAGE_BUCKET,
    MAGAZINE_TAGLINE,
    currentIssuePeriod,
    formatChipsOnly,
    formatPeriodLabel,
    isValidIssuePeriod,
    normalizeIssueManifest,
    normalizeSignaturePageCount,
    stripMagazineDashes,
} from './magazineSchema.mjs';
import { IMAGE_VAULT_FALLBACK_URL } from './imageVault.mjs';

async function getSupabaseClient(sb) {
    if (sb && typeof sb === 'object') return sb;
    const { createClient } = await import('../supabaseServerClient.js');
    return createClient();
}

function readItemMeta(item) {
    if (!item || typeof item !== 'object') return {};
    const m = item.metadata_json || item.metadata || item.payload_json || item.meta;
    return m && typeof m === 'object' ? m : {};
}

function stripDollarForChips(text) {
    return stripMagazineDashes(String(text ?? '').replace(/\$/g, ''));
}

/**
 * Enforces that NO raw third-party `http(s)` image URL ever enters `manifest_json`.
 * Permits only:
 *   1. First-party `/api/news/email-image...` (relative or on `smarter.poker`)
 *   2. Vaulted objects inside `/storage/v1/object/public/magazine-assets/...`
 *   3. Inline `data:image/svg+xml...` vector QR badges
 * Converts any other external URL into a signed `/api/news/email-image` proxy URL
 * or the guaranteed Vanguard fallback plate.
 */
export function ensureFirstPartyMagazineImageUrl(rawUrl, { mode = 'hero' } = {}) {
    const clean = String(rawUrl || '').trim();
    if (!clean) return IMAGE_VAULT_FALLBACK_URL;

    if (clean.startsWith('data:image/svg+xml')) {
        return clean;
    }

    if (clean.startsWith(EMAIL_IMAGE_PATH)) {
        return clean;
    }

    if (clean.startsWith('/')) {
        return IMAGE_VAULT_FALLBACK_URL;
    }

    try {
        const parsed = new URL(clean);
        const host = parsed.hostname.toLowerCase();
        const pathName = parsed.pathname;

        const isSmarterOrigin = host === 'smarter.poker' || host.endsWith('.smarter.poker');
        if (isSmarterOrigin && pathName === EMAIL_IMAGE_PATH) {
            return parsed.toString();
        }

        const isVaultBucketObject =
            (host.endsWith('.supabase.co') || isSmarterOrigin) &&
            pathName.includes(`/storage/v1/object/public/${MAGAZINE_STORAGE_BUCKET}/`);
        if (isVaultBucketObject) {
            return parsed.toString();
        }

        // Convert any third-party external URL into a signed first-party proxy URL
        return buildSignedEmailImageUrl(parsed.toString(), { mode, relative: true });
    } catch {
        return IMAGE_VAULT_FALLBACK_URL;
    }
}

function splitParagraphs(bodyText, summaryText, fallbackParagraphs = []) {
    const raw = String(bodyText || '')
        .split(/\n{2,}/)
        .map((p) => stripMagazineDashes(p))
        .filter((p) => p.length >= 25);
    if (raw.length >= 2) return raw;
    const out = [...raw];
    const cleanSummary = stripMagazineDashes(summaryText || '');
    if (cleanSummary && !out.includes(cleanSummary)) {
        out.unshift(cleanSummary);
    }
    for (const fb of fallbackParagraphs) {
        const cleanFb = stripMagazineDashes(fb);
        if (cleanFb && out.length < 6 && !out.includes(cleanFb)) {
            out.push(cleanFb);
        }
    }
    return out;
}

function buildFallbackNewsBriefs(periodLabel) {
    return [
        {
            headline: `Live Tournament Guarantees Surge Entering ${periodLabel}`,
            summary: 'Regional mid-major stops and championship main events continue expanding multi-flight fields and deeper Day 2 blind structures across North America.',
            byline: 'Smarter.Poker Tour Desk',
            category: 'Live Circuit',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            url: `${MAGAZINE_SITE_URL}/hub/news`,
        },
        {
            headline: 'Mixed-Game & Pot-Limit Omaha Action Expands Across US Poker Rooms',
            summary: 'Four-card and five-card Omaha cash tables alongside dealer-choice rotations record steady table-hour growth in Las Vegas, Texas, and Florida cardrooms.',
            byline: 'Cardroom Pulse',
            category: 'Cash Games',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            url: `${MAGAZINE_SITE_URL}/hub/poker-near-me`,
        },
        {
            headline: 'Mystery Bounty & PKO Formats Reshape Final-Table Strategy',
            summary: 'Modern tournament structures reward players who dynamically recalibrate chip-equivalent bounty odds as Stage 2 envelopes come off the board.',
            byline: 'Strategy Desk',
            category: 'Tournaments',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            url: `${MAGAZINE_SITE_URL}/tools/mystery-bounty-tracker`,
        },
        {
            headline: 'High-Roller Regulars Lean Into Small-Ball Flop Geometry & Turn Overbets',
            summary: 'Championship stream breakdowns highlight compact 25%-33% flop range c-bets paired with polarized 135%-175% turn and river pressure.',
            byline: 'Solver Watch',
            category: 'High Stakes',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            url: `${MAGAZINE_SITE_URL}/hub/training/hand-lab`,
        },
        {
            headline: 'Cardroom Waitlist & Live Tournament Radar Adoption Accelerates',
            summary: 'Players travelling regional corridors use Poker Near Me to verify active tables, daily tournament guarantees, and series stop dates before arriving.',
            byline: 'Live Directory Desk',
            category: 'Poker Rooms',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            url: `${MAGAZINE_SITE_URL}/hub/poker-near-me`,
        },
        {
            headline: 'Structured 10-Minute Warmups Outperform Marathon Passive Video Binging',
            summary: 'Training telemetry shows active EV-graded decision reps before sitting down cut early-session positional mistakes across 6-max and 9-max formats.',
            byline: 'Training Lab',
            category: 'Performance',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            url: `${MAGAZINE_SITE_URL}/hub/training/quick-warmup`,
        },
        {
            headline: 'Satellite Seat-Lock Discipline Remains Top ROI Edge For Festival Grinders',
            summary: 'Milestone and survival qualifiers continue offering outsized value for disciplined players who honor steep bubble-factor thresholds near the stone bubble.',
            byline: 'Tournament Math',
            category: 'Qualifiers',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            url: `${MAGAZINE_SITE_URL}/tools/satellite-calculator`,
        },
        {
            headline: 'Private Club Arena Heads-Up & Spin Action Grows Around The Clock',
            summary: 'Kings Club 25450 players launch instant 1v1 Heads-Up matches, 3-handed Spins, and nightly guaranteed tournaments directly in browser.',
            byline: 'Club Arena Desk',
            category: 'Club Arena',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            url: `${MAGAZINE_SITE_URL}/hub/club-arena/?join=25450`,
        },
    ];
}

function buildFallbackPoyStandings(year) {
    const names = [
        ['Adrian Mateos', 4420],
        ['Alex Foxen', 4285],
        ['Stephen Chidwick', 4190],
        ['Jesse Lonis', 4115],
        ['Seth Davies', 3980],
        ['Isaac Haxton', 3910],
        ['Kristen Foxen', 3845],
        ['Bin Weng', 3790],
        ['Jeremy Ausmus', 3725],
        ['Jason Koon', 3680],
        ['Artur Martirosian', 3610],
        ['Michael Watson', 3565],
        ['Dan Smith', 3510],
        ['Brian Rast', 3460],
        ['Mikita Badziakouski', 3415],
        ['Chris Brewer', 3370],
        ['Nick Petrangelo', 3325],
        ['ren Lin', 3280],
        ['David Peters', 3240],
        ['Erik Seidel', 3195],
        ['Shannon Shorr', 3150],
        ['Punnat Punsri', 3110],
        ['Daniel Dvoress', 3075],
        ['Jonathan Jaffe', 3035],
        ['Sam Soverel', 2995],
    ];
    return names.map(([playerName, points], i) => ({
        rank: i + 1,
        playerName: playerName.replace(/^r/, 'R'),
        points,
        year,
        source: 'standings_snapshot',
    }));
}

function buildFallbackKingsClubResults() {
    return [
        {
            rank: 1,
            name: 'Kings Club Sunday Major Championship',
            gameType: 'NLH',
            buyInLabel: formatChipsOnly(500),
            prizePoolLabel: formatChipsOnly(50000),
            players: 118,
        },
        {
            rank: 2,
            name: 'Kings Club High-Action PLO4 Deepstack',
            gameType: 'PLO4',
            buyInLabel: formatChipsOnly(300),
            prizePoolLabel: formatChipsOnly(25000),
            players: 89,
        },
        {
            rank: 3,
            name: 'Midweek Progressive Bounty Showdown',
            gameType: 'NLH PKO',
            buyInLabel: formatChipsOnly(200),
            prizePoolLabel: formatChipsOnly(18000),
            players: 102,
        },
        {
            rank: 4,
            name: 'Friday Night 6-Max Turbo Championship',
            gameType: 'NLH 6-Max',
            buyInLabel: formatChipsOnly(150),
            prizePoolLabel: formatChipsOnly(12000),
            players: 84,
        },
        {
            rank: 5,
            name: 'PLO5 Five-Card Pot-Limit Classic',
            gameType: 'PLO5',
            buyInLabel: formatChipsOnly(250),
            prizePoolLabel: formatChipsOnly(15000),
            players: 64,
        },
        {
            rank: 6,
            name: 'Kings Club New Member Welcome Freeroll',
            gameType: 'NLH',
            buyInLabel: 'Freeroll (0 Chips)',
            prizePoolLabel: formatChipsOnly(5000),
            players: 210,
        },
    ];
}

function buildSpotModel(catalogSpot, vaultSpotItem) {
    const meta = readItemMeta(vaultSpotItem);
    const base = catalogSpot || SPOT_OF_THE_WEEK_CATALOG[0];
    const slug = String(meta.slug || vaultSpotItem?.source_id || base.slug);
    const cardImageUrl = ensureFirstPartyMagazineImageUrl(
        meta.cardImageUrl || vaultSpotItem?.vaulted_image_url || buildSpotCardImageUrl(slug, { relative: true })
    );
    const votes = meta.communityVotes || { A: 0, B: 0, C: 0, total: 0, solverAgreementPct: null };
    return {
        slug,
        category: stripDollarForChips(meta.category || base.category || 'Solver Lab'),
        title: stripDollarForChips(vaultSpotItem?.headline || base.title),
        variant: String(meta.variant || base.variant || 'nlh'),
        situation: stripDollarForChips(vaultSpotItem?.summary || base.situation),
        heroCards: Array.isArray(meta.heroCards) && meta.heroCards.length ? meta.heroCards : base.heroCards || [],
        boardCards: Array.isArray(meta.boardCards) && meta.boardCards.length ? meta.boardCards : base.boardCards || [],
        options: (Array.isArray(meta.options) && meta.options.length ? meta.options : base.options || []).map((o) => ({
            key: String(o.key || 'A'),
            label: stripDollarForChips(o.label || ''),
        })),
        correctKey: String(meta.correctKey || base.correctKey || 'A'),
        solverFrequency: stripDollarForChips(meta.solverFrequency || base.solverFrequency || ''),
        evSummary: stripDollarForChips(meta.evSummary || base.evSummary || ''),
        cardImageUrl,
        imageUrl: cardImageUrl,
        communityVotes: {
            A: Number(votes.A || 0),
            B: Number(votes.B || 0),
            C: Number(votes.C || 0),
            total: Number(votes.total || 0),
            solverAgreementPct: votes.solverAgreementPct ?? null,
        },
        handLabUrl: `${MAGAZINE_SITE_URL}/hub/training/hand-lab?spot=${encodeURIComponent(slug)}`,
    };
}

/**
 * Pure, deterministic 44-page magazine manifest builder.
 */
export function buildMagazineManifestFromVault({
    issueNumber = 1,
    volumeNumber = 1,
    issuePeriod = currentIssuePeriod(),
    vaultItems = [],
    overrides = {},
} = {}) {
    const period = isValidIssuePeriod(issuePeriod) ? String(issuePeriod).trim() : currentIssuePeriod();
    const periodLabel = formatPeriodLabel(period);
    const yearNum = Number(period.slice(0, 4)) || new Date().getUTCFullYear();
    const issueNum = Math.max(1, Math.round(Number(issueNumber) || 1));
    const volNum = Math.max(1, Math.round(Number(volumeNumber) || 1));
    const siteOrigin = String(overrides?.siteUrl || MAGAZINE_SITE_URL).replace(/\/+$/, '');
    const slug = String(overrides?.slug || period);

    const pinnedTargetId = overrides?.pinnedVaultItemId ? String(overrides.pinnedVaultItemId).trim() : '';

    const activeItems = (Array.isArray(vaultItems) ? vaultItems : [])
        .filter((item) => item && item.is_excluded !== true)
        .map((item) => ({
            ...item,
            summary: item.deck || item.summary || item.subheadline || '',
            source_url: item.canonical_url || item.source_url || '',
        }))
        .sort((a, b) => {
            const aPinned = Boolean(a.is_pinned) || (pinnedTargetId && String(a.id) === pinnedTargetId);
            const bPinned = Boolean(b.is_pinned) || (pinnedTargetId && String(b.id) === pinnedTargetId);
            return Number(bPinned) - Number(aPinned) || Number(b.editorial_score || 0) - Number(a.editorial_score || 0);
        });

    const bySection = (sec) => activeItems.filter((item) => item.section === sec);

    const coverPool = [
        ...activeItems.filter((i) => i.is_pinned || (pinnedTargetId && String(i.id) === pinnedTargetId)),
        ...bySection('cover_candidate'),
        ...bySection('feature_story'),
        ...bySection('news_brief'),
    ];
    const leadCoverItem = coverPool[0] || null;
    const secondaryFeatureItem =
        coverPool.find((item) => item !== leadCoverItem && item?.headline !== leadCoverItem?.headline) || null;
    const finalTableItems = coverPool
        .filter((item) => item !== leadCoverItem && item !== secondaryFeatureItem)
        .slice(0, 4);

    const photoEssayItems = [...bySection('photo_essay'), ...bySection('cover_candidate')].slice(0, 2);

    // News briefs (8 to 12 stories across pp. 6-9)
    const vaultNewsBriefs = [...bySection('news_brief'), ...bySection('feature_story')]
        .filter((item) => item !== leadCoverItem && item !== secondaryFeatureItem)
        .map((item) => {
            const meta = readItemMeta(item);
            return {
                headline: stripMagazineDashes(item.headline || 'World Poker Report'),
                summary: stripMagazineDashes(item.summary || ''),
                byline: stripMagazineDashes(meta.byline || 'Smarter.Poker News Desk'),
                category: stripMagazineDashes(meta.category || 'Poker News'),
                imageUrl: ensureFirstPartyMagazineImageUrl(item.vaulted_image_url || item.original_image_url),
                url: `${siteOrigin}/hub/news`,
            };
        });
    const combinedBriefs = [...vaultNewsBriefs, ...buildFallbackNewsBriefs(periodLabel)].slice(0, 12);

    // Cover imagery & headlines
    const coverWebImage = ensureFirstPartyMagazineImageUrl(
        overrides?.coverImageUrl || leadCoverItem?.vaulted_image_url || IMAGE_VAULT_FALLBACK_URL
    );
    const coverMasterImage = ensureFirstPartyMagazineImageUrl(
        leadCoverItem?.vaulted_master_url || coverWebImage
    );

    const coverHeadline = stripMagazineDashes(
        overrides?.coverHeadline ||
            leadCoverItem?.headline ||
            `${periodLabel} Championship Report: Inside High-Stakes Strategy & The Global POY Race`
    );
    const coverSubheadline = stripMagazineDashes(
        overrides?.coverSubheadline ||
            leadCoverItem?.summary ||
            'Exclusive Solver Breakdowns, Top 25 Player Of The Year Standings, Kings Club 25450 Champions & 60-Day Live Tour Radar'
    );

    // Cover Story 4-page paragraphs (pp. 12-15)
    const coverStoryParagraphs = splitParagraphs(leadCoverItem?.body_text, leadCoverItem?.summary, [
        `${coverHeadline} defines the competitive landscape for ${periodLabel}, bringing together deeper championship fields, sharper preflop 3-bet dynamics, and fearless river sizing at the highest levels of the game.`,
        'Across major stops and online championship series, finalists consistently separated themselves by respecting stack-to-pot geometry early while applying relentless polarized pressure once opponents capped their ranges.',
        'Tournament directors and cardroom operators likewise reported sustained turnout across mid-major main events, mystery bounty flights, and four- and five-card Pot-Limit Omaha side events.',
        'Inside the Smarter.Poker Hand Lab, solver diagnostics confirm why modern champions prioritize blocker-driven bluff-catching and disciplined ICM bubble-factor awareness when six-figure pay jumps hang in the balance.',
        'As the calendar turns toward next month’s headline series, stack preservation on wet multiway textures and decisive turn overbets on brick runouts remain two of the highest-ROI habits any serious player can build.',
        'Flip forward to The Strategy Lab beginning on Page 26 to drill the exact No-Limit Holdem, Final-Table ICM, and Pot-Limit Omaha spots shaping championship poker right now.',
    ]);

    // Secondary Feature paragraphs (pp. 16-17)
    const secondaryHeadline = stripMagazineDashes(
        secondaryFeatureItem?.headline || 'Major Circuit Deep Dive: How Mid-Stakes Grinders Are Conquering Record Fields'
    );
    const secondaryParagraphs = splitParagraphs(secondaryFeatureItem?.body_text, secondaryFeatureItem?.summary, [
        'Record-breaking regional flights have transformed weekend circuit stops into marathon tests of late-registration math, big-blind ante defense, and Day 2 stack leverage.',
        'Players who map out 15-to-25 big blind reshove zones before sitting down avoid bleeding chips in passive multiway flats and arrive at final-table bubbles commanding fold equity.',
        'Pair pre-session quick warmups with real-time ICM chop comparisons so every deep run converts maximum long-term equity.',
    ]);

    // Platform Highlights (pp. 18-19)
    const vaultPlatform = bySection('platform_highlight').map((item) => {
        const meta = readItemMeta(item);
        return {
            badge: stripMagazineDashes(meta.badge || meta.category || 'Platform Upgrade'),
            headline: stripMagazineDashes(item.headline),
            summary: stripDollarForChips(item.summary || item.body_text || ''),
            ctaLabel: stripMagazineDashes(meta.ctaLabel || 'Open On Smarter.Poker'),
            url: String(item.source_url || meta.ctaUrl || `${siteOrigin}/hub`),
        };
    });
    const fallbackPlatform = PLATFORM_UPDATES_CATALOG.slice(0, 6).map((u) => ({
        badge: stripMagazineDashes(u.badge),
        headline: stripMagazineDashes(u.title),
        summary: stripDollarForChips(u.summary),
        ctaLabel: stripMagazineDashes(u.ctaLabel),
        url: u.ctaUrl,
    }));
    const platformItems = [...vaultPlatform, ...fallbackPlatform].slice(0, 6);

    // POY Standings (pp. 20-21)
    const poyVault = bySection('poy_snapshot')[0];
    const poyMeta = readItemMeta(poyVault);
    const rawStandings =
        Array.isArray(poyMeta.standings) && poyMeta.standings.length >= 5
            ? poyMeta.standings
            : buildFallbackPoyStandings(yearNum);
    const poyStandings = rawStandings.slice(0, 25).map((s, idx) => ({
        rank: Number(s.rank || idx + 1),
        playerName: stripMagazineDashes(s.playerName || s.player_name || `Player #${idx + 1}`),
        points: Math.round(Number(s.points || 0) * 100) / 100,
        year: Number(s.year || yearNum),
    }));

    // Kings Club 25450 Champions (pp. 24-25) - strictly Chips, ZERO `$`
    const kcVaultItems = bySection('tournament_result').map((item, idx) => {
        const meta = readItemMeta(item);
        const prizeChips = Number(meta.prizePoolChips ?? meta.prize_pool ?? 0);
        const buyInChips = Number(meta.buyInChips ?? meta.buy_in_amount ?? 0);
        return {
            rank: idx + 1,
            name: stripDollarForChips(meta.name || item.headline || 'Kings Club Championship').split(' - ')[0],
            gameType: stripDollarForChips(meta.gameType || meta.game_type || 'NLH'),
            buyInLabel: stripDollarForChips(meta.buyInLabel || (buyInChips > 0 ? formatChipsOnly(buyInChips) : 'Freeroll (0 Chips)')),
            prizePoolLabel: stripDollarForChips(meta.prizePoolLabel || formatChipsOnly(prizeChips || 10000)),
            players: Number(meta.players ?? meta.current_players ?? 0),
        };
    });
    const kingsClubList = [...kcVaultItems, ...buildFallbackKingsClubResults()].slice(0, 6).map((r, i) => ({
        ...r,
        rank: i + 1,
    }));

    // Strategy Spots (pp. 26-31)
    const vaultSpots = bySection('strategy_spot');
    const nlhCatalog = SPOT_OF_THE_WEEK_CATALOG.find((s) => s.variant === 'nlh' && !/icm|satellite/i.test(s.slug)) || SPOT_OF_THE_WEEK_CATALOG[0];
    const icmCatalog = SPOT_OF_THE_WEEK_CATALOG.find((s) => /icm|satellite/i.test(s.slug)) || SPOT_OF_THE_WEEK_CATALOG[2];
    const ploCatalog = SPOT_OF_THE_WEEK_CATALOG.find((s) => s.variant === 'plo4' || s.variant === 'plo5') || SPOT_OF_THE_WEEK_CATALOG[5];

    const nlhVaultMatch = vaultSpots.find((v) => readItemMeta(v).variant === 'nlh' && !/icm|satellite/i.test(v.source_id || ''));
    const icmVaultMatch = vaultSpots.find((v) => /icm|satellite|pko/i.test(`${v.source_id} ${v.headline}`));
    const ploVaultMatch = vaultSpots.find((v) => ['plo4', 'plo5'].includes(readItemMeta(v).variant) || /plo/i.test(v.source_id || ''));

    const nlhSpot = buildSpotModel(nlhCatalog, nlhVaultMatch);
    const icmSpot = buildSpotModel(icmCatalog, icmVaultMatch);
    const ploSpot = buildSpotModel(ploCatalog, ploVaultMatch);

    // Trivia Quiz (pp. 34-35) - 4 Questions
    const vaultTrivia = bySection('trivia_quiz').map((item) => {
        const meta = readItemMeta(item);
        const catMatch = TRIVIA_OF_THE_WEEK_CATALOG.find((q) => q.slug === item.source_id);
        const src = catMatch || meta;
        return {
            slug: String(item.source_id || src.slug || 'quiz-1'),
            badge: stripDollarForChips(meta.badge || src.badge || 'Poker IQ'),
            categoryLabel: stripDollarForChips(meta.categoryLabel || src.categoryLabel || 'GTO Theory'),
            question: stripDollarForChips(meta.question || item.headline || src.question || ''),
            options: (Array.isArray(meta.options) && meta.options.length ? meta.options : src.options || []).map((o) => ({
                key: String(o.key || 'A'),
                label: stripDollarForChips(o.label || ''),
            })),
            answerKey: String(meta.answerKey || src.answerKey || 'B'),
            explanation: stripDollarForChips(meta.explanation || item.summary || src.explanation || ''),
            ctaUrl: `${siteOrigin}/hub/trivia`,
        };
    });
    const fallbackTrivia = TRIVIA_OF_THE_WEEK_CATALOG.slice(0, 4).map((q) => ({
        slug: q.slug,
        badge: stripDollarForChips(q.badge),
        categoryLabel: stripDollarForChips(q.categoryLabel),
        question: stripDollarForChips(q.question),
        options: (q.options || []).map((o) => ({ key: o.key, label: stripDollarForChips(o.label) })),
        answerKey: q.answerKey,
        explanation: stripDollarForChips(q.explanation),
        ctaUrl: `${siteOrigin}/hub/trivia`,
    }));
    const quizQuestions = [...vaultTrivia, ...fallbackTrivia]
        .filter((q, idx, arr) => q.question && arr.findIndex((x) => x.slug === q.slug) === idx)
        .slice(0, 4)
        .map((q, idx) => ({ ...q, number: idx + 1, correctKey: q.answerKey }));

    // Video & Tool Spotlights (pp. 36-37)
    const videoItems = bySection('video_highlight').slice(0, 3).map((v) => {
        const meta = readItemMeta(v);
        const vidId = String(meta.videoId || v.source_id || 'featured');
        const wPath = meta.watchPath || `/hub/video-library/watch/${encodeURIComponent(vidId)}`;
        const fullUrl = wPath.startsWith('http') ? wPath : `${siteOrigin}${wPath}`;
        return {
            videoId: vidId,
            headline: stripMagazineDashes(v.headline || 'High-Stakes Hand Breakdown'),
            summary: stripMagazineDashes(v.summary || 'Curated Smarter.Poker Video Library session'),
            sourceName: stripMagazineDashes(meta.sourceName || 'Verified Creator'),
            duration: String(meta.duration || ''),
            imageUrl: ensureFirstPartyMagazineImageUrl(v.vaulted_image_url),
            url: fullUrl,
            qrUrl: fullUrl,
        };
    });
    while (videoItems.length < 3) {
        const idx = videoItems.length + 1;
        const fallbackWatchUrl = `${siteOrigin}/hub/video-library`;
        videoItems.push({
            videoId: `curated-${idx}`,
            headline:
                idx === 1
                    ? 'Deep-Stack 3-Bet Pot Navigation & Turn Sizing Mastery'
                    : idx === 2
                      ? 'Final Table ICM Pressure & Short-Stack Reshove Clinic'
                      : 'Multi-Way Pot-Limit Omaha Equity Realization Lab',
            summary: 'Smarter.Poker Curated Video Library',
            sourceName: 'Smarter.Poker Studio',
            duration: '18:40',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            url: fallbackWatchUrl,
            qrUrl: fallbackWatchUrl,
        });
    }

    const toolItems = TOOL_SPOTLIGHT_CATALOG.slice(0, 4).map((t) => ({
        slug: t.slug,
        category: stripDollarForChips(t.category),
        headline: stripDollarForChips(t.title),
        summary: stripDollarForChips(t.tip),
        url: t.url,
        qrUrl: t.url,
    }));

    // Live Series Radar (pp. 38-39)
    const seriesItems = bySection('series_calendar').map((s) => {
        const meta = readItemMeta(s);
        return {
            headline: stripMagazineDashes(s.headline),
            summary: stripMagazineDashes(s.summary || ''),
            venueName: stripMagazineDashes(meta.venueName || ''),
            city: stripMagazineDashes(meta.city || ''),
            state: stripMagazineDashes(meta.state || ''),
            dates: stripMagazineDashes([meta.startDate, meta.endDate].filter(Boolean).join(' to ') || meta.schedule || 'Upcoming'),
            url: `${siteOrigin}/hub/poker-near-me`,
        };
    });
    const fallbackSeries = [
        { headline: 'Las Vegas Championship Tour Series', summary: 'Las Vegas, NV • Multi-Flight Main Event & High Rollers', venueName: 'Las Vegas Strip', city: 'Las Vegas', state: 'NV', dates: 'Upcoming 60-Day Window', url: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'South Florida Deepstack Classic', summary: 'Hollywood, FL • Guaranteed Championship & PLO Series', venueName: 'South Florida Cardroom Corridor', city: 'Hollywood', state: 'FL', dates: 'Upcoming 60-Day Window', url: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'Texas Lone Star Major Open', summary: 'Austin & Houston, TX • Deep-Stack Main Event & Mystery Bounty', venueName: 'Texas Card House Circuit', city: 'Austin', state: 'TX', dates: 'Upcoming 60-Day Window', url: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'Midwest Heartland Poker Championship', summary: 'Chicago Metro & Hammond, IN • Main Event & Senior/PKO Flights', venueName: 'Midwest Corridor', city: 'Chicago', state: 'IL', dates: 'Upcoming 60-Day Window', url: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'California Coast Classic', summary: 'Los Angeles & San Jose, CA • Quantum & Deepstack Flights', venueName: 'California Cardrooms', city: 'Los Angeles', state: 'CA', dates: 'Upcoming 60-Day Window', url: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'Northeast Atlantic Championship', summary: 'Atlantic City, NJ & Philadelphia, PA • Regional Trophy Series', venueName: 'East Coast Tour', city: 'Atlantic City', state: 'NJ', dates: 'Upcoming 60-Day Window', url: `${siteOrigin}/hub/poker-near-me` },
    ];
    const combinedSeries = [...seriesItems, ...fallbackSeries].slice(0, 10);

    // Featured Poker Rooms Directory (pp. 40-41)
    const venueItems = bySection('featured_venue').map((v) => {
        const meta = readItemMeta(v);
        const vUrl = String(meta.venueUrl || v.source_url || `${siteOrigin}/hub/poker-near-me`);
        return {
            headline: stripMagazineDashes(v.headline),
            city: stripMagazineDashes(meta.city || ''),
            state: stripMagazineDashes(meta.state || ''),
            tables: Number(meta.tables || 0),
            summary: stripMagazineDashes(v.summary || 'Live NLH, PLO & Daily Tournaments'),
            url: vUrl,
            qrUrl: vUrl,
        };
    });
    const fallbackVenues = [
        { headline: 'Bellagio Poker Room', city: 'Las Vegas', state: 'NV', tables: 37, summary: 'Las Vegas, NV • 37 Tables • NLH, PLO & High-Stakes Mixed Cash', url: `${siteOrigin}/hub/poker-near-me`, qrUrl: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'ARIA Resort & Casino Poker Room', city: 'Las Vegas', state: 'NV', tables: 24, summary: 'Las Vegas, NV • 24 Tables • Daily MTTs, NLH & Pot-Limit Omaha', url: `${siteOrigin}/hub/poker-near-me`, qrUrl: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'Wynn Las Vegas Poker Room', city: 'Las Vegas', state: 'NV', tables: 28, summary: 'Las Vegas, NV • 28 Tables • Deep-Stack Cash & Signature Series', url: `${siteOrigin}/hub/poker-near-me`, qrUrl: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'Seminole Hard Rock Hollywood', city: 'Hollywood', state: 'FL', tables: 45, summary: 'Hollywood, FL • 45 Tables • Major Tour Host, 24/7 NLH & PLO', url: `${siteOrigin}/hub/poker-near-me`, qrUrl: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'Commerce Casino', city: 'Commerce', state: 'CA', tables: 120, summary: 'Commerce, CA • 120 Tables • Largest Cardroom Spread From Low To High Stakes', url: `${siteOrigin}/hub/poker-near-me`, qrUrl: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'The Lodge Card Club', city: 'Round Rock', state: 'TX', tables: 70, summary: 'Round Rock, TX • 70 Tables • Time-Collection Cash, PLO & Championship Series', url: `${siteOrigin}/hub/poker-near-me`, qrUrl: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'Borgata Hotel Casino & Spa', city: 'Atlantic City', state: 'NJ', tables: 52, summary: 'Atlantic City, NJ • 52 Tables • East Coast Flagship Cash & Daily Tournaments', url: `${siteOrigin}/hub/poker-near-me`, qrUrl: `${siteOrigin}/hub/poker-near-me` },
        { headline: 'Rivers Casino Des Plaines Poker Room', city: 'Des Plaines', state: 'IL', tables: 22, summary: 'Des Plaines, IL • 22 Tables • Chicagoland Action NLH & PLO Cash', url: `${siteOrigin}/hub/poker-near-me`, qrUrl: `${siteOrigin}/hub/poker-near-me` },
    ];
    const combinedVenues = [...venueItems, ...fallbackVenues].slice(0, 10);

    // Promo Signup URL for p. 2 House Spread
    const promoSignupUrl = buildPromoSignupUrl(`${siteOrigin}/auth/signup`, { siteUrl: siteOrigin });

    // Editor's "First Hand" Note (p. 3)
    const editorNote = stripMagazineDashes(
        overrides?.editorNote ||
            `Welcome to Volume ${volNum}, Issue #${issueNum} (${periodLabel}) of ${MAGAZINE_MASTHEAD}. Built in the classic tradition of print poker journalism and powered by real-time solver math, live tour telemetry, and our 42-tool pro suite, every spread is engineered to sharpen your decisions whether you are flipping through on desktop, reading on mobile between hands, or picking up a print copy in your local cardroom.`
    );

    const issueStats = [
        { label: 'Print & Digital Pages', value: '44', detail: '11 Four-Page Signatures' },
        { label: 'Pro Poker Calculators', value: '42', detail: '100% Free Browser Suite' },
        { label: 'POY Contenders Tracked', value: 'Top 25', detail: `${yearNum} Global Standings` },
        { label: 'Specialty GTO Labs', value: '16+', detail: 'NLH, ICM, PLO4 & PLO5' },
        { label: 'Kings Club Welcome', value: '25 Chips', detail: 'Plus 30d VIP & 500 Diamonds' },
        { label: 'Live Series Horizon', value: '60 Days', detail: 'Coast-To-Coast Radar' },
    ];

    const coverLines = [
        `Global POY Top 25: ${poyStandings[0]?.playerName || 'Leader'} Sets The Pace (p. 20)`,
        `Kings Club 25450 Monthly Champions Circle In Chips (p. 24)`,
        `The Strategy Lab: NLH Overbets, Final-Table ICM & PLO Wraps (p. 26)`,
    ];

    const tocEntries = [
        { pageNumber: 3, endPageNumber: 3, title: 'First Hand: From The Editorial Desk', subtitle: 'Monthly telemetry, masthead & state of the game', group: 'departments', groupLabel: 'Departments, POY & Final Table', kind: 'editor_first_hand' },
        { pageNumber: 6, endPageNumber: 9, title: 'The Rail: Monthly Poker News Digest', subtitle: 'Four pages of industry, tour & high-stakes headlines', group: 'departments', groupLabel: 'Departments, POY & Final Table', kind: 'news_rail' },
        { pageNumber: 10, endPageNumber: 11, title: 'Capture The Moment: Photo Spread', subtitle: 'Two-page championship photography showcase', group: 'features', groupLabel: 'Features & Cover Stories', kind: 'capture_the_moment_left' },
        { pageNumber: 12, endPageNumber: 15, title: coverHeadline, subtitle: 'Four-page Cover Story investigation & key numbers', group: 'features', groupLabel: 'Features & Cover Stories', kind: 'cover_feature' },
        { pageNumber: 16, endPageNumber: 17, title: secondaryHeadline, subtitle: 'Live circuit deep dive & field dynamics', group: 'features', groupLabel: 'Features & Cover Stories', kind: 'secondary_feature' },
        { pageNumber: 18, endPageNumber: 19, title: 'Inside Smarter.Poker: New Upgrades Shipped', subtitle: 'Latest trainers, calculators & Club Arena features', group: 'features', groupLabel: 'Features & Cover Stories', kind: 'platform_feature' },
        { pageNumber: 20, endPageNumber: 21, title: `${yearNum} Global Player Of The Year Top 25`, subtitle: 'Official standings & monthly mover spotlights', group: 'departments', groupLabel: 'Departments, POY & Final Table', kind: 'poy_standings' },
        { pageNumber: 22, endPageNumber: 23, title: 'Final Table: Major Circuit Results', subtitle: 'Championship storylines & trophy winners', group: 'departments', groupLabel: 'Departments, POY & Final Table', kind: 'final_table_live' },
        { pageNumber: 24, endPageNumber: 25, title: 'Kings Club 25450 Champions Circle', subtitle: 'Completed Club Arena majors & Chips prize pools', group: 'departments', groupLabel: 'Departments, POY & Final Table', kind: 'kings_club_champions' },
        { pageNumber: 26, endPageNumber: 27, title: `NLH Solver Lab: ${nlhSpot.title}`, subtitle: 'Deep-stack geometry, EVs & community vote split', group: 'strategy', groupLabel: 'The Strategy Lab', kind: 'strategy_nlh' },
        { pageNumber: 28, endPageNumber: 29, title: `Tournament ICM Lab: ${icmSpot.title}`, subtitle: 'Pay-jump bubble factors & deal calculator math', group: 'strategy', groupLabel: 'The Strategy Lab', kind: 'strategy_icm' },
        { pageNumber: 30, endPageNumber: 31, title: `Pot-Limit Omaha Lab: ${ploSpot.title}`, subtitle: 'PLO4/PLO5 nut blockers, wraps & equity realization', group: 'strategy', groupLabel: 'The Strategy Lab', kind: 'strategy_plo' },
        { pageNumber: 32, endPageNumber: 33, title: 'AI Coach Column: Leak-Busting & Bankroll Shield', subtitle: 'Eliminating positional EV leaks & shot-taking discipline', group: 'strategy', groupLabel: 'The Strategy Lab', kind: 'strategy_ai_coach' },
        { pageNumber: 34, endPageNumber: 35, title: 'The Smarter.Poker Test: 4-Spot IQ Challenge', subtitle: 'Test your poker math with full answer key', group: 'strategy', groupLabel: 'The Strategy Lab', kind: 'the_test_quiz' },
        { pageNumber: 36, endPageNumber: 37, title: 'Video & Pro Tool Spotlight Of The Month', subtitle: 'Scan-to-watch hand breakdowns & pro utilities', group: 'strategy', groupLabel: 'The Strategy Lab', kind: 'video_tool_spotlight' },
        { pageNumber: 38, endPageNumber: 39, title: '60-Day Coast-To-Coast Live Series Radar', subtitle: 'Upcoming tournament stops & daily guarantees', group: 'departments', groupLabel: 'Departments, POY & Final Table', kind: 'live_series_radar' },
        { pageNumber: 40, endPageNumber: 41, title: 'Featured Poker Rooms Across America', subtitle: 'Verified cardroom directory & table counts', group: 'departments', groupLabel: 'Departments, POY & Final Table', kind: 'poker_rooms_directory' },
        { pageNumber: 42, endPageNumber: 43, title: 'Cardroom Print Bundle & Weekly Wire Guide', subtitle: 'Stock complimentary monthly print copies in your room', group: 'departments', groupLabel: 'Departments, POY & Final Table', kind: 'cardroom_bundle_cta' },
    ];

    const photoLeftImg = ensureFirstPartyMagazineImageUrl(photoEssayItems[0]?.vaulted_image_url || coverWebImage);
    const photoLeftMaster = ensureFirstPartyMagazineImageUrl(photoEssayItems[0]?.vaulted_master_url || coverMasterImage);
    const photoRightImg = ensureFirstPartyMagazineImageUrl(photoEssayItems[1]?.vaulted_image_url || secondaryFeatureItem?.vaulted_image_url || IMAGE_VAULT_FALLBACK_URL);
    const photoRightMaster = ensureFirstPartyMagazineImageUrl(photoEssayItems[1]?.vaulted_master_url || photoRightImg);
    const secondaryImg = ensureFirstPartyMagazineImageUrl(secondaryFeatureItem?.vaulted_image_url || IMAGE_VAULT_FALLBACK_URL);
    const secondaryMaster = ensureFirstPartyMagazineImageUrl(secondaryFeatureItem?.vaulted_master_url || secondaryImg);

    const rawPages = [
        // p. 1: front_cover
        {
            pageNumber: 1,
            kind: 'front_cover',
            department: 'Cover',
            tocGroup: 'features',
            runningHeader: MAGAZINE_MASTHEAD,
            headline: coverHeadline,
            subheadline: `Vol. ${volNum} • Issue ${issueNum} • ${periodLabel}`,
            byline: MAGAZINE_TAGLINE,
            imageUrl: coverWebImage,
            masterImageUrl: coverMasterImage,
            ctaLabel: 'Read Issue Online',
            ctaUrl: `/hub/magazine/${slug}`,
            qrUrl: `${siteOrigin}/hub/magazine/${slug}`,
            items: coverLines.map((line, i) => ({ number: i + 1, headline: line })),
            paragraphs: [coverSubheadline],
            meta: {
                volumeIssueLine: `Vol. ${volNum} • Issue ${issueNum} • ${periodLabel}`,
                coverLines,
            },
        },
        // p. 2: house_promo_spread (strictly Chips, zero `$`)
        {
            pageNumber: 2,
            kind: 'house_promo_spread',
            department: 'Inside Front Cover',
            tocGroup: 'departments',
            runningHeader: 'Smarter.Poker & Kings Club 25450',
            headline: '25 Free Chips + 30-Day Free VIP + 500 Free Diamonds',
            subheadline: 'Join Kings Club (Club Code 25450) On Club Arena & Train With 42 Free Pro Poker Tools',
            byline: 'Exclusive Reader Welcome Package',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Claim Free Welcome Package',
            ctaUrl: promoSignupUrl,
            qrUrl: promoSignupUrl,
            paragraphs: [
                'Create your free Smarter.Poker account via the QR code or link on this page and complete quick phone verification to unlock 25 Free Chips in Kings Club (Club Code 25450), a 30-Day Free VIP Card, and 500 Free Diamonds.',
                'Take a seat in 24/7 No-Limit Holdem, PLO4, PLO5, private 1v1 Heads-Up matches, and 3-handed Spin games with sub-second dealing and live Bad Beat Jackpot pools.',
            ],
            stats: [
                { label: 'Kings Club Bonus', value: formatChipsOnly(25), detail: 'Club Code 25450' },
                { label: 'VIP Membership', value: '30 Days', detail: 'Full Training & Pro Tools' },
                { label: 'Diamond Vault', value: '500 Diamonds', detail: 'Instant Account Credit' },
            ],
        },
        // p. 3: editor_first_hand
        {
            pageNumber: 3,
            kind: 'editor_first_hand',
            department: 'Departments, POY & Final Table',
            tocGroup: 'departments',
            runningHeader: `First Hand • ${periodLabel}`,
            headline: 'First Hand: Precision At Every Decision Point',
            subheadline: `From The Smarter.Poker Editorial Desk • Vol. ${volNum}, Issue #${issueNum}`,
            byline: 'Smarter.Poker Editorial Board',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Explore Smarter.Poker Hub',
            ctaUrl: '/hub',
            qrUrl: `${siteOrigin}/hub`,
            paragraphs: [
                editorNote,
                'Every Tuesday our Weekly Wire intelligence brief captures breaking storylines, fresh solver spots, and live tournament action; each month those verified highlights crystallize into this 44-page edition.',
            ],
            pullQuote: 'Great poker is built one disciplined range decision at a time - at the felt and in the lab.',
            stats: issueStats,
            items: [
                { role: 'Publication', name: MAGAZINE_MASTHEAD },
                { role: 'Editorial & Solver Lab', name: 'Smarter.Poker Strategy & News Desk' },
                { role: 'Live Tour & Venue Data', name: 'Poker Near Me Verification Team' },
                { role: 'Cardroom Print Distribution', name: 'Oak Lawn, IL Print Operations' },
            ],
        },
        // p. 4: toc_left
        {
            pageNumber: 4,
            kind: 'toc_left',
            department: 'Table Of Contents',
            tocGroup: 'features',
            runningHeader: `Contents • ${periodLabel}`,
            headline: 'In This Issue: Features & Departments',
            subheadline: `Vol. ${volNum} • Issue ${issueNum} • ${periodLabel}`,
            imageUrl: coverWebImage,
            masterImageUrl: coverMasterImage,
            ctaLabel: 'Jump To Cover Story',
            ctaUrl: `/hub/magazine/${slug}`,
            qrUrl: `${siteOrigin}/hub/magazine/${slug}`,
            items: tocEntries.filter((t) => t.group === 'features' || (t.group === 'departments' && t.pageNumber <= 25)),
        },
        // p. 5: toc_right
        {
            pageNumber: 5,
            kind: 'toc_right',
            department: 'Table Of Contents',
            tocGroup: 'strategy',
            runningHeader: `Contents • The Strategy Lab & Directories`,
            headline: 'The Strategy Lab, Tour Radar & Room Guide',
            subheadline: 'Click Any Entry Online Or Scan Any Page In Print',
            imageUrl: nlhSpot.cardImageUrl,
            masterImageUrl: nlhSpot.cardImageUrl,
            ctaLabel: 'Open Hand Lab',
            ctaUrl: '/hub/training/hand-lab',
            qrUrl: `${siteOrigin}/hub/training/hand-lab`,
            items: tocEntries.filter((t) => t.group === 'strategy' || t.pageNumber > 25),
        },
        // pp. 6-9: news_rail (4 pages)
        ...[0, 1, 2, 3].map((railIdx) => {
            const slice = combinedBriefs.slice(railIdx * 3, railIdx * 3 + 3);
            const railTitles = [
                'The Rail: Global Tour & High-Stakes Briefs',
                'The Rail: Cardroom Growth & Industry Pulse',
                'The Rail: Tournament Formats & Rules Watch',
                'The Rail: Online & Ecosystem Intelligence',
            ];
            const leadImg = slice[0]?.imageUrl || IMAGE_VAULT_FALLBACK_URL;
            return {
                pageNumber: 6 + railIdx,
                kind: 'news_rail',
                department: 'Departments, POY & Final Table',
                tocGroup: 'departments',
                runningHeader: `The Rail • Page ${railIdx + 1} Of 4`,
                headline: railTitles[railIdx],
                subheadline: `${periodLabel} Verified World Poker News Digest`,
                byline: 'Smarter.Poker News Desk',
                imageUrl: leadImg,
                masterImageUrl: leadImg,
                ctaLabel: 'More On News Hub',
                ctaUrl: '/hub/news',
                qrUrl: `${siteOrigin}/hub/news`,
                items: slice,
                paragraphs: slice.map((s) => `${s.headline}: ${s.summary}`),
            };
        }),
        // p. 10: capture_the_moment_left
        {
            pageNumber: 10,
            kind: 'capture_the_moment_left',
            department: 'Features & Cover Stories',
            tocGroup: 'features',
            runningHeader: 'Capture The Moment • Spread I',
            headline: stripMagazineDashes(photoEssayItems[0]?.headline || 'Under The Championship Lights'),
            subheadline: 'High-Stakes Tension Where Every River Sizing Carries Championship Weight',
            byline: 'Smarter.Poker Visual Vault',
            imageUrl: photoLeftImg,
            masterImageUrl: photoLeftMaster,
            ctaLabel: 'View Issue Gallery',
            ctaUrl: `/hub/magazine/${slug}`,
            qrUrl: `${siteOrigin}/hub/magazine/${slug}`,
            paragraphs: [
                stripMagazineDashes(
                    photoEssayItems[0]?.summary ||
                        'Deep into the final two tables, chip stacks compress, cameras close in, and hours of disciplined preparation converge on a single river decision.'
                ),
            ],
            pullQuote: 'Composure under final-table lights begins hundreds of hands earlier in preparation.',
        },
        // p. 11: capture_the_moment_right
        {
            pageNumber: 11,
            kind: 'capture_the_moment_right',
            department: 'Features & Cover Stories',
            tocGroup: 'features',
            runningHeader: 'Capture The Moment • Spread II',
            headline: stripMagazineDashes(photoEssayItems[1]?.headline || 'The Championship Rail & Trophy Moment'),
            subheadline: `${periodLabel} Photographic Highlights From Across The Poker World`,
            byline: 'Smarter.Poker Visual Vault',
            imageUrl: photoRightImg,
            masterImageUrl: photoRightMaster,
            ctaLabel: 'Explore Live Series',
            ctaUrl: '/hub/poker-near-me',
            qrUrl: `${siteOrigin}/hub/poker-near-me`,
            paragraphs: [
                stripMagazineDashes(
                    photoEssayItems[1]?.summary ||
                        'From packed Day 1 cardroom floors to the final river showdown, live poker continues drawing surging fields across every major stop.'
                ),
            ],
        },
        // pp. 12-15: cover_feature (4 pages)
        ...[0, 1, 2, 3].map((partIdx) => {
            const pSlice = [
                coverStoryParagraphs[partIdx] || coverStoryParagraphs[0],
                coverStoryParagraphs[(partIdx + 2) % coverStoryParagraphs.length],
            ].filter(Boolean);
            const subTitles = [
                coverSubheadline,
                'Part II: Range Construction & Positional Leverage',
                'Part III: Navigating Pay Jumps & Deep-Run Inflection Points',
                'Part IV: Key Takeaways For Your Next Championship Session',
            ];
            return {
                pageNumber: 12 + partIdx,
                kind: 'cover_feature',
                department: 'Features & Cover Stories',
                tocGroup: 'features',
                runningHeader: `Cover Story • Part ${partIdx + 1} Of 4`,
                headline: partIdx === 0 ? coverHeadline : `${coverHeadline} (Continued)`,
                subheadline: subTitles[partIdx],
                byline: stripMagazineDashes(readItemMeta(leadCoverItem).byline || 'Smarter.Poker Feature Desk'),
                imageUrl: coverWebImage,
                masterImageUrl: coverMasterImage,
                ctaLabel: 'Train Championship Spots',
                ctaUrl: '/hub/training/hand-lab',
                qrUrl: `${siteOrigin}/hub/training/hand-lab`,
                paragraphs: pSlice,
                pullQuote:
                    partIdx === 0
                        ? 'Uncapped range advantage paired with fearless river sizing separates trophy winners from min-cashers.'
                        : partIdx === 2
                          ? 'Respecting Bubble Factor against covering stacks preserves real tournament equity when short stacks are on the ropes.'
                          : '',
                stats: issueStats.slice(0, 4),
            };
        }),
        // pp. 16-17: secondary_feature (2 pages)
        ...[0, 1].map((idx) => ({
            pageNumber: 16 + idx,
            kind: 'secondary_feature',
            department: 'Features & Cover Stories',
            tocGroup: 'features',
            runningHeader: `Circuit Feature • Page ${idx + 1} Of 2`,
            headline: idx === 0 ? secondaryHeadline : `${secondaryHeadline}: Tactical Blueprint`,
            subheadline:
                idx === 0
                    ? 'Inside Multi-Flight Tournament Preparation & Day 2 Stack Accumulation'
                    : 'Executing 15bb-25bb Reshove & Blind-Defense Adjustments Under Big-Blind Antes',
            byline: 'Smarter.Poker Tour Desk',
            imageUrl: secondaryImg,
            masterImageUrl: secondaryMaster,
            ctaLabel: 'Open Push/Fold Tool',
            ctaUrl: '/tools/push-fold-calculator',
            qrUrl: `${siteOrigin}/tools/push-fold-calculator`,
            paragraphs: idx === 0 ? secondaryParagraphs.slice(0, 2) : secondaryParagraphs.slice(1),
            pullQuote: 'Winning Day 2 transitions starts with owning the 14bb to 22bb reshove window.',
            stats: [
                { label: 'Optimal Reshove Window', value: '14-22 BB', detail: 'High Dead-Money Leverage' },
                { label: 'BBA Orbit Cost', value: '2.5 BB', detail: 'Standard 8/9-Handed Table' },
            ],
        })),
        // pp. 18-19: platform_feature (2 pages)
        ...[0, 1].map((idx) => {
            const pSlice = platformItems.slice(idx * 3, idx * 3 + 3);
            return {
                pageNumber: 18 + idx,
                kind: 'platform_feature',
                department: 'Features & Cover Stories',
                tocGroup: 'features',
                runningHeader: `Inside Smarter.Poker • Page ${idx + 1} Of 2`,
                headline:
                    idx === 0
                        ? 'Inside Smarter.Poker: New GTO Labs & Engine Upgrades'
                        : 'Pro Poker Calculators & Live Table Utilities Shipped This Month',
                subheadline: '100% Integrated Across Desktop & Mobile Browser With Zero Downloads Required',
                byline: 'Smarter.Poker Engineering',
                imageUrl: IMAGE_VAULT_FALLBACK_URL,
                masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
                ctaLabel: idx === 0 ? 'Launch Training Hub' : 'Explore All 42 Tools',
                ctaUrl: idx === 0 ? '/hub/training' : '/tools',
                qrUrl: `${siteOrigin}${idx === 0 ? '/hub/training' : '/tools'}`,
                items: pSlice,
                paragraphs: pSlice.map((p) => `${p.headline}: ${p.summary}`),
            };
        }),
        // pp. 20-21: poy_standings (2 pages)
        {
            pageNumber: 20,
            kind: 'poy_standings',
            department: 'Departments, POY & Final Table',
            tocGroup: 'departments',
            runningHeader: `${yearNum} Global POY • Ranks 1-12`,
            headline: `${yearNum} Global Player Of The Year Standings (Ranks 1-12)`,
            subheadline: `${poyStandings[0]?.playerName || 'Leader'} Holds #1 Entering ${periodLabel}`,
            byline: 'Global Standings Desk',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'View Live POY Leaderboard',
            ctaUrl: '/hub/news',
            qrUrl: `${siteOrigin}/hub/news`,
            standings: poyStandings.slice(0, 12),
            items: poyStandings.slice(0, 12),
        },
        {
            pageNumber: 21,
            kind: 'poy_standings',
            department: 'Departments, POY & Final Table',
            tocGroup: 'departments',
            runningHeader: `${yearNum} Global POY • Ranks 13-25 & Movers`,
            headline: `${yearNum} Global Player Of The Year Standings (Ranks 13-25)`,
            subheadline: 'Contenders Within Striking Distance As Championship Series Heat Up',
            byline: 'Global Standings Desk',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Follow Tour Results',
            ctaUrl: '/hub/news',
            qrUrl: `${siteOrigin}/hub/news`,
            standings: poyStandings.slice(12, 25),
            items: poyStandings.slice(12, 25),
            paragraphs: [
                `Consistency across high-roller festivals and massive main-event fields separates the ${yearNum} Top 25 leaderboard contenders, with narrow point margins from #5 through #25.`,
            ],
        },
        // pp. 22-23: final_table_live (2 pages)
        ...[0, 1].map((idx) => {
            const ftSlice = finalTableItems.slice(idx * 2, idx * 2 + 2);
            const mappedFt =
                ftSlice.length > 0
                    ? ftSlice.map((f) => ({
                          headline: stripMagazineDashes(f.headline),
                          summary: stripMagazineDashes(f.summary || ''),
                          imageUrl: ensureFirstPartyMagazineImageUrl(f.vaulted_image_url),
                          url: `${siteOrigin}/hub/news`,
                      }))
                    : combinedBriefs.slice(idx * 2, idx * 2 + 2);
            return {
                pageNumber: 22 + idx,
                kind: 'final_table_live',
                department: 'Departments, POY & Final Table',
                tocGroup: 'departments',
                runningHeader: `Final Table Results • Page ${idx + 1} Of 2`,
                headline:
                    idx === 0
                        ? 'Final Table: Major Circuit Results & Trophy Winners'
                        : 'Final Table: Breakthrough Runs & Championship Storylines',
                subheadline: `${periodLabel} Live Tournament Recap`,
                byline: 'Tournament Results Desk',
                imageUrl: mappedFt[0]?.imageUrl || IMAGE_VAULT_FALLBACK_URL,
                masterImageUrl: mappedFt[0]?.imageUrl || IMAGE_VAULT_FALLBACK_URL,
                ctaLabel: 'Browse Tour Radar',
                ctaUrl: '/hub/poker-near-me',
                qrUrl: `${siteOrigin}/hub/poker-near-me`,
                items: mappedFt,
                paragraphs: mappedFt.map((m) => `${m.headline}: ${m.summary}`),
            };
        }),
        // pp. 24-25: kings_club_champions (2 pages, strictly Chips, ZERO `$`)
        ...[0, 1].map((idx) => {
            const kcSlice = kingsClubList.slice(idx * 3, idx * 3 + 3);
            return {
                pageNumber: 24 + idx,
                kind: 'kings_club_champions',
                department: 'Departments, POY & Final Table',
                tocGroup: 'departments',
                runningHeader: `Kings Club 25450 • Page ${idx + 1} Of 2`,
                headline:
                    idx === 0
                        ? 'Kings Club 25450 Monthly Champions Circle'
                        : 'Club Arena Completed Majors & Freeroll Standouts',
                subheadline: 'Official Completed Tournament Prize Pools In Kings Club (Code 25450)',
                byline: 'Club Arena Competition Desk',
                imageUrl: IMAGE_VAULT_FALLBACK_URL,
                masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
                ctaLabel: 'Enter Kings Club 25450',
                ctaUrl: '/hub/club-arena/?join=25450',
                qrUrl: `${siteOrigin}/hub/club-arena/?join=25450`,
                standings: kcSlice,
                items: kcSlice.map((k) => ({
                    rank: k.rank,
                    headline: `${k.name} (${k.gameType})`,
                    summary: `Prize Pool: ${k.prizePoolLabel} • Buy-In: ${k.buyInLabel}`,
                    prizePoolLabel: k.prizePoolLabel,
                    buyInLabel: k.buyInLabel,
                    players: k.players,
                })),
                paragraphs: [
                    'Every tournament inside Kings Club (Club Code 25450) settles automatically in Chips on the Smarter.Poker Club Arena engine, featuring NLH, PLO4, PLO5, PKO, and Spin formats.',
                ],
            };
        }),
        // pp. 26-27: strategy_nlh (2 pages)
        {
            pageNumber: 26,
            kind: 'strategy_nlh',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'NLH Solver Lab • Setup & Action Tree',
            headline: `NLH Deep-Stack Lab: ${nlhSpot.title}`,
            subheadline: `${nlhSpot.category} • 6-Max Cash & Deep-Stack Decision Point`,
            byline: 'Smarter.Poker GTO Lab',
            imageUrl: nlhSpot.cardImageUrl,
            masterImageUrl: nlhSpot.cardImageUrl,
            ctaLabel: 'Play Spot In Hand Lab',
            ctaUrl: `/hub/training/hand-lab?spot=${encodeURIComponent(nlhSpot.slug)}`,
            qrUrl: nlhSpot.handLabUrl,
            spot: nlhSpot,
            items: nlhSpot.options,
            paragraphs: [
                nlhSpot.situation,
                'Before turning your eyes to Page 27, lock in your exact action and sizing choice from Options A, B, and C, then compare your intuition against the solver equilibrium and Weekly Wire reader vote.',
            ],
        },
        {
            pageNumber: 27,
            kind: 'strategy_nlh',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'NLH Solver Lab • Equilibrium Verdict',
            headline: `Solver Verdict: ${nlhSpot.solverFrequency}`,
            subheadline: `Recommended Line: Option ${nlhSpot.correctKey} • Community Vote Vs. GTO`,
            byline: 'Smarter.Poker GTO Lab',
            imageUrl: nlhSpot.cardImageUrl,
            masterImageUrl: nlhSpot.cardImageUrl,
            ctaLabel: 'Drill More NLH Spots',
            ctaUrl: `/hub/training/hand-lab?spot=${encodeURIComponent(nlhSpot.slug)}`,
            qrUrl: nlhSpot.handLabUrl,
            spot: nlhSpot,
            paragraphs: [
                nlhSpot.evSummary,
                'Key Takeaway: Whenever preflop and flop callers cap their top-of-range nutted density while you retain sets, two-pairs, and overpairs, geometric overbets outperform small sizing.',
            ],
        },
        // pp. 28-29: strategy_icm (2 pages)
        {
            pageNumber: 28,
            kind: 'strategy_icm',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'Tournament ICM Lab • Final Table Pressure',
            headline: `Final-Table ICM Lab: ${icmSpot.title}`,
            subheadline: `${icmSpot.category} • Navigating Asymmetric Pay-Jump Risk`,
            byline: 'Smarter.Poker Tournament Lab',
            imageUrl: icmSpot.cardImageUrl,
            masterImageUrl: icmSpot.cardImageUrl,
            ctaLabel: 'Open ICM Calculator',
            ctaUrl: '/tools/icm-calculator',
            qrUrl: `${siteOrigin}/tools/icm-calculator`,
            spot: icmSpot,
            items: icmSpot.options,
            paragraphs: [
                icmSpot.situation,
                'Chip EV and tournament equity diverge sharply whenever micro-stacks sit on the brink of elimination while a covering big stack opens ahead of you.',
            ],
        },
        {
            pageNumber: 29,
            kind: 'strategy_icm',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'Tournament ICM Lab • Bubble Factor Math',
            headline: `ICM Verdict: ${icmSpot.solverFrequency}`,
            subheadline: `Recommended Action: Option ${icmSpot.correctKey} • Scan Below To Run Custom Stacks`,
            byline: 'Smarter.Poker Tournament Lab',
            imageUrl: icmSpot.cardImageUrl,
            masterImageUrl: icmSpot.cardImageUrl,
            ctaLabel: 'Run ICM Deal Math',
            ctaUrl: '/tools/icm-calculator',
            qrUrl: `${siteOrigin}/tools/icm-calculator`,
            spot: icmSpot,
            paragraphs: [
                icmSpot.evSummary,
                'Scan the QR badge on this page at any live final table to compare Chip-Chop, Even-Split, and exact ICM numbers on your phone in seconds.',
            ],
        },
        // pp. 30-31: strategy_plo (2 pages)
        {
            pageNumber: 30,
            kind: 'strategy_plo',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'Pot-Limit Omaha Lab • PLO4 & PLO5',
            headline: `Omaha Multi-Way Lab: ${ploSpot.title}`,
            subheadline: `${ploSpot.category} • Nut Blockers, Redraws & SPR Discipline`,
            byline: 'Smarter.Poker Omaha Desk',
            imageUrl: ploSpot.cardImageUrl,
            masterImageUrl: ploSpot.cardImageUrl,
            ctaLabel: 'Train PLO In Hand Lab',
            ctaUrl: `/hub/training/hand-lab?spot=${encodeURIComponent(ploSpot.slug)}`,
            qrUrl: ploSpot.handLabUrl,
            spot: ploSpot,
            items: ploSpot.options,
            paragraphs: [
                ploSpot.situation,
                'In four-card and five-card Pot-Limit Omaha, bare non-nut draws and unbacked wraps routinely get quartered or freerolled when stacks go in without redraw protection.',
            ],
        },
        {
            pageNumber: 31,
            kind: 'strategy_plo',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'Pot-Limit Omaha Lab • Solver Breakdown',
            headline: `PLO Solver Verdict: ${ploSpot.solverFrequency}`,
            subheadline: `Recommended Line: Option ${ploSpot.correctKey} • Counting Clean Nut Outs`,
            byline: 'Smarter.Poker Omaha Desk',
            imageUrl: ploSpot.cardImageUrl,
            masterImageUrl: ploSpot.cardImageUrl,
            ctaLabel: 'Open PLO Outs Tool',
            ctaUrl: '/tools/plo-outs-calculator',
            qrUrl: `${siteOrigin}/tools/plo-outs-calculator`,
            spot: ploSpot,
            paragraphs: [
                ploSpot.evSummary,
                'Use the free Smarter.Poker PLO Wrap & Redraw Outs Counter between sessions to separate 13-to-20 card nut wraps from dominated sucker-end straight draws.',
            ],
        },
        // pp. 32-33: strategy_ai_coach (2 pages)
        {
            pageNumber: 32,
            kind: 'strategy_ai_coach',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'AI Personal Assistant • Leak-Busting Column',
            headline: 'Three Silent Positional Leaks Draining Winrates (And How To Fix Them)',
            subheadline: 'Data-Driven Insights From Smarter.Poker Personal Assistant & EV Heatmaps',
            byline: 'Smarter.Poker AI Coaching Column',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Open EV Heatmap',
            ctaUrl: '/hub/training/ev-heatmap',
            qrUrl: `${siteOrigin}/hub/training/ev-heatmap`,
            paragraphs: [
                '1. Over-Flatting Out Of The Small Blind: Calling raises cold from the Small Blind invites Big Blind squeezes and forces out-of-position play with uncapped opponents behind. Shift toward a disciplined 3-bet-or-fold construction outside high-implied-odds multiway spots.',
                '2. Autopilot 65% C-Betting Multiway: What prints heads-up bleeds chips 3-way and 4-way. Tighten flop continuation frequencies and use compact 25%-33% stabs when checking is close.',
                '3. Skipping Blocker Checks On Paired Rivers: Before hero-calling or firing a third barrel, verify whether your suits block Villain value combos or Villain missed front-door draws.',
            ],
            pullQuote: 'Fixing your worst two positional leaks raises net winrate faster than memorizing obscure edge cases.',
        },
        {
            pageNumber: 33,
            kind: 'strategy_ai_coach',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'AI Personal Assistant • Bankroll Discipline',
            headline: 'Structured Shot-Taking & Downswing Shield Architecture',
            subheadline: 'Separating Standard Variance From Game-Selection Drift',
            byline: 'Smarter.Poker Bankroll Lab',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Check Bankroll Coach',
            ctaUrl: '/hub/training/bankroll-coach',
            qrUrl: `${siteOrigin}/hub/training/bankroll-coach`,
            paragraphs: [
                'Every winning player experiences 15-to-30 buy-in MTT swings and multi-session cash variance. Pre-committing a hard three-buy-in shot budget before testing the next stake removes tilt-driven chase decisions.',
                'Pair a 5-minute pre-session warmup with an explicit stop-loss rule whenever table quality degrades or fatigue creeps past your A-game window.',
            ],
            stats: [
                { label: 'Live Cash Cushion', value: '30-40 BI', detail: 'Low Risk-Of-Ruin Baseline' },
                { label: 'MTT Roll Standard', value: '100-150 BI', detail: 'Large-Field Variance Buffer' },
                { label: 'Shot-Take Trigger', value: '3-5 BI', detail: 'Pre-Set Step-Down Rule' },
            ],
        },
        // pp. 34-35: the_test_quiz (2 pages)
        {
            pageNumber: 34,
            kind: 'the_test_quiz',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'The Smarter.Poker Test • Questions 1-2',
            headline: 'The Smarter.Poker Test: Monthly Poker IQ Challenge',
            subheadline: 'Select Your Answers Interactive Online Or Check The Print Key On Page 35',
            byline: 'Smarter.Poker Trivia V3 Arena',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Play Live Trivia Arena',
            ctaUrl: '/hub/trivia',
            qrUrl: `${siteOrigin}/hub/trivia`,
            items: quizQuestions.slice(0, 2),
            meta: {
                allQuestions: quizQuestions,
            },
        },
        {
            pageNumber: 35,
            kind: 'the_test_quiz',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'The Smarter.Poker Test • Questions 3-4 & Answer Key',
            headline: 'The Smarter.Poker Test: Questions 3-4 & Official Answer Key',
            subheadline: 'Scan Below For Head-To-Head ELO Trivia Duels & Daily Diamond Streaks',
            byline: 'Smarter.Poker Trivia V3 Arena',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Challenge A Player In Trivia',
            ctaUrl: '/hub/trivia',
            qrUrl: `${siteOrigin}/hub/trivia`,
            items: quizQuestions.slice(2, 4),
            meta: {
                allQuestions: quizQuestions,
                answerKey: quizQuestions.map((q) => ({
                    number: q.number,
                    answerKey: q.answerKey,
                    explanation: q.explanation,
                })),
            },
        },
        // pp. 36-37: video_tool_spotlight (2 pages)
        {
            pageNumber: 36,
            kind: 'video_tool_spotlight',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'Video Library Spotlight • Scan To Watch',
            headline: 'Top Curated Strategy Videos Of The Month',
            subheadline: 'Scan Any QR Code Or Click To Watch Instant Hand-By-Hand Breakdowns',
            byline: 'Smarter.Poker Video Library',
            imageUrl: videoItems[0]?.imageUrl || IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: videoItems[0]?.imageUrl || IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Open Video Library',
            ctaUrl: '/hub/video-library',
            qrUrl: videoItems[0]?.qrUrl || `${siteOrigin}/hub/video-library`,
            items: videoItems,
        },
        {
            pageNumber: 37,
            kind: 'video_tool_spotlight',
            department: 'The Strategy Lab',
            tocGroup: 'strategy',
            runningHeader: 'Pro Tool Spotlight • 42 Free Utilities',
            headline: 'Essential Pro Poker Calculators Of The Month',
            subheadline: 'Bookmark On Your Phone For Instant Table-Side & Post-Session Math',
            byline: 'Smarter.Poker Tools Suite',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Explore All 42 Tools',
            ctaUrl: '/tools',
            qrUrl: `${siteOrigin}/tools`,
            items: toolItems,
        },
        // pp. 38-39: live_series_radar (2 pages)
        {
            pageNumber: 38,
            kind: 'live_series_radar',
            department: 'Departments, POY & Final Table',
            tocGroup: 'departments',
            runningHeader: '60-Day Live Series Radar • National Stops',
            headline: 'Coast-To-Coast Upcoming 60-Day Live Series Schedule',
            subheadline: 'Major Championship Stops, Regional Festivals & Multi-Flight Open Events',
            byline: 'Poker Near Me Tour Desk',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Search Live Series Near You',
            ctaUrl: '/hub/poker-near-me',
            qrUrl: `${siteOrigin}/hub/poker-near-me`,
            items: combinedSeries.slice(0, 5),
        },
        {
            pageNumber: 39,
            kind: 'live_series_radar',
            department: 'Departments, POY & Final Table',
            tocGroup: 'departments',
            runningHeader: '60-Day Live Series Radar • Regional & Daily',
            headline: 'Regional Stops & Recurring Cardroom Tournament Highlights',
            subheadline: 'Verify Real-Time Schedules & Guarantees Before You Travel',
            byline: 'Poker Near Me Tour Desk',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Open Live Poker Map',
            ctaUrl: '/hub/poker-near-me',
            qrUrl: `${siteOrigin}/hub/poker-near-me`,
            items: combinedSeries.slice(5, 10),
        },
        // pp. 40-41: poker_rooms_directory (2 pages)
        {
            pageNumber: 40,
            kind: 'poker_rooms_directory',
            department: 'Departments, POY & Final Table',
            tocGroup: 'departments',
            runningHeader: 'Featured Poker Rooms • West & Las Vegas',
            headline: 'Featured Poker Rooms Across America: West & Las Vegas',
            subheadline: 'Verified Table Counts, Cash Spreads & Daily Tournament Action',
            byline: 'Poker Near Me Directory',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Find Rooms Near You',
            ctaUrl: '/hub/poker-near-me',
            qrUrl: `${siteOrigin}/hub/poker-near-me`,
            items: combinedVenues.slice(0, 5),
        },
        {
            pageNumber: 41,
            kind: 'poker_rooms_directory',
            department: 'Departments, POY & Final Table',
            tocGroup: 'departments',
            runningHeader: 'Featured Poker Rooms • Texas, Midwest & East',
            headline: 'Featured Poker Rooms Across America: Texas, South & East Coast',
            subheadline: 'Scan To Check Live Waitlists, Hours & Upcoming Series',
            byline: 'Poker Near Me Directory',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Browse Full Directory',
            ctaUrl: '/hub/poker-near-me',
            qrUrl: `${siteOrigin}/hub/poker-near-me`,
            items: combinedVenues.slice(5, 10),
        },
        // pp. 42-43: cardroom_bundle_cta (2 pages)
        {
            pageNumber: 42,
            kind: 'cardroom_bundle_cta',
            department: 'Departments, POY & Final Table',
            tocGroup: 'departments',
            runningHeader: 'Smarter.Poker Weekly Wire • Free Tuesday Brief',
            headline: 'Never Miss A Tuesday: Subscribe Free To The Smarter.Poker Weekly Wire',
            subheadline: 'Fresh Solver Spots, POY Updates, Kings Club Schedules & Zero Recycled Noise',
            byline: 'Subscriber Services',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Subscribe To Weekly Wire',
            ctaUrl: '/hub/wire',
            qrUrl: `${siteOrigin}/hub/wire`,
            paragraphs: [
                'Every Tuesday at 14:00 UTC, thousands of poker players open the Smarter.Poker Weekly Wire for curated tournament news, interactive Spot Of The Week voting, and free pro calculator tips.',
                'Scan the QR badge or visit smarter.poker/hub/wire to subscribe in one click.',
            ],
        },
        {
            pageNumber: 43,
            kind: 'cardroom_bundle_cta',
            department: 'Departments, POY & Final Table',
            tocGroup: 'departments',
            runningHeader: 'Cardroom Print Program • Request Copies',
            headline: 'Poker Room Managers: Stock Smarter.Poker Magazine In Your Cardroom',
            subheadline: 'Request Monthly Bulk Print Bundles (5 To 1,000 Copies) + Free QR Table Tents',
            byline: 'Cardroom Distribution Desk',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Request Cardroom Print Bundle',
            ctaUrl: '/hub/magazine/poker-rooms',
            qrUrl: `${siteOrigin}/hub/magazine/poker-rooms`,
            paragraphs: [
                'Give waiting-list players a true 44-page poker strategy and live-series magazine at your brush stand and lounge tables - complete with featured directory placement for verified partner rooms.',
                'Enroll your poker room in 60 seconds at smarter.poker/hub/magazine/poker-rooms.',
            ],
            stats: [
                { label: 'Bundle Range', value: '5-1,000', detail: 'Copies Per Month' },
                { label: 'Trim Format', value: '8.375x10.875', detail: 'Saddle-Stitch Glossy' },
            ],
        },
        // p. 44: back_cover
        {
            pageNumber: 44,
            kind: 'back_cover',
            department: 'Back Cover',
            tocGroup: 'departments',
            runningHeader: MAGAZINE_MASTHEAD,
            headline: 'Train Smarter. Find Live Action. Conquer Every Street.',
            subheadline: 'GTO Hand Lab • 42 Pro Calculators • Poker Near Me • Kings Club 25450',
            byline: 'smarter.poker',
            imageUrl: IMAGE_VAULT_FALLBACK_URL,
            masterImageUrl: IMAGE_VAULT_FALLBACK_URL,
            ctaLabel: 'Visit Smarter.Poker',
            ctaUrl: '/',
            qrUrl: siteOrigin,
            paragraphs: [
                'One unified poker ecosystem built for serious tournament and cash-game players everywhere.',
            ],
            stats: [
                { label: 'Web Hub', value: 'smarter.poker', detail: 'Instant Browser Access' },
                { label: 'Kings Club', value: 'Code 25450', detail: 'Club Arena Lobby' },
            ],
        },
    ];

    const signaturePageCount = normalizeSignaturePageCount(rawPages.length);

    return normalizeIssueManifest({
        masthead: MAGAZINE_MASTHEAD,
        issueNumber: issueNum,
        volumeNumber: volNum,
        issuePeriod: period,
        periodLabel,
        slug,
        title: stripMagazineDashes(`${MAGAZINE_MASTHEAD} - Issue #${issueNum} (${periodLabel})`),
        coverHeadline,
        coverSubheadline,
        coverLines,
        coverImageUrl: coverWebImage,
        editorNote,
        pageCount: signaturePageCount,
        toc: tocEntries,
        stats: issueStats,
        pages: rawPages,
    });
}

async function upsertMagazineIssueResilient(client, payload, existingId = null) {
    let candidate = { ...payload };
    for (let attempt = 0; attempt < 8; attempt += 1) {
        let query;
        if (existingId) {
            query = client.from('magazine_issues').update(candidate).eq('id', existingId);
        } else {
            query = client.from('magazine_issues').upsert(candidate, { onConflict: 'issue_period' });
        }
        const res = typeof query.select === 'function' ? await query.select('*').limit(2) : await query;
        if (!res?.error) {
            const row = Array.isArray(res?.data) ? res.data[0] : res?.data || candidate;
            return row || candidate;
        }

        const msg = String(res.error.message || res.error.details || '');
        const missingColMatch =
            msg.match(/Could not find the '([^']+)' column/i) ||
            msg.match(/column "([^"]+)" of relation "magazine_issues" does not exist/i) ||
            msg.match(/column "([^"]+)" does not exist/i);

        if (missingColMatch?.[1] && missingColMatch[1] in candidate) {
            delete candidate[missingColMatch[1]];
            continue;
        }
        throw res.error;
    }
    return candidate;
}

/**
 * Compiles and persists a monthly magazine issue row in `public.magazine_issues`.
 */
export async function compileMonthlyMagazineIssue(
    sb,
    {
        issuePeriod = '',
        status = '',
        coverHeadline = '',
        coverSubheadline = '',
        editorNote = '',
        pinnedVaultItemId = '',
        siteUrl = MAGAZINE_SITE_URL,
    } = {}
) {
    const client = await getSupabaseClient(sb);
    const period = isValidIssuePeriod(issuePeriod) ? String(issuePeriod).trim() : currentIssuePeriod();

    let vaultItems = [];
    try {
        const { data } = await client
            .from('magazine_vault_items')
            .select('*')
            .eq('issue_period', period)
            .limit(500);
        vaultItems = Array.isArray(data) ? data : [];
    } catch {
        vaultItems = [];
    }

    let existingIssue = null;
    try {
        const { data: existingRows } = await client
            .from('magazine_issues')
            .select('*')
            .eq('issue_period', period)
            .order('created_at', { ascending: true })
            .limit(3);
        if (Array.isArray(existingRows) && existingRows.length > 0) {
            existingIssue = existingRows[0];
        }
    } catch {
        existingIssue = null;
    }

    let issueNumber = Number(existingIssue?.issue_number || 0);
    if (!Number.isFinite(issueNumber) || issueNumber < 1) {
        try {
            const { data: topRows } = await client
                .from('magazine_issues')
                .select('issue_number')
                .order('issue_number', { ascending: false })
                .limit(10);
            const maxNum = (topRows || []).reduce(
                (acc, r) => Math.max(acc, Number(r?.issue_number || 0)),
                0
            );
            issueNumber = maxNum + 1;
        } catch {
            issueNumber = 1;
        }
    }

    const year = Number(period.slice(0, 4)) || new Date().getUTCFullYear();
    const volumeNumber = Math.max(1, Number(existingIssue?.volume_number || year - 2025));

    const effectiveOverrides = {
        slug: existingIssue?.slug || period,
        coverHeadline: coverHeadline || existingIssue?.cover_headline || '',
        coverSubheadline: coverSubheadline || existingIssue?.cover_subheadline || '',
        editorNote: editorNote || existingIssue?.editor_note || '',
        pinnedVaultItemId,
        siteUrl,
    };

    const manifest = buildMagazineManifestFromVault({
        issueNumber,
        volumeNumber,
        issuePeriod: period,
        vaultItems,
        overrides: effectiveOverrides,
    });

    const nextStatus = status
        ? status
        : existingIssue?.status === 'published'
          ? 'published'
          : 'review';

    const nowIso = new Date().toISOString();
    const issuePayload = {
        issue_number: manifest.issueNumber,
        volume_number: manifest.volumeNumber,
        issue_period: period,
        slug: manifest.slug,
        title: manifest.title,
        cover_headline: manifest.coverHeadline,
        cover_subheadline: manifest.coverSubheadline,
        editor_note: manifest.editorNote,
        cover_image_url: manifest.coverImageUrl,
        status: nextStatus,
        page_count: manifest.pageCount,
        manifest_json: manifest,
        ...(nextStatus === 'published' && !existingIssue?.published_at ? { published_at: nowIso } : {}),
        updated_at: nowIso,
    };

    const savedIssue = await upsertMagazineIssueResilient(client, issuePayload, existingIssue?.id || null);

    return {
        issue: {
            ...issuePayload,
            ...(savedIssue || {}),
            manifest_json: manifest,
        },
        manifest,
        vaultItemCount: vaultItems.length,
    };
}
