/**
 * PERSONAL ASSISTANT — no-undef BUILD GUARD
 * ─────────────────────────────────────────────────────────────────────────
 * An undefined identifier in a React component does not fail the Next.js
 * build. It throws at render time, React unmounts the tree, and the user
 * gets a white screen. This surface has shipped that bug twice:
 *
 *   - `user is not defined`  — white-screened the Leak Finder
 *     (pages/hub/personal-assistant/leaks.js) for every logged-in visitor.
 *   - `M`, `effStack`, `coachStreak` — undefined identifiers that crashed
 *     the GTO Sandbox after a refactor moved state out of the component.
 *
 * Both were one ESLint rule away from being caught at build time. This test
 * runs exactly that rule — `no-undef` — over the Personal Assistant surface
 * and fails the build on any hit.
 *
 * WHY ITS OWN CONFIG:
 * It deliberately does NOT read eslint.config.js / .eslintrc. `next lint`
 * config drifts, rules get relaxed to unblock a deploy, and a plugin that
 * fails to load can disable a whole config. This guard builds its own
 * minimal flat config in-process (`overrideConfigFile: true`) with only the
 * rules below enabled, so no amount of lint churn elsewhere can weaken it.
 *
 * TWO RULES, BECAUSE `no-undef` ALONE DOES NOT RELIABLY COVER JSX:
 * whether core `no-undef` flags `<Foo />` with no Foo in scope depends on
 * whether the parser creates a scope reference for the JSXIdentifier — which
 * has varied across espree/eslint-scope versions. An unimported component is
 * exactly the kind of thing a refactor drops, and it white-screens on render,
 * so this guard does not want that to be an accident of the installed lint
 * version. `react/jsx-no-undef` checks it explicitly and unconditionally, and
 * eslint-plugin-react is already in the tree via eslint-config-next, so no new
 * dependency is needed. If the plugin cannot be resolved the guard still runs
 * `no-undef` and reports the reduced coverage rather than failing — see
 * `jsxCovered` below and the dedicated coverage test further down.
 *
 * Results are filtered to `ruleId` in {'no-undef', 'react/jsx-no-undef'}.
 * Because this config loads only those rules, inline
 * `eslint-disable`/`eslint-disable-next-line` comments naming rules we do not
 * load are reported as separate problems — those are ignored, they are not our
 * concern.
 *
 * The test skips gracefully when eslint cannot be imported (a checkout with
 * no node_modules), and only lints target paths that actually exist, so it
 * behaves in a partial checkout instead of exploding.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

// The Personal Assistant surface: pages, API routes, hooks, libs and the
// shared chrome that renders on top of it.
const TARGETS = [
    'pages/hub/personal-assistant',
    'pages/sandbox',
    'pages/api/sandbox',
    'pages/api/assistant',
    'src/components/sandbox',
    'src/components/jarvis/DashboardOverview.jsx',
    'src/components/ui/HamburgerMenu.jsx',
    'src/components/ui/BottomNavBar.jsx',
    'src/config/hamburgerMenus.js',
    'src/hooks/useAssistant.js',
    'src/lib/sandbox',
];

// espree cannot parse TypeScript, and this surface is JS-only by convention.
const LINT_EXTS = ['.js', '.jsx', '.mjs', '.cjs'];

// Generous browser + node globals. Anything genuinely global belongs here;
// anything NOT here and not declared in the file is the bug we are hunting.
const GLOBALS = {};
for (const name of [
    // ── browser / DOM
    'window', 'document', 'navigator', 'location', 'history', 'screen',
    'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'crypto',
    'fetch', 'Headers', 'Request', 'Response', 'FormData', 'AbortController',
    'AbortSignal', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader',
    'WebSocket', 'EventSource', 'BroadcastChannel', 'MessageChannel',
    'Worker', 'SharedWorker', 'ServiceWorker', 'Notification', 'PushManager',
    'Image', 'Audio', 'Option', 'Event', 'CustomEvent', 'MouseEvent',
    'KeyboardEvent', 'TouchEvent', 'PointerEvent', 'DragEvent', 'FocusEvent',
    'InputEvent', 'WheelEvent', 'CloseEvent', 'MessageEvent', 'ErrorEvent',
    'ProgressEvent', 'StorageEvent', 'PopStateEvent', 'HashChangeEvent',
    'Element', 'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement',
    'HTMLInputElement', 'HTMLVideoElement', 'HTMLAudioElement', 'Node',
    'NodeList', 'DOMParser', 'XMLHttpRequest', 'XMLSerializer',
    'CanvasRenderingContext2D', 'Path2D', 'ImageData', 'OffscreenCanvas',
    'ResizeObserver', 'IntersectionObserver', 'MutationObserver',
    'PerformanceObserver', 'performance', 'requestAnimationFrame',
    'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
    'matchMedia', 'getComputedStyle', 'scrollTo', 'scrollBy', 'alert',
    'confirm', 'prompt', 'open', 'close', 'print', 'getSelection',
    'devicePixelRatio', 'innerWidth', 'innerHeight', 'visualViewport',
    'speechSynthesis', 'SpeechSynthesisUtterance', 'MediaRecorder',
    'AudioContext', 'webkitAudioContext', 'DeviceOrientationEvent',
    'structuredClone', 'reportError', 'queueMicrotask', 'atob', 'btoa',
    'CSS', 'Range', 'Selection', 'Clipboard', 'ClipboardItem',
    // ── timers (shared browser/node)
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'setImmediate', 'clearImmediate',
    // ── node
    'process', 'Buffer', 'global', 'globalThis', '__dirname', '__filename',
    'require', 'module', 'exports', 'console', 'URLPattern', 'TextEncoder',
    'TextDecoder', 'ReadableStream', 'WritableStream', 'TransformStream',
    'CompressionStream', 'DecompressionStream',
]) {
    GLOBALS[name] = 'readonly';
}

// ─────────────────────────────────────────────────────────────────────────
// Target expansion
// ─────────────────────────────────────────────────────────────────────────

function walkFiles(abs, out) {
    let stat;
    try {
        stat = fs.statSync(abs);
    } catch {
        return out;
    }
    if (stat.isFile()) {
        if (LINT_EXTS.includes(path.extname(abs))) out.push(abs);
        return out;
    }
    if (!stat.isDirectory()) return out;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walkFiles(path.join(abs, entry.name), out);
    }
    return out;
}

/** Only the TARGETS that exist in this checkout, expanded to lintable files. */
function collectFiles() {
    const files = [];
    const present = [];
    const absent = [];
    for (const rel of TARGETS) {
        const abs = path.join(REPO_ROOT, rel);
        if (!fs.existsSync(abs)) { absent.push(rel); continue; }
        present.push(rel);
        walkFiles(abs, files);
    }
    return { files: [...new Set(files)].sort(), present, absent };
}

