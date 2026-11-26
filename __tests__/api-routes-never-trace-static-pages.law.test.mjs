/**
 * AN API ROUTE OR SERVER HELPER NEVER CAUSES @vercel/nft TO TRACE NON-API PAGES (2026-11-26)
 *
 * Incident 86bcafc1-80ae-4118-afff-7fa2aa505386 (`VercelDeploymentFailed`,
 * recurrence 1, inbox events 449357, 449362, 449364): PR #3060 (43de03b0) built
 * IndexNow URLs in `pages/api/news/magazine.js` with:
 *
 *   const issueRoute = `/hub/magazine/${encodeURIComponent(slug)}`;
 *   await submitToIndexNow([`${siteUrl}/hub/magazine`, `${siteUrl}${issueRoute}`]);
 *
 * Because `siteUrl` is a dynamic runtime variable, Next.js's `@vercel/nft` file
 * tracer evaluated `${siteUrl}${issueRoute}` as a wildcard path glob matching
 * `pages/hub/magazine/*` and bundled every magazine page (including the
 * statically optimized `pages/hub/magazine/poker-rooms.js`) into the API
 * route's `.nft.json` trace. Next.js then unlinked the server JS of statically
 * optimized pages during export, so Vercel's serverless packaging step failed
 * with ENOENT across three consecutive production commits (43de03b0, aa4b466e,
 * 3d9f880d / dpl_CewLB2tbc1dpkbrgEN29az96RGYN, dpl_DwC2axuBoQ7m1cJJf5AENMBhqS8d,
 * dpl_B2ES3ddkJcqGqYmZ4Tz3uALBHdPA).
 *
 * PR #3079 fixed `pages/api/news/magazine.js` by constructing URLs via
 * `new URL(route, siteUrl).href`, and added a single-file check for that route.
 * This law test closes the class repo-wide in required Pre-Deploy Safety Checks
 * by running the exact installed `@vercel/nft` tracer across EVERY API route
 * (`pages/api/**`, `app/api/**`) and every server-importable helper directory
 * (`lib/**`, `utils/**`, `src/lib/**`, `src/services/**`, etc.) that webpack
 * bundles into serverless API functions.
 *
 * How to fix a violation:
 *   Replace `${baseUrl}${route}` or `baseUrl + route` (where `route` starts
 *   with `/hub/...`, `/poker-rooms/...`, or any non-API page path) with:
 *     new URL(route, baseUrl).href
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextFileTracer from 'next/dist/compiled/@vercel/nft/index.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const SERVER_SOURCE_DIRS = [
    'pages/api',
    'app/api',
    'lib',
    'utils',
    'src/lib',
    'src/services',
    'src/utils',
    'src/config',
    'src/content',
    'src/contracts',
    'src/data',
    'src/engine',
    'src/engines',
    'src/guards',
    'src/logic',
    'src/registry',
    'src/world',
];

const ROOT_TRACE_ALLOW = new Set(['pages', 'app', 'package.json']);

function walkSourceFiles(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'tests' || entry.name === 'node_modules') {
                continue;
            }
            walkSourceFiles(full, out);
        } else if (/\.(js|mjs|cjs|ts|tsx|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function isNonApiPageFile(relPath) {
    const norm = relPath.split(path.sep).join('/');
    if (norm.startsWith('pages/') && !norm.startsWith('pages/api/')) return true;
    if (norm.startsWith('app/') && !norm.startsWith('app/api/')) return true;
    return false;
}

/**
 * Runs Next.js's compiled `@vercel/nft` tracer on the given entry files,
 * exposing only `pages/`, `app/`, and `package.json` at repo root so glob
 * resolution checks real page routes without scanning `node_modules/` or
 * `public/`. Returns a map of offending source file -> sorted list of traced
 * non-API page files.
 */
