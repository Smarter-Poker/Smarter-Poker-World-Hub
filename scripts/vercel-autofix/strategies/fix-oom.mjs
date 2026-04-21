#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// Deterministic OOM fix: bump NODE_OPTIONS max-old-space-size in
// package.json's build script. Cap at 7168MB (leave 1GB for OS on 8GB
// Vercel build machine). If already at cap, exit "already_at_cap" —
// human needs to enable Vercel Enhanced Builds.
//
// Uses JSON.parse/stringify rather than regex-mutate so scripts with
// escaped quotes don't corrupt.
// ═════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

const CAP_MB = 7168;
const STEP_MB = 1536;
const PKG_PATH = path.resolve('package.json');

function log(obj) { console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj })); }
function fail(reason, extra = {}) { log({ level: 'error', reason, ...extra }); process.exit(2); }

const raw = fs.readFileSync(PKG_PATH, 'utf8');

let pkg;
try { pkg = JSON.parse(raw); }
catch (e) { fail('package_json_unparseable', { err: String(e) }); }

const oldScript = pkg?.scripts?.build;
if (typeof oldScript !== 'string') fail('no_build_script');

const heapMatch = oldScript.match(/max-old-space-size=(\d+)/);
const current = heapMatch ? parseInt(heapMatch[1], 10) : null;
let next, newScript;

if (current === null) {
  next = CAP_MB;
  newScript = `NODE_OPTIONS='--max-old-space-size=${CAP_MB}' ${oldScript}`;
} else if (current >= CAP_MB) {
  fail('already_at_cap', { current, cap: CAP_MB });
} else {
  next = Math.min(CAP_MB, current + STEP_MB);
  newScript = oldScript.replace(/max-old-space-size=\d+/, `max-old-space-size=${next}`);
}

pkg.scripts.build = newScript;

const indent = detectIndent(raw);
const trailingNl = raw.endsWith('\n');
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, indent) + (trailingNl ? '\n' : ''));

log({
  level: 'info',
  action: current === null ? 'added_node_options' : 'bumped_heap',
  from: current, to: next, cap: CAP_MB,
});

const title = current === null
  ? `fix(build): add NODE_OPTIONS=max-old-space-size=${CAP_MB} to prevent Vercel OOM`
  : `fix(build): bump Node heap ${current}MB→${next}MB to prevent Vercel OOM`;

const body = [
  `Vercel deployment ${process.env.DEPLOYMENT_ID} OOMed on commit ${process.env.COMMIT_SHA}.`,
  '',
  'Build-log excerpt:',
  '```',
  (process.env.SNIPPET || '').slice(0, 1500),
  '```',
  '',
  current === null
    ? `Added \`NODE_OPTIONS=--max-old-space-size=${CAP_MB}\` (was: none).`
    : `Raised \`NODE_OPTIONS=--max-old-space-size\` from ${current} → ${next} MB.`,
  `Build machine has 8GB RAM; cap is ${CAP_MB} MB to leave ~1GB for OS + binaries.`,
  '',
  '---',
  `Autofix attempt: ${process.env.ATTEMPT_ID || 'n/a'}`,
].join('\n');

fs.writeFileSync('/tmp/vercel-autofix-commit-title.txt', title);
fs.writeFileSync('/tmp/vercel-autofix-commit-body.txt', body);
// Per-strategy path allowlist consumed by open-pr.mjs
fs.writeFileSync('/tmp/vercel-autofix-paths.txt', 'package.json\n');

function detectIndent(text) {
  const m = text.match(/\n([\t ]+)"/);
  if (!m) return 2;
  if (m[1].includes('\t')) return '\t';
  return m[1].length || 2;
}
