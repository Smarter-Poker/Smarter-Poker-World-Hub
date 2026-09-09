#!/usr/bin/env node
/**
 * A JOB THAT READS HISTORY MUST CHECK HISTORY OUT.
 *
 * `actions/checkout` defaults to `fetch-depth: 1`. That is ONE commit and no
 * ancestry, and git does not complain about it - it answers questions about
 * commits it has never heard of with "fatal: Not a valid object name", which
 * a script silencing stderr reads as a plain "no".
 *
 * That is how publish-watchdog.yml ran until 2026-09-09. Two scripts in that
 * one job read history, and one of them says so in a comment: "the workflow
 * checks main out with full history, so every question here is answerable by
 * git in a few seconds". It was not, in this repo. The consequences were a
 * recovery path that could never be taken, and 21 fully merged branches
 * reported to a human as work that "nothing will ever merge".
 *
 * So the rule is mechanical: if a job runs a history command, its checkout
 * says `fetch-depth: 0`.
 *
 * TWO THINGS THIS DELIBERATELY GETS RIGHT, because getting them wrong is how
 * a guard like this becomes noise:
 *
 *  1. Comments are stripped before scanning. report-stuck-prs.sh mentions
 *     `git rev-list` twice while running no git at all - both are prose about
 *     an earlier version. A scanner that reads comments fails that file and
 *     teaches everyone to ignore it.
 *
 *  2. `git log -1` and `git rev-parse HEAD` are NOT history commands. They
 *     work perfectly at depth 1, they are everywhere, and demanding a full
 *     clone for them would cost every workflow real time for nothing.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));

/**
 * Strip `#` comments from shell/YAML-ish text without eating a `#` that is
 * inside quotes (`--format='%h #%n'`) or part of `${#var}` / `$#`.
 * Line-oriented and deliberately simple: it only has to be right about
 * whether a git command is real code.
 */
export function stripComments(text) {
    const out = [];
    for (const line of String(text).split('\n')) {
        let quote = null;
        let cut = -1;
        for (let i = 0; i < line.length; i += 1) {
            const c = line[i];
            if (quote) {
                if (c === quote && line[i - 1] !== '\\') quote = null;
                continue;
            }
            if (c === "'" || c === '"') { quote = c; continue; }
            if (c === '#') {
                // `${#x}` and `$#` are parameter expansions, not comments.
                if (i > 0 && (line[i - 1] === '{' || line[i - 1] === '$')) continue;
                // A comment starts a line or follows whitespace.
                if (i === 0 || /\s/.test(line[i - 1])) { cut = i; break; }
            }
        }
        out.push(cut === -1 ? line : line.slice(0, cut));
    }
    return out.join('\n');
}

/**
 * Commands that cannot be answered by a single commit.
 *
 * `git log -N` counts only for N >= 2: `git log -1` is the ordinary "what is
 * HEAD" and is fine at depth 1.
 */
export const HISTORY_PATTERNS = [
    { re: /\bgit\s+merge-base\b/, why: 'git merge-base' },
    { re: /\bgit\s+cat-file\s+-e\b/, why: 'git cat-file -e' },
    { re: /\bgit\s+rev-list\b/, why: 'git rev-list' },
    { re: /\bgit\s+describe\b/, why: 'git describe' },
    { re: /\bgit\s+log\s+-(?!1\b)(\d+)\b/, why: 'git log -N' },
    { re: /\bgit\s+log\b[^\n]*\.\.[^\n]/, why: 'git log A..B' },
];

export function historyCommandsIn(text) {
    const code = stripComments(text);
    return HISTORY_PATTERNS.filter((p) => p.re.test(code)).map((p) => p.why);
}

/** Files a job's `run:` bodies hand to an interpreter, resolved under ROOT. */
export function referencedScripts(runText, root = ROOT) {
    const found = new Set();
    const re = /(?:bash|sh|node|python3?)\s+([A-Za-z0-9_./-]+\.(?:sh|mjs|js|py))/g;
    let m;
    while ((m = re.exec(runText)) !== null) {
        const p = join(root, m[1]);
        if (existsSync(p)) found.add(p);
    }
    return [...found];
}

/** `fetch-depth: 0` means all history. Anything else (including absent) does not. */
export function checkoutDepth(step) {
    const w = step.with || {};
    return Object.prototype.hasOwnProperty.call(w, 'fetch-depth') ? Number(w['fetch-depth']) : 1;
}

export function auditWorkflows(dir = join(ROOT, '.github/workflows'), root = ROOT) {
    const rows = [];
    for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
        let doc;
        try {
            doc = yaml.load(readFileSync(join(dir, file), 'utf8'));
        } catch {
            continue; // a workflow that does not parse is another guard's job
        }
        for (const [jobName, job] of Object.entries(doc?.jobs || {})) {
            const steps = Array.isArray(job?.steps) ? job.steps : [];
            const checkouts = steps.filter((s) => String(s?.uses || '').includes('actions/checkout'));
            if (checkouts.length === 0) continue; // no working tree, no claim to make

            const needs = new Map(); // why -> where
            for (const step of steps) {
                const run = String(step?.run || '');
                if (!run) continue;
                for (const why of historyCommandsIn(run)) {
                    if (!needs.has(why)) needs.set(why, `${file} (inline)`);
                }
                for (const script of referencedScripts(run, root)) {
                    for (const why of historyCommandsIn(readFileSync(script, 'utf8'))) {
                        if (!needs.has(why)) needs.set(why, script.slice(root.length + 1));
                    }
                }
            }
            if (needs.size === 0) continue;

            const depth = Math.min(...checkouts.map(checkoutDepth));
            rows.push({
                file, job: jobName, depth,
                ok: depth === 0,
                needs: [...needs.entries()].map(([why, where]) => `${why} in ${where}`),
            });
        }
    }
    return rows;
}

function main() {
    const rows = auditWorkflows();
    console.log('');
    console.log('  JOBS THAT READ GIT HISTORY, AND WHETHER THEY CHECK IT OUT');
    console.log('');
    console.log(`  ${'workflow / job'.padEnd(56)}${'depth'.padStart(6)}  reads`);
    for (const r of rows) {
        const depth = r.depth === 0 ? 'all' : String(r.depth);
        console.log(`  ${(`${r.file} / ${r.job}`).slice(0, 55).padEnd(56)}${depth.padStart(6)}  ${r.needs[0]}`);
        for (const extra of r.needs.slice(1)) console.log(`  ${''.padEnd(62)}${extra}`);
    }
    const bad = rows.filter((r) => !r.ok);
    console.log('');
    if (bad.length === 0) {
        console.log('  OK - every job that reads history checks history out.');
        return 0;
    }
    for (const r of bad) {
        console.log(`::error::${r.file} job "${r.job}" reads history (${r.needs.join('; ')}) but checks out at depth ${r.depth}.`);
        console.log(`::error::Add "fetch-depth: 0" to its actions/checkout. Add "filter: blob:none" with it - measured on this repo, that is 21s against 23s for a depth-1 clone, and 103s for a plain fetch-depth: 0.`);
    }
    return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exit(main());
}
