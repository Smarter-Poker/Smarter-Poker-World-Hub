#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════
// Deterministic missing-dep fix: `npm install <module>` for a build-log
// "Cannot find module 'X'" failure. Verifies with a local `npm run build`
// pre-commit so we don't push broken installs.
//
// Refuses to install:
//   - Scoped packages from unfamiliar orgs (allowlist below)
//   - Packages that already exist in package.json deps (likely a
//     transient Vercel cache issue; no-op and let it retry)
//   - Deep-path imports (e.g. 'lodash/debounce' — parent is the pkg)
//   - Packages the npm registry doesn't know about
// ═════════════════════════════════════════════════════════════════════════

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MODULE = process.env.MODULE_NAME;
if (!MODULE) {
  console.error(JSON.stringify({ level: 'fatal', reason: 'no_module_env' }));
  process.exit(2);
}

function log(obj) { console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj })); }
function fail(reason, extra = {}) { log({ level: 'error', reason, ...extra }); process.exit(2); }

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

// Check if the package is already declared — if so, this is probably a
// Vercel cache blip, not a genuinely missing dep. Skip.
try {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
  if (all[pkgName]) {
    log({
      level: 'info',
      reason: 'already_declared_in_package_json',
      pkgName,
      existingVersion: all[pkgName],
      note: 'Likely Vercel cache corruption. Skipping autofix so humans investigate.',
    });
    process.exit(2);
  }
} catch (e) {
  log({ level: 'warn', msg: 'pkg.json read failed — proceeding', err: String(e) });
}

// Registry existence check
try {
  execSync(`npm view ${pkgName} name`, { stdio: 'pipe' });
} catch {
  fail('npm_view_failed', { pkgName });
}

// Install
log({ level: 'info', action: 'installing', pkgName });
try {
  execSync(`npm install ${pkgName} --save --no-audit --no-fund`, { stdio: 'inherit' });
} catch (e) {
  fail('npm_install_failed', { pkgName, err: String(e) });
}

// Verify build completes
log({ level: 'info', action: 'verifying_build' });
try {
  execSync('npm run build', {
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
    timeout: 15 * 60 * 1000, // 15 min hard cap
  });
} catch {
  fail('verify_build_still_fails');
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
fs.writeFileSync('/tmp/vercel-autofix-paths.txt', 'package.json\npackage-lock.json\n');
