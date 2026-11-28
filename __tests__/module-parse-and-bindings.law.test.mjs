/**
 * __tests__/module-parse-and-bindings.law.test.mjs
 *
 * Permanent regression fortress for incident 86bcafc1-80ae-4118-afff-7fa2aa505386
 * (VercelDeploymentFailed, 2026-11-27 208edab4 / dpl_2DNKZH24erXEh5p31vsMFYak52aJ).
 *
 * Proves that scripts/ci/check-module-parse-and-bindings.mjs catches:
 *   1. Duplicate import bindings (exact 208edab4 #3131+#3136 diamond-store shape).
 *   2. Duplicate top-level const/let/function/class declarations.
 *   3. Duplicate named exports & duplicate default exports (#3138 sibling).
 *   4. Missing, untracked, or Linux case-mismatched local relative imports.
 *   5. Missing named imports from local static ESM modules.
 *   6. Next.js pages/ extension collisions and pages/ vs app/ route collisions.
 *   7. Cleanly auto-merged cross-PR collisions under strict:false via read-only
 *      `git merge-tree --write-tree` (real 3-commit Git integration proof).
 *   8. Permanent wiring into both Pre-Deploy Safety Checks (build-safety-gate.yml)
 *      and the local pre-push hook (scripts/hooks/pre-push-js-safety.sh).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  validateModuleTree,
  validateSimulatedMerge,
  validateWorkingTree,
} from '../scripts/ci/check-module-parse-and-bindings.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cleanGitEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith('GIT_') && !['NODE_PATH', 'NODE_OPTIONS'].includes(key),
  ),
);

function makeVirtualTree(fileMap) {
  const allTrackedFiles = Object.keys(fileMap);
  return validateModuleTree({
    allTrackedFiles,
    readFile: (f) => {
      if (!(f in fileMap)) throw new Error(`missing virtual file ${f}`);
      return fileMap[f];
    },
  });
}

test('negative proof: catches exact 208edab4 (#3131 + #3136) duplicate import in pages/hub/diamond-store.js', () => {
  const res = makeVirtualTree({
    'src/lib/store/vipCheckoutAnalytics.mjs': 'export const vipCheckoutAnalytics = () => {};\n',
    'src/lib/store/vipIntroPrompt.mjs':
      'export const VIP_INTRO_VERIFY_REASON = "x";\nexport const vipCheckoutAnalytics = () => {};\n',
    'pages/hub/diamond-store.js': [
      "import { vipCheckoutAnalytics } from '../../src/lib/store/vipCheckoutAnalytics.mjs';",
      "import React from 'react';",
      'import {',
      '  VIP_INTRO_VERIFY_REASON,',
      '  vipCheckoutAnalytics,',
      "} from '../../src/lib/store/vipIntroPrompt.mjs';",
      'export default function DiamondStore() { return <div data-r={VIP_INTRO_VERIFY_REASON} onClick={vipCheckoutAnalytics} />; }',
    ].join('\n'),
  });

  assert.equal(res.violations.length, 1);
  assert.equal(res.violations[0].kind, 'parse-or-binding-error');
  assert.equal(res.violations[0].file, 'pages/hub/diamond-store.js');
  assert.match(res.violations[0].message, /vipCheckoutAnalytics.*already been declared/i);
});

test('negative proof: catches duplicate top-level bindings, duplicate named exports, and duplicate default exports', () => {
  const res = makeVirtualTree({
    'src/dup-const.js': 'const limit = 1;\nconst limit = 2;\nexport { limit };\n',
    'src/dup-export.ts': 'export const a = 1;\nconst b = 2;\nexport { b as a };\n',
    'src/dup-default.jsx': 'export default function A() { return <div />; }\nexport default function B() { return <span />; }\n',
  });

  const byFile = new Map(res.violations.map((v) => [v.file, v]));
  assert.equal(byFile.get('src/dup-const.js')?.kind, 'parse-or-binding-error');
  assert.equal(byFile.get('src/dup-export.ts')?.kind, 'parse-or-binding-error');
  assert.equal(byFile.get('src/dup-default.jsx')?.kind, 'parse-or-binding-error');
});

test('negative proof: catches missing local relative imports and Linux case-mismatched paths', () => {
  const res = makeVirtualTree({
    'src/lib/RealHelper.mjs': 'export const ok = 1;\n',
    'pages/demo.js': [
      "import { ok } from '../src/lib/realhelper.mjs';",
      "import { gone } from '../src/lib/does-not-exist.mjs';",
      'export default function Demo() { return <div>{ok}{gone}</div>; }',
    ].join('\n'),
  });

  const broken = res.violations.filter((v) => v.kind === 'broken-or-case-mismatched-import');
  assert.equal(broken.length, 2);
  assert.ok(broken.some((v) => v.message.includes('realhelper.mjs')));
  assert.ok(broken.some((v) => v.message.includes('does-not-exist.mjs')));
});

test('negative proof: catches missing named import from local static ESM module (and allows TS type exports for .ts/.tsx)', () => {
  const res = makeVirtualTree({
    'src/lib/store.ts': 'export interface StoreRow { id: string }\nexport const realExport = 42;\n',
    'src/good.ts': "import { StoreRow, realExport } from './lib/store';\nexport const x: StoreRow = { id: String(realExport) };\n",
    'src/bad.js': "import { ghostExport } from './lib/store';\nexport const y = ghostExport;\n",
  });

  const missing = res.violations.filter((v) => v.kind === 'missing-local-named-export');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].file, 'src/bad.js');
  assert.match(missing[0].message, /ghostExport/);
});

test('negative proof: catches Next.js pages/ extension collisions and pages/ vs app/ route collisions', () => {
  const res = makeVirtualTree({
    'pages/hub/promo.js': 'export default function A() { return <div />; }\n',
    'pages/hub/promo.tsx': 'export default function B() { return <div />; }\n',
    'pages/hub/clash.js': 'export default function C() { return <div />; }\n',
    'app/hub/clash/page.tsx': 'export default function D() { return <div />; }\n',
  });

  assert.ok(res.violations.some((v) => v.kind === 'route-extension-collision'));
  assert.ok(res.violations.some((v) => v.kind === 'app-pages-route-collision'));
});

test('global CSS outside _app: refused, except the listed page-scoped world sheets while app/layout exists', () => {
  const page = [
    "import '../../src/styles/worlds/video-library.css';",
    "import '../../src/styles/worlds/news.css';",
    'export default function P() { return <div />; }',
  ].join('\n');
  const files = {
    'src/styles/worlds/video-library.css': '.vl-a{}\n',
    'src/styles/worlds/news.css': '.n{}\n',
    'pages/hub/video-library.js': page,
    'src/components/X.js': "import '../styles/worlds/video-library.css';\nexport default function X() { return null; }\n",
  };
  const kinds = (res) => res.violations.filter((v) => v.kind === 'next-global-css-outside-app').map((v) => `${v.file} ${v.message.split('"')[1]}`);

  // No App Router root layout: Next refuses page-level global CSS, so does the gate.
  assert.equal(kinds(makeVirtualTree(files)).length, 3);

  // With app/layout.js the pages layer may import global CSS, but only the listed sheets, only from pages/.
  const withApp = kinds(makeVirtualTree({ ...files, 'app/layout.js': 'export default function L({ children }) { return children; }\n' }));
  assert.deepEqual(withApp.sort(), [
    'pages/hub/video-library.js ../../src/styles/worlds/news.css',
    'src/components/X.js ../styles/worlds/video-library.css',
  ]);
});

test('integration proof: git merge-tree catches cleanly auto-merged cross-PR duplicate import before merge', (t) => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-merge-tree-guard-'));
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));

  const git = (...args) =>
    execFileSync('git', args, { cwd: repoDir, env: cleanGitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  const writeAndCommit = (files, msg) => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(repoDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf8');
      git('add', '--', rel);
    }
    git('commit', '-m', msg);
  };

  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');

  const pad = Array.from({ length: 30 }, (_, i) => `const filler${i} = ${i};`).join('\n');
  writeAndCommit(
    {
      'src/lib/a.mjs': 'export const vipCheckoutAnalytics = () => 1;\n',
      'src/lib/b.mjs': 'export const vipCheckoutAnalytics = () => 2;\nexport const other = 3;\n',
      'pages/store.js': `import React from 'react';\n${pad}\nexport default function Store() { return <div />; }\n`,
    },
    'base',
  );

  // Branch B (like #3136) branches from base and adds import near the bottom of header block
  git('checkout', '-b', 'pr-b');
  writeAndCommit(
    {
      'pages/store.js': `import React from 'react';\n${pad}\nimport { vipCheckoutAnalytics, other } from '../src/lib/b.mjs';\nconst useB = () => [vipCheckoutAnalytics, other];\nexport default function Store() { return <div />; }\n`,
    },
    'pr-b adds import from b.mjs',
  );

  // Meanwhile PR A (like #3131) merges onto main adding import at line 1 — non-overlapping hunk!
  git('checkout', 'main');
  writeAndCommit(
    {
      'pages/store.js': `import { vipCheckoutAnalytics } from '../src/lib/a.mjs';\nimport React from 'react';\nconst useA = () => vipCheckoutAnalytics;\n${pad}\nexport default function Store() { return <div />; }\n`,
    },
    'pr-a adds import from a.mjs',
  );

  // Switch back to pr-b: on its own, pr-b is 100% syntactically valid!
  git('checkout', 'pr-b');
  const soloRes = validateWorkingTree(repoDir);
  assert.equal(soloRes.violations.length, 0, 'pr-b alone is valid (just like #3136 was)');

  // Simulated merge onto main catches the cross-PR SyntaxError BEFORE merge!
  const mergeRes = validateSimulatedMerge(repoDir, 'main', 'HEAD');
  assert.equal(mergeRes.skipped, false);
  assert.equal(mergeRes.violations.length, 1);
  assert.equal(mergeRes.violations[0].kind, 'parse-or-binding-error');
  assert.equal(mergeRes.violations[0].file, 'pages/store.js');
  assert.match(mergeRes.violations[0].message, /vipCheckoutAnalytics.*already been declared/i);
});

test('gate is wired into both Pre-Deploy Safety Checks (CI) and pre-push-js-safety.sh', () => {
  const ciYml = fs.readFileSync(path.join(ROOT, '.github/workflows/build-safety-gate.yml'), 'utf8');
  const hook = fs.readFileSync(path.join(ROOT, 'scripts/hooks/pre-push-js-safety.sh'), 'utf8');

  assert.match(
    ciYml,
    /node scripts\/ci\/check-module-parse-and-bindings\.mjs/,
    'build-safety-gate.yml must execute check-module-parse-and-bindings.mjs inside Pre-Deploy Safety Checks',
  );
  assert.match(
    ciYml,
    /--merge-against/,
    'build-safety-gate.yml must run simulated merge-tree validation against the base branch',
  );
  assert.match(
    hook,
    /check-module-parse-and-bindings\.mjs/,
    'scripts/hooks/pre-push-js-safety.sh must invoke check-module-parse-and-bindings.mjs',
  );
  assert.match(
    hook,
    /--merge-against refs\/remotes\/origin\/main/,
    'pre-push-js-safety.sh must validate the simulated merge against refs/remotes/origin/main',
  );
});

test('every pre-build test in scripts["build:vercel"] also gates PRs in Pre-Deploy Safety Checks', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const ciYml = fs.readFileSync(path.join(ROOT, '.github/workflows/build-safety-gate.yml'), 'utf8');
  const safetyStart = ciYml.indexOf('\n  safety-checks:');
  const notifyStart = ciYml.indexOf('\n  notify-failure:', safetyStart);
  assert.ok(safetyStart > 0 && notifyStart > safetyStart, 'could not isolate safety-checks job in build-safety-gate.yml');
  const safetyJob = ciYml.slice(safetyStart, notifyStart);

  const buildVercel = pkg.scripts?.['build:vercel'] ?? '';
  const testSegments = buildVercel
    .split('&&')
    .map((s) => s.trim())
    .filter((s) => /\bnpm run test:/.test(s) || /\bnode\b[^&]*\s--test\b/.test(s));

  assert.ok(testSegments.length > 0, 'expected at least one pre-build test command in scripts["build:vercel"]');

  const missingInCi = [];
  for (const seg of testSegments) {
    const core = seg.replace(/^NODE_ENV=test\s+/, '').trim();
    if (!safetyJob.includes(core)) {
      missingInCi.push(core);
    }
  }

  assert.deepEqual(
    missingInCi,
    [],
    'Every pre-build test command in scripts["build:vercel"] must also execute inside Pre-Deploy Safety Checks ' +
      '(build-safety-gate.yml), otherwise a PR can pass CI and immediately fail Vercel deployment (incident 86bcafc1 / #3143):\n' +
      missingInCi.map((c) => `  - ${c}`).join('\n'),
  );
});

test('CLI --merge-only catches cross-PR duplicate import without checking out PR code and fails closed on missing refs', (t) => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-merge-only-guard-'));
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));

  const git = (...args) =>
    execFileSync('git', args, { cwd: repoDir, env: cleanGitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  const writeAndCommit = (files, msg) => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(repoDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf8');
      git('add', '--', rel);
    }
    git('commit', '-m', msg);
  };

  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');

  const pad = Array.from({ length: 30 }, (_, i) => `const filler${i} = ${i};`).join('\n');
  writeAndCommit(
    {
      'src/lib/a.mjs': 'export const sharedFn = () => 1;\n',
      'src/lib/b.mjs': 'export const sharedFn = () => 2;\nexport const extra = 3;\n',
      'pages/store.js': `import React from 'react';\n${pad}\nexport default function Store() { return <div />; }\n`,
    },
    'base',
  );

  // Clean up-to-date PR branch (no syntax errors)
  git('checkout', '-b', 'pr-clean');
  writeAndCommit(
    {
      'pages/clean.js': "import { extra } from '../src/lib/b.mjs';\nexport default function Clean() { return <div>{extra}</div>; }\n",
    },
    'pr-clean',
  );
  const cleanSha = git('rev-parse', 'HEAD');

  // PR B branches off base and adds import near bottom
  git('checkout', 'main');
  git('checkout', '-b', 'pr-b');
  writeAndCommit(
    {
      'pages/store.js': `import React from 'react';\n${pad}\nimport { sharedFn, extra } from '../src/lib/b.mjs';\nconst useB = () => [sharedFn, extra];\nexport default function Store() { return <div />; }\n`,
    },
    'pr-b',
  );
  const prBSha = git('rev-parse', 'HEAD');

  // PR A lands on main adding import at line 1
  git('checkout', 'main');
  writeAndCommit(
    {
      'pages/store.js': `import { sharedFn } from '../src/lib/a.mjs';\nimport React from 'react';\nconst useA = () => sharedFn;\n${pad}\nexport default function Store() { return <div />; }\n`,
    },
    'pr-a',
  );

  const scriptPath = path.join(ROOT, 'scripts/ci/check-module-parse-and-bindings.mjs');
  const runCli = (args) => {
    try {
      const stdout = execFileSync(process.execPath, [scriptPath, '--repo', repoDir, ...args], {
        env: cleanGitEnv,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, stdout, stderr: '' };
    } catch (err) {
      return {
        status: typeof err.status === 'number' ? err.status : 1,
        stdout: err.stdout ? String(err.stdout) : '',
        stderr: err.stderr ? String(err.stderr) : '',
      };
    }
  };

  // Working tree stays on main the entire time (simulating pull_request_target).
  assert.equal(git('rev-parse', '--abbrev-ref', 'HEAD'), 'main');

  // 1. Clean PR passes --merge-only.
  const okRes = runCli(['--merge-only', '--merge-against', 'main', '--head', cleanSha]);
  assert.equal(okRes.status, 0, okRes.stderr);

  // 2. Colliding PR B fails --merge-only against advanced main!
  const failRes = runCli(['--merge-only', '--merge-against', 'main', '--head', prBSha]);
  assert.equal(failRes.status, 1, 'must fail when simulated merge onto main creates duplicate import');
  assert.match(failRes.stderr, /sharedFn.*already been declared/i);

  // 3. Missing ref fails closed (never silently skips in --merge-only mode).
  const missingRefRes = runCli(['--merge-only', '--merge-against', 'origin/does-not-exist', '--head', prBSha]);
  assert.equal(missingRefRes.status, 1, '--merge-only must fail closed when base ref is missing');
  assert.match(missingRefRes.stderr, /could not run/i);

  // Working tree remained untouched on main.
  assert.equal(git('rev-parse', '--abbrev-ref', 'HEAD'), 'main');
});

test('strict:false race closure: agent-autopilot.yml validates read-only merge-tree BEFORE minting App token, and CHECK 28b re-validates at end of Pre-Deploy Safety Checks', () => {
  const autopilotYml = fs.readFileSync(path.join(ROOT, '.github/workflows/agent-autopilot.yml'), 'utf8');
  const ciYml = fs.readFileSync(path.join(ROOT, '.github/workflows/build-safety-gate.yml'), 'utf8');

  // Security boundary: agent-autopilot.yml ONLY checks out default_branch, never PR code.
  assert.match(autopilotYml, /ref:\s*\$\{\{\s*github\.event\.repository\.default_branch\s*\}\}/);
  assert.match(autopilotYml, /fetch-depth:\s*0/);
  assert.doesNotMatch(autopilotYml, /ref:\s*\$\{\{\s*github\.event\.pull_request\.head/);

  // Simulated merge-tree check must run BEFORE actions/create-github-app-token.
  const mergeCheckIdx = autopilotYml.indexOf('node scripts/ci/check-module-parse-and-bindings.mjs');
  const appTokenIdx = autopilotYml.indexOf('uses: actions/create-github-app-token');
  assert.ok(mergeCheckIdx > 0 && appTokenIdx > 0, 'both merge-tree gate and app token step must exist');
  assert.ok(
    mergeCheckIdx < appTokenIdx,
    'read-only merge-tree check must execute BEFORE minting the GitHub App installation token',
  );
  assert.match(autopilotYml, /--merge-only/);
  assert.match(autopilotYml, /\^\[0-9a-f\]\{40\}\$/);

  // Cache-miss auth hardening: on a lockfile bump miss, npm ci must authenticate
  // to GitHub Packages and never mutate the shared nm-wh-noscripts cache.
  assert.match(autopilotYml, /packages:\s*read/);
  assert.match(autopilotYml, /registry-url:\s*'https:\/\/npm\.pkg\.github\.com'/);
  assert.match(autopilotYml, /scope:\s*'@smarter-poker'/);
  assert.match(autopilotYml, /uses:\s*actions\/cache\/restore@v4/);
  assert.match(autopilotYml, /NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_AUTH_TOKEN\s*\}\}/);
  assert.match(autopilotYml, /NPM_TOKEN:\s*\$\{\{\s*secrets\.NPM_AUTH_TOKEN\s*\}\}/);

  // Pre-Deploy Safety Checks must re-fetch origin/$BASE_BRANCH and re-run --merge-only right before finishing.
  const safetyStart = ciYml.indexOf('\n  safety-checks:');
  const notifyStart = ciYml.indexOf('\n  notify-failure:', safetyStart);
  const safetyJob = ciYml.slice(safetyStart, notifyStart);
  const check28bIdx = safetyJob.indexOf('CHECK 28b: Final pre-merge simulated merge-tree parity');
  const pg17Idx = safetyJob.indexOf('Run PostgreSQL 17 Qualification Suites In Parallel');
  assert.ok(check28bIdx > pg17Idx && pg17Idx > 0, 'CHECK 28b must run at the end of Pre-Deploy Safety Checks after PG17 suites');
  assert.match(safetyJob.slice(check28bIdx), /git fetch --no-tags origin/);
  assert.match(safetyJob.slice(check28bIdx), /--merge-only/);
});
