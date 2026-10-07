import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const FOCUSED_TESTS = [
    '__tests__/trivia-console-contract.test.mjs',
    '__tests__/trivia-phase-9-challenge-knowledge.test.mjs',
    '__tests__/trivia-phase-10-art-provenance.test.mjs',
    '__tests__/trivia-phase-10-progress-account.test.mjs',
    '__tests__/trivia-achievement-authority.test.mjs',
    '__tests__/page-preferences-merge-before-save.test.mjs',
    '__tests__/trivia-preferences-atomic-cas.test.mjs',
    '__tests__/trivia-phase-11-12-operations.test.mjs',
    '__tests__/trivia-phase-11-operations-authority.test.mjs',
    '__tests__/trivia-phase-12-historical-reconciliation.test.mjs',
    '__tests__/trivia-phase-12-cutover-readiness.test.mjs',
    '__tests__/trivia-pvp-engine-v2.test.mjs',
    '__tests__/trivia-tournament-containment.test.mjs',
    '__tests__/trivia-phase-11-ci-hardening.test.mjs',
    '__tests__/trivia-pwa-rollback.test.mjs',
];

const TRIVIA_ROUTES = [
    '/hub/trivia',
    '/hub/trivia/daily',
    '/hub/trivia/arcade',
    '/hub/trivia/history',
    '/hub/trivia/rules',
    '/hub/trivia/pro',
    '/hub/trivia/mtt',
    '/hub/trivia/cash',
    '/hub/trivia/icm',
    '/hub/trivia/gto',
    '/hub/trivia/endless',
    '/hub/trivia/mixed',
    '/hub/trivia/survival-game',
    '/hub/trivia/survival',
    '/hub/trivia/time-attack',
    '/hub/trivia/pvp',
    '/hub/trivia/tournaments',
    '/hub/trivia/achievements',
    '/hub/trivia/leaderboard',
    '/hub/trivia/settings',
    '/hub/trivia/stats',
];

test('the maintained required gate runs each Phase 9-12 focused contract exactly once', () => {
    const workflow = read('.github/workflows/build-safety-gate.yml');
    assert.match(workflow, /name: "Trivia Phases 9-12 focused contracts"/);
    for (const file of FOCUSED_TESTS) {
        assert.equal(workflow.split(file).length - 1, 1, `${file} must run exactly once in the maintained gate`);
    }
});

test('the maintained gate runs the real Phase 12 migration once on its existing PostgreSQL 17 toolchain', () => {
    const workflow = read('.github/workflows/build-safety-gate.yml');
    const gatePath = 'scripts/trivia/p12-cutover-replica-tests/run.sh';
    assert.equal(workflow.split(gatePath).length - 1, 1);
    assert.ok(
        workflow.indexOf('Resolve Exact PostgreSQL 17 Training Test Binaries')
            < workflow.indexOf('Trivia Phase 12 PostgreSQL 17 Cutover Authority'),
        'the cutover gate must reuse the already-resolved PG17 binaries',
    );

    const runner = read(gatePath);
    assert.match(runner, /PostgreSQL 17/);
    assert.match(runner, /PHASE6_POSTGRES_BIN/);
    assert.match(runner, /trap cleanup EXIT INT TERM/);
    assert.match(runner, /p12-cutover-pg17\.\*/);
    assert.match(runner, /20261006014200_trivia_p12_competitive_cutover_authority\.sql/);
    assert.match(runner, /space_before_kb/);
    assert.match(runner, /before_kb < 524288/);
    assert.match(runner, /shared_memory_type=mmap/);
    assert.match(runner, /postgres-mmap-wrapper\.sh/);
    const bootstrapWrapper = read(
        'scripts/trivia/p12-cutover-replica-tests/postgres-mmap-wrapper.sh',
    );
    assert.match(bootstrapWrapper, /P12_REAL_POSTGRES/);
    assert.match(bootstrapWrapper, /shared_memory_type=mmap/);
    assert.match(bootstrapWrapper, /dynamic_shared_memory_type=mmap/);
    assert.match(runner, /space_peak_free_kb/);
    assert.match(runner, /space_after_kb/);

    const assertions = read('scripts/trivia/p12-cutover-replica-tests/10_assertions.sql');
    for (const contract of [
        /fresh active PvP settlement/,
        /future active tournament settlement/,
        /terminal orphan reconciliation must block cutover/,
        /zero-Diamond canary passed without settlement row/,
        /refunded paid tournament falsely certified/,
        /human-win, or horse-win PvP proof failed/,
        /wallet authorization after match creation falsely certified/,
        /operator holder authorized a public target/,
        /one-time bootstrap authorization was reused/,
        /standby masked the latest owner health/,
        /compatibility RPC did not enter canonical recovery fence/,
    ]) assert.match(assertions, contract);
});

