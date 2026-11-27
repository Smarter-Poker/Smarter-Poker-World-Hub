/**
 * Smarter.Poker Magazine art direction: decides which picture prints on which
 * page so an issue reads like a real print magazine.
 *
 * Laws enforced here (see MAG LAW 24 in __tests__/smarter-poker-magazine.law.test.mjs):
 * 1. No picture prints twice in one issue (page art and item thumbnails share one ledger).
 * 2. Generated "editorial plate" placeholders and the generic fallback image never
 *    print as editorial art. A page with no real picture uses a text layout instead.
 * 3. A photo borrowed from another story is only placed on a story it is relevant
 *    to, and always carries that story's headline as its caption.
 * 4. Platform, house-ad and department pages carry Smarter.Poker brand art from /public.
 * 5. QR codes follow `planMagazineQrCodes` (schema): only where a scan takes the
 *    reader somewhere specific, once per destination.
 *
 * Pure ESM: no Node built-ins, safe for client and server bundles.
 */
import {
    isMagazineFallbackImageUrl,
    isVanguardPlateVaultRecord,
    magazineImageAssetKey,
    planMagazineQrCodes,
    stripMagazineDashes,
} from './magazineSchema.mjs';

/** Smarter.Poker brand art (files in /public), assigned by page kind and position in its run. */
export const MAGAZINE_BRAND_ART = Object.freeze({
    house_promo_spread: ['/images/club_arena_card_art.webp'],
    editor_first_hand: ['/circuit-brain-bg.webp'],
    platform_feature: [
        '/images/training/coach-mode/strategy-chamber-hero.webp',
        '/images/training/coach-mode/pot-odds-core.webp',
    ],
    poy_standings: ['/images/training/coach-mode/river-mastery.webp'],
    kings_club_champions: ['/images/training/casino-realism/adv-020.webp'],
    strategy_ai_coach: [
        '/images/training/coach-mode/preflop-position.webp',
        '/images/training/coach-mode/three-bet-pressure.webp',
    ],
    the_test_quiz: ['/images/trivia/daily-trivia-header-final.webp'],
    video_tool_spotlight: [null, '/images/training/coach-mode/cbet-analysis.webp'],
    live_series_radar: ['/images/training/casino-realism/adv-001.webp'],
    poker_rooms_directory: ['/images/training/casino-realism/adv-010.webp'],
    cardroom_bundle_cta: [
        '/images/training/coach-mode/turn-evolution.webp',
        '/images/training/training-orb-hero.webp',
    ],
    back_cover: ['/images/og-card.jpg'],
});

/** Art the reader sees when a table of contents page has no unused news photo left. */
const TOC_ART_FALLBACK = ['/images/training/casino-realism/adv-001.webp', '/images/training/training-orb-hero.webp'];

const STORY_PHOTO_KINDS = new Set([
    'front_cover',
    'capture_the_moment_left',
    'capture_the_moment_right',
    'cover_feature',
    'secondary_feature',
]);
const ITEM_LED_KINDS = new Set(['news_rail', 'final_table_live']);
const STRATEGY_SPOT_KINDS = new Set(['strategy_nlh', 'strategy_icm', 'strategy_plo']);

/** Pages claim their own pictures in this order, so the strongest placement keeps a shared picture. */
const CLAIM_PRIORITY = [
    'front_cover',
    'strategy_nlh',
    'strategy_icm',
    'strategy_plo',
    'video_tool_spotlight',
    'capture_the_moment_left',
    'capture_the_moment_right',
    'cover_feature',
    'secondary_feature',
    'final_table_live',
    'news_rail',
    'toc_left',
    'toc_right',
];

const RELEVANCE_STOPWORDS = new Set(
    (
        'the a an of in on at to for and or with by from as is are be its it this that his her their after before ' +
        'into over up out new wins win won takes take hauls haul big huge first second third final table main event ' +
        'events poker player players game games series tournament tournaments championship championships million ' +
        'millions guaranteed gtd prize pool record month week day year 2025 2026 2027 november december january ' +
        'returns return back more most just what why how who you your our we us vs plus all top best live online ' +
        'smarter magazine page story news brief recap results report'
    ).split(/\s+/)
);

