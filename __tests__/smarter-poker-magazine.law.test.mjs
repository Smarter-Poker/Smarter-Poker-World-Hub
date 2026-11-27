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
 *   MAG LAW 9: `monthly_magazine_published` suppresses duplicate push (`_push: 'none'`) and resolves in
 *              `notificationRoute.js`.
 *   MAG LAW 10: `@vercel/nft` (`nodeFileTrace`) across all 25+ `pages/api/news/*.js` routes traces `0`
 *               `pages/hub/**` files, and `magazine-rooms.js` traces `0` sibling APIs and `< 30` files.
 *   MAG LAW 11: `buildMagazineQrMatrixSvg` uses real ISO/IEC 18004 Reed-Solomon matrices matching
 *               `QRCodeCore.create` with 3 finder corners and pure `<rect>` SVG.
 *   MAG LAW 12: `vaultHarvester.mjs` enforces `redactPublicVenue` & `isUnverifiedSelfRegistration`
 *               (`AGENTS.md:87`), preserves `is_pinned`/`is_excluded`/`vaulted_storage_path`/Wire metadata,
 *               and `imageVault.mjs` enforces `limitInputPixels: 36_000_000` + rejects `image/svg+xml`.
 *   MAG LAW 13: `magazineCompiler.mjs` & `MagazineSpreadRenderer.js` guarantee zero duplicate paragraphs,
 *               deduplicated venues/updates, real non-zero Kings Club Chips, Rank #25 POY on Page 21,
 *               Setup vs Verdict strategy split, AI Coach/Final Table layout routing, Quiz Q3/Q4 numbering,
 *               and Page 42 (`/hub/wire`) vs Page 43 (`/hub/magazine/poker-rooms`) separation.
 *   MAG LAW 14: Handler-level HMAC integration test on `pages/api/news/magazine.js` (`compile`, `harvest`,
 *               `test_email`, and online-only `publish` succeed past auth while `sendEmail: true` and
 *               `pin_item` return `403`, malformed `issuePeriod` returns `400`, atomic `email_campaign_id`
 *               CAS holds, and `magazine-rooms.js` writes `shipping_address_json` + `table_count: null`).
 *   MAG LAW 15: Print isolation (`_app.js` + `print/[issue].js`), `poker-rooms.js` `getServerSideProps`,
 *               `[issue].js` `?page=` & viewport resize page retention, and `<= 60`-char single-brand
 *               titles + dual `sitemap-core.xml.js` & `sitemap.xml.js` coverage.
 *   MAG LAW 16: Cross-ecosystem `classifyClickedEmailSection` (`'magazine'` & `'cardrooms'`),
 *               `parseWireEditionSubjectNumber` `[PROMO MAGAZINE]` rejection, `NewsletterCaptureBar`
 *               `source` prop + `'capture:magazine'` + duplicate floating bar suppression, `operations.js`
 *               `monthly_magazine` + `?issuePeriod=` + non-phantom `shipping_address_json`, and
 *               `world-footer-navigation.json` `'news'` World Menu mapping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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

// ── MAG LAW 10: @vercel/nft Serverless Trace Isolation & Bundle Slimming ──────
test('MAG LAW 10: @vercel/nft traces zero pages/hub/** files across all 25+ pages/api/news/*.js routes, and magazine-rooms.js traces zero sibling APIs and < 30 files without sharp/resend/twilio', async () => {
    const apiNewsDir = path.join(REPO, 'pages', 'api', 'news');
    const apiNewsRoutes = fs
        .readdirSync(apiNewsDir)
        .filter((f) => f.endsWith('.js'))
        .sort()
        .map((f) => path.posix.join('pages/api/news', f));

    assert.ok(apiNewsRoutes.length >= 25, `Expected >= 25 pages/api/news/*.js routes, found ${apiNewsRoutes.length}`);

    const allNewsTrace = await nextFileTracer.nodeFileTrace(apiNewsRoutes, {
        base: REPO,
        processCwd: REPO,
    });
    const hubLeaks = [...allNewsTrace.fileList].filter((f) => f.startsWith('pages/hub/'));
    assert.deepEqual(
        hubLeaks,
        [],
        `Zero pages/api/news/*.js routes may trace UI pages under pages/hub/** (leaked: ${hubLeaks.join(', ')})`
    );

    const roomsEntry = 'pages/api/news/magazine-rooms.js';
    const roomsTrace = await nextFileTracer.nodeFileTrace([roomsEntry], {
        base: REPO,
        processCwd: REPO,
    });
    const tracedFiles = [...roomsTrace.fileList];
    const siblingApis = tracedFiles.filter((f) => f.startsWith('pages/api/') && f !== roomsEntry);
    assert.deepEqual(
        siblingApis,
        [],
        `magazine-rooms.js must trace zero sibling pages/api/* files (found: ${siblingApis.join(', ')})`
    );
    assert.ok(
        tracedFiles.length < 30,
        `magazine-rooms.js must trace < 30 total files after bundle slimming (found ${tracedFiles.length}: ${tracedFiles.join(', ')})`
    );
    const heavyDeps = tracedFiles.filter((f) => /(?:^|\/)node_modules\/(?:sharp|@img\/sharp|resend|twilio)\b/.test(f));
    assert.deepEqual(
        heavyDeps,
        [],
        `magazine-rooms.js must trace zero sharp/resend/twilio packages (found: ${heavyDeps.join(', ')})`
    );
});

// ── MAG LAW 11: Real Scannable ISO/IEC 18004 Reed-Solomon QR Matrix Parity ────
test('MAG LAW 11: buildMagazineQrMatrixSvg emits genuine ISO/IEC 18004 Reed-Solomon QR matrices matching QRCodeCore.create with 3 finder corners and pure <rect> SVG', async () => {
    const qrMod = await import('qrcode/lib/core/qrcode.js');
    const QRCodeCore = qrMod.default || qrMod;

    const targetUrl = 'https://smarter.poker/hub/magazine/2026-11';
    const expectedQr = QRCodeCore.create(targetUrl, { errorCorrectionLevel: 'M' });
    const modCount = expectedQr.modules.size;
    assert.ok(modCount >= 21 && modCount <= 177, `Valid ISO 18004 QR version module count expected, got ${modCount}`);

    const svg = buildMagazineQrMatrixSvg(targetUrl, 120);
    assert.match(svg, /^<svg\b[\s\S]*<\/svg>$/);
    assert.doesNotMatch(svg, /<\s*(?:text|tspan)\b/i, 'QR SVG must remain 100% pure vector <rect> without <text>/<tspan>');
    assert.match(svg, new RegExp(`data-qr-modules="${modCount}"`), 'QR SVG must declare exact ISO 18004 module count');
    assert.match(
        svg,
        new RegExp(`viewBox="0 0 ${(modCount + 8) * 4} ${(modCount + 8) * 4}"`),
        'QR SVG must include 4-module quiet zone around exact QR matrix'
    );

    // Count dark modules in QRCodeCore matrix and verify exact <rect> count (+1 background rect)
    let expectedDarkCount = 0;
    for (let r = 0; r < modCount; r += 1) {
        for (let c = 0; c < modCount; c += 1) {
            if (expectedQr.modules.get(r, c)) expectedDarkCount += 1;
        }
    }
    const rectTags = svg.match(/<rect\b[^>]*>/g) || [];
    assert.equal(
        rectTags.length,
        expectedDarkCount + 1,
        `QR SVG must emit 1 quiet-zone background <rect> + ${expectedDarkCount} exact Reed-Solomon dark module <rect>s`
    );

    // Verify all 3 ISO 18004 7x7 finder pattern outer top-left anchors at quiet-zone +4, cell=4
    for (const [fx, fy] of [
        [16, 16],
        [(4 + modCount - 7) * 4, 16],
        [16, (4 + modCount - 7) * 4],
    ]) {
        assert.match(
            svg,
            new RegExp(`<rect[^>]*\\bx="${fx}"[^>]*\\by="${fy}"`),
            `Missing ISO 18004 finder corner anchor at (${fx}, ${fy})`
        );
    }

    // Verify default signature page count & strict 01..12 month period guards
    assert.equal(normalizeSignaturePageCount(null), 44);
    assert.equal(normalizeSignaturePageCount(0), 44);
    assert.equal(normalizeSignaturePageCount(''), 44);
    assert.equal(normalizeSignaturePageCount(false), 44);
    assert.equal(isValidIssuePeriod('2026-00'), false);
    assert.equal(isValidIssuePeriod('2026-13'), false);
    assert.equal(isValidIssuePeriod('2026-11'), true);
});

// ── MAG LAW 12: Public Venue Privacy (AGENTS.md:87), Vault Flag Preservation & Sharp Bomb Guards ──
test('MAG LAW 12: vaultHarvester.mjs enforces redactPublicVenue & isUnverifiedSelfRegistration, preserves is_pinned/is_excluded/vaulted_storage_path/wire metadata, and imageVault.mjs enforces 36MP pixel limit + blocks SVG', async () => {
    const harvesterSrc = read('src/lib/magazine/vaultHarvester.mjs');
    assert.match(harvesterSrc, /redactPublicVenue/);
    assert.match(harvesterSrc, /isUnverifiedSelfRegistration/);
    assert.match(harvesterSrc, /publicVenuePrivacy\.mjs/);
    assert.match(harvesterSrc, /3109/);
    assert.match(harvesterSrc, /canonical_venue_id/);
    assert.match(harvesterSrc, /vaulted_storage_path/);
    assert.match(harvesterSrc, /wireEditionNumber/);

    const imageVaultSrc = read('src/lib/magazine/imageVault.mjs');
    assert.match(imageVaultSrc, /limitInputPixels/);
    assert.match(imageVaultSrc, /36_?000_?000/);

    const {
        IMAGE_VAULT_LIMIT_INPUT_PIXELS,
        fetchSafeMagazineImageBuffer,
        isAllowedUpstreamImageContentType,
    } = await import('../src/lib/magazine/imageVault.mjs');
    assert.equal(IMAGE_VAULT_LIMIT_INPUT_PIXELS, 36_000_000);
    assert.equal(isAllowedUpstreamImageContentType('image/svg+xml'), false);
    assert.equal(isAllowedUpstreamImageContentType('image/jpeg'), true);

    const svgHeaderResult = await fetchSafeMagazineImageBuffer('https://cdn.example.com/malicious.svg', {
        assertFetchableFn: async () => true,
        fetchImpl: async () =>
            new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
                status: 200,
                headers: { 'content-type': 'image/svg+xml' },
            }),
    });
    assert.equal(svgHeaderResult, null, 'image/svg+xml MIME must be rejected before sharp');

    const disguisedSvgResult = await fetchSafeMagazineImageBuffer('https://cdn.example.com/disguised.jpg', {
        assertFetchableFn: async () => true,
        fetchImpl: async () =>
            new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
                status: 200,
                headers: { 'content-type': 'image/jpeg' },
            }),
    });
    assert.equal(disguisedSvgResult, null, 'Disguised XML/SVG payload bytes must be rejected before sharp');

    // Functional harvest check proving venue redaction + self_registration exclusion + flag/metadata preservation
    const { harvestMonthlyMagazineVault } = await import('../src/lib/magazine/vaultHarvester.mjs');
    const upsertedBatches = [];
    const mockHarvestSb = {
        from(table) {
            const chain = {
                select: () => chain,
                eq: () => chain,
                neq: () => chain,
                in: () => chain,
                not: () => chain,
                or: () => chain,
                gte: () => chain,
                lte: () => chain,
                gt: () => chain,
                order: () => chain,
                limit: async () => {
                    if (table === 'magazine_vault_items') {
                        return {
                            data: [
                                {
                                    issue_period: '2026-11',
                                    section: 'featured_venue',
                                    source_type: 'poker_venue',
                                    source_id: '101',
                                    is_pinned: true,
                                    is_excluded: false,
                                    editorial_score: 97,
                                    vaulted_image_url: 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/existing-web.jpg',
                                    vaulted_master_url: 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/existing-master.jpg',
                                    vaulted_storage_path: '2026-11/existing-master.jpg',
                                    metadata_json: { wireEditionNumber: 4, campaignId: 'camp-4' },
                                },
                            ],
                            error: null,
                        };
                    }
                    if (table === 'poker_venues') {
                        return {
                            data: [
                                // Verified cardroom -> kept and redacted
                                {
                                    id: 101,
                                    name: 'Bellagio Poker Room',
                                    city: 'Las Vegas',
                                    state: 'NV',
                                    poker_tables: 37,
                                    trust_score: 95,
                                    is_active: true,
                                    venue_type: 'casino',
                                    source: 'hendon_mob',
                                    data_quality: 'scraped_verified',
                                    canonical_venue_id: null,
                                },
                                // Unverified self_registration -> MUST BE EXCLUDED per AGENTS.md:87
                                {
                                    id: 202,
                                    name: 'Unconfirmed Basement Room',
                                    city: 'Reno',
                                    state: 'NV',
                                    poker_tables: 10,
                                    trust_score: 80,
                                    is_active: true,
                                    venue_type: 'card_room',
                                    source: 'self_registration',
                                    data_quality: 'user_submitted',
                                    canonical_venue_id: null,
                                },
                                // Suppressed internal ID 3109 -> MUST BE EXCLUDED
                                {
                                    id: 3109,
                                    name: 'Internal Placeholder Venue',
                                    city: 'Austin',
                                    state: 'TX',
                                    poker_tables: 20,
                                    trust_score: 99,
                                    is_active: true,
                                    venue_type: 'card_room',
                                    source: 'manual_research',
                                    data_quality: 'manual_research',
                                    canonical_venue_id: null,
                                },
                            ],
                            error: null,
                        };
                    }
                    return { data: [], error: null };
                },
                upsert(rows) {
                    const arr = Array.isArray(rows) ? rows : [rows];
                    upsertedBatches.push(...arr);
                    return {
                        select: () => ({
                            limit: async () => ({ data: arr, error: null }),
                            then: (res, rej) => Promise.resolve({ data: arr, error: null }).then(res, rej),
                        }),
                        then: (res, rej) => Promise.resolve({ data: arr, error: null }).then(res, rej),
                    };
                },
            };
            return chain;
        },
        storage: {
            from() {
                return {
                    upload: async (p) => ({ data: { path: p }, error: null }),
                    getPublicUrl: (p) => ({
                        data: { publicUrl: `https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/${p}` },
                    }),
                };
            },
        },
    };

    await harvestMonthlyMagazineVault(mockHarvestSb, {
        issuePeriod: '2026-11',
        externalBudgetMs: 0,
    });

    const venueUpserts = upsertedBatches.filter((r) => r.section === 'featured_venue');
    assert.equal(venueUpserts.some((r) => String(r.source_id) === '202'), false, 'Unverified self_registration venue must never enter vault');
    assert.equal(venueUpserts.some((r) => String(r.source_id) === '3109'), false, 'Suppressed venue 3109 must never enter vault');

    const bellagioRow = venueUpserts.find((r) => String(r.source_id) === '101');
    assert.ok(bellagioRow, 'Verified Bellagio cardroom must be harvested');
    assert.equal(bellagioRow.is_pinned, true, 'Existing is_pinned flag must survive re-harvest');
    assert.equal(bellagioRow.vaulted_storage_path, '2026-11/existing-master.jpg', 'Existing vaulted_storage_path must survive re-harvest');
    assert.equal(bellagioRow.metadata_json?.wireEditionNumber, 4, 'Weekly Wire metadata must survive re-harvest');
    assert.ok(Number(bellagioRow.editorial_score) >= 97, 'Higher Weekly Wire editorial_score must survive re-harvest');
});

