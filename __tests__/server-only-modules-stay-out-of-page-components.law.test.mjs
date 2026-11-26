/**
 * A PAGE COMPONENT OR CLIENT COMPONENT NEVER REFERENCES A SERVER-ONLY MODULE (2026-11-25)
 *
 * Production alerts 449069 & 449081 (`VercelDeploymentFailed`): #3010 made the
 * Weekly Wire edition page call `emailImageProxy.buildSpotCardImageUrl` from
 * inside the React component. `emailImageProxy.mjs` imports `node:crypto`,
 * `sharp` and (through `security/fetchableUrl.js`) `node:dns/promises`. Next.js
 * only drops a page import from the browser bundle when nothing but
 * getServerSideProps / getStaticProps / getStaticPaths (and helpers reachable
 * only from them) uses it, so the component reference pulled the whole module
 * into the client build and webpack failed with:
 *   `UnhandledSchemeError: Reading from "node:dns/promises"`
 * Two production deployments (dpl_6b4YjEADH61aXZP22zyJE1JkTVBQ,
 * dpl_4x4tBdA3KHjKsjddrWjfYdFnpRcb) went to ERROR.
 *
 * The hardened rules:
 *   1. For every non-API page under `pages/`, a binding imported directly from
 *      a server-only specifier (`node:*`, `sharp`, `pg`, `ioredis`) or from a
 *      local module (relative or `@/`) that transitively imports/re-exports one
 *      may NEVER be referenced by the default-exported React component OR by
 *      any local helper function reachable from it.
 *   2. No file under `src/components/` may directly or transitively import a
 *      server-only specifier (`node:*`, `sharp`, `pg`, `ioredis`).
 *   3. Negative proofs verify the detector catches direct component leaks,
 *      transitive component leaks (exact #3010 pattern), and helper-indirect
 *      leaks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER_ONLY_PACKAGES = new Set(['sharp', 'pg', 'ioredis']);
const IMPORT_RE = /(?:^|\n)\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const EXPORT_FROM_RE = /(?:^|\n)\s*export\s+(?:\*|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/g;
const SIDE_IMPORT_RE = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXTENSIONS = ['', '.js', '.mjs', '.jsx', '.ts', '.tsx', '/index.js', '/index.mjs', '/index.ts', '/index.jsx', '/index.tsx'];
const SSR_EXPORTS = new Set(['getServerSideProps', 'getStaticProps', 'getStaticPaths']);

function walk(dir, { excludeRel = null, excludeTests = false } = {}, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (excludeTests && entry.name === '__tests__') continue;
            if (excludeRel && path.relative(ROOT, full).split(path.sep).join('/') === excludeRel) continue;
            walk(full, { excludeRel, excludeTests }, out);
        } else if (/\.(jsx?|tsx?|mjs)$/.test(entry.name)) {
            if (excludeTests && /\.test\./.test(entry.name)) continue;
            out.push(full);
        }
    }
    return out;
}

function resolveLocal(fromFile, spec) {
    let base;
    if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
    else if (spec.startsWith('@/')) base = path.resolve(ROOT, spec.slice(2));
    else return null;
    for (const ext of EXTENSIONS) {
        const candidate = base + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
}

function specifiersOf(source) {
    const specs = [];
    for (const m of source.matchAll(IMPORT_RE)) specs.push(m[2]);
    for (const m of source.matchAll(EXPORT_FROM_RE)) specs.push(m[1]);
    for (const m of source.matchAll(SIDE_IMPORT_RE)) specs.push(m[1]);
    for (const m of source.matchAll(REQUIRE_RE)) specs.push(m[1]);
    return specs;
}

function isServerOnlySpec(spec) {
    return spec.startsWith('node:') || SERVER_ONLY_PACKAGES.has(spec);
}

const serverOnlyCache = new Map();
function needsServer(file, seen = new Set()) {
    if (serverOnlyCache.has(file)) return serverOnlyCache.get(file);
    if (seen.has(file)) return null;
    seen.add(file);
    let reason = null;
    for (const spec of specifiersOf(fs.readFileSync(file, 'utf8'))) {
        if (isServerOnlySpec(spec)) {
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

/** Extract top-level `function name(...) { ... }` bodies (excluding SSR exports). */
function extractTopLevelFunctions(source) {
    const fns = new Map();
    const re = /(?:^|\n)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        const name = m[1];
        if (SSR_EXPORTS.has(name)) continue;
        const braceStart = source.indexOf('{', m.index + m[0].length);
        if (braceStart < 0) continue;
        let depth = 0;
        let inSingle = false;
        let inDouble = false;
        let inTemplate = false;
        let escaped = false;
        let end = source.length;
        for (let i = braceStart; i < source.length; i++) {
            const ch = source[i];
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (inSingle) { if (ch === "'") inSingle = false; continue; }
            if (inDouble) { if (ch === '"') inDouble = false; continue; }
            if (inTemplate) { if (ch === '`') inTemplate = false; continue; }
            if (ch === "'") { inSingle = true; continue; }
            if (ch === '"') { inDouble = true; continue; }
            if (ch === '`') { inTemplate = true; continue; }
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) { end = i + 1; break; }
            }
        }
        fns.set(name, source.slice(braceStart, end));
    }
    return fns;
}

