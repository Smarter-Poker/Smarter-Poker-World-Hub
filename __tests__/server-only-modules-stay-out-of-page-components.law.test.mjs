/**
 * A PAGE COMPONENT NEVER REFERENCES A SERVER-ONLY MODULE (2026-11-25)
 *
 * Production alert 449069 (`VercelDeploymentFailed`): #3010 made the Weekly
 * Wire edition page call `emailImageProxy.buildSpotCardImageUrl` from inside
 * the React component. `emailImageProxy.mjs` imports `node:crypto`, `sharp`
 * and (through `security/fetchableUrl.js`) `node:dns/promises`. Next.js only
 * drops a page import from the browser bundle when nothing but
 * getServerSideProps / getStaticProps uses it, so the component reference
 * pulled the whole module into the client build and webpack failed with
 * `UnhandledSchemeError: Reading from "node:dns/promises"`. Two production
 * deployments (dpl_6b4YjEADH61aXZP22zyJE1JkTVBQ, dpl_4x4tBdA3KHjKsjddrWjfYdFnpRcb)
 * went to ERROR and smarter.poker stayed on #3008.
 *
 * The rule: for every page under pages/ (API routes excluded), a binding
 * imported from a local module that transitively imports a `node:`-scheme
 * builtin or `sharp` may be used only outside
 * the default-exported component. Compute the value on the server and pass
 * it as a prop instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// Bare `crypto`, `path` and the like are polyfilled or stubbed by Next's client
// webpack config, so they are not what breaks the build. A `node:`-scheme
// specifier is never handled (UnhandledSchemeError), and `sharp` is a native
// binary. Those two are the build-breakers this law measures.
const SERVER_ONLY_PACKAGES = new Set(['sharp']);
const IMPORT_RE = /(?:^|\n)\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const SIDE_IMPORT_RE = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXTENSIONS = ['', '.js', '.mjs', '.jsx', '.ts', '.tsx', '/index.js', '/index.mjs', '/index.ts'];

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (path.relative(ROOT, full).split(path.sep).join('/') === 'pages/api') continue;
            walk(full, out);
        } else if (/\.(jsx?|tsx?|mjs)$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function resolveLocal(fromFile, spec) {
    if (!spec.startsWith('.')) return null;
    const base = path.resolve(path.dirname(fromFile), spec);
    for (const ext of EXTENSIONS) {
        const candidate = base + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
}

function specifiersOf(source) {
    const specs = [];
    for (const m of source.matchAll(IMPORT_RE)) specs.push(m[2]);
    for (const m of source.matchAll(SIDE_IMPORT_RE)) specs.push(m[1]);
    for (const m of source.matchAll(REQUIRE_RE)) specs.push(m[1]);
    return specs;
}

const serverOnlyCache = new Map();
function needsServer(file, seen = new Set()) {
    if (serverOnlyCache.has(file)) return serverOnlyCache.get(file);
    if (seen.has(file)) return null;
    seen.add(file);
    let reason = null;
    for (const spec of specifiersOf(fs.readFileSync(file, 'utf8'))) {
        if (spec.startsWith('node:') || SERVER_ONLY_PACKAGES.has(spec)) {
            reason = `${path.relative(ROOT, file)} imports ${spec}`;
            break;
        }
        const local = resolveLocal(file, spec);
        if (local) {
            const inner = needsServer(local, seen);
            if (inner) {
                reason = `${path.relative(ROOT, file)} -> ${inner}`;
                break;
            }
        }
    }
    serverOnlyCache.set(file, reason);
    return reason;
}

function bindingsOf(clause) {
    const names = [];
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) names.push(ns[1]);
    const def = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (def) names.push(def[1]);
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
        for (const part of named[1].split(',')) {
            const p = part.trim();
            if (!p) continue;
            const alias = p.split(/\s+as\s+/);
            names.push((alias[1] || alias[0]).trim());
        }
    }
    return names;
}

function componentBody(source) {
    const start = source.search(/\nexport\s+default\s+/);
    if (start < 0) return '';
    const rest = source.slice(start + 1);
    const next = rest.slice(1).search(/\nexport\s+(?:async\s+)?(?:function|const|let)\s/);
    return next < 0 ? rest : rest.slice(0, next + 1);
}

export function findViolations(files) {
    const violations = [];
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        const body = componentBody(source);
        if (!body) continue;
        for (const m of source.matchAll(IMPORT_RE)) {
            const local = resolveLocal(file, m[2]);
            if (!local) continue;
            const reason = needsServer(local);
            if (!reason) continue;
            for (const name of bindingsOf(m[1].trim())) {
                if (new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, '\\$')}\\b`).test(body)) {
                    violations.push(`${path.relative(ROOT, file)}: component uses "${name}" (${reason})`);
                }
            }
        }
    }
    return violations;
}

test('no page component references a binding from a server-only module', () => {
    const violations = findViolations(walk(path.join(ROOT, 'pages')));
    assert.deepEqual(violations, [], violations.join('\n'));
});

test('the Weekly Wire edition page receives its spot card URL as a prop', () => {
    const page = fs.readFileSync(path.join(ROOT, 'pages/hub/wire/[edition].js'), 'utf8');
    assert.match(page, /imageUrl:\s*buildSpotCardImageUrl\(spot\.slug,\s*\{\s*relative:\s*true\s*\}\)/);
    assert.doesNotMatch(componentBody(page), /buildSpotCardImageUrl|emailImageProxy/);
});