// ── MAG LAW 13: 44-Page Producer/Consumer Parity Across Compiler & Spread Renderer ──
test('MAG LAW 13: magazineCompiler.mjs and MagazineSpreadRenderer.js guarantee zero duplicate paragraphs, deduplicated venues, real Kings Club Chips, Rank #25 POY, Setup/Verdict strategy split, AI Coach/Final Table layouts, Quiz Q3/Q4 numbering, and Page 42 vs 43 CTAs', async () => {
    const { buildMagazineManifestFromVault } = await import('../src/lib/magazine/magazineCompiler.mjs');
    const vaultedWeb = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/law13-web.jpg';
    const vaultedMaster = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/law13-master.jpg';

    const poyItems = Array.from({ length: 25 }, (_, i) => ({
        id: `v-poy-${i + 1}`,
        issue_period: '2026-11',
        section: 'poy_standing',
        source_type: 'poy',
        source_id: String(i + 1),
        headline: `Contender Player ${i + 1}`,
        editorial_score: 100 - i,
        payload_json: {
            rank: i + 1,
            player_name: `Contender Player ${i + 1}`,
            points: 5000 - i * 50,
            year: 2026,
        },
    }));

    const manifest = buildMagazineManifestFromVault({
        issueNumber: 1,
        volumeNumber: 1,
        issuePeriod: '2026-11',
        vaultItems: [
            {
                id: 'v-cover-lead',
                issue_period: '2026-11',
                section: 'cover_candidate',
                headline: 'Record Autumn Fields Reshape Championship ICM Dynamics',
                subheadline: 'Inside Final Table Strategy Across Major Stops',
                body_text: 'Lead paragraph one examining championship stack distributions.\n\nLead paragraph two analyzing short-stack pay-jump discipline.',
                vaulted_image_url: vaultedWeb,
                vaulted_master_url: vaultedMaster,
                editorial_score: 99,
                is_pinned: true,
            },
            {
                id: 'v-sec-lead',
                issue_period: '2026-11',
                section: 'feature_story',
                headline: 'Mid-Major Regional Tours Post Historic Guarantees',
                body_text: 'Secondary paragraph alpha on regional tour growth.\n\nSecondary paragraph beta on satellite structures.',
                vaulted_image_url: vaultedWeb,
                vaulted_master_url: vaultedMaster,
                editorial_score: 91,
            },
            // Intentional duplicate Bellagio venue to prove deduplication against fallback & vault duplicates
            {
                id: 'v-venue-dup-1',
                issue_period: '2026-11',
                section: 'featured_venue',
                headline: 'Bellagio Poker Room',
                subheadline: 'Las Vegas, NV - 37 Poker Tables',
                editorial_score: 92,
                payload_json: { name: 'Bellagio Poker Room', city: 'Las Vegas', state: 'NV', poker_tables: 37 },
            },
            {
                id: 'v-venue-dup-2',
                issue_period: '2026-11',
                section: 'featured_venue',
                headline: 'Bellagio Poker Room',
                subheadline: 'Las Vegas, NV - 37 Poker Tables',
                editorial_score: 88,
                payload_json: { name: 'Bellagio Poker Room', city: 'Las Vegas', state: 'NV', poker_tables: 37 },
            },
            {
                id: 'v-kings-champ',
                issue_period: '2026-11',
                section: 'tournament_result',
                source_type: 'kings_club',
                headline: 'Kings Club Championship 45K',
                editorial_score: 95,
                payload_json: {
                    name: 'Kings Club Championship 45K',
                    game_type: 'NLH',
                    buy_in_amount: 500,
                    prize_pool: 45000,
                    current_players: 90,
                },
            },
            ...poyItems,
        ],
    });

    const pageByNum = (n) => manifest.pages.find((p) => p.pageNumber === n);

    // 1. Zero duplicate paragraphs on Cover Story (pp. 12-15) and Secondary Feature (pp. 16-17)
    const coverParas = [12, 13, 14, 15].flatMap((n) => pageByNum(n)?.paragraphs || []);
    assert.equal(coverParas.length, 8, 'Cover story pp. 12-15 must carry 8 total paragraphs');
    assert.equal(new Set(coverParas).size, 8, 'Cover story pp. 12-15 must contain zero duplicate paragraphs');

    const secondaryParas = [16, 17].flatMap((n) => pageByNum(n)?.paragraphs || []);
    assert.equal(secondaryParas.length, 4, 'Secondary feature pp. 16-17 must carry 4 total paragraphs');
    assert.equal(new Set(secondaryParas).size, 4, 'Secondary feature pp. 16-17 must contain zero duplicate paragraphs');

    // 2. Deduplicated Poker Rooms Directory (pp. 40-41) and Platform Updates (pp. 18-19)
    const dirNames = [40, 41]
        .flatMap((n) => pageByNum(n)?.items || [])
        .map((v) => String(v.headline || v.name || '').trim().toLowerCase())
        .filter(Boolean);
    assert.equal(new Set(dirNames).size, dirNames.length, `Duplicate venues prohibited on pp. 40-41: ${dirNames.join(', ')}`);

    const platTitles = [18, 19]
        .flatMap((n) => pageByNum(n)?.items || [])
        .map((u) => String(u.headline || u.title || '').trim().toLowerCase())
        .filter(Boolean);
    assert.equal(new Set(platTitles).size, platTitles.length, `Duplicate platform updates prohibited on pp. 18-19: ${platTitles.join(', ')}`);

    // 3. Kings Club Champions non-zero Chips & POY Page 21 Rank #25 (13 rows)
    const kingsRows = [24, 25].flatMap((n) => pageByNum(n)?.standings || []);
    assert.ok(kingsRows.length >= 2);
    for (const row of kingsRows) {
        const numericChips = Number(row.prizePoolChips ?? row.prizeChips ?? 0);
        assert.ok(numericChips > 0, `Kings Club row "${row.name}" must carry non-zero prizeChips, got ${numericChips}`);
    }

    const page21Rows = pageByNum(21)?.standings || [];
    assert.equal(page21Rows.length, 13, 'Page 21 POY Standings (Ranks 13-25) must contain all 13 rows');
    assert.equal(page21Rows[12]?.rank, 25, 'Page 21 POY Standings must include Rank #25');

    // 4. Strategy Setup vs Verdict split (pp. 26-31)
    for (const [setupPage, verdictPage] of [[26, 27], [28, 29], [30, 31]]) {
        assert.equal(pageByNum(setupPage)?.meta?.spreadHalf, 'setup', `Page ${setupPage} must be tagged spreadHalf='setup'`);
        assert.equal(pageByNum(verdictPage)?.meta?.spreadHalf, 'verdict', `Page ${verdictPage} must be tagged spreadHalf='verdict'`);
    }

    // 5. Quiz Q3 & Q4 numbering on Page 35 + Page 42 (/hub/wire) vs Page 43 (/hub/magazine/poker-rooms)
    const page35Questions = pageByNum(35)?.items || [];
    assert.equal(page35Questions[0]?.number, 3, 'First quiz question on Page 35 must carry number 3');
    assert.equal(page35Questions[1]?.number, 4, 'Second quiz question on Page 35 must carry number 4');

    assert.equal(pageByNum(42)?.ctaUrl, '/hub/wire', 'Page 42 must route to /hub/wire');
    assert.equal(pageByNum(43)?.ctaUrl, '/hub/magazine/poker-rooms', 'Page 43 must route to /hub/magazine/poker-rooms');

    // 6. Consumer MagazineSpreadRenderer.js layout routing & non-zero Chips formatting
    const rendererSrc = read('src/components/magazine/MagazineSpreadRenderer.js');
    assert.match(rendererSrc, /rows\.slice\(0,\s*13\)/, 'StandingsTableLayout must slice up to 13 rows so Rank #25 renders');
    assert.match(rendererSrc, /kind\s*===\s*['"]strategy_ai_coach['"][\s\S]{0,120}<FeatureArticleLayout/, 'strategy_ai_coach must route to FeatureArticleLayout');
    assert.match(rendererSrc, /kind\s*===\s*['"]final_table_live['"][\s\S]{0,120}<NewsRailLayout/, 'final_table_live must route to NewsRailLayout');
    assert.match(rendererSrc, /q\?\.number\s*\|\|\s*qIdx\s*\+\s*1/, 'TheTestQuizLayout must render q.number so Page 35 shows 3. and 4.');
    assert.match(rendererSrc, /spreadHalf/, 'StrategyColumnLayout must separate setup vs verdict spread halves');
    assert.match(rendererSrc, /page\?\.ctaUrl\s*\|\|\s*['"]\/hub\/magazine\/poker-rooms['"]/, 'CardroomBundleCtaLayout must honor page.ctaUrl');
});

// ── MAG LAW 14: Handler-Level Operator HMAC Auth, Atomic Email CAS & Cardroom Schema Contract ──
test('MAG LAW 14: pages/api/news/magazine.js honors operator HMAC on compile/harvest/test_email/online-publish, returns 403 on sendEmail:true or pin_item, returns 400 on bad issuePeriod, enforces atomic email_campaign_id CAS, and magazine-rooms.js writes shipping_address_json + null table_count', async () => {
    const magMod = await import('../pages/api/news/magazine.js');
    const magazineHandler = magMod.default;
    const { isAllowedOperatorMagazineAction } = magMod;

    assert.equal(isAllowedOperatorMagazineAction({ action: 'compile' }), true);
    assert.equal(isAllowedOperatorMagazineAction({ action: 'harvest' }), true);
    assert.equal(isAllowedOperatorMagazineAction({ action: 'test_email' }), true);
    assert.equal(
        isAllowedOperatorMagazineAction({ action: 'publish', sendEmail: false, confirmSend: 'PUBLISH_MAGAZINE_ONLINE' }),
        true
    );
    assert.equal(
        isAllowedOperatorMagazineAction({ action: 'publish', sendEmail: true, confirmSend: 'PUBLISH_MAGAZINE_ONLINE' }),
        false
    );
    assert.equal(isAllowedOperatorMagazineAction({ action: 'pin_item' }), false);

    const savedServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const testSecret = 'mag-law-14-operator-hmac-secret-20261126';
    process.env.SUPABASE_SERVICE_ROLE_KEY = testSecret;

    const makeMockIssueSb = () => ({
        from(table) {
            const sampleIssue = {
                id: '11111111-2222-4333-8444-555555555555',
                issue_number: 1,
                volume_number: 1,
                issue_period: '2026-11',
                slug: '2026-11',
                title: 'Smarter.Poker Magazine - Issue #1 (November 2026)',
                cover_headline: 'Championship Strategy Surge',
                cover_subheadline: '44 Pages Of GTO Strategy And Standings',
                status: 'review',
                page_count: 44,
                manifest_json: normalizeIssueManifest({ issuePeriod: '2026-11' }),
            };
            const chain = {
                select: () => chain,
                eq: () => chain,
                neq: () => chain,
                in: () => chain,
                not: () => chain,
                or: () => chain,
                gte: () => chain,
                lte: () => chain,
                gt: () => chain,
                is: () => chain,
                order: () => chain,
                update: () => chain,
                insert: () => chain,
                upsert: () => chain,
                limit: async () => ({ data: table === 'magazine_issues' ? [sampleIssue] : [], error: null }),
                then: (res, rej) =>
                    Promise.resolve({ data: table === 'magazine_issues' ? [sampleIssue] : [], error: null }).then(res, rej),
            };
            return chain;
        },
        storage: {
            from: () => ({
                upload: async (p) => ({ data: { path: p }, error: null }),
                getPublicUrl: (p) => ({
                    data: { publicUrl: `https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/${p}` },
                }),
            }),
        },
    });

    const invokeSignedPost = async (body) => {
        const ts = String(Math.floor(Date.now() / 1000));
        const action = String(body.action || '').trim();
        const cleanEmail = String(body.testEmail || '').trim().toLowerCase();
        const confirmSend = String(body.confirmSend || '').trim();
        const msg = confirmSend ? `${ts}:${action}:${cleanEmail}::${confirmSend}` : `${ts}:${action}:${cleanEmail}:`;
        const sig = crypto.createHmac('sha256', testSecret).update(msg).digest('hex');

        let statusCode = 200;
        let jsonBody = null;
        const req = {
            method: 'POST',
            headers: {
                'x-operator-timestamp': ts,
                'x-operator-signature': sig,
            },
            query: {},
            body,
            _rateLimitFn: () => true,
            _supabase: makeMockIssueSb(),
        };
        const res = {
            setHeader() {},
            status(code) {
                statusCode = code;
                return this;
            },
            json(payload) {
                jsonBody = payload;
                return this;
            },
        };
        await magazineHandler(req, res);
        return { statusCode, jsonBody };
    };

    try {
        // 1. compile, harvest, test_email, and online-only publish ALL succeed past auth (never 401 or 403!)
        const harvestRes = await invokeSignedPost({ action: 'harvest', issuePeriod: '2026-11' });
        assert.equal(harvestRes.statusCode, 200, `harvest HMAC failed: ${JSON.stringify(harvestRes.jsonBody)}`);

        const compileRes = await invokeSignedPost({ action: 'compile', issuePeriod: '2026-11', harvestFirst: false });
        assert.equal(compileRes.statusCode, 200, `compile HMAC failed: ${JSON.stringify(compileRes.jsonBody)}`);

        const onlinePubRes = await invokeSignedPost({
            action: 'publish',
            issuePeriod: '2026-11',
            sendEmail: false,
            confirmSend: 'PUBLISH_MAGAZINE_ONLINE',
        });
        assert.equal(onlinePubRes.statusCode, 200, `online publish HMAC failed: ${JSON.stringify(onlinePubRes.jsonBody)}`);

        const testEmailAuthCheck = await invokeSignedPost({ action: 'test_email', issuePeriod: '2026-11', testEmail: '' });
        assert.equal(testEmailAuthCheck.statusCode, 200, `test_email HMAC failed: ${JSON.stringify(testEmailAuthCheck.jsonBody)}`);
        assert.ok(testEmailAuthCheck.jsonBody?.htmlPreview, 'test_email preview must return htmlPreview');

        // 2. Disallowed mass-broadcast sendEmail:true and pin_item MUST return 403 under operator HMAC!
        const forbiddenEmailPub = await invokeSignedPost({
            action: 'publish',
            issuePeriod: '2026-11',
            sendEmail: true,
            confirmSend: 'PUBLISH_MAGAZINE_ONLINE',
        });
        assert.equal(forbiddenEmailPub.statusCode, 403, 'Operator HMAC must return 403 when sendEmail: true');

        const forbiddenPin = await invokeSignedPost({
            action: 'pin_item',
            id: '11111111-2222-4333-8444-555555555555',
            issuePeriod: '2026-11',
        });
        assert.equal(forbiddenPin.statusCode, 403, 'Operator HMAC must return 403 on pin_item');

        // 3. Malformed issuePeriod returns 400 (never falling back silently to current month)
        const badPeriodRes = await invokeSignedPost({ action: 'compile', issuePeriod: '2026-13', harvestFirst: false });
        assert.equal(badPeriodRes.statusCode, 400, 'Malformed issuePeriod must return 400');
    } finally {
        if (savedServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = savedServiceKey;
    }

    // 4. Atomic CAS on email_campaign_id in pages/api/news/magazine.js
    const magSrc = read('pages/api/news/magazine.js');
    assert.match(magSrc, /\.is\(['"]email_campaign_id['"],\s*null\)/, 'magazine.js must claim email_campaign_id via atomic .is("email_campaign_id", null) CAS');

    // 5. magazine-rooms.js writes shipping_address_json + table_count: null without phantom shipping_address
    const { validateRoomSubscriptionPayload } = await import('../pages/api/news/magazine-rooms.js');
    const validRoom = validateRoomSubscriptionPayload({
        room_name: 'The Lodge Card Club',
        contact_name: 'Cardroom Floor',
        contact_email: 'manager@thelodgepokerclub.com',
        contact_phone: '512-555-0199',
        shipping_address: '2055 S Interstate 35',
        city: 'Round Rock',
        state: 'TX',
        postal_code: '78664',
        table_count: 0,
        requested_copies: 50,
    });
    assert.equal(validRoom.ok, true, `Expected valid room payload, got: ${validRoom.error}`);
    assert.equal('shipping_address' in validRoom.record, false, 'magazine-rooms.js must never write phantom shipping_address column');
    assert.equal(validRoom.record.shipping_address_json?.street, '2055 S Interstate 35');
    assert.equal(validRoom.record.table_count, null, 'Zero/omitted table_count must map to null to satisfy SQL CHECK constraint');
});

// ── MAG LAW 15: Print Isolation, Cardroom SSR, Flipbook ?page= & Resize Retention, <=60-Char Titles & Dual Sitemaps ──
test('MAG LAW 15: _app.js + print/[issue].js enforce print isolation without a 45th blank page, poker-rooms.js exports getServerSideProps, [issue].js retains activePageNumber + ?page=, and <=60-char titles + dual sitemaps hold', async () => {
    // 1. Global shell print isolation in pages/_app.js & pages/hub/magazine/print/[issue].js
    const appSrc = read('pages/_app.js');
    assert.match(appSrc, /const\s+isPrintProofRoute\s*=/);
    assert.match(appSrc, /\/hub\/magazine\/print\/\[issue\]/);
    assert.match(appSrc, /!isPrintProofRoute[\s\S]{0,80}<WorldCommandDock/);
    assert.match(appSrc, /!isPrintProofRoute[\s\S]{0,120}<ActivePokerSeatLink/);
    assert.match(appSrc, /!isPrintProofRoute[\s\S]{0,140}<MessengerDockHost/);
    assert.match(appSrc, /!isPrintProofRoute\s*&&\s*<NewsletterCaptureBar/);
    assert.match(appSrc, /!isPrintProofRoute\s*&&\s*<TutorialProvider/);
    assert.match(appSrc, /!isPrintProofRoute[\s\S]{0,200}<GlobalNotificationPrompt/);
    assert.match(appSrc, /!isPrintProofRoute[\s\S]{0,160}<PWAInstallPrompt/);
    assert.match(appSrc, /!isPrintProofRoute\s*&&\s*<WelcomeModalGate/);

    const printSrc = read('pages/hub/magazine/print/[issue].js');
    assert.match(printSrc, /\.approved-global-header__clearance/);
    assert.match(printSrc, /\.sp-mag-print-sheet:last-child\s*\{\s*page-break-after:\s*auto\s*!important;\s*break-after:\s*auto\s*!important;\s*\}/);
    assert.match(printSrc, /pageBreakAfter:\s*isLastSheet\s*\?\s*['"]auto['"]\s*:\s*['"]always['"]|pageBreakAfter:\s*idx\s*<\s*pages\.length\s*-\s*1\s*\?\s*['"]always['"]\s*:\s*['"]auto['"]/);

    // 2. Cardroom portal SSR hydration
    const pokerRoomsSrc = read('pages/hub/magazine/poker-rooms.js');
    assert.match(pokerRoomsSrc, /export\s+async\s+function\s+getServerSideProps/);

    // 3. Flipbook ?page= deep-linking, viewport resize page retention & Cmd+ArrowLeft guard
    const issueSrc = read('pages/hub/magazine/[issue].js');
    assert.match(issueSrc, /initialPage/);
    assert.match(issueSrc, /router\?\.query\?\.page/);
    assert.match(issueSrc, /activePageNumber/);
    assert.match(issueSrc, /e\.metaKey\s*\|\|\s*e\.ctrlKey\s*\|\|\s*e\.altKey/);

    // 4. All 3 indexable magazine <title>s fit <= 60 chars (HTML-escaped) with exactly 1 Smarter.Poker mention
    const indexSrc = read('pages/hub/magazine/index.js');
    const indexTitleMatch = indexSrc.match(/const\s+pageTitle\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(indexTitleMatch?.[1], 'pages/hub/magazine/index.js must define static pageTitle');
    const roomsTitleMatch = pokerRoomsSrc.match(/const\s+pageTitle\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(roomsTitleMatch?.[1], 'pages/hub/magazine/poker-rooms.js must define static pageTitle');

    const { firstThatFits } = await import('../src/lib/seo/titleFit.js');
    const fittedIssueBase = firstThatFits([
        'Magazine Issue #1 (November 2026)',
        'Poker Magazine Issue #1',
        'Magazine Issue #1',
    ]);
    const issueTitle = fittedIssueBase.includes('Smarter.Poker')
        ? fittedIssueBase
        : `${fittedIssueBase} | Smarter.Poker`;

    const htmlEscapedLen = (s) => String(s).replace(/&/g, '&amp;').length;
    for (const [label, title] of [
        ['index.js', indexTitleMatch[1]],
        ['poker-rooms.js', roomsTitleMatch[1]],
        ['[issue].js', issueTitle],
    ]) {
        assert.ok(
            htmlEscapedLen(title) <= 60,
            `${label} <title> "${title}" exceeds 60 HTML-escaped chars (${htmlEscapedLen(title)})`
        );
        const brandCount = (title.match(/Smarter\.Poker/gi) || []).length;
        assert.equal(brandCount, 1, `${label} <title> "${title}" must mention Smarter.Poker exactly once`);
    }

    // 5. Dual sitemap parity (sitemap-core.xml.js AND root sitemap.xml.js)
    const coreSitemapSrc = read('pages/sitemap-core.xml.js');
    const rootSitemapSrc = read('pages/sitemap.xml.js');
    assert.match(coreSitemapSrc, /buildMagazineIssueUrls/);
    assert.match(rootSitemapSrc, /buildMagazineIssueUrls/);
    assert.match(rootSitemapSrc, /['"]\/hub\/magazine['"]/);
    assert.match(rootSitemapSrc, /['"]\/hub\/magazine\/poker-rooms['"]/);
});

// ── MAG LAW 16: Cross-Ecosystem Attribution, Capture Bar, Wire Subject Guard, Operations & World Menu ──
test('MAG LAW 16: classifyClickedEmailSection, parseWireEditionSubjectNumber, NewsletterCaptureBar, operations.js, admin studio, and world-footer-navigation.json enforce cross-ecosystem contracts', async () => {
    const { classifyClickedEmailSection } = await import('../src/lib/newsletter/utmAttribution.mjs');
    const { parseWireEditionSubjectNumber } = await import('../src/lib/newsletter/weeklyWireEngine.mjs');
    const { resolveNotificationRoute } = await import('../src/lib/notificationRoute.js');

    // 1. Email click heatmap classifies /hub/magazine/poker-rooms -> 'cardrooms' and /hub/magazine* -> 'magazine'
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/magazine/poker-rooms'), 'cardrooms');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/magazine/poker-rooms/?utm_source=monthly_magazine'), 'cardrooms');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/magazine'), 'magazine');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/magazine/2026-11?utm_source=monthly_magazine'), 'magazine');
    assert.equal(
        classifyClickedEmailSection('https://track.example.com/click?url=' + encodeURIComponent('https://smarter.poker/hub/magazine/2026-11')),
        'magazine'
    );
    assert.equal(classifyClickedEmailSection('https://smarter.poker/poker-rooms'), 'nearby');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/wire/3'), 'archive');

    // 2. parseWireEditionSubjectNumber immediately rejects [promo ...], [lifecycle ...], [sms ...], [test ...], [spot-vote ...]
    assert.equal(parseWireEditionSubjectNumber('[PROMO MAGAZINE] Smarter.Poker Magazine - Issue #1 (November 2026)'), null);
    assert.equal(parseWireEditionSubjectNumber('[PROMO EMAIL+SMS] Claim Bonus #1'), null);
    assert.equal(parseWireEditionSubjectNumber('[Lifecycle] Day #21 Welcome-Back'), null);
    assert.equal(parseWireEditionSubjectNumber('[SMS] Kings Club #25450'), null);
    assert.equal(parseWireEditionSubjectNumber('[TEST] Smarter.Poker Weekly Wire #4'), null);
    assert.equal(parseWireEditionSubjectNumber('[SPOT-VOTE] turn-overbet #1'), null);
    assert.equal(parseWireEditionSubjectNumber('Smarter.Poker Weekly Wire #4'), 4);

    // 3. notificationRoute.js aligns monthly_magazine_published slug regex to /^[a-z0-9][a-z0-9._-]{0,63}$/i
    assert.equal(
        resolveNotificationRoute({ type: 'monthly_magazine_published', data: { slug: 'vol1.2026_11' } }),
        '/hub/magazine/vol1.2026_11'
    );
    assert.equal(
        resolveNotificationRoute({ type: 'monthly_magazine_published', data: { slug: '-invalid-leading-dash' } }),
        '/hub/magazine'
    );
    assert.equal(
        resolveNotificationRoute({ type: 'monthly_magazine_published', data: { slug: '../admin' } }),
        '/hub/magazine'
    );

    // 4. getMenuConfigForPath in hamburgerMenus.js maps /hub/magazine and /hub/wire to 'news' while preserving world-footer-navigation.json 201-route lock
    const footerNav = JSON.parse(read('src/config/world-footer-navigation.json'));
    const newsWorld = (footerNav.worlds || []).find((w) => w.id === 'news');
    assert.deepEqual(newsWorld?.routePrefixes, ['/hub/news', '/hub/article']);

    const menuSrc = read('src/config/hamburgerMenus.js');
    assert.match(menuSrc, /createMenuItem\.navigation\(['"]Monthly Magazine['"],\s*['"]\/hub\/magazine['"]\)/);
    assert.match(menuSrc, /createMenuItem\.navigation\(['"]Weekly Wire['"],\s*['"]\/hub\/wire['"]\)/);
    const fnIdx = menuSrc.indexOf('export function getMenuConfigForPath');
    assert.ok(fnIdx >= 0, 'getMenuConfigForPath must exist in src/config/hamburgerMenus.js');
    const fnBody = menuSrc.slice(fnIdx).replace(/^export\s+function\s+/m, 'function ');
    const navSb = {
        resolveWorldMenu: () => null,
        getMenuConfig: (key) => ({ menuKey: key }),
        String,
        exports: {},
    };
    vm.runInNewContext(`${fnBody}\nexports.getMenuConfigForPath = getMenuConfigForPath;`, navSb);
    assert.equal(navSb.exports.getMenuConfigForPath('/hub/magazine')?.menuKey, 'news');
    assert.equal(navSb.exports.getMenuConfigForPath('/hub/magazine/2026-11?page=20')?.menuKey, 'news');
    assert.equal(navSb.exports.getMenuConfigForPath('/hub/wire')?.menuKey, 'news');
    assert.equal(navSb.exports.getMenuConfigForPath('/hub/wire/2')?.menuKey, 'news');
    assert.equal(navSb.exports.getMenuConfigForPath('/hub/unknown-page')?.menuKey, 'hub-home');

    // 5. NewsletterCaptureBar honors source prop, 'capture:magazine', Title Case headline, and floating suppression
    const captureSrc = read('src/components/news/NewsletterCaptureBar.js');
    const fnStart = captureSrc.indexOf('export function normalizeCapturePath');
    const fnEnd = captureSrc.indexOf('export default function NewsletterCaptureBar');
    assert.ok(fnStart >= 0 && fnEnd > fnStart);
    const pureSnippet = captureSrc.slice(fnStart, fnEnd).replace(/^export\s+function\s+/gm, 'function ');
    const capSb = { exports: {} };
    vm.runInNewContext(
        `${pureSnippet}\nexports.isNewsletterCaptureRoute = isNewsletterCaptureRoute;\nexports.deriveCaptureSource = deriveCaptureSource;\nexports.deriveCaptureHeadline = deriveCaptureHeadline;`,
        capSb
    );
    assert.equal(capSb.exports.isNewsletterCaptureRoute('/hub/magazine'), true);
    assert.equal(capSb.exports.isNewsletterCaptureRoute('/hub/magazine/2026-11'), true);
    assert.equal(capSb.exports.isNewsletterCaptureRoute('/hub/magazine/print/2026-11'), false);
    assert.equal(capSb.exports.isNewsletterCaptureRoute('/hub/magazine/poker-rooms'), false);
    assert.equal(capSb.exports.isNewsletterCaptureRoute('/hub/magazine/rss.xml'), false);
    assert.equal(capSb.exports.deriveCaptureSource('/hub/magazine'), 'capture:magazine');
    assert.equal(capSb.exports.deriveCaptureSource('/hub/magazine/2026-11'), 'capture:magazine');
    assert.equal(capSb.exports.deriveCaptureHeadline('/hub/magazine'), 'Get Smarter.Poker Magazine & Weekly Wire Free');

    assert.match(captureSrc, /source\s*=\s*['"]['"]/);
    assert.match(captureSrc, /const\s+effectiveSource\s*=\s*String\(source\s*\|\|\s*['"]['"]\)\.trim\(\)\s*\|\|\s*deriveCaptureSource\(cleanPath\)/);
    assert.match(captureSrc, /source:\s*effectiveSource/);
    assert.match(captureSrc, /cleanPath\s*===\s*['"]\/hub\/wire['"]/);
    assert.match(captureSrc, /cleanPath\s*===\s*['"]\/hub\/magazine['"]/);

    // 6. operations.js ALLOWED_SOURCES + ?issuePeriod= + non-phantom shipping_address_json
    const opsSrc = read('pages/api/news/operations.js');
    assert.match(opsSrc, /monthly_magazine:\s*0/);
    assert.match(opsSrc, /['"]monthly_magazine['"]/);
    assert.match(opsSrc, /req\.query\.issuePeriod/);
    assert.match(opsSrc, /selectedPeriod/);
    assert.match(opsSrc, /\.eq\(['"]issue_period['"],\s*selectedPeriod\)/);
    assert.match(opsSrc, /shipping_address_json/);
    const selectMatches = [...opsSrc.matchAll(/from\(['"]magazine_room_subscriptions['"]\)[\s\S]{0,240}?\.select\(([\s\S]*?)\)/g)];
    assert.ok(selectMatches.length >= 2);
    for (const m of selectMatches) {
        assert.doesNotMatch(
            m[1],
            /\bshipping_address\b(?!_json)/,
            'operations.js must never query phantom shipping_address column in SQL select()'
        );
    }

    // 7. Admin Studio & Reader cross-links and Tuesday Weekly Wire copy
    const adminSrc = read('pages/admin/newsletter.js');
    assert.match(adminSrc, /&issuePeriod=\$\{encodeURIComponent\(periodArg\)\}/);
    assert.match(adminSrc, /setMagCoverHeadline\(iss\.cover_headline\s*\|\|\s*['"]['"]\)/);
    assert.match(adminSrc, /setMagCoverSubheadline\(iss\.cover_subheadline\s*\|\|\s*['"]['"]\)/);
    assert.match(adminSrc, /setMagEditorNote\(iss\.editor_note\s*\|\|\s*['"]['"]\)/);
    assert.match(adminSrc, /Magazine:\s*\{campaign\.telemetry\.sections\.magazine\}/);
    assert.match(adminSrc, /Cardrooms:\s*\{campaign\.telemetry\.sections\.cardrooms\}/);
    assert.match(adminSrc, /monthly_magazine/);
    assert.match(adminSrc, /updateMagazineRoomStatus\(room,\s*['"]cancelled['"]\)/);
    assert.match(adminSrc, /saveMagazineRoomDetails/);

    assert.match(read('pages/hub/wire/[edition].js'), /href="\/hub\/magazine"/);
    const notifSettingsSrc = read('pages/hub/settings/notifications.js');
    assert.doesNotMatch(notifSettingsSrc, /Sunday Weekly Wire/i);
    assert.match(notifSettingsSrc, /Tuesday Weekly Wire/);
    assert.match(notifSettingsSrc, /\/hub\/magazine/);
    assert.match(read('pages/hub/email-preferences.js'), /\/hub\/magazine/);
});

// ── MAG LAW 17: Live Editorial Hygiene, Competitor Promo Shield, Entity Decode, Non-Echoing Decks & Real poker_series Schema ──
test('MAG LAW 17: competitor online-poker promos/outlets never leak into vault or compiled magazine, cover/feature/rail decks never echo headlines, numeric HTML entities & scraper byline prefixes are stripped, and poker_series never queries phantom venue_name', async () => {
    const { isCompetitorSponsoredPost, normalizeEditorialTitle } = await import('../src/lib/newsletter/editorialCleaners.mjs');
    const { isEchoingOrEmptyBlurb } = await import('../src/lib/newsletter/weeklyWireEngine.mjs');
    const { stripMagazineDashes } = await import('../src/lib/magazine/magazineSchema.mjs');
    const { buildCleanNonEchoingDeck, harvestMonthlyMagazineVault, stripScraperBylinePrefix } = await import(
        '../src/lib/magazine/vaultHarvester.mjs'
    );
    const { buildMagazineManifestFromVault } = await import('../src/lib/magazine/magazineCompiler.mjs');

    // 1. Competitor online-poker promo copy & rival operator blogs blocked at source
    assert.equal(
        isCompetitorSponsoredPost({
            title: 'Climb The Cash Game Ladder At Betrivers Poker For A Share Of 20k Each Week',
            source_name: 'Poker.org',
        }),
        true,
        'BetRivers Poker cash-game ladder promo must be blocked'
    );
    assert.equal(
        isCompetitorSponsoredPost({
            title: 'BetRivers: New Jersey Online Poker Launch Remains a Top Priority',
            source_name: 'Pokerfuse',
        }),
        true,
        'BetRivers online poker promo coverage must be blocked'
    );
    assert.equal(
        isCompetitorSponsoredPost({
            title: 'Festive Season returns with $1M in rewards throughout December',
            source_name: 'PokerStars Blog',
        }),
        true,
        'PokerStars Blog promotional posts must be blocked'
    );
    assert.equal(
        isCompetitorSponsoredPost({
            title: 'Brazilian commentors Felipe de Paulo and Flavio Del Valle become PokerStars Ambassadors',
            source_name: 'PokerStars Blog',
        }),
        true,
        'PokerStars Ambassador promos must be blocked'
    );
    // Real live tour stories remain allowed
    assert.equal(
        isCompetitorSponsoredPost({
            title: 'Ramin Hajiyev Hauls Third Triton Trophy and $2.8M After Steamrolling Final Table',
            source_name: 'PokerNews',
        }),
        false
    );
    assert.equal(
        isCompetitorSponsoredPost({
            title: 'WPT Unveils Huge 2027 LAPC Schedule With $10M In Guarantees',
            source_name: 'Poker.org',
        }),
        false
    );

    // 2. Acronym & bare numeric magnitude normalization (LAPC, 50M, 250K, 20K)
    assert.equal(
        normalizeEditorialTitle('Wpt Unveils Huge 2027 Lapc Schedule With 10m In Guarantees'),
        'WPT Unveils Huge 2027 LAPC Schedule With 10M In Guarantees'
    );
    assert.equal(
        normalizeEditorialTitle('Wsop Paradise 2026 A 50m Monster And A 250k Battle Of The Brains'),
        'WSOP Paradise 2026 A 50M Monster And A 250K Battle Of The Brains'
    );

    // 3. Hex/decimal HTML entity decoding & punctuation spacing + scraper byline prefix stripping
    assert.equal(
        stripMagazineDashes('When you&#x27;re in Delaware , Michigan , and &#39;Pennsylvania&#39; &mdash; let&#8217;s play .'),
        "When you're in Delaware, Michigan, and 'Pennsylvania' - let's play."
    );
    assert.equal(
        stripScraperBylinePrefix(
            'Justin Hammer Posted on: November 26, 2026 11:47 PST Link copied Add as a preferred source on Google It&#x27;s that time of year to reflect on tournament direction.'
        ),
        "It's that time of year to reflect on tournament direction."
    );

    // 4. Non-echoing deck synthesis & compile-time competitor exclusion on legacy vault rows
    const nonEchoDeck = buildCleanNonEchoingDeck({
        title: 'WSOP Paradise 2026 A 50M Monster And A 250K Battle Of The Brains',
        rawSummary: 'Wsop Paradise 2026 A 50m Monster And A 250k Battle Of The Brains',
        paragraphs: ['Wsop Paradise 2026 A 50m Monster And A 250k Battle Of The Brains'],
        sourceName: 'Poker.org',
        category: 'Tournament',
    });
    assert.equal(isEchoingOrEmptyBlurb('WSOP Paradise 2026 A 50M Monster And A 250K Battle Of The Brains', nonEchoDeck), false);

    const vaultedWeb = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/law17-web.jpg';
    const vaultedMaster = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/law17-master.jpg';
    const compiledManifest = buildMagazineManifestFromVault({
        issueNumber: 1,
        volumeNumber: 1,
        issuePeriod: '2026-11',
        vaultItems: [
            // Legacy banked competitor row with highest score -> MUST BE FILTERED OUT by compiler!
            {
                id: 'legacy-betrivers',
                issue_period: '2026-11',
                section: 'cover_candidate',
                source_type: 'poker_news',
                source_id: 'aaaa1111-1111-4111-8111-111111111111',
                headline: 'Climb The Cash Game Ladder At Betrivers Poker For A Share Of 20k Each Week',
                deck: 'Climb The Cash Game Ladder At Betrivers Poker For A Share Of 20k Each Week',
                body_text: 'At BetRivers Poker , there&#x27;s $20,000 in cash game rewards.',
                vaulted_image_url: vaultedWeb,
                vaulted_master_url: vaultedMaster,
                editorial_score: 999,
            },
            // Podcast pipe-stub -> demoted behind real championship journalism
            {
                id: 'podcast-stub',
                issue_period: '2026-11',
                section: 'cover_candidate',
                source_type: 'poker_news',
                source_id: 'bbbb2222-2222-4222-8222-222222222222',
                headline: 'Shocking Story After EPT Win | PokerNews Podcast #1018',
                deck: 'Shocking Story After EPT Win | PokerNews Podcast #1018',
                vaulted_image_url: vaultedWeb,
                vaulted_master_url: vaultedMaster,
                editorial_score: 120,
            },
            // Legitimate championship lead story with echoing raw deck & hex entities
            {
                id: 'triton-champ',
                issue_period: '2026-11',
                section: 'cover_candidate',
                source_type: 'poker_news',
                source_id: '8cc90281-596b-4b9a-bcfc-12a5feb0f0ee',
                headline: 'Ramin Hajiyev Hauls Third Triton Trophy and $2.8M After Steamrolling Final Table',
                deck: 'Ramin Hajiyev Hauls Third Triton Trophy and $2.8M After Steamrolling Final Table',
                body_text:
                    'Ramin Hajiyev Hauls Third Triton Trophy and $2.8M After Steamrolling Final Table\n\nRamin Hajiyev captured his third career Triton Super High Roller Series title after navigating an elite final table in Monte Carlo&#x27;s $150,000 event.\n\nEntering heads-up play with a commanding chip lead , Hajiyev applied relentless turn overbet pressure to seal the $2.8M top prize.',
                vaulted_image_url: vaultedWeb,
                vaulted_master_url: vaultedMaster,
                editorial_score: 96,
                metadata_json: { byline: 'PokerNews', category: 'Tournament' },
            },
            // Year-long 365-day placeholder series -> MUST BE FILTERED OUT on pp. 38-39
            {
                id: 'year-long-series',
                issue_period: '2026-11',
                section: 'series_calendar',
                source_type: 'poker_series',
                source_id: '999',
                headline: '2026 Year Long Placeholder Series',
                summary: '(2026-01-01 to 2026-12-31)',
                metadata_json: { startDate: '2026-01-01', endDate: '2026-12-31', city: '', state: '' },
                editorial_score: 88,
            },
            // Genuine multi-week championship stop -> KEPT on pp. 38-39
            {
                id: 'real-venetian-series',
                issue_period: '2026-11',
                section: 'series_calendar',
                source_type: 'tournament_series',
                source_id: '777',
                headline: 'DeepStack Extravaganza Championship',
                summary: 'The Venetian Resort, Las Vegas, NV • 2026-11-28 to 2026-12-20',
                metadata_json: {
                    venueName: 'The Venetian Resort',
                    city: 'Las Vegas',
                    state: 'NV',
                    startDate: '2026-11-28',
                    endDate: '2026-12-20',
                },
                editorial_score: 85,
            },
        ],
    });

    const fullManifestStr = JSON.stringify(compiledManifest);
    assert.doesNotMatch(fullManifestStr, /Betrivers/i, 'Competitor BetRivers row must never appear anywhere in manifest');
    assert.doesNotMatch(fullManifestStr, /&#x27;|&#0?39;|&quot;|&mdash;/i, 'Raw HTML entities must never survive into manifest');
    assert.match(compiledManifest.coverHeadline, /Ramin Hajiyev Hauls Third Triton Trophy/);
    assert.equal(
        isEchoingOrEmptyBlurb(compiledManifest.coverHeadline, compiledManifest.coverSubheadline),
        false,
        `coverSubheadline must never echo coverHeadline: "${compiledManifest.coverSubheadline}"`
    );

    const p12 = compiledManifest.pages.find((p) => p.pageNumber === 12);
    assert.equal(
        isEchoingOrEmptyBlurb(compiledManifest.coverHeadline, p12?.paragraphs?.[0] || ''),
        false,
        'Cover Story Page 12 opening paragraph must never echo headline'
    );

    // News Rail / Final Table / Platform pages carry empty paragraphs[] so Reader View never double-renders
    for (const n of [6, 7, 8, 9, 22, 23]) {
        assert.deepEqual(
            compiledManifest.pages.find((p) => p.pageNumber === n)?.paragraphs,
            [],
            `Page ${n} must not duplicate item cards inside page.paragraphs`
        );
    }

    // Live Series Radar pp. 38-39 excludes 365-day placeholders and keeps real stops
    const seriesHeadlines = [38, 39].flatMap((n) => (compiledManifest.pages.find((p) => p.pageNumber === n)?.items || []).map((x) => x.headline));
    assert.equal(seriesHeadlines.includes('2026 Year Long Placeholder Series'), false);
    assert.equal(seriesHeadlines.includes('DeepStack Extravaganza Championship'), true);

    // 5. Schema Law: neither vaultHarvester.mjs nor weeklyWireEngine.mjs queries phantom `venue_name` on `poker_series`
    const harvesterSrc = read('src/lib/magazine/vaultHarvester.mjs');
    const wireEngineSrc = read('src/lib/newsletter/weeklyWireEngine.mjs');
    for (const [name, src] of [
        ['vaultHarvester.mjs', harvesterSrc],
        ['weeklyWireEngine.mjs', wireEngineSrc],
    ]) {
        const psSelects = [...src.matchAll(/from\(['"]poker_series['"]\)[\s\S]{0,180}?\.select\(([\s\S]*?)\)/g)];
        assert.ok(psSelects.length >= 1, `${name} must query poker_series`);
        for (const m of psSelects) {
            assert.doesNotMatch(
                m[1],
                /\bvenue_name\b/,
                `${name} must never select non-existent column venue_name on poker_series`
            );
        }
    }

    // Also prove harvestMonthlyMagazineVault executes tournament_series + poker_series cleanly
    const queriedTables = [];
    const mockSb = {
        from(table) {
            queriedTables.push(table);
            const chain = {
                select: () => chain,
                eq: () => chain,
                neq: () => chain,
                in: () => chain,
                or: () => chain,
                gte: () => chain,
                lt: () => chain,
                lte: () => chain,
                gt: () => chain,
                ilike: () => chain,
                like: () => chain,
                order: () => chain,
                limit: async () => ({ data: [], error: null }),
                upsert: (rows) => ({
                    select: async () => ({ data: rows, error: null }),
                }),
            };
            return chain;
        },
        storage: {
            from: () => ({
                upload: async (p) => ({ data: { path: p }, error: null }),
                getPublicUrl: (p) => ({ data: { publicUrl: `https://smarter.poker/${p}` } }),
            }),
        },
    };
    await harvestMonthlyMagazineVault(mockSb, { issuePeriod: '2026-11', externalBudgetMs: 0 });
    assert.ok(queriedTables.includes('poker_series'), 'Harvester must query poker_series');
    assert.ok(queriedTables.includes('tournament_series'), 'Harvester must query tournament_series');
});

// ── MAG LAW 18: Commercial Saddle-Stitch Imposition & Cardroom Fulfillment CSV/Label Engine ──
test('MAG LAW 18: computeSaddleStitchSpreads enforces exact 16.75x10.875 signature sheet pairing across 36/40/44/48 pages, and buildCardroomFulfillmentCsv computes 10% overage + neutralizes CSV formula injection', async () => {
    const {
        IMPOSITION_SHEET_TRIM,
        buildCardroomFulfillmentCsv,
        computeSaddleStitchSpreads,
        escapeFulfillmentCsvCell,
        padPagesToSignature,
    } = await import('../src/lib/magazine/magazineImposition.mjs');

    assert.equal(IMPOSITION_SHEET_TRIM.spreadWidthIn, 16.75);
    assert.equal(IMPOSITION_SHEET_TRIM.spreadHeightIn, 10.875);
    assert.equal(IMPOSITION_SHEET_TRIM.bleedSpreadWidthIn, 17.0);
    assert.equal(IMPOSITION_SHEET_TRIM.bleedSpreadHeightIn, 11.125);

    // Non-multiples of 4 MUST throw RangeError; padPagesToSignature rounds cleanly to 4-page signatures
    assert.throws(() => computeSaddleStitchSpreads([{ pageNumber: 1 }, { pageNumber: 2 }]), RangeError);
    assert.throws(
        () => computeSaddleStitchSpreads(Array.from({ length: 42 }, (_, i) => ({ pageNumber: i + 1 }))),
        RangeError
    );
    assert.equal(padPagesToSignature([{ pageNumber: 1 }, { pageNumber: 2 }, { pageNumber: 3 }]).length, 4);

    for (const totalPages of [36, 40, 44, 48]) {
        const fakePages = Array.from({ length: totalPages }, (_, idx) => ({
            pageNumber: idx + 1,
            headline: `Page ${idx + 1}`,
        }));
        const spreads = computeSaddleStitchSpreads(fakePages);
        assert.equal(spreads.length, totalPages / 2, `${totalPages}p must produce ${totalPages / 2} printer spreads`);

        // Sheet 1 Front = [P.N | P.1], Sheet 1 Back = [P.2 | P.N-1], Centerfold = [P.N/2 | P.N/2 + 1]
        assert.equal(spreads[0].leftPageNumber, totalPages);
        assert.equal(spreads[0].rightPageNumber, 1);
        assert.equal(spreads[0].side, 'front');
        assert.equal(spreads[1].leftPageNumber, 2);
        assert.equal(spreads[1].rightPageNumber, totalPages - 1);
        assert.equal(spreads[1].side, 'back');
        const lastSpread = spreads[spreads.length - 1];
        assert.equal(lastSpread.leftPageNumber, totalPages / 2);
        assert.equal(lastSpread.rightPageNumber, totalPages / 2 + 1);

        const seen = new Set();
        for (const sp of spreads) {
            assert.equal(
                sp.leftPageNumber + sp.rightPageNumber,
                totalPages + 1,
                `Every saddle-stitch spread must sum to N+1 (${totalPages + 1})`
            );
            seen.add(sp.leftPageNumber);
            seen.add(sp.rightPageNumber);
        }
        assert.equal(seen.size, totalPages, `All ${totalPages} pages must appear bijectively across spreads`);
    }

    // Print proof route wires booklet imposition, center spine fold ticks, registration bullseyes & Vanguard color bars
    const printProofSrc = read('pages/hub/magazine/print/[issue].js');
    assert.match(printProofSrc, /computeSaddleStitchSpreads/);
    assert.match(printProofSrc, /imposition.*booklet/);
    assert.match(printProofSrc, /16\.75in\s+10\.875in/);
    assert.match(printProofSrc, /17\.0in\s+11\.125in/);
    assert.match(printProofSrc, /RegistrationBullseye/);
    assert.match(printProofSrc, /VanguardColorBars/);

    // CSV formula-injection guard + shipping_address_json extraction + 10% overage press-run calculation
    assert.equal(escapeFulfillmentCsvCell('=CMD|\' /C calc\'!A0'), "'=CMD|' /C calc'!A0");
    assert.equal(escapeFulfillmentCsvCell('+18005550199'), "'+18005550199");

    const fulfillment = buildCardroomFulfillmentCsv(
        [
            {
                id: 'r1',
                room_name: 'The Lodge Card Club',
                contact_name: '=EvilManager',
                contact_email: 'floor@thelodgepokerclub.com',
                contact_phone: '512-555-0199',
                shipping_address_json: { street: '2055 S Interstate 35, Suite 150', postalCode: '78664' },
                city: 'Round Rock',
                state: 'TX',
                table_count: 85,
                requested_copies: 100,
                status: 'verified',
            },
            {
                id: 'r2',
                room_name: 'Texas Card House Dallas',
                contact_name: 'Cardroom Desk',
                contact_email: 'desk@texascardhouse.com',
                shipping_address_json: { street: '11834 Harry Hines Blvd' },
                city: 'Dallas',
                state: 'TX',
                postal_code: '75234',
                requested_copies: 75,
                status: 'active',
            },
            {
                id: 'r3-pending',
                room_name: 'Pending Room Excluded By Default',
                requested_copies: 500,
                status: 'pending',
            },
        ],
        { issuePeriod: '2026-11', overagePct: 10 }
    );
    assert.equal(fulfillment.activeRoomsCount, 2);
    assert.equal(fulfillment.netCopies, 175);
    assert.equal(fulfillment.overageCopies, 18); // Math.ceil(175 * 0.10) = 18
    assert.equal(fulfillment.totalPressRunCopies, 193);
    assert.match(fulfillment.csv, /"2055 S Interstate 35, Suite 150"/);
    assert.match(fulfillment.csv, /'=EvilManager/);
    assert.doesNotMatch(fulfillment.csv, /Pending Room Excluded By Default/);

    const adminSrc = read('pages/admin/newsletter.js');
    assert.match(adminSrc, /exportMagazineFulfillmentCsv/);
    assert.match(adminSrc, /printMagazinePackingLabels/);
});

// ── MAG LAW 19: 44-Page Commercial PDF Builder, Cache Invalidation & /api/news/magazine-pdf Trace Law ──
test('MAG LAW 19: buildMagazineIssuePdfBuffer generates a valid 44-page %PDF-1.x binary with SSRF protection, /api/news/magazine-pdf enforces refresh auth + published-only caching, compileMonthlyMagazineIssue invalidates stale pdf_url, and @vercel/nft traces zero pages/hub/* files', async () => {
    const { buildMagazineManifestFromVault, compileMonthlyMagazineIssue } = await import(
        '../src/lib/magazine/magazineCompiler.mjs'
    );
    const { buildMagazineIssuePdfBuffer, isAllowedMagazineAssetImageUrl } = await import(
        '../src/lib/magazine/magazinePdfBuilder.mjs'
    );
    const { default: pdfHandler } = await import('../pages/api/news/magazine-pdf.js');

    // 1. Strict SSRF allowlist on embedded PDF images
    assert.equal(
        isAllowedMagazineAssetImageUrl(
            'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/cover.jpg'
        ),
        true
    );
    assert.equal(isAllowedMagazineAssetImageUrl('http://169.254.169.254/latest/meta-data/'), false);
    assert.equal(isAllowedMagazineAssetImageUrl('https://evil.example.com/storage/v1/object/public/magazine-assets/a.jpg'), false);
    assert.equal(
        isAllowedMagazineAssetImageUrl(
            'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/../private/secret.jpg'
        ),
        false
    );

    // 2. Real 44-page PDF binary generation
    const manifest = buildMagazineManifestFromVault({
        issueNumber: 1,
        volumeNumber: 1,
        issuePeriod: '2026-11',
        vaultItems: [],
    });
    const pdfBuf = await buildMagazineIssuePdfBuffer(manifest, { embedImages: false });
    assert.ok(Buffer.isBuffer(pdfBuf), 'PDF output must be a Node Buffer');
    assert.ok(pdfBuf.byteLength > 25_000, `Expected substantial 44-page PDF binary, got ${pdfBuf.byteLength} bytes`);
    const pdfAscii = pdfBuf.toString('latin1');
    assert.equal(pdfAscii.startsWith('%PDF-1.'), true, 'PDF buffer must start with %PDF-1. header');
    assert.match(pdfAscii, /\/Count\s+44\b/, 'PDF page tree must declare /Count 44 pages');

    // 3. /api/news/magazine-pdf endpoint behavior (400 bad selector, 401 unauth refresh, 200 build+upload on published, 302 cached, no DB cache write on draft preview)
    let uploadedBytes = 0;
    let dbUpdatedPayload = null;
    const cachedPublicPdfUrl =
        'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/smarter-poker-magazine-2026-11.pdf';

    const makePdfMockSb = (issueRow) => ({
        from(table) {
            const chain = {
                select: () => chain,
                in: () => chain,
                eq: () => chain,
                order: () => chain,
                limit: async () => ({
                    data: table === 'magazine_issues' && issueRow ? [issueRow] : [],
                    error: null,
                }),
                update: (payload) => {
                    dbUpdatedPayload = payload;
                    return { eq: async () => ({ data: [payload], error: null }) };
                },
            };
            return chain;
        },
        storage: {
            from: () => ({
                upload: async (_p, buf) => {
                    uploadedBytes = buf.byteLength;
                    return { data: { path: _p }, error: null };
                },
                getPublicUrl: () => ({ data: { publicUrl: cachedPublicPdfUrl } }),
            }),
        },
    });

    const callPdfApi = async ({ query = {}, issueRow = null }) => {
        let statusCode = 200;
        let headers = {};
        let bodyOut = null;
        let redirectTarget = null;
        const req = {
            method: 'GET',
            headers: {},
            query,
            _rateLimitFn: () => true,
            _fetchImpl: async () => ({ ok: false }),
            _supabase: makePdfMockSb(issueRow),
        };
        const res = {
            setHeader(k, v) {
                headers[k.toLowerCase()] = v;
            },
            status(c) {
                statusCode = c;
                return this;
            },
            redirect(c, url) {
                statusCode = c;
                redirectTarget = url;
                return this;
            },
            send(b) {
                bodyOut = b;
                return this;
            },
            end(b) {
                if (b !== undefined) bodyOut = b;
                return this;
            },
            json(p) {
                bodyOut = p;
                return this;
            },
        };
        await pdfHandler(req, res);
        return { statusCode, headers, bodyOut, redirectTarget };
    };

    const badSel = await callPdfApi({ query: { issue: '../etc/passwd' } });
    assert.equal(badSel.statusCode, 400);

    const unauthRefresh = await callPdfApi({ query: { issue: '2026-11', refresh: '1' } });
    assert.equal(unauthRefresh.statusCode, 401);

    // Draft preview generates PDF with private,no-store and NEVER persists pdf_url to DB
    uploadedBytes = 0;
    dbUpdatedPayload = null;
    const draftRes = await callPdfApi({
        query: { issue: '2026-11', preview: '1', download: '1' },
        issueRow: {
            id: 'draft-id-1',
            issue_number: 1,
            volume_number: 1,
            issue_period: '2026-11',
            slug: '2026-11',
            status: 'review',
            manifest_json: manifest,
            pdf_url: null,
        },
    });
    assert.equal(draftRes.statusCode, 200);
    assert.equal(draftRes.headers['content-type'], 'application/pdf');
    assert.equal(draftRes.headers['cache-control'], 'private, no-store');
    assert.equal(uploadedBytes, 0, 'Draft preview must not overwrite published storage PDF');
    assert.equal(dbUpdatedPayload, null, 'Draft preview must not persist pdf_url on review issue');

    // Published issue builds PDF, uploads to magazine-assets, and caches pdf_url
    const pubRes = await callPdfApi({
        query: { issue: '2026-11', download: '1' },
        issueRow: {
            id: 'pub-id-1',
            issue_number: 1,
            volume_number: 1,
            issue_period: '2026-11',
            slug: '2026-11',
            status: 'published',
            manifest_json: manifest,
            pdf_url: null,
        },
    });
    assert.equal(pubRes.statusCode, 200);
    assert.ok(uploadedBytes > 25_000);
    assert.equal(dbUpdatedPayload?.pdf_url, cachedPublicPdfUrl);

    // Subsequent published request redirects (302) to cached magazine-assets PDF URL
    const cachedRes = await callPdfApi({
        query: { issue: '2026-11', download: '1' },
        issueRow: {
            id: 'pub-id-1',
            issue_number: 1,
            volume_number: 1,
            issue_period: '2026-11',
            slug: '2026-11',
            status: 'published',
            manifest_json: manifest,
            pdf_url: cachedPublicPdfUrl,
        },
    });
    assert.equal(cachedRes.statusCode, 302);
    assert.match(String(cachedRes.redirectTarget), /magazine-assets\/2026-11\/smarter-poker-magazine-2026-11\.pdf/);

    // Re-compiling an issue resets pdf_url: null so stale PDFs are never served after manifest edits
    let persistedIssueRow = null;
    const compileMockSb = {
        from(table) {
            const chain = {
                select: () => chain,
                eq: () => chain,
                order: () => chain,
                limit: async () => ({
                    data:
                        table === 'magazine_issues'
                            ? [{ id: 'pub-id-1', issue_number: 1, issue_period: '2026-11', status: 'published', pdf_url: cachedPublicPdfUrl }]
                            : [],
                    error: null,
                }),
                update: (payload) => {
                    persistedIssueRow = payload;
                    return {
                        eq: () => ({
                            select: () => ({ limit: async () => ({ data: [payload], error: null }) }),
                        }),
                    };
                },
            };
            return chain;
        },
    };
    await compileMonthlyMagazineIssue(compileMockSb, { issuePeriod: '2026-11' });
    assert.equal(persistedIssueRow?.pdf_url, null, 'Re-compiling an issue must reset pdf_url to null');

    // 4. Next.js @vercel/nft trace check: magazine-pdf.js must NEVER trace any pages/hub/* static page
    const nftRes = await nextFileTracer.nodeFileTrace(['pages/api/news/magazine-pdf.js'], {
        base: REPO,
        processCwd: REPO,
    });
    const leakedPages = [...nftRes.fileList].filter(
        (f) => f.startsWith('pages/hub/') || f.startsWith('pages/poker-rooms/')
    );
    assert.deepEqual(
        leakedPages,
        [],
        `pages/api/news/magazine-pdf.js leaked page traces into serverless bundle: ${leakedPages.join(', ')}`
    );
});

// ── MAG LAW 20: Printable 300-DPI Cardroom Table-Tent Kit, Print Chrome Isolation & Sitemap Parity ──
test('MAG LAW 20: /hub/magazine/table-tent exports getServerSideProps, <=60-char title, 4x6 & 5x7 @page specs, ISO 18004 QR codes, _app.js + NewsletterCaptureBar print isolation, and dual sitemaps', async () => {
    const tentSrc = read('pages/hub/magazine/table-tent.js');
    assert.match(tentSrc, /export\s+async\s+function\s+getServerSideProps/);
    assert.match(tentSrc, /buildMagazineQrDataUri/);
    assert.match(tentSrc, /@page\s*\{\s*size:\s*8\.5in\s+6\.5in/);
    assert.match(tentSrc, /@page\s*\{\s*size:\s*5in\s+7in/);
    assert.match(tentSrc, /utm_source=table_tent&utm_medium=qr&utm_campaign=cardroom_kit/);

    const titleMatch = tentSrc.match(/const\s+pageTitle\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(titleMatch?.[1], 'table-tent.js must define static pageTitle');
    const escapedLen = titleMatch[1].replace(/&/g, '&amp;').length;
    assert.ok(escapedLen <= 60, `table-tent.js <title> exceeds 60 chars (${escapedLen}): "${titleMatch[1]}"`);
    assert.equal((titleMatch[1].match(/Smarter\.Poker/gi) || []).length, 1);

    // Print isolation in _app.js + NewsletterCaptureBar exclusion
    const appSrc = read('pages/_app.js');
    assert.match(appSrc, /\/hub\/magazine\/table-tent/);

    const captureSrc = read('src/components/news/NewsletterCaptureBar.js');
    const fnStart = captureSrc.indexOf('export function normalizeCapturePath');
    const fnEnd = captureSrc.indexOf('export default function NewsletterCaptureBar');
    const pureSnippet = captureSrc.slice(fnStart, fnEnd).replace(/^export\s+function\s+/gm, 'function ');
    const capSb = { exports: {} };
    vm.runInNewContext(`${pureSnippet}\nexports.isNewsletterCaptureRoute = isNewsletterCaptureRoute;`, capSb);
    assert.equal(capSb.exports.isNewsletterCaptureRoute('/hub/magazine/table-tent'), false);
    assert.equal(capSb.exports.isNewsletterCaptureRoute('/hub/magazine/table-tent?room=Lodge'), false);

    // Registered in both sitemaps
    assert.match(read('src/lib/seo/sitemapBuilders.mjs'), /\/hub\/magazine\/table-tent/);
    assert.match(read('pages/sitemap.xml.js'), /['"]\/hub\/magazine\/table-tent['"]/);
});

// ── MAG LAW 21: Interactive Flipbook Live Spot Voting, Reading Progress/Bookmarks, Instant Search, Zoom & Audio Speech Cleanup ──
test('MAG LAW 21: MagazineSpreadRenderer + [issue].js + index.js wire live /api/news/spot-vote tallies with AbortController, localStorage reading progress & bookmarks, instant 44-page search, 135% spread zoom, and speechSynthesis cleanup on unmount', () => {
    const rendererSrc = read('src/components/magazine/MagazineSpreadRenderer.js');
    const fnStart = rendererSrc.indexOf('export function parseLiveSpotVotePayload');
    const fnEnd = rendererSrc.indexOf('function StrategyColumnLayout');
    assert.ok(fnStart >= 0 && fnEnd > fnStart, 'parseLiveSpotVotePayload must exist in MagazineSpreadRenderer.js');
    const fnSnippet = rendererSrc.slice(fnStart, fnEnd).replace(/^export\s+function\s+/, 'function ');
    const sb = { Math, Number, exports: {} };
    vm.runInNewContext(`${fnSnippet}\nexports.parseLiveSpotVotePayload = parseLiveSpotVotePayload;`, sb);

    const normalizedTallies = sb.exports.parseLiveSpotVotePayload({
        votes: { A: 14, B: 26, C: 10, total: 50 },
    });
    assert.deepEqual({ ...normalizedTallies }, { A: 14, B: 26, C: 10, total: 50 });

    assert.match(rendererSrc, /\/api\/news\/spot-vote/);
    assert.match(rendererSrc, /new\s+AbortController\(\)/);
    assert.match(rendererSrc, /sp_magazine_spot_vote_updated/);

    const issueSrc = read('pages/hub/magazine/[issue].js');
    assert.match(issueSrc, /sp_mag_progress_v1:/);
    assert.match(issueSrc, /sp_mag_bookmarks_v1:/);
    assert.match(issueSrc, /speechSynthesis/);
    assert.match(issueSrc, /\.cancel\(\)/, 'Audio narration must cancel speechSynthesis cleanly on stop/unmount');
    assert.match(issueSrc, /zoomScale|1\.35|135%/);
    assert.match(issueSrc, /\/api\/og\/magazine-card\?/);
    assert.match(issueSrc, /\/api\/news\/spot-vote/);

    const indexSrc = read('pages/hub/magazine/index.js');
    assert.match(indexSrc, /sp_mag_progress_v1:/);
    assert.match(indexSrc, /Continue Reading Issue #/);
    assert.match(indexSrc, /\/api\/news\/magazine-pdf\?issue=/);
    assert.match(indexSrc, /\/hub\/magazine\/table-tent/);
});

// ── MAG LAW 22: Dynamic 1200x630 Magazine OG Card Satori Compliance & Geo/Middleware Public Allowlisting ──
test('MAG LAW 22: /api/og/magazine-card enforces Edge runtime, Satori display:flex on all multi-child JSX containers, ASCII/no-$ cardText, Vanguard palette, and geo-blocks + middleware allowlists', () => {
    const ogSrc = read('pages/api/og/magazine-card.js');
    assert.match(ogSrc, /export\s+const\s+config\s*=\s*\{\s*runtime:\s*['"]edge['"]\s*\}/);
    assert.match(ogSrc, /new\s+ImageResponse\(/);
    assert.match(ogSrc, /width:\s*1200/);
    assert.match(ogSrc, /height:\s*630/);
    assert.doesNotMatch(ogSrc, /#fbbf24|#f59e0b|#eab308|#c084fc|#a855f7|#ec4899/i);

    // Every <div style={{ ... }}> in Satori OG card must explicitly include display: 'flex'
    const divStyleMatches = [...ogSrc.matchAll(/<div\s+style=\{\{([\s\S]*?)\}\}/g)];
    assert.ok(divStyleMatches.length >= 15, 'Expected Satori JSX layout containers in magazine-card.js');
    for (const m of divStyleMatches) {
        assert.match(
            m[1],
            /display:\s*['"]flex['"]/,
            `Every <div> in pages/api/og/magazine-card.js must declare display: 'flex' for Satori: ${m[1].slice(0, 80)}`
        );
    }

    // Verify cardText sanitizes non-ASCII, em/en dashes, and '$' symbols
    const fnStart = ogSrc.indexOf('export function cardText');
    const fnEnd = ogSrc.indexOf('function clampText');
    const fnSnippet = ogSrc.slice(fnStart, fnEnd).replace(/^export\s+function\s+/, 'function ');
    const sb = { exports: {} };
    vm.runInNewContext(`${fnSnippet}\nexports.cardText = cardText;`, sb);
    assert.equal(sb.exports.cardText('Kings Club — $500,000 Chips \u{1F525}'), 'Kings Club - 500,000 Chips');

    // Public allowlists in config/geo-blocks.json and middleware.ts
    const geoBlocks = JSON.parse(read('config/geo-blocks.json'));
    const allowPaths = geoBlocks.allow_paths || [];
    assert.ok(allowPaths.includes('/api/news/magazine-pdf'), 'geo-blocks.json must allow /api/news/magazine-pdf');
    assert.ok(allowPaths.includes('/api/og/'), 'geo-blocks.json must allow /api/og/');

    const mwSrc = read('middleware.ts');
    assert.match(mwSrc, /['"]\/api\/news\/magazine-pdf['"]/);
    assert.match(mwSrc, /['"]\/api\/og\/['"]/);
});

// ── MAG LAW 23: Per-Page Print QR UTMs, Venue Auto-Linking, Pro-Account Confirmation Email & Cross-Hub Showcases ──
test('MAG LAW 23: appendMagazineQrUtm tags all 44 QR URLs without mutating ctaUrl or dropping ?pt=, resolveMatchingPokerVenueId auto-links verified venues while rejecting id=3109 & unverified self-reg, sendCardroomConfirmationEmail uses resendAccount.mjs within <=30 @vercel/nft files, and MagazineNewsstandBanner mounts on /hub/news & /poker-rooms', async () => {
    const { appendMagazineQrUtm, classifyClickedEmailSection } = await import(
        '../src/lib/newsletter/utmAttribution.mjs'
    );
    const { buildMagazineManifestFromVault } = await import('../src/lib/magazine/magazineCompiler.mjs');
    const {
        default: roomsHandler,
        resolveMatchingPokerVenueId,
        sendCardroomConfirmationEmail,
    } = await import('../pages/api/news/magazine-rooms.js');

    // 1. Per-page QR UTM attribution across all 44 pages while keeping web ctaUrl clean & preserving ?pt=
    const taggedPromoQr = appendMagazineQrUtm(
        'https://smarter.poker/auth/signup?redirect=%2Fhub%2Fclub-arena%2F%3Fjoin%3D25450&pt=signed_token_xyz',
        { issuePeriod: '2026-11', pageNumber: 2, kind: 'house_promo_spread' }
    );
    const parsedPromoQr = new URL(taggedPromoQr);
    assert.equal(parsedPromoQr.searchParams.get('pt'), 'signed_token_xyz');
    assert.equal(parsedPromoQr.searchParams.get('utm_source'), 'mag_qr');
    assert.equal(parsedPromoQr.searchParams.get('utm_medium'), 'qr');
    assert.equal(parsedPromoQr.searchParams.get('utm_campaign'), 'mag_2026-11');
    assert.equal(parsedPromoQr.searchParams.get('utm_content'), 'p02_house_promo_spread');

    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/magazine/table-tent?room=Lodge'), 'cardrooms');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/api/news/magazine-pdf?issue=2026-11'), 'magazine');

    const manifest = buildMagazineManifestFromVault({
        issueNumber: 1,
        volumeNumber: 1,
        issuePeriod: '2026-11',
        vaultItems: [],
    });
    assert.equal(manifest.pages.length, 44);
    for (const pg of manifest.pages) {
        if (pg.qrUrl) {
            assert.match(
                pg.qrUrl,
                /utm_source=mag_qr/,
                `Page ${pg.pageNumber} (${pg.kind}) qrUrl must include utm_source=mag_qr: ${pg.qrUrl}`
            );
            assert.match(pg.qrUrl, /utm_campaign=mag_2026-11/);
        }
        if (pg.ctaUrl) {
            assert.doesNotMatch(
                pg.ctaUrl,
                /utm_source=mag_qr/,
                `Page ${pg.pageNumber} web ctaUrl must stay clean of print QR UTMs: ${pg.ctaUrl}`
            );
        }
    }

    // 2. Verified Poker Venue Auto-Linking (matches real room, rejects id=3109 & unverified self_registration)
    const mockVenuesSb = (rows) => ({
        from: () => {
            const chain = {
                select: () => chain,
                eq: () => chain,
                limit: async () => ({ data: rows, error: null }),
            };
            return chain;
        },
    });

    const verifiedMatch = await resolveMatchingPokerVenueId(
        mockVenuesSb([
            {
                id: 3109,
                name: 'The Lodge Card Club',
                slug: 'suppressed-3109',
                city: 'Round Rock',
                state: 'TX',
                is_active: true,
                is_suppressed: false,
                canonical_venue_id: null,
                source: 'pokeratlas',
                data_quality: 'scraped_verified',
                venue_type: 'card_room',
            },
            {
                id: 9001,
                name: 'The Lodge Card Club',
                slug: 'unverified-self-reg',
                city: 'Round Rock',
                state: 'TX',
                is_active: true,
                is_suppressed: false,
                canonical_venue_id: null,
                source: 'self_registration',
                data_quality: 'pending',
                venue_type: 'card_room',
            },
            {
                id: 4242,
                name: 'The Lodge Card Club & Poker Room',
                slug: 'the-lodge-card-club-round-rock',
                city: 'Round Rock',
                state: 'TX',
                is_active: true,
                is_suppressed: false,
                canonical_venue_id: null,
                source: 'pokeratlas',
                data_quality: 'scraped_verified',
                venue_type: 'card_room',
            },
        ]),
        { room_name: 'The Lodge Card Club', city: 'Round Rock', state: 'TX' }
    );
    assert.deepEqual(verifiedMatch, {
        venueId: 4242,
        slug: 'the-lodge-card-club-round-rock',
    });

    // 3. Automated Cardroom Confirmation Email via resendAccount.mjs + POST /api/news/magazine-rooms end-to-end
    const savedBulkKey = process.env.RESEND_BULK_API_KEY;
    process.env.RESEND_BULK_API_KEY = 're_test_pro_key_mag23';
    try {
        let capturedEmailReq = null;
        const emailResult = await sendCardroomConfirmationEmail(
            {
                room_name: 'The Lodge Card Club',
                contact_name: 'Floor Manager',
                contact_email: 'floor@thelodgepokerclub.com',
                city: 'Round Rock',
                state: 'TX',
                postal_code: '78664',
                requested_copies: 75,
                shipping_address_json: { street: '2055 S Interstate 35' },
            },
            {
                matchedVenueSlug: 'the-lodge-card-club-round-rock',
                fetchImpl: async (url, init) => {
                    capturedEmailReq = { url, headers: init.headers, body: JSON.parse(init.body) };
                    return { ok: true, status: 200 };
                },
            }
        );
        assert.equal(emailResult.sent, true);
        assert.equal(capturedEmailReq?.url, 'https://api.resend.com/emails');
        assert.equal(capturedEmailReq?.headers?.Authorization, 'Bearer re_test_pro_key_mag23');
        assert.match(capturedEmailReq?.body?.from || '', /@mail\.smarter\.poker/);
        assert.match(capturedEmailReq?.body?.html || '', /\/hub\/magazine\/table-tent\?/);
        assert.match(capturedEmailReq?.body?.html || '', /the-lodge-card-club-round-rock/);

        // End-to-end POST handler links venue_id and returns matched_venue_slug + confirmationEmailSent
        let insertedPayload = null;
        let postStatus = 200;
        let postJson = null;
        const mockPostSb = {
            from(table) {
                if (table === 'poker_venues') {
                    const chain = {
                        select: () => chain,
                        eq: () => chain,
                        limit: async () => ({
                            data: [
                                {
                                    id: 4242,
                                    name: 'The Lodge Card Club',
                                    slug: 'the-lodge-card-club-round-rock',
                                    city: 'Round Rock',
                                    state: 'TX',
                                    is_active: true,
                                    is_suppressed: false,
                                    canonical_venue_id: null,
                                    source: 'pokeratlas',
                                    data_quality: 'scraped_verified',
                                    venue_type: 'card_room',
                                },
                            ],
                            error: null,
                        }),
                    };
                    return chain;
                }
                const chain = {
                    select: () => chain,
                    ilike: () => chain,
                    in: () => chain,
                    limit: async () => ({ data: [], error: null }),
                    insert: (payload) => {
                        insertedPayload = payload;
                        return {
                            select: () => ({
                                limit: async () => ({
                                    data: [{ id: 'sub-uuid-1', ...payload }],
                                    error: null,
                                }),
                            }),
                        };
                    },
                };
                return chain;
            },
        };
        await roomsHandler(
            {
                method: 'POST',
                headers: {},
                body: {
                    room_name: 'The Lodge Card Club',
                    contact_name: 'Floor Manager',
                    contact_email: 'floor@thelodgepokerclub.com',
                    shipping_address: '2055 S Interstate 35',
                    city: 'Round Rock',
                    state: 'TX',
                    postal_code: '78664',
                    requested_copies: 50,
                },
                _rateLimitFn: () => true,
                _supabase: mockPostSb,
                _fetchImpl: async () => ({ ok: true, status: 200 }),
            },
            {
                setHeader() {},
                status(c) {
                    postStatus = c;
                    return this;
                },
                json(p) {
                    postJson = p;
                    return this;
                },
            }
        );
        assert.equal(postStatus, 201);
        assert.equal(insertedPayload?.venue_id, 4242);
        assert.equal(postJson?.subscription?.venue_id, 4242);
    } finally {
        if (savedBulkKey === undefined) delete process.env.RESEND_BULK_API_KEY;
        else process.env.RESEND_BULK_API_KEY = savedBulkKey;
    }

    // 4. @vercel/nft serverless trace stays <= 30 files and 0 pages/hub/* files on magazine-rooms.js
    const roomsNft = await nextFileTracer.nodeFileTrace(['pages/api/news/magazine-rooms.js'], {
        base: REPO,
        processCwd: REPO,
    });
    assert.ok(
        roomsNft.fileList.size <= 30,
        `pages/api/news/magazine-rooms.js trace grew to ${roomsNft.fileList.size} files (max 30)`
    );
    const leakedRoomPages = [...roomsNft.fileList].filter((f) => f.startsWith('pages/hub/'));
    assert.deepEqual(leakedRoomPages, []);

    // 5. Cross-hub MagazineNewsstandBanner mounted on /hub/news and /poker-rooms + Table-Tent CTA on /hub/magazine/poker-rooms
    const bannerSrc = read('src/components/magazine/MagazineNewsstandBanner.js');
    assert.match(bannerSrc, /minHeight:\s*['"]44px['"]/);
    assert.match(bannerSrc, /href="\/hub\/magazine"/);
    assert.match(bannerSrc, /href="\/hub\/magazine\/poker-rooms"/);
    assert.doesNotMatch(bannerSrc, /#fbbf24|#c084fc|\u2014|\u2013/i);

    assert.match(read('pages/hub/news.js'), /MagazineNewsstandBanner/);
    assert.match(read('pages/poker-rooms/index.js'), /MagazineNewsstandBanner/);
    assert.match(read('pages/hub/magazine/poker-rooms.js'), /\/hub\/magazine\/table-tent/);
});

// ── MAG LAW 24: Print-Edition Art Direction, QR Discipline & Zero Duplication ──
test('MAG LAW 24: every printed picture is real and unique, placeholder plates never print or get reused, QR codes print only on join or destination pages, pull quotes come from their own story, and the renderer honors the plan', async () => {
    const { buildMagazineManifestFromVault } = await import('../src/lib/magazine/magazineCompiler.mjs');
    const { finalizeMagazineIssueManifest, listPrintedMagazinePictures } = await import('../src/lib/magazine/magazineArtDirection.mjs');
    const {
        normalizeIssueManifest,
        isMagazineFallbackImageUrl,
        isSelfReferentialMagazineQr,
        MAGAZINE_QR_PAGE_KINDS,
        planMagazineQrCodes,
    } = await import('../src/lib/magazine/magazineSchema.mjs');

    const asset = (name) => `https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/magazine-assets/2026-11/${name}-web.jpg`;
    const shared = asset('0123456789abcdef01234567');
    const plate = asset('fedcba9876543210fedcba98');
    const vaultItems = [
        {
            id: 'l18-cover',
            issue_period: '2026-11',
            section: 'cover_candidate',
            headline: 'Circuit Finale Draws Record Field In Cherokee',
            body_text:
                'The circuit finale opened with a record 1,240 entries across the first two flights of the Main Event.\n\nOrganizers added a third starting flight after the opening day sold out within four hours of registration.\n\nLast year the same event drew 980 players and paid 140 places, with the winner taking home a career-best score.',
            vaulted_image_url: shared,
            vaulted_master_url: shared,
            image_width: 1200,
            image_height: 800,
            editorial_score: 99,
            is_pinned: true,
        },
        {
            id: 'l18-feature',
            issue_period: '2026-11',
            section: 'feature_story',
            headline: 'Island Festival Adds A Five Million Guarantee',
            body_text:
                'The island festival announced a five million guarantee for its championship event starting next week.\n\nQualifiers from the season will receive travel packages and a seat in the opening flight of the event.',
            vaulted_image_url: shared,
            vaulted_master_url: shared,
            image_width: 1200,
            image_height: 800,
            editorial_score: 90,
        },
        {
            id: 'l18-news-plate',
            issue_period: '2026-11',
            section: 'news_brief',
            headline: 'Regional Series Posts Strong Turnout',
            summary: 'A regional series posted strong turnout across its opening weekend of events.',
            vaulted_image_url: plate,
            vaulted_master_url: plate,
            image_width: 1600,
            image_height: 2000,
            metadata_json: { usedFallbackImage: true },
            editorial_score: 80,
        },
    ];

    const manifest = buildMagazineManifestFromVault({ issueNumber: 1, volumeNumber: 1, issuePeriod: '2026-11', vaultItems });

    // 1. Every printed picture is real (never a fallback or a plate) and prints exactly once.
    const pictures = listPrintedMagazinePictures(manifest);
    assert.ok(pictures.length > 0, 'Issue must print pictures');
    const plateKey = 'vault:fedcba9876543210fedcba98';
    for (const pic of pictures) {
        assert.equal(isMagazineFallbackImageUrl(pic.url), false, `Page ${pic.pageNumber} prints a fallback image`);
        assert.notEqual(pic.key, plateKey, `Page ${pic.pageNumber} prints a placeholder plate`);
    }
    const keys = pictures.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length, `Duplicate printed pictures: ${keys.join(', ')}`);
    for (const page of manifest.pages) {
        if (page.imageRole === 'none') continue;
        assert.ok(page.imageUrl && !isMagazineFallbackImageUrl(page.imageUrl), `Page ${page.pageNumber} has a role but no real picture`);
    }

    // 2. QR codes: allowed kinds only, never pointing back at the magazine, each destination once.
    const qrPages = manifest.pages.filter((p) => p.showQr);
    assert.ok(qrPages.length >= 3 && qrPages.length <= 16, `Expected a disciplined QR count, got ${qrPages.length}`);
    const qrTargets = new Set();
    for (const page of qrPages) {
        assert.ok(new Set(MAGAZINE_QR_PAGE_KINDS).has(page.kind), `QR printed on disallowed page kind ${page.kind}`);
        assert.equal(isSelfReferentialMagazineQr(page.qrUrl), false, `Page ${page.pageNumber} QR points back at the magazine`);
        assert.ok(page.qrLabel && /^Scan To |^Scan For /.test(page.qrLabel), `Page ${page.pageNumber} QR needs an action label`);
        const target = String(page.qrUrl).replace(/#.*$/, '').replace(/[?&]utm_[^&]*/g, '').replace(/\/$/, '');
        assert.equal(qrTargets.has(target), false, `QR destination printed twice: ${target}`);
        qrTargets.add(target);
    }
    assert.equal(manifest.pages.find((p) => p.kind === 'front_cover').showQr, false, 'Front cover never carries a QR code');
    assert.ok(planMagazineQrCodes(manifest.pages) instanceof Map);

    // 3. Feature pull quotes are sentences of their own story; no pull quote or stat prints twice.
    const storyText = manifest.pages
        .filter((p) => p.kind === 'cover_feature')
        .flatMap((p) => p.paragraphs)
        .join(' ')
        .toLowerCase();
    for (const page of manifest.pages.filter((p) => p.kind === 'cover_feature' && p.pullQuote)) {
        assert.ok(storyText.includes(page.pullQuote.toLowerCase().slice(0, 40)), `Page ${page.pageNumber} pull quote is not from the story`);
    }
    const quotes = manifest.pages.map((p) => p.pullQuote).filter(Boolean);
    assert.equal(new Set(quotes).size, quotes.length, 'A pull quote prints twice');
    const statKeys = manifest.pages.flatMap((p) => (p.stats || []).map((s) => `${s.label}|${s.value}`.toLowerCase()));
    assert.equal(new Set(statKeys).size, statKeys.length, 'A stat prints twice');
    for (const page of manifest.pages.filter((p) => p.kind === 'cover_feature' || p.kind === 'secondary_feature')) {
        if (page.runIndex > 0) assert.equal(page.subheadline, '', `Page ${page.pageNumber} continuation carries an invented deck`);
        assert.doesNotMatch(page.headline, /Tactical Blueprint/);
    }

    // 4. Runs are derived and finalize is idempotent.
    const cover = manifest.pages.filter((p) => p.kind === 'cover_feature');
    assert.deepEqual(cover.map((p) => `${p.runIndex}/${p.runLength}`), ['0/4', '1/4', '2/4', '3/4']);
    const again = normalizeIssueManifest(finalizeMagazineIssueManifest(manifest, { vaultItems }));
    assert.equal(JSON.stringify(again.pages), JSON.stringify(manifest.pages), 'finalizeMagazineIssueManifest must be idempotent');

    // 5. The harvester retries plates instead of reusing them forever.
    const harvesterSrc = read('src/lib/magazine/vaultHarvester.mjs');
    assert.match(harvesterSrc, /!isVanguardPlateVaultRecord\(existing\)/, 'Harvester must never reuse a placeholder plate');
    assert.match(harvesterSrc, /usedFallbackImage:\s*Boolean\(vidVault\?\.usedFallback\)/, 'Video plates must be recorded');

    // 6. The renderer prints exactly what the plan says.
    const rendererSrc = read('src/components/magazine/MagazineSpreadRenderer.js');
    assert.match(rendererSrc, /if \(!page\?\.showQr\) return null;/, 'QrBlock must render only when the plan prints a QR');
    assert.match(rendererSrc, /page\.imageRole === 'none'/, 'Pages without a picture must print no picture');
    assert.match(rendererSrc, /deckEchoesCopy/, 'Decks that repeat the first paragraph must be dropped');
    assert.match(rendererSrc, /smarter-poker-logo-final\.png/, 'Running heads must carry the Smarter.Poker logo');
    assert.match(rendererSrc, /brand-text-trimmed\.png/, 'The cover masthead must carry the Smarter.Poker wordmark');
    assert.match(read('pages/_app.js'), /magazine-print\.css/, 'The print stylesheet must load globally');
    assert.doesNotMatch(rendererSrc, /Scan At The Table/, 'Generic QR badges must not return');
});

// ── MAG LAW 25: Printed Copy Never Stops Mid-Word & Pull Quotes Keep Their Gutter ──
test('MAG LAW 25: decks and paragraphs clip on a full sentence, never mid-word, and the pull-quote mark keeps its gutter', async () => {
    const { clipAtSentence, buildCleanNonEchoingDeck } = await import('../src/lib/magazine/vaultHarvester.mjs');
    const long = "Only four people will ever have a Triton 10th Anniversary commemorative coin in their prize cabinets, won in the $150,000 NLH 10th Anniversary Special tournaments held at this year's Triton stops. The last one was up for grabs today at the Triton Super High Roller Series North Cyprus, where the field was the deepest of the year.";
    const clipped = clipAtSentence(long, 280);
    assert.ok(clipped.length <= 280, 'Clipped copy must respect the limit');
    assert.ok(clipped.endsWith("Triton stops."), `Clipped copy must end on the last full sentence, got: ${clipped.slice(-40)}`);
    assert.equal(clipAtSentence('Short line.', 280), 'Short line.', 'Copy under the limit is untouched');
    const noStops = 'word '.repeat(80).trim();
    const wordClip = clipAtSentence(noStops, 100);
    assert.ok(wordClip.endsWith('word…'), 'Without a sentence end the clip lands on a whole word with an ellipsis');
    assert.ok(wordClip.length <= 100, 'Word clip respects the limit');
    const deck = buildCleanNonEchoingDeck({ title: 'Triton Anniversary Special', rawSummary: long });
    assert.match(deck, /[.!?…]["”')\]]?$/, 'Decks end on punctuation, never mid-word');
    const harvester = read('src/lib/magazine/vaultHarvester.mjs');
    assert.doesNotMatch(harvester, /return cand\.slice\(0, 280\)/, 'Decks must not be sliced mid-word');
    assert.doesNotMatch(harvester, /paragraphs\.push\(text\.slice\(0, 700\)\)/, 'Paragraphs must not be sliced mid-word');
    const css = read('src/components/magazine/magazine-print.css');
    assert.match(css, /\.spm-sheet \.spm-pullquote,\s*\n\.spm-pullquote \{/, 'The pull quote must out-rank the .spm-sheet blockquote reset so its quote mark never overlaps the text');
});