test('every rebuilt Trivia route has finite p75 Core Web Vitals and resource ceilings', () => {
    const registry = JSON.parse(read('scripts/ci/mobile-budget.json')).trivia;
    assert.ok(registry.samples >= 4, 'p75 needs at least four cold samples per route');
    assert.deepEqual(Object.keys(registry.routes), TRIVIA_ROUTES);
    assert.equal(registry.defaults.lcpMs, 2500);
    assert.equal(registry.defaults.inpMs, 200);
    assert.equal(registry.defaults.cls, 0.1);
    for (const key of ['jsKb', 'cssKb', 'imageKb', 'queryCount', 'jsHeapMb']) {
        assert.ok(Number.isFinite(registry.defaults[key]) && registry.defaults[key] > 0, `${key} must have a finite blocking ceiling`);
    }

    const spec = read('e2e/trivia-performance-budget.spec.ts');
    for (const contract of [
        /devices\['Pixel 5'\]/,
        /\.\.\.pixel5Context/,
        /function p75/,
        /largest-contentful-paint/,
        /layout-shift/,
        /durationThreshold:\s*16/,
        /performance\.eventCounts/,
        /JSHeapUsedSize/,
        /type !== 'script' && type !== 'stylesheet' && type !== 'image'/,
        /request\.resourceType\(\) === 'fetch'/,
        /produced no LCP entry/,
        /produced no trusted interaction timing/,
        /must measure its intended page/,
    ]) assert.match(spec, contract);
    assert.doesNotMatch(spec, /if \([^)]*lcp[^)]*>\s*0\)/i, 'a missing LCP cannot silently skip its assertion');
});