const RELEVANCE_ALIASES = Object.freeze({ wsopc: ['wsop', 'circuit'], gtd: [], lapc: ['wpt'] });

function relevanceTokens(text) {
    const out = new Set();
    for (const raw of String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9$ ]+/g, ' ')
        .split(/\s+/)) {
        if (raw.length < 3 || RELEVANCE_STOPWORDS.has(raw) || /^\$?\d/.test(raw)) continue;
        const alias = RELEVANCE_ALIASES[raw];
        if (alias) alias.forEach((a) => out.add(a));
        else out.add(raw);
    }
    return out;
}

/** Headline words count fully; body words only break ties, so a passing mention never wins. */
function relevanceScore(page, photoText) {
    const head = relevanceTokens(`${page.headline || ''} ${page.subheadline || ''}`);
    const body = relevanceTokens((page.paragraphs || []).slice(0, 2).join(' '));
    let score = 0;
    for (const t of relevanceTokens(photoText)) {
        if (head.has(t)) score += 1;
        else if (body.has(t)) score += 0.1;
    }
    return score;
}

/** First-party YouTube thumbnail through the Next.js image optimizer (img.youtube.com is an allowed remote pattern). */
export function buildMagazineVideoThumbnailUrl(videoId, width = 640) {
    const id = String(videoId || '').trim();
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return '';
    const source = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    return `/_next/image?url=${encodeURIComponent(source)}&w=${width}&q=75`;
}

function buildPhotoLedger(vaultItems = []) {
    const info = new Map();
    for (const row of Array.isArray(vaultItems) ? vaultItems : []) {
        const key = magazineImageAssetKey(row?.vaulted_image_url);
        if (!key) continue;
        const plate = isVanguardPlateVaultRecord(row);
        const prev = info.get(key);
        info.set(key, {
            key,
            plate: plate || Boolean(prev?.plate),
            webUrl: row.vaulted_image_url,
            masterUrl: row.vaulted_master_url || row.vaulted_image_url,
            headline: stripMagazineDashes(String(row.headline || prev?.headline || '')).trim(),
            section: String(row.section || prev?.section || ''),
            width: Number(row.image_width || 0),
            height: Number(row.image_height || 0),
            isRemoteVideo: row.source_type === 'video_library',
        });
    }
    return info;
}

function isUsablePicture(url, ledger) {
    if (!url || isMagazineFallbackImageUrl(url)) return false;
    const key = magazineImageAssetKey(url);
    if (!key) return false;
    const known = ledger.get(key);
    return !known?.plate;
}

/**
 * Returns a new manifest whose pages and items obey the art-direction laws above.
 * Idempotent: running it on its own output changes nothing.
 */
