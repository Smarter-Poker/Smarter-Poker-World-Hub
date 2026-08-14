#!/usr/bin/env node
/**
 * SUPABASE .catch() MISUSE CHECK — zero tolerance
 * ═══════════════════════════════════════════════════════════════════════════
 * Supabase's PostgREST builder is a THENABLE, not a Promise. It implements
 * .then() but has NO .catch(). That causes TWO failures at once:
 *
 *   1. `builder.catch(fn)` throws TypeError synchronously, and
 *   2. a thenable only executes when .then() is called — so when .catch()
 *      throws first, THE QUERY IS NEVER SENT.
 *
 * Wrapped in a try/catch, as these sites usually are, the TypeError is
 * swallowed and the write vanishes in complete silence.
 *
 * This is invisible to every other gate. It is valid syntax, so `next build`,
 * `tsc` and `_chk.cjs` all pass it. Only runtime reveals it.
 *
 * IT COST REAL DATA, measured in production before the fix:
 *   * club_arena_audit_logs .... 0 rows
 *   * promo_wagering_ledger .... 0 rows
 *   * club_arena_messages ...... 0 rows
 *   BBJ payouts, insurance premiums, promo wagering, sit-downs and table chat
 *   were all writing to nothing.
 *   * /api/cron/signup-probe and /api/cron/email-deliverability-check threw
 *     this every day from 2026-06-17 to 2026-08-12 — the probes that exist to
 *     announce a broken signup or mail flow were themselves dead for two
 *     months, so an outage would have gone unreported.
 *   * pages/api/club-arena/rakeback.js chained it onto a TREASURY ROLLBACK:
 *     the compensating re-credit was never sent, so a failed chip credit left
 *     the club treasury permanently short while the player got nothing.
 *
 * ── DETECTION ──────────────────────────────────────────────────────────────
 * Walks BACKWARDS from every `.catch(` to find what it is actually chained to,
 * rather than scanning forward from `.from(`/`.rpc(` and guessing. Forward
 * scanning cannot tell these apart:
 *
 *     Promise.all([ sb.from('a').select() ]).catch(fn)   // FINE - real promise
 *     fetchAllRows(() => sb.from('a').select()).catch(fn) // FINE - real promise
 *     sb.from('a').insert({}).catch(fn)                   // BUG  - thenable
 *
 * All three contain `.from(` before a `.catch(`. Only the third is a defect.
 * Walking backwards over the balanced parens immediately preceding `.catch(`
 * and testing whether the callee is a PostgREST method resolves it exactly —
 * validated against the real codebase, where it flagged 29 genuine sites and
 * zero false positives.
 *
 * `.then(...).catch(...)` is CORRECT and not flagged: .then() on a thenable
 * returns a real Promise, which does have .catch().
 *
 * ── WHY ZERO ───────────────────────────────────────────────────────────────
 * All 29 known sites are fixed. The baseline is 0 so the next one fails the
 * build immediately, rather than hiding inside a frozen count.
 *
 * USAGE: node scripts/check-supabase-catch-misuse.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';

/** Every known site is fixed. Do not raise this to accommodate a new one. */
const BASELINE = 0;

const ROOTS = ['pages', 'src'];
const SKIP_DIR = /node_modules|\.next|\.git/;

/** Methods that return the PostgREST builder (a thenable), not a Promise. */
const BUILDER_METHOD = /\.(select|insert|update|upsert|delete|eq|neq|in|is|not|order|limit|single|maybeSingle|range|gt|gte|lt|lte|match|filter|rpc|from)\s*$/;

const findings = [];

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIR.test(p)) walk(p);
        } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            scan(p);
        }
    }
}

function scan(file) {
    const src = fs.readFileSync(file, 'utf8');
    let i = -1;

    while ((i = src.indexOf('.catch(', i + 1)) > -1) {
        // Ignore matches inside a line comment (several files DISCUSS this bug).
        const lineStart = src.lastIndexOf('\n', i) + 1;
        if (src.slice(lineStart, i).includes('//')) continue;

        // The construct immediately before .catch( must be a call: `...)`.
        let j = i - 1;
        while (j >= 0 && /\s/.test(src[j])) j -= 1;
        if (src[j] !== ')') continue;

        // Walk back over that balanced (...) to find its opening paren.
        let depth = 0;
        let k = j;
        for (; k >= 0; k -= 1) {
            const c = src[k];
            if (c === ')' || c === ']' || c === '}') depth += 1;
            else if (c === '(' || c === '[' || c === '{') {
                depth -= 1;
                if (depth === 0) break;
            }
        }
        if (k < 0) continue;

        // What is being called? If it is a PostgREST builder method, the
        // .catch() is on a thenable and this is the bug. If it is
        // Promise.all, a helper, or anything else, the .catch() is on a real
        // promise and is correct.
        let t = k - 1;
        while (t >= 0 && /\s/.test(src[t])) t -= 1;
        if (!BUILDER_METHOD.test(src.slice(Math.max(0, t - 60), t + 1))) continue;

        // A .then() anywhere in the chain already converted it to a Promise.
        if (src.slice(k, i).includes('.then(')) continue;

        findings.push(`${file}:${src.slice(0, i).split('\n').length}`);
    }
}

for (const root of ROOTS) {
    if (fs.existsSync(root)) walk(root);
}

const unique = [...new Set(findings)].sort();
const count = unique.length;

if (count > BASELINE) {
    console.error('');
    console.error(`SUPABASE .catch() MISUSE: ${count} site(s) found, baseline ${BASELINE}.`);
    console.error('');
    console.error('The PostgREST builder is a thenable with no .catch(). Chaining .catch()');
    console.error('onto it throws TypeError AND means the query is never sent — silently,');
    console.error('if there is a try/catch around it.');
    console.error('');
    console.error('Read the returned error instead:');
    console.error('    const { error } = await supabase.from(...).insert({...});');
    console.error('    if (error) console.warn(...);');
    console.error('');
    console.error('Or, for fire-and-forget, put .then() first — it returns a real Promise:');
    console.error('    supabase.from(...).insert({...})');
    console.error('      .then(({ error }) => { if (error) throw error; })');
    console.error('      .catch(err => console.warn(err));');
    console.error('');
    for (const f of unique) console.error(`  ${f}`);
    console.error('');
    process.exit(1);
}

console.log(`[supabase-catch] OK — ${count} site(s), at baseline ${BASELINE}.`);
process.exit(0);