function rel(abs) {
    return path.relative(REPO_ROOT, abs);
}

// ─────────────────────────────────────────────────────────────────────────
// ESLint (v9 flat config, Node API)
// ─────────────────────────────────────────────────────────────────────────

async function loadESLint() {
    try {
        const mod = await import('eslint');
        return mod.ESLint ?? mod.default?.ESLint ?? null;
    } catch {
        return null;
    }
}

/**
 * eslint-plugin-react, if it is resolvable. It ships as a transitive dep of
 * eslint-config-next (a devDependency of this repo), so this normally succeeds
 * without adding anything to package.json. Returns null rather than throwing so
 * a checkout without it still gets `no-undef` coverage.
 */
async function loadReactPlugin() {
    try {
        const mod = await import('eslint-plugin-react');
        const plugin = mod.default ?? mod;
        // Only useful if it actually carries the rule we want.
        return plugin?.rules?.['jsx-no-undef'] ? plugin : null;
    } catch {
        return null;
    }
}

/** ruleIds this guard treats as a hit. */
const UNDEF_RULES = new Set(['no-undef', 'react/jsx-no-undef']);

function buildLinter(ESLint, reactPlugin) {
    return new ESLint({
        cwd: REPO_ROOT,
        // `true` = do not read any eslint.config.* from disk. This guard owns
        // its config so unrelated lint changes cannot switch the rule off.
        overrideConfigFile: true,
        errorOnUnmatchedPattern: false,
        overrideConfig: [
            {
                files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
                languageOptions: {
                    ecmaVersion: 'latest',
                    sourceType: 'module',
                    globals: GLOBALS,
                    parserOptions: {
                        ecmaFeatures: { jsx: true },
                    },
                },
                linterOptions: {
                    reportUnusedDisableDirectives: false,
                },
                // Core no-undef is blind to JSX element names; react/jsx-no-undef
                // is the half that catches `<Foo />` with no Foo in scope.
                ...(reactPlugin ? { plugins: { react: reactPlugin } } : {}),
                rules: {
                    'no-undef': 'error',
                    ...(reactPlugin ? { 'react/jsx-no-undef': 'error' } : {}),
                },
            },
        ],
    });
}