export function finalizeMagazineIssueManifest(manifest, { vaultItems = [] } = {}) {
    if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.pages)) return manifest;
    const ledger = buildPhotoLedger(vaultItems);
    const pages = manifest.pages.map((p) => ({
        ...p,
        items: Array.isArray(p.items) ? p.items.map((it) => (it && typeof it === 'object' ? { ...it } : it)) : [],
    }));

    // Position of each page inside its run of same-kind pages (feature spreads, ads, departments).
    const runIndex = new Map();
    const kindCount = new Map();
    pages.forEach((p, idx) => {
        const prev = pages[idx - 1];
        const inRun = prev && prev.kind === p.kind && Number(prev.pageNumber) + 1 === Number(p.pageNumber);
        runIndex.set(p, inRun ? runIndex.get(prev) + 1 : 0);
        kindCount.set(p.kind, (kindCount.get(p.kind) || 0) + (inRun ? 0 : 1));
    });
    const occurrence = new Map();
    const kindOccurrence = new Map();
    pages.forEach((p) => {
        const n = kindOccurrence.get(p.kind) || 0;
        occurrence.set(p, n);
        kindOccurrence.set(p.kind, n + 1);
    });

    const used = new Set();
    const assigned = new Map(); // page -> { url, master, role, caption, leadItemIndex }
    const claim = (url) => {
        const key = magazineImageAssetKey(url);
        if (!key || used.has(key)) return false;
        used.add(key);
        return true;
    };

    // Video items: replace failed vault thumbnails with the real YouTube frame.
    for (const p of pages) {
        for (const it of p.items) {
            if (!it || typeof it !== 'object' || !it.videoId) continue;
            if (!isUsablePicture(it.imageUrl, ledger)) {
                const thumb = buildMagazineVideoThumbnailUrl(it.videoId);
                if (thumb) {
                    it.imageUrl = thumb;
                    it.masterImageUrl = buildMagazineVideoThumbnailUrl(it.videoId, 1200);
                }
            }
        }
    }

    const ordered = [...pages].sort((a, b) => {
        const pa = CLAIM_PRIORITY.indexOf(a.kind);
        const pb = CLAIM_PRIORITY.indexOf(b.kind);
        return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || Number(a.pageNumber) - Number(b.pageNumber);
    });

    // Pass 1: every page keeps its own picture when it is real and nobody stronger claimed it.
    const alreadyDirected = Number(manifest?.meta?.artDirectionVersion) >= 1;
    for (const p of ordered) {
        const ri = runIndex.get(p);
        if (alreadyDirected) {
            const keep =
                p.imageRole &&
                p.imageRole !== 'none' &&
                p.imageUrl &&
                (p.imageRole === 'art' || p.imageRole === 'spot' || isUsablePicture(p.imageUrl, ledger));
            if (keep && claim(p.imageUrl)) {
                assigned.set(p, {
                    url: p.imageUrl,
                    master: p.masterImageUrl || p.imageUrl,
                    role: p.imageRole,
                    caption: p.imageCaption || '',
                    ...(Number.isInteger(p.leadItemIndex) && p.leadItemIndex >= 0 ? { leadItemIndex: p.leadItemIndex } : {}),
                });
            }
            continue;
        }
        if (p.kind === 'front_cover' || (STORY_PHOTO_KINDS.has(p.kind) && ri === 0)) {
            if (isUsablePicture(p.imageUrl, ledger) && claim(p.imageUrl)) {
                assigned.set(p, { url: p.imageUrl, master: p.masterImageUrl || p.imageUrl, role: 'photo', caption: '' });
            }
        } else if (STRATEGY_SPOT_KINDS.has(p.kind) && ri === 0) {
            if (p.imageUrl && !isMagazineFallbackImageUrl(p.imageUrl) && claim(p.imageUrl)) {
                assigned.set(p, { url: p.imageUrl, master: p.masterImageUrl || p.imageUrl, role: 'spot', caption: '' });
            }
        } else if (p.kind === 'video_tool_spotlight' && ri === 0) {
            const idx = p.items.findIndex((it) => it?.videoId && isUsablePicture(it.imageUrl, ledger));
            if (idx >= 0 && claim(p.items[idx].imageUrl)) {
                const it = p.items[idx];
                assigned.set(p, {
                    url: it.imageUrl,
                    master: it.masterImageUrl || it.imageUrl,
                    role: 'video',
                    caption: stripMagazineDashes(it.headline || it.title || ''),
                    leadItemIndex: idx,
                });
            }
        } else if (ITEM_LED_KINDS.has(p.kind)) {
            const idx = p.items.findIndex((it) => it && isUsablePicture(it.imageUrl, ledger) && !used.has(magazineImageAssetKey(it.imageUrl)));
            if (idx >= 0 && claim(p.items[idx].imageUrl)) {
                const it = p.items[idx];
                assigned.set(p, {
                    url: it.imageUrl,
                    master: it.masterImageUrl || it.imageUrl,
                    role: 'photo',
                    caption: stripMagazineDashes(it.headline || it.title || ''),
                    leadItemIndex: idx,
                });
            }
        }
    }

    // Pool of real photos no page has claimed yet (stories that were not printed, or item thumbnails).
    const pool = [...ledger.values()]
        .filter((ph) => !ph.plate && !ph.isRemoteVideo && ph.width >= 360)
        .sort((a, b) => b.width * b.height - a.width * a.height);
    const takeFromPool = (p, { requireRelevance }) => {
        let best = null;
        let bestScore = -1;
        for (const ph of pool) {
            if (used.has(ph.key)) continue;
            const score = relevanceScore(p, ph.headline);
            if (requireRelevance && score < 1) continue;
            if (score > bestScore) {
                best = ph;
                bestScore = score;
            }
        }
        if (!best) return null;
        used.add(best.key);
        return { url: best.webUrl, master: best.masterUrl, role: 'photo', caption: best.headline };
    };

    // Pass 2: fill pages that still need a picture.
    for (const p of ordered) {
        if (assigned.has(p)) continue;
        const ri = runIndex.get(p);
        let pick = null;
        if (p.kind === 'front_cover') {
            pick = takeFromPool(p, { requireRelevance: true }) || takeFromPool(p, { requireRelevance: false });
        } else if (STORY_PHOTO_KINDS.has(p.kind)) {
            const wantsPhoto =
                ri === 0 ||
                (p.kind === 'cover_feature' && ri === 2) ||
                (p.kind === 'secondary_feature' && ri === 1) ||
                p.kind.startsWith('capture_the_moment');
            if (wantsPhoto) pick = takeFromPool(p, { requireRelevance: true });
        } else if (p.kind === 'toc_left' || p.kind === 'toc_right') {
            pick = takeFromPool(p, { requireRelevance: false });
            if (!pick) {
                const art = TOC_ART_FALLBACK[p.kind === 'toc_left' ? 0 : 1];
                if (claim(art)) pick = { url: art, master: art, role: 'art', caption: '' };
            }
        } else if (ITEM_LED_KINDS.has(p.kind)) {
            pick = takeFromPool(p, { requireRelevance: true });
        } else {
            const artList = MAGAZINE_BRAND_ART[p.kind] || [];
            const art = artList[ri] ?? (ri === 0 ? artList[0] : null);
            if (art && claim(art)) pick = { url: art, master: art, role: 'art', caption: '' };
        }
        if (pick) assigned.set(p, pick);
    }

    // Pass 3: item thumbnails, each at most once, never repeating page art.
    for (const p of pages) {
        const lead = assigned.get(p);
        p.items.forEach((it, idx) => {
            if (!it || typeof it !== 'object' || !('imageUrl' in it || 'masterImageUrl' in it)) return;
            if (lead && Number.isInteger(lead.leadItemIndex) && lead.leadItemIndex === idx) {
                it.imageUrl = '';
                it.masterImageUrl = '';
                return;
            }
            if (isUsablePicture(it.imageUrl, ledger) && claim(it.imageUrl)) return;
            it.imageUrl = '';
            it.masterImageUrl = '';
        });
    }

    let coverImageUrl = manifest.coverImageUrl;
    for (const p of pages) {
        const pick = assigned.get(p);
        if (pick) {
            p.imageUrl = pick.url;
            p.masterImageUrl = pick.master;
            p.imageRole = pick.role;
            p.imageCaption = pick.caption || '';
            p.leadItemIndex = Number.isInteger(pick.leadItemIndex) ? pick.leadItemIndex : -1;
        } else {
            p.imageUrl = '';
            p.masterImageUrl = '';
            p.imageRole = 'none';
            p.imageCaption = '';
            p.leadItemIndex = -1;
        }
        if (p.kind === 'front_cover' && p.imageUrl) coverImageUrl = p.imageUrl;
    }

    applyEditorialHygiene(pages, runIndex);

    const qrPlan = planMagazineQrCodes(pages);
    for (const p of pages) {
        const planned = qrPlan.get(Number(p.pageNumber)) || { showQr: false, qrLabel: '' };
        p.showQr = planned.showQr;
        p.qrLabel = planned.qrLabel;
    }

    return {
        ...manifest,
        coverImageUrl,
        meta: { ...(manifest.meta || {}), artDirectionVersion: 1 },
        pages,
    };
}

