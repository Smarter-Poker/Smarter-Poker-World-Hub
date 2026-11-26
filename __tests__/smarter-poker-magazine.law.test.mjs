/**
 * PERMANENT ANTI-REGRESSION LAW SUITE - SMARTER.POKER MONTHLY MAGAZINE ECOSYSTEM
 *
 * Enforces all 8 architectural, print-signature, SSRF/image-vault, client-bundle,
 * SEO/allowlist, palette, and Admin Studio invariants across Slice 1, Slice 2, and Slice 3:
 *
 *   MAG LAW 1: 4-page commercial saddle-stitch signature invariant (`normalizeSignaturePageCount`
 *              always `% 4 === 0`, `8.375` x `10.875` trim, `0.125` bleed, deterministic
 *              `buildMagazineQrMatrixSvg` has zero `<text>`/`<tspan>` tags).
 *   MAG LAW 2: Weekly Wire Tuesday schedule (`('/api/news/digest?days=7', dict(day_of_week='tue', hour=14, minute=0))`)
 *              remains 100% intact alongside `/api/news/magazine-vault` and
 *              `/api/news/magazine?action=monthly_publish` in `scripts/openclaw-cron-dispatcher.py`,
 *              with zero net-new files added to `pages/api/cron/`.
 *   MAG LAW 3: `buildMagazineManifestFromVault` produces a complete 44-page Card Player 1:1 issue
 *              (`pageCount % 4 === 0`) containing Cover, House Spread, First Hand, 2-Page TOC,
 *              News Rail, Capture The Moment, Cover Feature, POY Standings, Final Table,
 *              Kings Club Champions (Chips-only, zero `$`), NLH/ICM/PLO/AI Strategy Columns,
 *              The Test Quiz, Video/Tools, Live Series Radar, Poker Rooms Directory,
 *              Cardroom Bundle CTA, and Back Cover, with zero third-party hotlink images.
 *   MAG LAW 4: Image Vault (`imageVault.mjs`) enforces `assertFetchableUrl` SSRF protection +
 *              `sharp` 300-DPI print master & web JPEG generation into `magazine-assets`
 *              (and uses `supabaseServerClient`, never raw `@supabase/supabase-js`).
 *   MAG LAW 5: `/hub/magazine`, `/hub/magazine/[issue]`, `/hub/magazine/print/[issue]`, and
 *              `/hub/magazine/poker-rooms` keep client bundles pure (zero top-level `sharp`/`fs`/
 *              `child_process` imports), include `onError` image fallbacks, and enforce
 *              `@page` `8.375in 10.875in` print CSS.
 *   MAG LAW 6: `config/geo-blocks.json`, `middleware.ts`, `sitemapBuilders.mjs`, and
 *              `sitemap-core.xml.js` allowlist and index `/hub/magazine` routes cleanly.
 *   MAG LAW 7: Vanguard palette (`0` yellow/purple hexes), `0` em/en dashes, and Chips-only
 *              formatting hold across all `src/lib/magazine/*`, `src/components/magazine/*`,
 *              `pages/hub/magazine/*`, `pages/api/news/magazine*.js`, and `pages/admin/newsletter.js`.
 *   MAG LAW 8: `/api/news/magazine-rooms.js` blocks synthetic domains (`@example.com`, `@horse.ai`),
 *              rate-limits writes, and gates `GET`/`PATCH` behind admin auth;
 *              `pages/admin/newsletter.js` wires the Monthly Magazine Studio via `/api/news/magazine`
 *              and `/api/news/operations` (never `/api/admin/*`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import nextFileTracer from 'next/dist/compiled/@vercel/nft/index.js';

import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_PAGE_KINDS,
    MAGAZINE_POSTAL_ADDRESS,
    MAGAZINE_SECTIONS,
    MAGAZINE_STORAGE_BUCKET,
    MAGAZINE_TOC_GROUPS,
    MAGAZINE_TRIM,
    buildMagazineQrDataUri,
    buildMagazineQrMatrixSvg,
    currentIssuePeriod,
    formatChipsOnly,
    formatPeriodLabel,
    isValidIssuePeriod,
    normalizeIssueManifest,
    normalizeSignaturePageCount,
    previousIssuePeriod,
    stripMagazineDashes,
} from '../src/lib/magazine/magazineSchema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(REPO, rel));

test('the publication API treats magazine links as URLs during Next file tracing', async () => {
    const apiRoute = 'pages/api/news/magazine.js';
    const { fileList } = await nextFileTracer.nodeFileTrace([apiRoute], {
        base: REPO,
        processCwd: REPO,
        // Isolate this entry's file references from module dependencies bundled by webpack.
        resolve: async () => [],
    });

    assert.ok(fileList.has(apiRoute));
    const readerPages = [...fileList].filter((file) => file.startsWith('pages/hub/magazine/'));
    assert.deepEqual(readerPages, []);
});

const FORBIDDEN_PALETTE_HEX_RE =
    /#(?:fbbf24|eab308|f59e0b|ffd700|fde047|fef08a|d97706|ca8a04|d4a853|c084fc|a855f7|8b5cf6|d8b4fe|9333ea|7c3aed)\b/i;

function stripCommentsAndRegexes(source) {
    let out = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    out = out.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
    // Blank regex literals so character classes like /[\u2014\u2013]/ in strippers are not mistaken for UI copy
    const chars = out.split('');
    const OPENS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '\n']);
    for (let i = 0; i < chars.length; i += 1) {
        if (chars[i] !== '/') continue;
        let j = i - 1;
        while (j >= 0 && (chars[j] === ' ' || chars[j] === '\t')) j -= 1;
        const prev = j >= 0 ? chars[j] : '\n';
        const isReturn = out.slice(Math.max(0, j - 5), j + 1).endsWith('return');
        if (!OPENS.has(prev) && !isReturn) continue;
        let k = i + 1;
        let inClass = false;
        let closed = -1;
        for (; k < chars.length; k += 1) {
            const c = chars[k];
            if (c === '\\') {
                k += 1;
                continue;
            }
            if (c === '\n') break;
            if (c === '[') inClass = true;
            else if (c === ']') inClass = false;
            else if (c === '/' && !inClass) {
                closed = k;
                break;
            }
        }
        if (closed < 0) continue;
        for (let m = i + 1; m < closed; m += 1) {
            if (chars[m] !== '\n') chars[m] = ' ';
        }
        i = closed;
    }
    return chars.join('');
}

// ── MAG LAW 1: 4-Page Saddle-Stitch Signature Math, Trim Specs & Pure-Vector QR ──
test('MAG LAW 1: 4-page saddle-stitch signature invariant, 8.375x10.875 trim + 0.125 bleed, and pure-vector QR SVG hold', () => {
    assert.equal(MAGAZINE_MASTHEAD, 'Smarter.Poker Magazine');
    assert.equal(MAGAZINE_STORAGE_BUCKET, 'magazine-assets');
    assert.equal(MAGAZINE_POSTAL_ADDRESS, 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453');

    assert.equal(MAGAZINE_TRIM.widthIn, 8.375);
    assert.equal(MAGAZINE_TRIM.heightIn, 10.875);
    assert.equal(MAGAZINE_TRIM.bleedIn, 0.125);
    assert.equal(MAGAZINE_TRIM.safeMarginIn, 0.5);
    assert.equal(MAGAZINE_TRIM.defaultPageCount, 44);

    for (const candidate of [0, 1, 15, 16, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 60, NaN, null, undefined]) {
        const normalized = normalizeSignaturePageCount(candidate);
        assert.equal(normalized % 4, 0, `Page count ${normalized} from ${String(candidate)} must be divisible by 4`);
        assert.ok(normalized >= 36 && normalized <= 48, `Page count ${normalized} must stay within 36..48 saddle-stitch bounds`);
    }
    assert.equal(normalizeSignaturePageCount(44), 44);
    assert.equal(normalizeSignaturePageCount(41), 44);
    assert.equal(normalizeSignaturePageCount(37), 40);

    // Deterministic pure-vector QR matrix (zero <text> or <tspan>)
    const qrA = buildMagazineQrMatrixSvg('https://smarter.poker/hub/magazine/2026-11', 96);
    const qrB = buildMagazineQrMatrixSvg('https://smarter.poker/hub/magazine/2026-11', 96);
    const qrOther = buildMagazineQrMatrixSvg('https://smarter.poker/hub/training/hand-lab', 96);
    assert.equal(qrA, qrB, 'QR SVG matrix must be 100% deterministic for identical URLs');
    assert.notEqual(qrA, qrOther, 'Distinct URLs must produce distinct QR matrices');
    assert.match(qrA, /^<svg\b[\s\S]*<\/svg>$/);
    assert.doesNotMatch(qrA, /<\s*(?:text|tspan)\b/i, 'QR SVG must contain zero <text> or <tspan> elements');
    assert.match(buildMagazineQrDataUri('https://smarter.poker/hub/magazine'), /^data:image\/svg\+xml;/);

    // Schema helpers
    assert.equal(formatChipsOnly(25000), '25,000 Chips');
    assert.equal(formatChipsOnly(0), '0 Chips');
    assert.doesNotMatch(formatChipsOnly(100000), /\$/);
    assert.equal(stripMagazineDashes('WSOP \u2014 Main Event \u2013 Final &mdash; Table &ndash; Live'), 'WSOP - Main Event - Final - Table - Live');
    assert.equal(isValidIssuePeriod('2026-11'), true);
    assert.equal(isValidIssuePeriod('2026-13'), false);
    assert.equal(currentIssuePeriod(new Date('2026-11-26T12:00:00Z')), '2026-11');
    assert.equal(previousIssuePeriod(new Date('2026-01-15T12:00:00Z')), '2025-12');
    assert.equal(formatPeriodLabel('2026-11'), 'November 2026');

    const normalizedManifest = normalizeIssueManifest({ issuePeriod: '2026-11', pages: [{ headline: 'Cover \u2014 Story' }] });
    assert.equal(normalizedManifest.pageCount % 4, 0);
    assert.equal(normalizedManifest.pages[0].headline, 'Cover - Story');

    // Pure schema must remain 100% client-bundle safe
    const schemaCode = stripCommentsAndRegexes(read('src/lib/magazine/magazineSchema.mjs'));
    assert.doesNotMatch(schemaCode, /\b(?:sharp|node:fs|node:crypto|child_process|supabaseServerClient)\b/);
});

// ── MAG LAW 2: Weekly Wire Tuesday Schedule Intact + Magazine Crons + Zero Net-New /api/cron Files ──
test('MAG LAW 2: Weekly Wire Tuesday 14:00 schedule remains intact alongside magazine-vault and monthly_publish in OpenClaw, with zero net-new pages/api/cron files', () => {
    const cronPy = read('scripts/openclaw-cron-dispatcher.py');
    assert.match(
        cronPy,
        /\(['"]\/api\/news\/digest\?days=7['"],\s*dict\(day_of_week=['"]tue['"],\s*hour=14,\s*minute=0\)\)/,
        'Weekly Wire Tuesday 14:00 schedule must remain 100% intact in scripts/openclaw-cron-dispatcher.py'
    );
    assert.match(cronPy, /\/api\/news\/magazine-vault/, 'OpenClaw dispatcher must schedule /api/news/magazine-vault');
    assert.match(
        cronPy,
        /\/api\/news\/magazine\?action=monthly_publish/,
        'OpenClaw dispatcher must schedule /api/news/magazine?action=monthly_publish'
    );
    assert.match(cronPy, /['"]\/api\/news\/magazine-vault['"]\s*:\s*300/);
    assert.match(cronPy, /['"]\/api\/news\/magazine\?action=monthly_publish['"]\s*:\s*300/);

    // Weekly Wire post-send hook banks curated items into magazine vault non-blockingly
    const digestSrc = read('pages/api/news/digest.js');
    assert.match(digestSrc, /harvestWeeklyWireEditionToVault/);

    // Zero net-new magazine files added to pages/api/cron/ (preserves Vercel cron ceiling)
    const cronFiles = fs.readdirSync(path.join(REPO, 'pages', 'api', 'cron'));
    const strayMagazineCrons = cronFiles.filter((f) => /magazine/i.test(f));
    assert.deepEqual(
        strayMagazineCrons,
        [],
        `Zero magazine cron files may be added to pages/api/cron/ (found: ${strayMagazineCrons.join(', ')})`
    );
});

// ── MAG LAW 3: 44-Page Card Player 1:1 Issue Manifest, Chips-Only & Zero Third-Party Hotlinks ──
test('MAG LAW 3: buildMagazineManifestFromVault compiles a complete 44-page Card Player 1:1 issue with Chips-only Kings Club results and zero external hotlinks', async () => {
    assert.equal(exists('src/lib/magazine/magazineCompiler.mjs'), true, 'src/lib/magazine/magazineCompiler.mjs must exist');
    const compilerMod = await import('../src/lib/magazine/magazineCompiler.mjs');
    assert.equal(typeof compilerMod.buildMagazineManifestFromVault, 'function');

    const vaultedWeb = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/sample-web.jpg';
    const vaultedMaster = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/sample-master.jpg';

    const sampleVaultItems = [
        {
            id: 'v-cover-1',
            issue_period: '2026-11',
            section: 'cover_candidate',
            headline: 'Inside The Championship Main Event Final Table Surge',
            subheadline: 'Deep-Stack Discipline, ICM Pressure, And Record Turnouts Across North America',
            body_text: 'Championship fields surged across major poker rooms this month.\n\nFinal table contenders leaned heavily on ICM discipline and blocker-driven river sizing.',
            vaulted_image_url: vaultedWeb,
            vaulted_master_url: vaultedMaster,
            editorial_score: 98,
            is_pinned: true,
            is_excluded: false,
            payload_json: { source_name: 'Smarter.Poker Editorial' },
        },
        {
            id: 'v-kings-1',
            issue_period: '2026-11',
            section: 'tournament_result',
            source_type: 'kings_club',
            headline: 'Kings Club Sunday Major Championship',
            vaulted_image_url: vaultedWeb,
            vaulted_master_url: vaultedMaster,
            editorial_score: 90,
            is_pinned: false,
            is_excluded: false,
            payload_json: {
                club_id: 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4',
                name: 'Kings Club Sunday Major Championship',
                prize_pool: 45000,
                buy_in_amount: 500,
                current_players: 90,
            },
        },
    ];

    const manifest = compilerMod.buildMagazineManifestFromVault({
        issueNumber: 1,
        volumeNumber: 1,
        issuePeriod: '2026-11',
        vaultItems: sampleVaultItems,
        overrides: {
            coverHeadline: 'Inside The Championship Main Event Surge',
            coverSubheadline: '44 Pages Of Strategy, POY Standings, Live Tour Radar & Kings Club Action',
            editorNote: 'Welcome to the November edition of Smarter.Poker Magazine.',
        },
    });

    assert.equal(manifest.pageCount, 44, 'Compiled issue must default to exact 44-page commercial signature');
    assert.equal(manifest.pageCount % 4, 0);
    assert.equal(manifest.pages.length, 44, 'Manifest must emit all 44 page sheets');

    manifest.pages.forEach((p, idx) => {
        assert.equal(p.pageNumber, idx + 1, `Page index ${idx} must carry sequential pageNumber ${idx + 1}`);
    });

    const presentKinds = new Set(manifest.pages.map((p) => p.kind));
    for (const requiredKind of MAGAZINE_PAGE_KINDS) {
        assert.equal(
            presentKinds.has(requiredKind),
            true,
            `44-page Card Player 1:1 manifest must include page kind "${requiredKind}"`
        );
    }

    assert.ok(Array.isArray(manifest.toc) && manifest.toc.length >= 8, 'Manifest must include populated Table Of Contents entries');
    const tocGroupsSeen = new Set(manifest.toc.map((t) => t.group || t.tocGroup).filter(Boolean));
    assert.ok(MAGAZINE_TOC_GROUPS.length === 3 && (tocGroupsSeen.size >= 2 || manifest.pages.some((p) => p.kind === 'toc_left')));

    // Kings Club Champions pages must format strictly in Chips (zero $ currency symbols)
    const kingsPages = manifest.pages.filter((p) => p.kind === 'kings_club_champions');
    assert.ok(kingsPages.length >= 1, 'Manifest must include kings_club_champions spread');
    assert.doesNotMatch(
        JSON.stringify(kingsPages),
        /\$\s*\d/,
        'Kings Club Champions pages must format prizes strictly in Chips with zero $ currency signs'
    );

    // Zero third-party hotlink image URLs anywhere in manifest
    const isAllowedFirstPartyOrVaultImage = (rawUrl) => {
        const u = String(rawUrl || '').trim();
        if (!u) return true;
        if (u.startsWith('/') || u.startsWith('data:image/svg+xml')) return true;
        try {
            const parsed = new URL(u);
            if (parsed.hostname === 'smarter.poker' || parsed.hostname.endsWith('.smarter.poker')) return true;
            if (parsed.hostname.endsWith('.supabase.co') && parsed.pathname.includes('/magazine-assets/')) return true;
            return false;
        } catch {
            return false;
        }
    };

    assert.equal(isAllowedFirstPartyOrVaultImage(manifest.coverImageUrl), true, `Disallowed cover image hotlink: ${manifest.coverImageUrl}`);
    for (const p of manifest.pages) {
        assert.equal(
            isAllowedFirstPartyOrVaultImage(p.imageUrl),
            true,
            `Page ${p.pageNumber} (${p.kind}) contains third-party imageUrl hotlink: ${p.imageUrl}`
        );
        assert.equal(
            isAllowedFirstPartyOrVaultImage(p.masterImageUrl),
            true,
            `Page ${p.pageNumber} (${p.kind}) contains third-party masterImageUrl hotlink: ${p.masterImageUrl}`
        );
    }
});

// ── MAG LAW 4: Image Vault SSRF Hardening, 300-DPI Print Master & supabaseServerClient ──
test('MAG LAW 4: imageVault.mjs enforces assertFetchableUrl SSRF blocks, generates 300-DPI print masters + web JPEGs into magazine-assets, and avoids raw @supabase/supabase-js', async () => {
    const vaultSrc = read('src/lib/magazine/imageVault.mjs');
    assert.match(vaultSrc, /assertFetchableUrl/, 'imageVault.mjs must enforce assertFetchableUrl');
    assert.match(vaultSrc, /redirect:\s*['"]manual['"]/, 'imageVault.mjs must validate redirects manually');
    assert.match(vaultSrc, /supabaseServerClient/, 'imageVault.mjs must import supabaseServerClient');
    assert.doesNotMatch(vaultSrc, /from\s+['"]@supabase\/supabase-js['"]/);

    const {
        IMAGE_VAULT_PRINT_DPI,
        buildVanguardEditorialPlateSvg,
        fetchSafeMagazineImageBuffer,
        vaultMagazineImage,
    } = await import('../src/lib/magazine/imageVault.mjs');

    assert.equal(IMAGE_VAULT_PRINT_DPI, 300);

    const plateSvg = buildVanguardEditorialPlateSvg(1200, 800, 'law-test');
    assert.doesNotMatch(plateSvg, /<\s*(?:text|tspan)\b/i, 'Fallback Vanguard plate SVG must contain zero <text>/<tspan>');
    assert.doesNotMatch(plateSvg, FORBIDDEN_PALETTE_HEX_RE);

    // SSRF guard must reject non-fetchable internal/metadata hosts before fetching
    await assert.rejects(
        () =>
            fetchSafeMagazineImageBuffer('http://169.254.169.254/latest/meta-data/', {
                assertFetchableFn: async () => false,
                fetchImpl: async () => {
                    throw new Error('fetchImpl must never be called when assertFetchableUrl blocks host');
                },
            }),
        /SSRF_BLOCKED_HOST/
    );

    // Generate a crisp 1400x900 synthetic source image via sharp and verify 300-DPI master + 1200x800 web upload
    const sourceJpeg = await sharp({
        create: {
            width: 1400,
            height: 900,
            channels: 3,
            background: { r: 11, g: 21, b: 32 },
        },
    })
        .jpeg({ quality: 92 })
        .toBuffer();

    const uploadedObjects = new Map();
    const mockStorageSb = {
        storage: {
            from(bucketName) {
                assert.equal(bucketName, 'magazine-assets');
                return {
                    async upload(objectPath, buf, opts) {
                        uploadedObjects.set(objectPath, { buf, opts });
                        return { data: { path: objectPath }, error: null };
                    },
                    getPublicUrl(objectPath) {
                        return {
                            data: {
                                publicUrl: `https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/${objectPath}`,
                            },
                        };
                    },
                };
            },
        },
    };

    const vaulted = await vaultMagazineImage(mockStorageSb, {
        sourceUrl: 'https://media.pokernews.example/championship.jpg',
        issuePeriod: '2026-11',
        assertFetchableFn: async () => true,
        fetchImpl: async () =>
            new Response(sourceJpeg, {
                status: 200,
                headers: { 'content-type': 'image/jpeg', 'content-length': String(sourceJpeg.byteLength) },
            }),
    });

    assert.equal(vaulted.usedFallback, false);
    assert.match(vaulted.vaultedMasterUrl, /\/magazine-assets\/2026-11\/[0-9a-f]{24}-master\.jpg$/);
    assert.match(vaulted.vaultedImageUrl, /\/magazine-assets\/2026-11\/[0-9a-f]{24}-web\.jpg$/);
    assert.equal(uploadedObjects.size, 2);

    const masterEntry = [...uploadedObjects.entries()].find(([k]) => k.endsWith('-master.jpg'))?.[1];
    const webEntry = [...uploadedObjects.entries()].find(([k]) => k.endsWith('-web.jpg'))?.[1];
    assert.ok(masterEntry && webEntry);

    const masterMeta = await sharp(masterEntry.buf).metadata();
    assert.equal(masterMeta.format, 'jpeg');
    assert.equal(masterMeta.density, 300, 'Print master JPEG must embed 300-DPI density metadata');

    const webMeta = await sharp(webEntry.buf).metadata();
    assert.equal(webMeta.width, 1200);
    assert.equal(webMeta.height, 800);
});

// ── MAG LAW 5: Reader, Flipbook, Print Proof & Cardroom Portal Purity, Fallbacks & Print CSS ──
test('MAG LAW 5: /hub/magazine surfaces keep client bundles pure, guard all <img> tags with onError fallbacks, and enforce 8.375in 10.875in @page print CSS', () => {
    const clientSurfaceFiles = [
        'src/components/magazine/MagazineSpreadRenderer.js',
        'pages/hub/magazine/index.js',
        'pages/hub/magazine/[issue].js',
        'pages/hub/magazine/print/[issue].js',
        'pages/hub/magazine/poker-rooms.js',
    ];

    for (const rel of clientSurfaceFiles) {
        assert.equal(exists(rel), true, `Required magazine client surface missing: ${rel}`);
        const src = read(rel);

        // Top-level imports (before getServerSideProps / export default) must NEVER pull Node/sharp modules into Webpack client bundles
        const ssrIdx = src.indexOf('export async function getServerSideProps');
        const topAndClientSrc = ssrIdx >= 0 ? src.slice(0, ssrIdx) : src;
        assert.doesNotMatch(
            topAndClientSrc,
            /^\s*import\s+[\s\S]*?from\s+['"](?:sharp|fs|node:fs|child_process|node:child_process|dns|node:dns|[^'"]*(?:imageVault|vaultHarvester|magazineCompiler|supabaseServerClient))['"]/m,
            `${rel} must never top-level import Node/sharp/server-only modules into client bundles`
        );

        // Every <img must include loop-guarded onError fallback
        const imgMatches = src.match(/<img\b[\s\S]*?>/g) || [];
        for (const imgTag of imgMatches) {
            assert.match(imgTag, /\bonError=/, `${rel} contains an <img> without an onError fallback handler`);
        }
        if (imgMatches.length > 0) {
            assert.match(
                src,
                /dataset\.fb|handleMagazineImageError/,
                `${rel} must guard <img> onError swaps with dataset.fb or shared handleMagazineImageError`
            );
        }
    }
    assert.match(
        read('src/components/magazine/MagazineSpreadRenderer.js'),
        /dataset\.fb/,
        'MagazineSpreadRenderer.js must guard <img> fallback swaps with dataset.fb'
    );

    const printSrc = read('pages/hub/magazine/print/[issue].js');
    assert.match(printSrc, /@page/);
    assert.match(printSrc, /8\.375in\s+10\.875in/);
    assert.match(printSrc, /@media\s+print/);
    assert.match(printSrc, /noindex,\s*nofollow/);

    const issueSrc = read('pages/hub/magazine/[issue].js');
    assert.match(issueSrc, /ArrowLeft/);
    assert.match(issueSrc, /ArrowRight/);
    assert.match(issueSrc, /preview/);
});

// ── MAG LAW 6: Geo-Blocks, Auth Middleware, Sitemaps, RSS 2.0 & Navigation Wiring ──
test('MAG LAW 6: geo-blocks.json, middleware.ts, sitemapBuilders.mjs, sitemap-core.xml.js, RSS 2.0, and navigation allowlist and index /hub/magazine cleanly', async () => {
    const geoJson = JSON.parse(read('config/geo-blocks.json'));
    const allowPaths = new Set(geoJson.allow_paths || []);
    const mwSrc = read('middleware.ts');

    for (const requiredPath of ['/hub/magazine', '/hub/magazine/', '/api/news/magazine', '/api/news/magazine-rooms']) {
        assert.equal(allowPaths.has(requiredPath), true, `config/geo-blocks.json allow_paths missing "${requiredPath}"`);
        assert.equal(
            mwSrc.includes(`'${requiredPath}'`) || mwSrc.includes(`"${requiredPath}"`),
            true,
            `middleware.ts AUTH_ALWAYS_ALLOW missing "${requiredPath}"`
        );
    }

    const sitemapBuildersSrc = read('src/lib/seo/sitemapBuilders.mjs');
    assert.doesNotMatch(
        sitemapBuildersSrc,
        /sharp|node:|imageVault|magazineCompiler/,
        'sitemapBuilders.mjs must remain pure ESM without Node/sharp imports'
    );

    const sitemapMod = await import('../src/lib/seo/sitemapBuilders.mjs');
    const staticPaths = new Set((sitemapMod.STATIC_PAGES || []).map((p) => p.path));
    assert.equal(staticPaths.has('/hub/magazine'), true, 'STATIC_PAGES must include /hub/magazine');
    assert.equal(staticPaths.has('/hub/magazine/poker-rooms'), true, 'STATIC_PAGES must include /hub/magazine/poker-rooms');
    assert.equal(typeof sitemapMod.buildMagazineIssueUrls, 'function', 'sitemapBuilders.mjs must export buildMagazineIssueUrls');

    const builtIssueUrls = await sitemapMod.buildMagazineIssueUrls([
        { slug: '2026-11', issue_period: '2026-11', status: 'published', published_at: '2026-11-26T15:00:00Z' },
    ]);
    assert.ok(
        builtIssueUrls.some((u) => u.path === '/hub/magazine/2026-11'),
        'buildMagazineIssueUrls must map published issues to /hub/magazine/<slug>'
    );

    const coreSitemapSrc = read('pages/sitemap-core.xml.js');
    assert.match(coreSitemapSrc, /buildMagazineIssueUrls/, 'pages/sitemap-core.xml.js must wire buildMagazineIssueUrls');

    assert.equal(exists('pages/hub/magazine/rss.xml.js'), true, 'pages/hub/magazine/rss.xml.js must exist');
    assert.match(read('pages/hub/magazine/rss.xml.js'), /application\/rss\+xml/);
    assert.doesNotMatch(
        read('pages/hub/magazine/rss.xml.js'),
        /^\s*export\s*\{/m,
        'Next.js page files must not mix getServerSideProps with named re-exports that SWC strips'
    );
    assert.match(read('src/config/hamburgerMenus.js'), /\/hub\/magazine/);
    assert.match(read('pages/hub/wire/index.js'), /\/hub\/magazine/);
});

// ── MAG LAW 7: Vanguard Palette, Zero Em/En Dashes & Chips-Only Across All Magazine Files ──
test('MAG LAW 7: Vanguard palette (zero yellow/purple hexes), zero em/en dashes, and Cover-Reveal email standards hold across all magazine modules and pages', async () => {
    const collectFiles = (relDir) => {
        const fullDir = path.join(REPO, relDir);
        if (!fs.existsSync(fullDir)) return [];
        const out = [];
        for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
            const childRel = path.posix.join(relDir, entry.name);
            if (entry.isDirectory()) out.push(...collectFiles(childRel));
            else if (/\.(?:m?js|jsx|ts|tsx|css)$/.test(entry.name)) out.push(childRel);
        }
        return out;
    };

    const magazineFiles = [
        ...collectFiles('src/lib/magazine'),
        ...collectFiles('src/components/magazine'),
        ...collectFiles('pages/hub/magazine'),
        'pages/api/news/magazine.js',
        'pages/api/news/magazine-vault.js',
        'pages/api/news/magazine-rooms.js',
        'pages/api/news/operations.js',
        'pages/admin/newsletter.js',
    ].filter((rel) => exists(rel));

    assert.ok(magazineFiles.length >= 12, `Expected full magazine file set, found ${magazineFiles.length}`);

    for (const rel of magazineFiles) {
        const raw = read(rel);
        const stripped = stripCommentsAndRegexes(raw);
        assert.doesNotMatch(
            stripped,
            FORBIDDEN_PALETTE_HEX_RE,
            `${rel} contains forbidden yellow or purple hex color outside Vanguard palette`
        );
        assert.doesNotMatch(
            stripped,
            /[\u2014\u2013]|&mdash;|&ndash;/i,
            `${rel} contains banned em/en dash in non-comment, non-regex source`
        );
    }

    // Verify Cover-Reveal Email Renderer output
    if (exists('src/lib/magazine/magazineEmailRenderer.mjs')) {
        const { renderMonthlyMagazineCoverEmail } = await import('../src/lib/magazine/magazineEmailRenderer.mjs');
        const rendered = renderMonthlyMagazineCoverEmail({
            issue: {
                issue_number: 1,
                volume_number: 1,
                issue_period: '2026-11',
                slug: '2026-11',
                title: 'Smarter.Poker Magazine \u2014 November 2026',
                cover_headline: 'Championship Strategy \u2013 Inside The Solver Lab',
                cover_subheadline: '44 Pages Of Poker Strategy, POY Standings & Tour Schedules',
                cover_image_url: 'https://smarter.poker/api/news/email-image?fallback=1&w=960&h=540',
            },
            manifest: {
                issueNumber: 1,
                volumeNumber: 1,
                issuePeriod: '2026-11',
                toc: [
                    { title: 'Deep-Stack River Bluffs', pageNumber: 12 },
                    { title: 'Player Of The Year Top 25', pageNumber: 20 },
                ],
            },
            unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok1.sig1',
            preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=tok1.sig1',
            siteUrl: 'https://smarter.poker',
        });
        assert.doesNotMatch(rendered.html, /[\u2014\u2013]|&mdash;|&ndash;/i);
        assert.doesNotMatch(rendered.text, /[\u2014\u2013]/);
        assert.doesNotMatch(rendered.html, FORBIDDEN_PALETTE_HEX_RE);
        assert.match(rendered.html, /utm_source=monthly_magazine/);
        assert.match(rendered.html, /Oak Lawn,\s*IL\s*60453/);
        assert.match(rendered.html, /Unsubscribe/);
    }
});

// ── MAG LAW 8: Cardroom Endpoint Security, Non-Blocking Operations Summary & Admin Studio Wiring ──
test('MAG LAW 8: magazine-rooms.js blocks synthetic domains + gates GET/PATCH behind admin auth, operations.js serves resilient magazineSummary, and /admin/newsletter wires Monthly Magazine Studio', () => {
    assert.equal(exists('pages/api/news/magazine-rooms.js'), true, 'pages/api/news/magazine-rooms.js must exist');
    assert.equal(exists('pages/api/news/magazine.js'), true, 'pages/api/news/magazine.js must exist');
    assert.equal(exists('pages/api/news/magazine-vault.js'), true, 'pages/api/news/magazine-vault.js must exist');

    for (const apiRel of ['pages/api/news/magazine.js', 'pages/api/news/magazine-vault.js', 'pages/api/news/magazine-rooms.js']) {
        const apiSrc = read(apiRel);
        assert.match(apiSrc, /supabaseServerClient/, `${apiRel} must use supabaseServerClient`);
        assert.doesNotMatch(apiSrc, /from\s+['"]@supabase\/supabase-js['"]/, `${apiRel} must never import raw @supabase/supabase-js`);
    }

    const roomsSrc = read('pages/api/news/magazine-rooms.js');
    assert.match(roomsSrc, /applyRateLimit/, 'magazine-rooms.js must rate-limit requests');
    assert.match(roomsSrc, /example\.com/i, 'magazine-rooms.js must block synthetic @example.com emails');
    assert.match(roomsSrc, /horse\.ai/i, 'magazine-rooms.js must block synthetic @horse.ai emails');
    assert.match(roomsSrc, /getServerUserWithFallback/, 'magazine-rooms.js must verify admin JWT on GET/PATCH');
    assert.match(roomsSrc, /\['admin',\s*'superadmin',\s*'god'\]/, 'magazine-rooms.js must enforce admin roles on GET/PATCH');

    // operations.js non-blocking magazineSummary contract (omitting giant manifest_json)
    const opsSrc = read('pages/api/news/operations.js');
    assert.match(opsSrc, /currentIssuePeriod/, 'operations.js must compute currentPeriod via currentIssuePeriod()');
    assert.match(opsSrc, /magazineSummary/, 'operations.js GET payload must include magazineSummary');
    assert.match(opsSrc, /from\('magazine_issues'\)/);
    assert.match(opsSrc, /from\('magazine_vault_items'\)/);
    assert.match(opsSrc, /from\('magazine_room_subscriptions'\)/);
    assert.match(opsSrc, /totalRequestedCopies/);
    assert.doesNotMatch(
        opsSrc,
        /manifest_json/,
        'operations.js summary query must omit giant manifest_json blobs to keep admin JSON fast'
    );

    // Admin Monthly Magazine Studio wiring in pages/admin/newsletter.js
    const adminSrc = read('pages/admin/newsletter.js');
    assert.doesNotMatch(
        adminSrc,
        /fetch\(\s*[`'"]\/api\/admin\//,
        'pages/admin/newsletter.js must never call /api/admin/* (blocked by MFA cookie middleware)'
    );
    assert.match(adminSrc, /Smarter\.Poker Monthly Magazine Studio/);
    assert.match(adminSrc, /\/api\/news\/magazine/);
    assert.match(adminSrc, /\/api\/news\/magazine-rooms/);
    assert.match(adminSrc, /\/api\/news\/operations/);
    assert.match(adminSrc, /Harvest Monthly Vault Now/);
    assert.match(adminSrc, /Compile 44-Page Issue Preview/);
    assert.match(adminSrc, /Publish Issue Online/);
    assert.match(adminSrc, /Publish &amp; Email Subscribers|Publish & Email Subscribers/);
    assert.match(adminSrc, /Open Online Flipbook/);
    assert.match(adminSrc, /Open 8\.375x10\.875 Print Proof/);
    assert.match(adminSrc, /Send Magazine Test Email/);
    assert.match(adminSrc, /title="Monthly Magazine Cover-Reveal Email Preview"/);
    assert.match(adminSrc, /Poker Room Print Distribution Roster/);

    const emailInputs = adminSrc.match(/type="email"/g) || [];
    assert.ok(
        emailInputs.length >= 4,
        `pages/admin/newsletter.js must render inline type="email" test inputs across Promo, Wire, Magazine, and Lifecycle panels (found ${emailInputs.length})`
    );
});

// ── MAG LAW 9: Notification Bell Routing & Push Suppression Parity ────────────
test('MAG LAW 9: monthly_magazine_published suppresses duplicate push and resolves cleanly in notificationRoute.js', async () => {
    const { resolveNotificationRoute } = await import('../src/lib/notificationRoute.js');
    const magApiSrc = read('pages/api/news/magazine.js');
    assert.match(magApiSrc, /monthly_magazine_published/);
    assert.match(magApiSrc, /_push:\s*'none'/);

    assert.equal(
        resolveNotificationRoute({
            type: 'monthly_magazine_published',
            data: { slug: '2026-11' },
        }),
        '/hub/magazine/2026-11'
    );
    assert.equal(
        resolveNotificationRoute({
            type: 'monthly_magazine_published',
            data: {},
        }),
        '/hub/magazine'
    );
});
