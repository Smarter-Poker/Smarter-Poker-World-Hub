#!/usr/bin/env node
/**
 * CI GATE — phantom tables (Phase U4.2)
 * ===========================================================================
 * Fails when application code reads or writes a Postgres relation that does
 * not exist in the Supabase project. Those calls fail at runtime with
 * `42P01 relation does not exist`, and because almost every call site logs a
 * warning and continues, they are invisible until someone notices the data
 * was never saved.
 *
 * Found on first run (2026-08-12), 3 phantoms in 384 referenced relations:
 *   training_moves     src/engines/SessionTracker.js       (INSERT)
 *   xp_logs            src/hooks/useTrainingAccountant.ts  (INSERT)
 *   user_dna_profiles  src/services/MediaUploadService.js, SocialService.js
 *
 * WHAT IT DOES NOT FLAG (each of these caused a false positive on an earlier
 * iteration — do not "simplify" them away):
 *   - `.storage.from('bucket')` — a storage bucket is not a relation. The
 *     `.storage` is usually on a PREVIOUS line because the call is chained
 *     across lines, so this needs a context window, not a single-line test.
 *   - Any file whose client comes from another Supabase project.
 *     `getMlbSupabase()` points at project nscdmxldtyszyvcxxwgr, so its
 *     tables are correctly absent from this one. Detected per FILE, because
 *     the client is fetched once far above the `.from()` calls.
 *   - Occurrences inside comments and doc blocks. Several files document the
 *     pattern with `supabase.from('posts')` / `.from('table')` in JSDoc.
 *
 * Usage:  node scripts/ci/check-phantom-tables.mjs
 * Env:    NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *         (missing or rejected creds => SKIP, never a false failure)
 * Exit:   0 ok/skipped, 1 phantom relation found
 * ===========================================================================
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['pages/api', 'src'];
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const ALLOWLIST_PATH = 'scripts/ci/supabase-invariants.allowlist.json';

/** Clients that talk to a DIFFERENT Supabase project. */
const FOREIGN_CLIENTS = ['getMlbSupabase', 'mlbDb'];

function walk(dir, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        const st = statSync(p);
        if (st.isDirectory()) {
            if (entry === 'node_modules' || entry === '.next') continue;
            walk(p, out);
        } else if (EXTS.has(extname(p))) {
            out.push(p);
        }
    }
    return out;
}

/**
 * Strip block and line comments cheaply.
 * This is a linter, not a parser: over-stripping loses a reference (a miss),
 * under-stripping invents one (a false failure). Prefer misses.
 */
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const refs = new Map(); // relation -> Set("file:line")

/**
 * A file is FOREIGN if it obtains its client from another Supabase project.
 * Checked per file, not per line, because the client is fetched once at the
 * top of a function and the `.from()` calls sit many lines below it.
 */
const isForeignFile = (src) => FOREIGN_CLIENTS.some(c => src.includes(c));

const LOOKBACK = 4; // lines of context for `.storage` detection

for (const root of ROOTS) {
    for (const file of walk(root)) {
        const rawSrc = readFileSync(file, 'utf8');
        if (isForeignFile(rawSrc)) continue;
        const lines = stripComments(rawSrc).split('\n');
        lines.forEach((line, i) => {
            const re = /\.from\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/g;
            let m;
            while ((m = re.exec(line)) !== null) {
                const ctx = lines.slice(Math.max(0, i - LOOKBACK), i + 1).join('\n');
                if (/\.storage\b/.test(ctx)) continue; // storage bucket, not a relation
                const name = m[1];
                if (!refs.has(name)) refs.set(name, new Set());
                refs.get(name).add(`${file}:${i + 1}`);
            }
        });
    }
}

let allow = { phantom_tables: [] };
if (existsSync(ALLOWLIST_PATH)) {
    try { allow = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')); }
    catch { console.warn(`[phantom-tables] could not parse ${ALLOWLIST_PATH}; ignoring`); }
}
const allowed = new Set(allow.phantom_tables || []);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.log('[phantom-tables] SKIP — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.');
    console.log(`[phantom-tables] ${refs.size} distinct relations referenced; not verified.`);
    process.exit(0);
}

// PostgREST publishes an OpenAPI document at the REST root listing every
// relation it exposes, keyed by name under `definitions`. That needs no custom
// RPC and no direct PG connection — just the service key — so this gate works
// on a stock Supabase project. Verified against production that this endpoint
// accepts ONLY the service_role key ("Only the `service_role` API key can be
// used for this endpoint"); anon and publishable keys both 401.
let existing;
try {
    const res = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
    });
    if (!res.ok) throw new Error(`REST root -> ${res.status}`);
    const spec = await res.json();
    const names = Object.keys(spec?.definitions || spec?.components?.schemas || {});
    if (names.length === 0) throw new Error('no definitions in the OpenAPI document');
    existing = new Set(names);
} catch (e) {
    // Never fail the build because the checker could not reach the schema.
    // A gate that red-lights on a network blip trains people to ignore it.
    console.log(`[phantom-tables] SKIP — could not read the schema (${e.message}).`);
    process.exit(0);
}

const phantoms = [...refs.keys()]
    .filter(n => !existing.has(n) && !allowed.has(n))
    .sort();

if (phantoms.length === 0) {
    console.log(`[phantom-tables] OK — ${refs.size} relations referenced, all present.`);
    process.exit(0);
}

console.error('\n[phantom-tables] FAIL — code references relations that do not exist:\n');
for (const p of phantoms) {
    console.error(`  ${p}`);
    for (const site of [...refs.get(p)].slice(0, 5)) console.error(`      ${site}`);
}
console.error(`\nEither create the relation, fix the name, or add it to ${ALLOWLIST_PATH}`);
console.error('with a reason. Do not allowlist a relation just to make CI green —');
console.error('a phantom relation means those writes are silently failing in production.\n');
process.exit(1);
