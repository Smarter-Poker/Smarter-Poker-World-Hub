#!/usr/bin/env node
/**
 * SUPABASE .catch() MISUSE CHECK  (ratchet)
 * ═══════════════════════════════════════════════════════════════════════════
 * Supabase's PostgREST query builder is a THENABLE, not a Promise. It
 * implements .then() but has NO .catch(). So this:
 *
 *     await supabase.from('t').insert({...}).catch(() => null);
 *
 * throws `TypeError: ....insert(...).catch is not a function` at the .catch
 * call, BEFORE the await ever runs — turning a defensive "ignore failures"
 * into a guaranteed crash of the whole handler.
 *
 * This is invisible to every existing gate. It is not a syntax error, so
 * `next build`, `tsc` and `_chk.cjs` all pass. It only fails at runtime, on the
 * line that was supposed to make failure harmless.
 *
 * It has cost real uptime: Vercel runtime errors showed /api/cron/signup-probe
 * and /api/cron/email-deliverability-check throwing this EVERY DAY from
 * 2026-06-17 to 2026-08-12. Those are the probes that exist to announce a
 * broken signup or mail flow — both were dead for nearly two months, so an
 * actual outage would have gone unreported.
 *
 * ── WHY A RATCHET, NOT A HARD FAIL ─────────────────────────────────────────
 * There are dozens of pre-existing instances across the poker engine, the MLB
 * routes and Club Arena. Failing the build on all of them would either block
 * every push or force a reckless 50-file rewrite of money-handling code in one
 * commit. Instead this fails only when the count GOES UP: existing debt is
 * frozen, new debt is impossible. Lower BASELINE as sites are fixed — the
 * check tells you the new number every run.
 *
 * `.then(...).catch(...)` is CORRECT and not counted: .then() on a thenable
 * returns a real Promise, which does have .catch(). Only a .catch() reached
 * with no .then() before it in the same statement is a bug.
 *
 * USAGE: node scripts/check-supabase-catch-misuse.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Known count after the four cron probes were fixed (2026-08-12), measured by
 * this exact script. Ratchet DOWN as sites are fixed; never up.
 */
const BASELINE = 49;

const ROOTS = ['pages', 'src'];
const SKIP_DIR = /node_modules|\.next|\.git/;

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
    const re = /\.(from|rpc)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
        const before = src.slice(Math.max(0, m.index - 40), m.index);
        // storage.from() DOES return a real promise; Array.from is unrelated.
        if (/storage\s*$/.test(before) || /Array\s*$/.test(before)) continue;

        // Walk to the end of this statement (depth-0 semicolon) so a .catch()
        // belonging to a LATER statement is not blamed on this chain.
        let depth = 0;
        let end = -1;
        for (let i = m.index; i < src.length && i < m.index + 4000; i += 1) {
            const c = src[i];
            if (c === '(' || c === '[' || c === '{') depth += 1;
            else if (c === ')' || c === ']' || c === '}') depth -= 1;
            else if (c === ';' && depth <= 0) { end = i; break; }
        }
        if (end < 0) continue;

        const stmt = src.slice(m.index, end);
        const catchAt = stmt.indexOf('.catch(');
        const thenAt = stmt.indexOf('.then(');
        if (catchAt > -1 && (thenAt === -1 || catchAt < thenAt)) {
            findings.push(`${file}:${src.slice(0, m.index).split('\n').length}`);
        }
    }
}

for (const root of ROOTS) {
    if (fs.existsSync(root)) walk(root);
}

const unique = [...new Set(findings)].sort();
const count = unique.length;

if (count > BASELINE) {
    console.error('');
    console.error(`SUPABASE .catch() MISUSE INCREASED: ${count} (baseline ${BASELINE})`);
    console.error('');
    console.error('The PostgREST builder is a thenable with no .catch(), so');
    console.error('`await supabase.from(...).insert(...).catch(fn)` throws TypeError');
    console.error('before the await runs — crashing the handler it was meant to protect.');
    console.error('');
    console.error('Read the result instead:');
    console.error('    const { error } = await supabase.from(...).insert({...});');
    console.error('    if (error) console.warn(...);');
    console.error('');
    console.error('Or put .then() first — .then() returns a real Promise, which has .catch().');
    console.error('');
    for (const f of unique) console.error(`  ${f}`);
    console.error('');
    process.exit(1);
}

if (count < BASELINE) {
    console.log(`[supabase-catch] ${count} occurrences, DOWN from baseline ${BASELINE}.`);
    console.log(`[supabase-catch] Lower BASELINE to ${count} in this file to lock the gain in.`);
    process.exit(0);
}

console.log(`[supabase-catch] OK — ${count} occurrences, at baseline. No new ones.`);
process.exit(0);
