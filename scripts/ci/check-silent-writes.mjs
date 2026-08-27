#!/usr/bin/env node
/**
 * check-silent-writes — the two bugs that were in every file of the /horses
 * audit, hunted platform-wide.
 *
 * WHY THIS EXISTS
 *
 * 1. A ZERO-ROW WRITE IS NOT A FAILURE, TO POSTGREST.
 *    `.update({...}).eq('id', x)` that matches NOTHING returns
 *    { data: null, error: null }. Every route that checks only `if (error)`
 *    then reports success. The UI updates optimistically. Nothing was written.
 *
 *    In the /horses audit this had already produced: a review DELETE that
 *    removed the row from the UI and filed an admin_audit_log entry for a
 *    deletion that never happened; a "Ticket Marked Resolved" toast on a
 *    ticket that stayed open; and horse edits that silently did nothing for
 *    two of three admin accounts.
 *
 *    The fix is always `.select(...)` plus a length check.
 *
 * 2. A DISCARDED `error` IS A CONFIDENT WRONG ANSWER.
 *    `const { data } = await supabase.from('x').select()` with no error
 *    capture cannot distinguish "nothing there" from "the query failed". On an
 *    abuse dashboard that renders as "no abuse detected". On a role check it
 *    renders as "you are not an admin".
 *
 * 3. `.single()` throws PGRST116 on zero rows. House rule: `.maybeSingle()`.
 *
 * HOW IT WORKS
 * Parses each file and walks member-call chains rooted at a Supabase-ish
 * receiver, so it sees `.from(...).update(...).eq(...)` as one chain and can
 * ask what terminates it. Regex cannot do that -- the chain spans lines and
 * the method order varies.
 *
 * EXEMPTIONS
 * A write whose result genuinely does not matter can be marked with a
 * `silent-write-ok:` comment on the line or the line above, WITH A REASON.
 * Fire-and-forget telemetry and audit-log inserts are the honest cases.
 *
 * USAGE
 *   node scripts/ci/check-silent-writes.mjs                 # report
 *   node scripts/ci/check-silent-writes.mjs --json          # machine readable
 *   node scripts/ci/check-silent-writes.mjs --update-baseline
 *   node scripts/ci/check-silent-writes.mjs --ci            # fail if > baseline
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
// @babel/parser and @babel/traverse are present transitively (via next/babel),
// not as declared dependencies. Declaring them properly would be the tidier
// answer, but package-lock.json is currently out of sync with package.json on
// main, so touching either file is a separate repair and not one to bundle
// into a guard.
//
// If they ever disappear, this must FAIL LOUDLY rather than crash with a bare
// MODULE_NOT_FOUND. A guard that stops running for an unrelated reason and
// says nothing intelligible is worse than no guard: the count stops moving and
// everyone assumes it is clean.
let parse, _traverse;
try {
  ({ parse } = await import('@babel/parser'));
  _traverse = (await import('@babel/traverse')).default;
} catch (e) {
  console.error(
    '::error::check-silent-writes cannot run: @babel/parser / @babel/traverse are not installed.\n'
    + 'They are relied on transitively via next/babel. Add them to devDependencies '
    + '(and repair the package-lock sync) rather than deleting this check.\n'
    + String(e?.message || e)
  );
  process.exit(1);
}

const traverse = _traverse.default || _traverse;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = join(ROOT, 'scripts', 'ci', 'silent-writes-baseline.json');

/**
 * UPDATE and DELETE only, and this narrowing is the whole point.
 *
 * They carry a `.eq()` / `.in()` filter that can match NOTHING, and PostgREST
 * reports that as { data: null, error: null } -- indistinguishable from
 * success. That is the bug.
 *
 * INSERT and UPSERT have no such failure mode: there is no filter to miss, so
 * an insert either inserts or returns an error. Flagging them produced 355 of
 * an initial 987 findings, none of which could ever be this bug. A checker
 * that cries wolf 36% of the time gets switched off, and then the real 632 go
 * unlooked-at too.
 */
const WRITE_METHODS = new Set(['update', 'delete']);
/** Terminators that make the affected row count knowable. */
const RESULT_METHODS = new Set(['select', 'maybeSingle', 'single', 'csv', 'explain']);
/** Receivers that look like a Supabase client. */
const CLIENT_RE = /supabase|getSupabase|getSB|getUserSB|createClient|db|sb|admin/i;

