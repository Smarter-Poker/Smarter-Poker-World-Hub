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