const STORY_TEXT_KINDS = new Set(['cover_feature', 'secondary_feature']);

function normalizeQuoteKey(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function splitSentences(paragraph) {
    return String(paragraph || '')
        .split(/(?<=[.!?])\s+(?=[A-Z0-9"\u201c])/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
}

/**
 * Picks a pull quote that is a real sentence from the story, taken from another page of the
 * same story so it never sits next to its own source text. Returns '' when nothing fits.
 */
export function pickStoryPullQuote(sourceParagraphs = [], usedKeys = new Set()) {
    const candidates = [];
    for (const paragraph of sourceParagraphs) {
        for (const sentence of splitSentences(paragraph)) {
            const clean = stripMagazineDashes(sentence).replace(/\*+$/, '').trim();
            if (clean.length < 60 || clean.length > 170) continue;
            if (/^(but|and|so|or)\b/i.test(clean) || /[?]$/.test(clean)) continue;
            if (/\b(page|flip forward|smarter\.poker)\b/i.test(clean)) continue;
            const key = normalizeQuoteKey(clean);
            if (!key || usedKeys.has(key)) continue;
            const digits = (clean.match(/\d/g) || []).length;
            candidates.push({ clean, key, score: digits * 2 + Math.min(clean.length, 140) / 20 });
        }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
}

/**
 * Story pages get pull quotes from their own story, and no stat box or pull quote prints twice
 * in one issue. Mutates pages in place.
 */
function applyEditorialHygiene(pages, runIndex) {
    const usedQuotes = new Set();
    pages.forEach((p, idx) => {
        if (!STORY_TEXT_KINDS.has(p.kind)) return;
        const ri = runIndex.get(p) || 0;
        const start = idx - ri;
        let end = idx;
        while (pages[end + 1] && pages[end + 1].kind === p.kind && (runIndex.get(pages[end + 1]) || 0) > 0) end += 1;
        const storyText = pages
            .slice(start, end + 1)
            .flatMap((page) => page.paragraphs || [])
            .join(' ');
        const storyKey = normalizeQuoteKey(storyText);
        const current = stripMagazineDashes(p.pullQuote || '');
        const currentKey = normalizeQuoteKey(current);
        const belongs = currentKey && storyKey.includes(currentKey) && !usedQuotes.has(currentKey);
        // Quotes go on continuation pages that print without a photo, where they fill the column.
        const wantsQuote = ri > 0 && p.imageRole === 'none';
        if (belongs && wantsQuote) {
            usedQuotes.add(currentKey);
            return;
        }
        p.pullQuote = '';
        if (!wantsQuote) return;
        const otherPages = pages.slice(start, end + 1).filter((page) => page !== p);
        const pick = pickStoryPullQuote(
            otherPages.flatMap((page) => page.paragraphs || []),
            usedQuotes
        );
        if (pick) {
            p.pullQuote = pick.clean;
            usedQuotes.add(pick.key);
        }
    });

    const seenQuotes = new Set();
    const seenStats = new Set();
    for (const p of pages) {
        const quoteKey = normalizeQuoteKey(p.pullQuote);
        if (quoteKey) {
            if (seenQuotes.has(quoteKey)) p.pullQuote = '';
            else seenQuotes.add(quoteKey);
        }
        if (Array.isArray(p.stats) && p.stats.length) {
            p.stats = p.stats.filter((stat) => {
                const key = `${normalizeQuoteKey(stat?.label)}|${normalizeQuoteKey(stat?.value)}`;
                if (seenStats.has(key)) return false;
                seenStats.add(key);
                return true;
            });
        }
    }
}

/** Every picture key the reader will see, in print order (used by the laws and the live audit). */
export function listPrintedMagazinePictures(manifest) {
    const out = [];
    for (const p of manifest?.pages || []) {
        if (p.imageRole !== 'none' && p.imageUrl && !isMagazineFallbackImageUrl(p.imageUrl)) {
            out.push({ pageNumber: p.pageNumber, key: magazineImageAssetKey(p.imageUrl), url: p.imageUrl, where: 'page' });
        }
        (p.items || []).forEach((it, idx) => {
            if (it?.imageUrl && !isMagazineFallbackImageUrl(it.imageUrl)) {
                out.push({ pageNumber: p.pageNumber, key: magazineImageAssetKey(it.imageUrl), url: it.imageUrl, where: `item ${idx}` });
            }
        });
    }
    return out;
}