function listFiles() {
  const out = execSync(
    "git ls-files 'pages/**/*.js' 'pages/**/*.jsx' 'pages/**/*.ts' 'pages/**/*.tsx' " +
    "'src/**/*.js' 'src/**/*.jsx' 'src/**/*.ts' 'src/**/*.tsx' 'server/**/*.ts' 'server/**/*.js'",
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return out.split('\n').filter(Boolean);
}

function parseFile(src, file) {
  const plugins = ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'];
  if (/\.tsx?$/.test(file)) plugins.push('typescript');
  return parse(src, { sourceType: 'module', allowReturnOutsideFunction: true, errorRecovery: true, plugins });
}

/**
 * Walk to the root of a member-call chain, collecting every method name.
 * `a.from('t').update({}).eq('id',1)` -> { root: a, methods: [from, update, eq] }
 */
function describeChain(node) {
  const methods = [];
  let cur = node;
  while (cur) {
    if (cur.type === 'CallExpression' && cur.callee?.type === 'MemberExpression') {
      const name = cur.callee.property?.name || cur.callee.property?.value;
      if (name) methods.push(name);
      cur = cur.callee.object;
    } else if (cur.type === 'MemberExpression') {
      cur = cur.object;
    } else if (cur.type === 'CallExpression') {
      cur = cur.callee;
    } else if (cur.type === 'AwaitExpression' || cur.type === 'TSNonNullExpression') {
      cur = cur.argument ?? cur.expression;
    } else break;
  }
  methods.reverse();
  let rootName = '';
  if (cur?.type === 'Identifier') rootName = cur.name;
  else if (cur?.type === 'CallExpression' && cur.callee?.type === 'Identifier') rootName = cur.callee.name;
  else if (cur?.type === 'MemberExpression' && cur.object?.type === 'Identifier') rootName = cur.object.name;
  else if (cur?.type === 'ThisExpression') rootName = 'this';
  return { rootName, methods };
}

function isExempt(lines, line) {
  const here = lines[line - 1] || '';
  const above = lines[line - 2] || '';
  const above2 = lines[line - 3] || '';
  return /silent-write-ok:/.test(here) || /silent-write-ok:/.test(above) || /silent-write-ok:/.test(above2);
}

/** The enclosing statement's destructuring pattern, if it is one. */
function destructuredKeys(path) {
  let p = path;
  for (let i = 0; i < 8 && p; i++) {
    if (p.node.type === 'VariableDeclarator' && p.node.id?.type === 'ObjectPattern') {
      return p.node.id.properties
        .map((pr) => pr.key?.name || pr.key?.value)
        .filter(Boolean);
    }
    // `({ data } = await ...)`
    if (p.node.type === 'AssignmentExpression' && p.node.left?.type === 'ObjectPattern') {
      return p.node.left.properties.map((pr) => pr.key?.name || pr.key?.value).filter(Boolean);
    }
    p = p.parentPath;
  }
  return null;
}

function scan() {
  const findings = [];
  for (const file of listFiles()) {
    let src;
    try { src = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; }
    if (!/from\s*\(|\.rpc\s*\(/.test(src)) continue;
    const lines = src.split('\n');

    let ast;
    try { ast = parseFile(src, file); } catch { continue; }

    traverse(ast, {
      CallExpression(path) {
        const { node } = path;
        if (node.callee?.type !== 'MemberExpression') return;
        const method = node.callee.property?.name;
        if (!method) return;
        const line = node.loc?.start.line ?? 0;

        // --- .single() ---
        if (method === 'single') {
          const { rootName } = describeChain(node);
          if (CLIENT_RE.test(rootName) && !isExempt(lines, line)) {
            findings.push({ file, line, rule: 'single', detail: '.single() throws PGRST116 on zero rows; use .maybeSingle()' });
          }
          return;
        }

        // Only look at the OUTERMOST call of a chain, so one chain yields one finding.
        if (path.parentPath?.node?.type === 'MemberExpression'
            && path.parentPath.node.object === node) return;

        const { rootName, methods } = describeChain(node);
        if (!CLIENT_RE.test(rootName)) return;
        if (!methods.includes('from')) return;

        const write = methods.find((m) => WRITE_METHODS.has(m));
        if (!write) return;
        if (isExempt(lines, line)) return;

        const hasResult = methods.some((m) => RESULT_METHODS.has(m));
        if (!hasResult) {
          findings.push({
            file, line, rule: 'silent-write',
            detail: `.${write}() with no .select() -- a zero-row match returns { error: null } and reads as success`,
          });
          return;
        }

        // Result requested, but is the row count actually looked at?
        const keys = destructuredKeys(path);
        if (keys && !keys.includes('data') && !keys.includes('count')) {
          findings.push({
            file, line, rule: 'result-discarded',
            detail: `.${write}() asks for a result but destructures only { ${keys.join(', ')} } -- the row count is thrown away`,
          });
        }
      },
    });
  }
  return findings;
}

const args = process.argv.slice(2);
const findings = scan();

if (args.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2));
  process.exit(0);
}

const byRule = findings.reduce((a, f) => { (a[f.rule] ||= []).push(f); return a; }, {});

if (args.includes('--update-baseline')) {
  const counts = Object.fromEntries(Object.entries(byRule).map(([k, v]) => [k, v.length]));
  writeFileSync(BASELINE, JSON.stringify({
    note: 'Counts may only go DOWN. Raising a number here needs a reason in the PR.',
    generated: new Date().toISOString().slice(0, 10),
    counts,
  }, null, 2) + '\n');
  console.log('baseline written:', JSON.stringify(counts));
  process.exit(0);
}

for (const [rule, list] of Object.entries(byRule)) {
  console.log(`\n=== ${rule} (${list.length}) ===`);
  for (const f of list.slice(0, 400)) console.log(`  ${f.file}:${f.line}  ${f.detail}`);
  if (list.length > 400) console.log(`  ... and ${list.length - 400} more`);
}
console.log(`\nTOTAL: ${findings.length}`);

if (args.includes('--ci')) {
  if (!existsSync(BASELINE)) { console.error('no baseline; run --update-baseline'); process.exit(1); }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')).counts || {};
  let bad = false;
  for (const [rule, list] of Object.entries(byRule)) {
    const allowed = base[rule] ?? 0;
    if (list.length > allowed) {
      console.error(`::error::${rule}: ${list.length} found, baseline allows ${allowed}. A zero-row write that reads as success is how a UI lies to an operator.`);
      bad = true;
    }
  }
  process.exit(bad ? 1 : 0);
}