function componentBody(source) {
    const start = source.search(/(?:^|\n)export\s+default\s+/);
    if (start < 0) return '';
    const rest = source.slice(start);
    const next = rest.slice(1).search(/\nexport\s+(?:async\s+)?(?:function|const|let)\s/);
    return next < 0 ? rest : rest.slice(0, next + 1);
}

function identifierUsedIn(text, name) {
    return new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, '\\$')}\\b`).test(text);
}

/** Collect component body plus every local top-level helper transitively called from it. */
function clientReachableText(source) {
    const body = componentBody(source);
    if (!body) return '';
    const fns = extractTopLevelFunctions(source);
    const visited = new Set();
    const chunks = [body];
    const queue = [body];
    while (queue.length) {
        const text = queue.shift();
        for (const [fnName, fnBody] of fns) {
            if (visited.has(fnName)) continue;
            if (identifierUsedIn(text, fnName)) {
                visited.add(fnName);
                chunks.push(fnBody);
                queue.push(fnBody);
            }
        }
    }
    return chunks.join('\n');
}

export function findPageViolationsInSource(filePath, source) {
    const violations = [];
    const clientCode = clientReachableText(source);
    if (!clientCode) return violations;
    for (const m of source.matchAll(IMPORT_RE)) {
        const spec = m[2];
        let reason = null;
        if (isServerOnlySpec(spec)) {
            reason = `${path.relative(ROOT, filePath)} imports ${spec}`;
        } else {
            const local = resolveLocal(filePath, spec);
            if (local) reason = needsServer(local);
        }
        if (!reason) continue;
        for (const name of bindingsOf(m[1].trim())) {
            if (identifierUsedIn(clientCode, name)) {
                violations.push(`${path.relative(ROOT, filePath)}: client-reachable code uses "${name}" (${reason})`);
            }
        }
    }
    return violations;
}

export function findPageViolations(files) {
    const violations = [];
    for (const file of files) {
        violations.push(...findPageViolationsInSource(file, fs.readFileSync(file, 'utf8')));
    }
    return violations;
}

export function findComponentViolations(files) {
    const violations = [];
    for (const file of files) {
        const reason = needsServer(file);
        if (reason) violations.push(`${path.relative(ROOT, file)}: client component depends on server-only module (${reason})`);
    }
    return violations;
}

test('no page component (or helper reachable from it) references a server-only module', () => {
    const pages = walk(path.join(ROOT, 'pages'), { excludeRel: 'pages/api' });
    assert.ok(pages.length >= 400, `expected full pages/ scan, got ${pages.length}`);
    const violations = findPageViolations(pages);
    assert.deepEqual(violations, [], violations.join('\n'));
});

test('no file under src/components/ directly or transitively imports node:* or sharp/pg/ioredis', () => {
    const components = walk(path.join(ROOT, 'src/components'), { excludeTests: true });
    assert.ok(components.length >= 500, `expected full src/components/ scan, got ${components.length}`);
    const violations = findComponentViolations(components);
    assert.deepEqual(violations, [], violations.join('\n'));
});

test('the Weekly Wire edition page receives its spot card URL as a prop', () => {
    const page = fs.readFileSync(path.join(ROOT, 'pages/hub/wire/[edition].js'), 'utf8');
    assert.match(page, /imageUrl:\s*buildSpotCardImageUrl\(spot\.slug,\s*\{\s*relative:\s*true\s*\}\)/);
    assert.doesNotMatch(clientReachableText(page), /buildSpotCardImageUrl|emailImageProxy/);
});

test('detector catches transitive (#3010), direct node:*, and helper-indirect leaks', () => {
    const wirePath = path.join(ROOT, 'pages/hub/wire/[edition].js');

    const transitiveLeak = `
import * as emailImageProxy from '../../../src/lib/newsletter/emailImageProxy.mjs';
export default function Page({ spot }) {
  return <img src={emailImageProxy.buildSpotCardImageUrl(spot.slug)} />;
}
`;
    assert.equal(findPageViolationsInSource(wirePath, transitiveLeak).length, 1);

    const directLeak = `
import crypto from 'node:crypto';
export default function Page() {
  return <div>{crypto.randomUUID()}</div>;
}
`;
    assert.equal(findPageViolationsInSource(wirePath, directLeak).length, 1);

    const helperLeak = `
import { buildSpotCardImageUrl } from '../../../src/lib/newsletter/emailImageProxy.mjs';
function helperUsedByClient(slug) {
  return buildSpotCardImageUrl(slug, { relative: true });
}
export default function Page({ slug }) {
  return <img src={helperUsedByClient(slug)} />;
}
`;
    assert.equal(findPageViolationsInSource(wirePath, helperLeak).length, 1);

    const ssrOnlyHelper = `
import { buildSpotCardImageUrl } from '../../../src/lib/newsletter/emailImageProxy.mjs';
function serializeOnServer(slug) {
  return { imageUrl: buildSpotCardImageUrl(slug, { relative: true }) };
}
export default function Page({ imageUrl }) {
  return <img src={imageUrl} />;
}
export async function getServerSideProps() {
  return { props: serializeOnServer('test') };
}
`;
    assert.deepEqual(findPageViolationsInSource(wirePath, ssrOnlyHelper), []);
});
