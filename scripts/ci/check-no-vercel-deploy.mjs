#!/usr/bin/env node
/**
 * NOTHING IN THIS REPO MAY INVOKE A VERCEL DEPLOY — WITH ONE NAMED EXCEPTION.
 * ─────────────────────────────────────────────────────────────────────────
 * World Hub deploys exactly one way: push to main, the Vercel GIT INTEGRATION
 * on hub-vanguard builds and auto-promotes. CLAUDE.md §1.3:
 *
 *   Never run `vercel deploy` or `vercel --prod`.
 *   Never call the deploy hook URL by hand.
 *
 * Issue #653 catalogued what happened when scripts contradicted that rule:
 * `deploy-production.sh` and `manual-deploy.yml` (Club Arena side) fired
 * `vercel --prod` directly, failed, and painted a red Production badge that
 * taught everyone red means nothing. `scripts/antigravity-deploy.sh` sat in
 * THIS repo for months after §1.3 named it forbidden — a rule loses to a
 * script with a plausible filename every time. All three are deleted; this
 * check stops them coming back. Ported from Club Arena's identically-named
 * script (which has no exception because that repo may not deploy at all).
 *
 * THE ONE EXCEPTION: `.github/workflows/club-arena-scheduled-deploy.yml`
 * POSTs the `VERCEL_HUB_VANGUARD_DEPLOY_HOOK` daily as a safety net for a
 * missed Club Arena sync. It is CHECK-6c allowlisted and OWNS the hook.
 * Nothing else may call a deploy hook or the deployments API.
 *
 * Usage: node scripts/ci/check-no-vercel-deploy.mjs
 * Exit:  0 clean · 1 something else can deploy · 2 script error
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', 'dist', '.git', '.next', 'playwright-report',
                      'test-results', '_to_delete', 'coverage', '.venv', '.agent-trees',
                      'public']);
const EXTS = /\.(sh|ya?ml|mjs|cjs|js|ts|json|command)$/;
const SPECIAL_FILENAMES = new Set(['Makefile']);

/** The sole sanctioned deploy-hook caller (see header). */
const ALLOWED = new Set(['.github/workflows/club-arena-scheduled-deploy.yml']);

/* The forbidden thing is INVOKING a deploy, not the word "vercel". Reading the
   Vercel API to ask what a deployment did is how verify-deploy.js and the
   publish watchdog diagnose failures; banning reads would delete the tools
   that catch this class of problem. Match the command forms only. */
const PROD_FLAG = /\bvercel(?:\s+(?![;&|])\S+)*\s+--prod\b/;
const BARE_DEPLOY = /(?:^\s*|[;&|]\s*|\bnpx(?:\s+-\S+)*\s+)vercel(?:\s+(?:\.|\.\/\S+))?\s*(?:$|[;&|])/;
const PATTERNS = [
  [PROD_FLAG, 'invokes the Vercel CLI with the production flag'],
  [BARE_DEPLOY, 'invokes the Vercel CLI without a read-only subcommand'],
  [/\bvercel\s+deploy\b/, 'invokes `vercel deploy`'],
  [/api\.vercel\.com\/v\d+\/deployments['"`\s]*,?\s*\{[^}]*method:\s*['"`]POST/i,
   'POSTs to the Vercel deployments API'],
  [/vercel\.com\/v\d+\/integrations\/deploy\//, 'calls a Vercel deploy hook URL'],
  [/DEPLOY_HOOK/, 'references a deploy hook secret'],
];

// Regression examples from the 2026-08-29 dirty-feature-branch production
// incident. The old patterns missed flags inserted between `vercel` and
// `--prod`, so `npx -y vercel --force --prod` survived CHECK 18 for months.
for (const command of [
  'vercel --prod',
  'vercel --force --prod',
  'npx vercel --force --prod',
  'npx -y vercel --force --prod',
]) {
  if (!PROD_FLAG.test(command)) {
    throw new Error(`production-deploy guard does not recognize: ${command}`);
  }
}
for (const command of ['vercel', 'npx vercel', 'npx -y vercel', 'npx vercel .']) {
  if (!BARE_DEPLOY.test(command)) {
    throw new Error(`bare-deploy guard does not recognize: ${command}`);
  }
}

const findings = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!EXTS.test(e.name) && !SPECIAL_FILENAMES.has(e.name)) continue;
    if (statSync(p).size > 512 * 1024) continue;
    const rel = relative(ROOT, p);
    if (ALLOWED.has(rel)) continue;
    // This file describes the patterns it bans; so do the playbook and rules.
    if (rel === 'scripts/ci/check-no-vercel-deploy.mjs' || rel === 'AGENT-PLAYBOOK.md') continue;
    const src = readFileSync(p, 'utf8');
    for (const line of src.split('\n')) {
      const t = line.trim();
      if (t.startsWith('#') || t.startsWith('//') || t.startsWith('*')) continue; // comments explain, they do not run
      for (const [re, why] of PATTERNS) if (re.test(line)) findings.push([rel, why, t.slice(0, 100)]);
    }
  }
})(ROOT);

if (findings.length === 0) {
  console.log('check-no-vercel-deploy: OK — only the sanctioned safety net can deploy.');
  process.exit(0);
}

console.error('\nSOMETHING BESIDES THE SANCTIONED SAFETY NET CAN INVOKE A VERCEL DEPLOY:\n');
for (const [file, why, line] of findings) console.error(`  ${file}\n    ${why}\n    ${line}`);
console.error(
  '\nWorld Hub deploys ONE way: push to main -> Vercel git integration on' +
    '\nhub-vanguard. The single exception is club-arena-scheduled-deploy.yml,' +
    '\nwhich owns VERCEL_HUB_VANGUARD_DEPLOY_HOOK as a daily safety net.' +
    '\nEverything else is issue #653 happening again: a script that beats the' +
    '\nrule, a duplicate build queue, a red badge that teaches everyone red' +
    '\nmeans nothing. Delete the invocation or, if it is genuinely sanctioned,' +
    '\nadd it to ALLOWED in this file IN THE SAME PR with the reason written in.'
);
process.exit(1);
