#!/usr/bin/env node
// A Supabase/PostgREST `.in(column, list)` filter travels in the request URL.
// Past ~25KB the database gateway answers a plain 400 Bad Request, which is how
// Messenger read receipts broke for an agent with 673 inbox threads on
// 2026-11-06 (World Hub #2684) and how the social contacts rail went empty.
//
// This is a RATCHET, not a full audit: the tree held 342 `.in()` calls whose
// list is not visibly bounded when the check was written, and most are bounded
// by a `.limit()` or by the data (a table's seats, one club's tiers). The
// baseline records today's count per file. A file may only go DOWN. A new
// `.in()` over a caller-sized list must be batched (slice/chunk/idBatches) or
// carry `// in-list: bounded <why>` on the call or the line above it.
//
//   node scripts/ci/check-unbatched-in-lists.mjs            check against baseline
//   node scripts/ci/check-unbatched-in-lists.mjs --write    rewrite the baseline
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const BASELINE = join(ROOT, 'scripts/ci/unbatched-in-baseline.json');
const ROOTS = ['pages', 'src', 'lib', 'utils', 'services'];
const EXTENSIONS = /\.(m?js|jsx|ts|tsx)$/;
const SKIP = /(^|\/)(node_modules|\.next|__tests__|tests?|__mocks__|vendor|public)(\/|$)|\.test\.|\.spec\./;
const IN_CALL = /\.in\(\s*(['"`])[\w.]+\1\s*,\s*([\s\S]{0,200}?)\)/g;
const BOUNDED = /\.slice\(|chunk|batch|idBatches|in-list:\s*bounded/i;
// The negated form carries its list in the URL too, built by hand:
//   .not('id', 'in', `(${ids.join(',')})`)
// A literal list ('(a,b)') is its own bound; an interpolated one is counted.
// Added 2026-11-07 after a 1000-id read list here made a ~38KB URL.
const NOT_IN_CALL = /\.not\(\s*(['"`])[\w.>-]+\1\s*,\s*(['"])in\2\s*,\s*`\(\$\{([\s\S]{1,200}?)\}\)`\s*\)/g;

function walk(directory, files = []) {
    if (!existsSync(directory)) return files;
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        const rel = relative(ROOT, path).split(sep).join('/');
        if (SKIP.test(rel)) continue;
        const info = statSync(path);
        if (info.isDirectory()) walk(path, files);
        else if (EXTENSIONS.test(name)) files.push(path);
    }
    return files;
}

export function unboundedInCalls(source) {
    const hits = [];
    for (const match of source.matchAll(IN_CALL)) {
        const argument = match[2].trim();
        if (argument.startsWith('[')) continue; // a literal list is its own bound
        const lineStart = source.lastIndexOf('\n', match.index) + 1;
        const previousLineStart = source.lastIndexOf('\n', Math.max(0, lineStart - 2)) + 1;
        const context = source.slice(previousLineStart, match.index + match[0].length);
        if (BOUNDED.test(context)) continue;
        hits.push({ line: source.slice(0, match.index).split('\n').length, argument: argument.slice(0, 60) });
    }
    for (const match of source.matchAll(NOT_IN_CALL)) {
        const lineStart = source.lastIndexOf('\n', match.index) + 1;
        const previousLineStart = source.lastIndexOf('\n', Math.max(0, lineStart - 2)) + 1;
        const context = source.slice(previousLineStart, match.index + match[0].length);
        if (BOUNDED.test(context)) continue;
        hits.push({ line: source.slice(0, match.index).split('\n').length, argument: `not in ${match[3].slice(0, 52)}` });
    }
    return hits.sort((a, b) => a.line - b.line);
}

export function scan(root = ROOT) {
    const counts = {};
    for (const base of ROOTS) {
        for (const file of walk(join(root, base))) {
            const hits = unboundedInCalls(readFileSync(file, 'utf8'));
            if (hits.length) counts[relative(root, file).split(sep).join('/')] = hits.length;
        }
    }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function main() {
    const current = scan();
    if (process.argv.includes('--write')) {
        writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
        console.log(`Baseline written: ${Object.values(current).reduce((a, b) => a + b, 0)} calls in ${Object.keys(current).length} files.`);
        return;
    }
    if (!existsSync(BASELINE)) { console.error('UNKNOWN: baseline missing; run with --write.'); process.exit(3); }
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const grown = Object.entries(current).filter(([file, count]) => count > (baseline[file] || 0));
    const shrunk = Object.entries(baseline).filter(([file, count]) => (current[file] || 0) < count);
    if (shrunk.length) console.log(`Fewer unbounded .in() calls in ${shrunk.length} file(s); lower the baseline with --write.`);
    if (!grown.length) { console.log('OK: no new unbounded .in() lists.'); return; }
    console.error('New .in() filters over a list that is not visibly bounded:');
    for (const [file, count] of grown) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        console.error(`  ${file}: ${baseline[file] || 0} -> ${count}`);
        for (const hit of unboundedInCalls(source)) console.error(`    line ${hit.line}: .in(..., ${hit.argument})`);
    }
    console.error('Batch the list (100 ids per request, see selectInBatches in src/lib/inBatches.mjs) or mark a truly bounded list with `// in-list: bounded <why>`.');
    process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
