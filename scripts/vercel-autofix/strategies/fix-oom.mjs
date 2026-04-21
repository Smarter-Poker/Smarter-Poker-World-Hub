#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// Deterministic OOM fix: bump NODE_OPTIONS max-old-space-size in
// package.json's build script. Cap at 7168MB (leave 1GB for OS on 8GB
// Vercel build machine). If already at cap, exit non-zero with a
// "cannot_autofix" signal — humans must enable Enhanced Builds.
//
// Outputs (expected by open-pr.mjs):
//   - git working tree has modified package.json
//   - /tmp/vercel-autofix-commit-message.txt contains the commit body
// ═════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const CAP_MB = 7168;
const STEP_MB = 1536;
const PKG_PATH = path.resolve('package.json');

function log(obj) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

function fail(reason, extra = {}) {
  log({ level: 'error', reason, ...extra });
  process.exit(2);
}

const raw = fs.readFileSync(PKG_PATH, 'utf8');
const buildScriptMatch = raw.match(/"build"\s*:\s*"([^"]+)"/);
if (!buildScriptMatch) fail('no_build_script');

const oldScript = buildScriptMatch[1];
const heapMatch = oldScript.match(/max-old-space-size=(\d+)/);
if (!heapMatch) {
  // Prepend NODE_OPTIONS if the script has none
  const newScript = `NODE_OPTIONS='--max-old-space-size=${CAP_MB}' ${oldScript}`;
  const newRaw = raw.replace(
    `"build": "${oldScript}"`,
    `"build": "${newScript}"`
  );
  fs.writeFileSync(PKG_PATH, newRaw);
  log({ level: 'info', action: 'added_node_options', newValue: CAP_MB });
  writeCommitMsg({
    title: `fix(build): add NODE_OPTIONS=max-old-space-size=${CAP_MB} to prevent Vercel OOM`,
    body: oomBody({ old: 'none', next: CAP_MB }),
  });
  process.exit(0);
}

const current = parseInt(heapMatch[1], 10);
if (current >= CAP_MB) {
  fail('already_at_cap', { current, cap: CAP_MB });
}

const next = Math.min(CAP_MB, current + STEP_MB);
const newScript = oldScript.replace(
  /max-old-space-size=\d+/,
  `max-old-space-size=${next}`
);
const newRaw = raw.replace(
  `"build": "${oldScript}"`,
  `"build": "${newScript}"`
);
fs.writeFileSync(PKG_PATH, newRaw);

execSync(`git diff --stat ${PKG_PATH}`, { stdio: 'inherit' });

log({
  level: 'info',
  action: 'bumped_heap',
  from: current,
  to: next,
  cap: CAP_MB,
});

writeCommitMsg({
  title: `fix(build): bump Node heap ${current}MB→${next}MB to prevent Vercel OOM`,
  body: oomBody({ old: current, next }),
});

function oomBody({ old: oldMb, next }) {
  return [
    `Vercel deployment ${process.env.DEPLOYMENT_ID} OOMed on commit ${process.env.COMMIT_SHA}.`,
    '',
    'Build-log excerpt:',
    '```',
    (process.env.SNIPPET || '').slice(0, 1500),
    '```',
    '',
    `Raised \`NODE_OPTIONS=--max-old-space-size\` from ${oldMb} → ${next} MB.`,
    `Build machine has 8GB RAM; cap is ${CAP_MB} MB to leave ~1GB for OS + binaries.`,
    '',
    '---',
    `Autofix attempt: ${process.env.ATTEMPT_ID || 'n/a'}`,
  ].join('\n');
}

function writeCommitMsg({ title, body }) {
  fs.writeFileSync('/tmp/vercel-autofix-commit-title.txt', title);
  fs.writeFileSync('/tmp/vercel-autofix-commit-body.txt', body);
}
