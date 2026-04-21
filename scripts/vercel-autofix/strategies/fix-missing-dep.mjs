#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// Deterministic missing-dep fix: `npm install <module>` for a build-log
// "Cannot find module 'X'" failure. Verifies with a local `npm run build`
// pre-commit so we don't push broken installs.
//
// Refuses to install:
//   - Scoped packages from unfamiliar orgs (allowlist: @supabase, @sentry,
//     @next, @anthropic, @radix-ui, @tailwindcss, @tanstack, @types).
//   - Typo candidates (uses npm registry exists-check).
//   - Deep-path imports (e.g. 'lodash/debounce' — the parent is the pkg).
// ═════════════════════════════════════════════════════════════════════════

import { execSync } from 'node:child_process';
import fs from 'node:fs';

const MODULE = process.env.MODULE_NAME;
if (!MODULE) {
  console.error(JSON.stringify({ level: 'fatal', reason: 'no_module_env' }));
  process.exit(2);
}

function log(obj) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

// Strip deep path: '@foo/bar/baz' → '@foo/bar', 'lodash/debounce' → 'lodash'
function resolvePackageName(m) {
  if (m.startsWith('@')) {
    const [scope, name] = m.split('/');
    return `${scope}/${name}`;
  }
  return m.split('/')[0];
}

const pkgName = resolvePackageName(MODULE);

// Scope allowlist for auto-install
const ALLOWED_SCOPES = [
  '@supabase', '@sentry', '@next', '@anthropic',
  '@radix-ui', '@tailwindcss', '@tanstack', '@types',
  '@vercel', '@testing-library', '@playwright',
];
if (pkgName.startsWith('@') && !ALLOWED_SCOPES.some((s) => pkgName.startsWith(s + '/'))) {
  log({ level: 'warn', reason: 'scope_not_allowlisted', pkgName });
  process.exit(2);
}

// Registry existence check
try {
  execSync(`npm view ${pkgName} name`, { stdio: 'pipe' });
} catch {
  log({ level: 'error', reason: 'npm_view_failed', pkgName });
  process.exit(2);
}

// Install
log({ level: 'info', action: 'installing', pkgName });
execSync(`npm install ${pkgName} --save --no-audit --no-fund`, { stdio: 'inherit' });

// Verify build completes
log({ level: 'info', action: 'verifying_build' });
try {
  execSync('npm run build', { stdio: 'inherit', env: { ...process.env, CI: 'true' } });
} catch {
  log({ level: 'error', reason: 'verify_build_still_fails' });
  process.exit(2);
}

const title = `fix(deps): add missing package \`${pkgName}\` to resolve build failure`;
const body = [
  `Vercel deployment ${process.env.DEPLOYMENT_ID} failed on commit ${process.env.COMMIT_SHA}`,
  `with \`Cannot find module '${MODULE}'\`.`,
  '',
  'Build-log excerpt:',
  '```',
  (process.env.SNIPPET || '').slice(0, 1500),
  '```',
  '',
  `Installed \`${pkgName}\` at latest. Local \`npm run build\` passes.`,
  '',
  '---',
  `Autofix attempt: ${process.env.ATTEMPT_ID || 'n/a'}`,
].join('\n');

fs.writeFileSync('/tmp/vercel-autofix-commit-title.txt', title);
fs.writeFileSync('/tmp/vercel-autofix-commit-body.txt', body);