let cached = null;
async function lintSurface() {
    if (cached) return cached;
    const ESLint = await loadESLint();
    if (!ESLint) return (cached = { skipped: 'eslint could not be imported (no node_modules?)' });

    const { files, present, absent } = collectFiles();
    if (files.length === 0) {
        return (cached = { skipped: 'no Personal Assistant source files present in this checkout' });
    }

    const reactPlugin = await loadReactPlugin();
    const eslint = buildLinter(ESLint, reactPlugin);
    const results = await eslint.lintFiles(files);

    const undef = [];
    const fatal = [];
    for (const r of results) {
        for (const m of r.messages || []) {
            if (UNDEF_RULES.has(m.ruleId)) {
                undef.push(`${rel(r.filePath)}:${m.line}:${m.column}  ${m.message}`);
            } else if (m.fatal) {
                fatal.push(`${rel(r.filePath)}:${m.line ?? 0}:${m.column ?? 0}  ${m.message}`);
            }
            // Every other ruleId (including the null / unknown-rule problems
            // produced by inline eslint-disable comments naming rules this
            // minimal config does not load) is deliberately ignored.
        }
    }
    undef.sort();
    fatal.sort();
    return (cached = {
        undef, fatal, fileCount: files.length, present, absent,
        // false = eslint-plugin-react was not resolvable, so `<Foo />` with no
        // Foo in scope was NOT checked on this run.
        jsxCovered: !!reactPlugin,
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

test('Personal Assistant surface has no undefined identifiers (eslint no-undef)', async (t) => {
    const out = await lintSurface();
    if (out.skipped) {
        t.skip(`${out.skipped} — no-undef was NOT verified.`);
        return;
    }

    assert.deepEqual(
        out.undef,
        [],
        `${out.undef.length} undefined identifier(s) on the Personal Assistant surface.\n`
        + 'Each one throws at render time and white-screens the page — this is the\n'
        + 'exact failure mode that took out the Leak Finder and the GTO Sandbox.\n\n'
        + out.undef.map((u) => `  ${u}`).join('\n')
        + '\n\nFix the reference (import it, destructure it from props/hooks, or declare\n'
        + 'it). Do NOT silence this with an eslint-disable comment.',
    );
});

test('JSX element names are covered too (react/jsx-no-undef is loaded)', async (t) => {
    const out = await lintSurface();
    if (out.skipped) {
        t.skip(`${out.skipped} — JSX coverage was NOT verified.`);
        return;
    }
    if (!out.jsxCovered) {
        // Not a regression in the source — the plugin simply is not installed
        // here. Say so loudly instead of silently running at half coverage.
        t.skip(
            'eslint-plugin-react could not be resolved, so `<Foo />` with no Foo in\n'
            + 'scope was NOT checked on this run (core no-undef never sees JSX element\n'
            + 'names). Install devDependencies — eslint-config-next brings the plugin.',
        );
        return;
    }
    assert.ok(out.jsxCovered);
});

test('every Personal Assistant file the guard lints actually parses', async (t) => {
    const out = await lintSurface();
    if (out.skipped) {
        t.skip(`${out.skipped} — parse coverage was NOT verified.`);
        return;
    }

    assert.deepEqual(
        out.fatal,
        [],
        `${out.fatal.length} file(s) on the Personal Assistant surface could not be parsed.\n`
        + 'A file that does not parse is a file no-undef never ran on — the guard above\n'
        + 'is blind to it.\n\n'
        + out.fatal.map((f) => `  ${f}`).join('\n')
        + '\n\nIf the syntax is legitimate and simply newer than this config understands,\n'
        + 'widen languageOptions in __tests__/pa-no-undef.test.mjs — do not delete this test.',
    );
});

test('no-undef is not suppressed by inline comments on this surface', () => {
    const { files } = collectFiles();
    if (files.length === 0) return; // partial checkout — nothing to police

    const suppressed = [];
    // eslint-disable / eslint-disable-next-line / eslint-disable-line that
    // names no-undef, or a blanket disable with no rule list at all.
    const NAMED = /eslint-disable(?:-next-line|-line)?\s+[^*\n]*\bno-undef\b/;
    const BLANKET = /\/\*\s*eslint-disable\s*\*\//;
    for (const abs of files) {
        const src = fs.readFileSync(abs, 'utf8');
        if (NAMED.test(src)) suppressed.push(`${rel(abs)} — disables no-undef explicitly`);
        else if (BLANKET.test(src)) suppressed.push(`${rel(abs)} — blanket /* eslint-disable */ turns off every rule`);
    }
    suppressed.sort();

    assert.deepEqual(
        suppressed,
        [],
        'no-undef is being suppressed inline, which defeats the guard above:\n\n'
        + suppressed.map((s) => `  ${s}`).join('\n')
        + '\n\nAn undefined identifier still white-screens the page whether or not the\n'
        + 'linter is allowed to mention it. Fix the reference instead.',
    );
});

test('the guard is pointed at a Personal Assistant surface that exists', () => {
    const { files, present, absent } = collectFiles();
    if (present.length === 0) {
        // Nothing of the surface is checked out — a slice/worktree, not a regression.
        return;
    }
    assert.ok(
        files.length > 0,
        `Target paths exist (${present.join(', ')}) but expanded to zero lintable files.\n`
        + `This guard would silently pass. Absent targets: ${absent.join(', ') || 'none'}`,
    );
});