test('the existing production-build browser job owns Trivia budgets and installed-PWA rollback', () => {
    const workflow = read('.github/workflows/global-footer-e2e.yml');
    assert.match(workflow, /VERCEL:\s*'1'/, 'the maintained build must emit the real root worker');
    assert.match(workflow, /name: Wait for server\s+id: production_server_ready/);
    const runWhenServerIsReady = /if: \$\{\{ !cancelled\(\) && steps\.production_server_ready\.outcome == 'success' \}\}/g;
    assert.equal(
        [...workflow.matchAll(runWhenServerIsReady)].length,
        2,
        'both Trivia browser gates must still run after an unrelated browser suite fails when the production server is ready',
    );
    const triviaPerformanceStep = workflow.indexOf('name: Trivia Phase 11 mobile p75 performance budgets');
    const triviaPwaStep = workflow.indexOf('name: Trivia installed-PWA upgrade and rollback compatibility');
    const unrelatedFooterStep = workflow.indexOf('name: Verify footer routes and geometry');
    assert.ok(
        triviaPerformanceStep < unrelatedFooterStep && triviaPwaStep < unrelatedFooterStep,
        'scoped Trivia release evidence must run before the unrelated footer matrix',
    );
    assert.match(workflow, /trivia-performance-budget\.spec\.ts --project=trivia-performance/);
    assert.match(workflow, /trivia-pwa-rollback\.spec\.ts --project=trivia-pwa/);
    assert.match(workflow, /TRIVIA_PVP_ENABLED:\s*'true'/);
    assert.match(workflow, /TRIVIA_TOURNAMENTS_ENABLED:\s*'true'/);

    const config = read('playwright.config.ts');
    assert.match(config, /name: 'trivia-performance'[\s\S]*?serviceWorkers: 'block'/);
    assert.match(config, /name: 'trivia-pwa'[\s\S]*?serviceWorkers: 'allow'/);

    const pwa = read('e2e/trivia-pwa-rollback.spec.ts');
    assert.match(pwa, /const TRIVIA_ART_CACHE = '\(trivia-art-\[0-9a-f\]\+\)'/);
    assert.doesNotMatch(pwa, /\.unregister\(\)/, 'unregister leaves the old controlling worker alive and cannot identify a new activation');
    assert.match(pwa, /activateRootWorker\(page, '\/sw\.js\?trivia-release=forward-candidate'/);
    assert.match(pwa, /activateRootWorker\(page, '\/sw\.js', ''\)/);
    assert.match(pwa, /active\.state !== 'activated'/, 'cache assertions must wait for activate event.waitUntil to settle');
    assert.match(pwa, /trivia-art-prior-rejected/);
    assert.match(pwa, /trivia-art-forward-candidate/);
    assert.match(pwa, /static-assets/);
    assert.match(pwa, /_next\\\/static\\\/chunks\\\/pages/);
    assert.match(read('__tests__/trivia-pwa-rollback.test.mjs'), /triviaArtCacheName/, 'the rollback gate must bind the worker to the exact shipped art digest');
});

test('the Trivia performance project is pinned to Chromium for CDP metrics', () => {
    const config = read('playwright.config.ts');
    const projectStart = config.indexOf("name: 'trivia-performance'");
    const projectEnd = config.indexOf("name: 'trivia-pwa'", projectStart);
    assert.ok(projectStart >= 0 && projectEnd > projectStart, 'the Trivia performance project must remain independently configured');

    const project = config.slice(projectStart, projectEnd);
    assert.match(project, /\.\.\.devices\['Pixel 5'\]/, 'the CDP gate must use a Chromium mobile device profile');
    assert.match(project, /browserName:\s*'chromium'/, 'the CDP gate must explicitly launch Chromium');
    assert.doesNotMatch(project, /devices\['iPhone 13'\]/, 'a WebKit-default device profile would break newCDPSession');
});

test('approved shared chrome is responsive and below-fold lobby art waits for the viewport', () => {
    const header = read('src/components/ui/UniversalHeader.js');
    const footer = JSON.parse(read('src/config/world-footer-navigation.json'))
        .worlds.find((world) => world.id === 'trivia')?.artwork;
    const bottomNav = read('src/components/ui/BottomNavBar.jsx');
    const frameCard = read('src/components/trivia/console/TriviaFrameCard.jsx');
    const footerBrowserGate = read('e2e/global-footer-visual.spec.ts');

    assert.match(header, /<picture className="approved-global-header__picture">/);
    assert.match(header, /global-header-desktop-824\.625ee4e7dd\.webp 824w/);
    assert.match(header, /global-header-desktop-1200\.c58360aee1\.webp 1200w/);
    assert.ok(
        statSync(join(ROOT, 'public/images/global-header/global-header-desktop-824.625ee4e7dd.webp')).size <= 75 * 1024,
        'the phone header derivative must stay below 75KB',
    );

    for (const relativePath of [
        'public/images/global-header/global-header-desktop-824.625ee4e7dd.webp',
        'public/images/global-header/global-header-desktop-1200.c58360aee1.webp',
        'public/images/global-header/global-header-desktop-1648.0660349552.webp',
        'public/images/footers/world-hub/footer-poker-trivia-v2-640.8127741cce.webp',
        'public/images/footers/world-hub/footer-poker-trivia-v2-960.ce11e590da.webp',
        'public/images/footers/world-hub/footer-poker-trivia-v2-1916.d526120ec9.webp',
    ]) {
        const hashToken = basename(relativePath).match(/\.([0-9a-f]{10})\.webp$/)?.[1];
        assert.ok(hashToken, `${relativePath} carries a content hash`);
        const actualHash = createHash('sha256').update(readFileSync(join(ROOT, relativePath))).digest('hex');
        assert.equal(actualHash.slice(0, 10), hashToken, `${relativePath} bytes match its URL`);
    }

    assert.equal(footer?.src, '/images/footers/world-hub/footer-poker-trivia-v2.png');
    assert.match(footer?.sources?.[0]?.srcSet || '', /footer-poker-trivia-v2-640\.8127741cce\.webp 640w/);
    assert.ok(
        statSync(join(ROOT, 'public/images/footers/world-hub/footer-poker-trivia-v2-640.8127741cce.webp')).size <= 80 * 1024,
        'the phone footer derivative must stay below 80KB',
    );
    assert.match(bottomNav, /\(artwork\.sources \|\| \[\]\)\.map/);
    assert.match(footerBrowserGate, /const expectedIntrinsicHeight =/);
    assert.match(footerBrowserGate, /toBeLessThanOrEqual\(1\)/);
    assert.match(footerBrowserGate, /approvedArtworkPaths/);

    assert.match(frameCard, /new IntersectionObserver/);
    assert.match(frameCard, /CARD_ART_ROOT_MARGIN = '128px 0px'/);
    assert.match(frameCard, /src=\{artReady \? image : TRANSPARENT_PIXEL\}/);
    assert.match(frameCard, /src=\{artReady \? FRAME_ASSETS\[resolvedFamily\] : TRANSPARENT_PIXEL\}/);

    const responsiveArt = read('src/components/trivia/console/ResponsiveModeArt.jsx');
    const lobby = read('src/components/trivia/TriviaLobby.jsx');
    assert.match(responsiveArt, /srcSet=\{ready \? art\.mobile\.webp : undefined\}/);
    assert.match(responsiveArt, /src=\{ready \? art\.mobile\.src : art\.preview\}/);
    assert.match(lobby, /src=\{quickStakesArtReady \? TRIVIA_QUICK_STAKES_MODE\.image : TRANSPARENT_PIXEL\}/);
});