async function findNonApiPageTraces(entryFiles, { readFile } = {}) {
    const prevCwd = process.cwd();
    const changedCwd = path.resolve(prevCwd) !== ROOT;
    if (changedCwd) process.chdir(ROOT);

    try {
        const pageOnlyReaddir = async (dir) => {
            const entries = await fs.promises.readdir(dir);
            if (path.resolve(dir) === ROOT) {
                return entries.filter((name) => ROOT_TRACE_ALLOW.has(name));
            }
            return entries;
        };

        const { fileList, reasons } = await nextFileTracer.nodeFileTrace(entryFiles, {
            base: ROOT,
            processCwd: ROOT,
            readdir: pageOnlyReaddir,
            // Isolate each entry's static/dynamic asset & path references from
            // module imports bundled by webpack (which are traced via SERVER_SOURCE_DIRS).
            resolve: async () => [],
            ...(readFile ? { readFile } : {}),
        });

        const byOffender = new Map();
        for (const traced of fileList) {
            if (!isNonApiPageFile(traced)) continue;
            const parents = [...(reasons.get(traced)?.parents || [])];
            const owners = parents.length > 0 ? parents : ['<unknown-entry>'];
            for (const owner of owners) {
                if (!byOffender.has(owner)) byOffender.set(owner, new Set());
                byOffender.get(owner).add(traced);
            }
        }

        const result = new Map();
        for (const [owner, pages] of [...byOffender.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            result.set(owner, [...pages].sort());
        }
        return result;
    } finally {
        if (changedCwd) process.chdir(prevCwd);
    }
}

test('no API route or server helper causes @vercel/nft to trace non-API pages', async () => {
    const entryFiles = SERVER_SOURCE_DIRS.flatMap((dir) => walkSourceFiles(path.join(ROOT, dir)));
    assert.ok(
        entryFiles.length >= 1000,
        `Expected >= 1000 API/server source files to trace, found only ${entryFiles.length}`,
    );

    const violations = await findNonApiPageTraces(entryFiles);
    if (violations.size > 0) {
        const lines = [...violations.entries()].map(([owner, pages]) => {
            const preview = pages.slice(0, 6).join(', ');
            const more = pages.length > 6 ? ` (+${pages.length - 6} more)` : '';
            return `  - ${owner} -> ${pages.length} non-API page(s): ${preview}${more}`;
        });
        assert.fail(
            `Found ${violations.size} server file(s) causing @vercel/nft to bundle non-API pages into serverless traces.\n` +
            `Static pages have their server JS deleted during Next.js export, causing Vercel production builds to fail with ENOENT.\n` +
            `Construct public URLs with \`new URL(route, baseUrl).href\` instead of \`\${baseUrl}\${route}\` or \`baseUrl + route\`:\n` +
            lines.join('\n'),
        );
    }
});

test('negative proof: catches the exact #3060 magazine IndexNow template-string leak', async () => {
    const target = path.join(ROOT, 'pages/api/news/magazine.js');
    const brokenFixture = [
        'export async function publishCompiledIssue(siteUrl, slug, submitToIndexNow) {',
        '    const issueRoute = `/hub/magazine/${encodeURIComponent(slug)}`;',
        '    await submitToIndexNow([`${siteUrl}/hub/magazine`, `${siteUrl}${issueRoute}`]);',
        '}',
    ].join('\n');

    const violations = await findNonApiPageTraces([target], {
        readFile: async (p) => (p === target ? brokenFixture : fs.promises.readFile(p, 'utf8')),
    });

    assert.ok(
        violations.has('pages/api/news/magazine.js'),
        'Expected detector to attribute leak to pages/api/news/magazine.js',
    );
    const traced = violations.get('pages/api/news/magazine.js');
    assert.ok(
        traced.includes('pages/hub/magazine/poker-rooms.js'),
        `Expected pages/hub/magazine/poker-rooms.js to be flagged, got: ${traced.join(', ')}`,
    );
});

test('negative proof: catches non-API page traces inside shared src/lib helpers', async () => {
    const target = path.join(ROOT, 'src/lib/seo/sitemapBuilders.mjs');
    const brokenFixture = [
        'export function buildHomeGameUrls(baseUrl, gameSlug) {',
        '    const gameRoute = `/hub/home-games/${encodeURIComponent(gameSlug)}`;',
        '    return [`${baseUrl}${gameRoute}`];',
        '}',
    ].join('\n');

    const violations = await findNonApiPageTraces([target], {
        readFile: async (p) => (p === target ? brokenFixture : fs.promises.readFile(p, 'utf8')),
    });

    assert.ok(
        violations.has('src/lib/seo/sitemapBuilders.mjs'),
        'Expected detector to attribute leak to src/lib/seo/sitemapBuilders.mjs',
    );
    const traced = violations.get('src/lib/seo/sitemapBuilders.mjs');
    assert.ok(
        traced.some((f) => f.startsWith('pages/hub/home-games/')),
        `Expected pages/hub/home-games/* pages to be flagged, got: ${traced.join(', ')}`,
    );
});

test('negative proof: catches string-concatenation leak (baseUrl + route) to top-level pages', async () => {
    const target = path.join(ROOT, 'pages/api/health.js');
    const brokenFixture = [
        'export function buildRoomUrls(origin, slug) {',
        '    const roomRoute = `/poker-rooms/${encodeURIComponent(slug)}`;',
        '    return [origin + roomRoute];',
        '}',
    ].join('\n');

    const violations = await findNonApiPageTraces([target], {
        readFile: async (p) => (p === target ? brokenFixture : fs.promises.readFile(p, 'utf8')),
    });

    assert.ok(
        violations.has('pages/api/health.js'),
        'Expected detector to attribute leak to pages/api/health.js',
    );
    const traced = violations.get('pages/api/health.js');
    assert.ok(
        traced.some((f) => f.startsWith('pages/poker-rooms/')),
        `Expected pages/poker-rooms/* pages to be flagged, got: ${traced.join(', ')}`,
    );
});

test('positive control: constructing public URLs with new URL(route, baseUrl).href traces zero non-API pages', async () => {
    const target = path.join(ROOT, 'pages/api/news/magazine.js');
    const safeFixture = [
        'export async function publishCompiledIssue(siteUrl, slug, submitToIndexNow) {',
        '    const issueRoute = `/hub/magazine/${encodeURIComponent(slug)}`;',
        '    const newsstandUrl = new URL("/hub/magazine", siteUrl);',
        '    const publishedIssueUrl = new URL(issueRoute, siteUrl);',
        '    await submitToIndexNow([newsstandUrl.href, publishedIssueUrl.href]);',
        '}',
    ].join('\n');

    const violations = await findNonApiPageTraces([target], {
        readFile: async (p) => (p === target ? safeFixture : fs.promises.readFile(p, 'utf8')),
    });

    assert.equal(violations.size, 0, `Expected 0 traced non-API pages for new URL(...), got ${violations.size}`);
});

test('build:vercel isolates pre-build unit tests under NODE_ENV=test without affecting next build', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const buildVercel = pkg.scripts?.['build:vercel'] ?? '';
    const segments = buildVercel.split('&&').map((s) => s.trim()).filter(Boolean);
    assert.ok(segments.length > 0, 'package.json must define scripts["build:vercel"]');

    const nextBuildSegments = segments.filter((s) => /\bnext build\b/.test(s));
    assert.equal(nextBuildSegments.length, 1, 'build:vercel must invoke next build exactly once');
    assert.doesNotMatch(
        nextBuildSegments[0],
        /\bNODE_ENV=test\b/,
        'next build itself must stay in production mode (never NODE_ENV=test)',
    );

    const unprotected = [];
    for (const seg of segments) {
        const isTestCommand = /\bnpm run test:/.test(seg) || /\bnode\b[^&]*\s--test\b/.test(seg);
        if (!isTestCommand) continue;
        if (/^NODE_ENV=test\s+/.test(seg)) continue;

        // Allow a single-file `node --test <file>` only when that file explicitly sets NODE_ENV = 'test'.
        const singleFileMatch = seg.match(/^node\s+--test\s+([^\s]+\.mjs)$/);
        if (singleFileMatch) {
            const fullPath = path.join(ROOT, singleFileMatch[1]);
            const source = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
            if (/process\.env\.NODE_ENV\s*=\s*['"]test['"]/.test(source)) continue;
        }
        unprotected.push(seg);
    }

    assert.deepEqual(
        unprotected,
        [],
        `build:vercel runs under Vercel's NODE_ENV=production, where React's act(...) throws unconditionally.\n` +
        `Prefix every pre-build test command in scripts["build:vercel"] with \`NODE_ENV=test\` (as happened on #3084 / dpl_GEHCsnjxzDhJSiawYYBiAftQzXkf):\n` +
        unprotected.map((s) => `  - ${s}`).join('\n'),
    );
});
