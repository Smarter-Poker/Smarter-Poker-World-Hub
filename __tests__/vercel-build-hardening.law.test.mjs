/**
 * __tests__/vercel-build-hardening.law.test.mjs
 *
 * Adversarial regression fortress for World Hub Vercel deployment & build-gate
 * hardening (follow-up to incident 86bcafc1 / VercelDeploymentFailed).
 *
 * Proves that scripts/ci/check-module-parse-and-bindings.mjs,
 * __tests__/vercel-json-is-deployable.law.test.mjs,
 * __tests__/shared-game-links.test.mjs, and scripts/hooks/pre-push-js-safety.sh
 * catch every remaining Vercel build-failure vector:
 *   1. Missing / case-mismatched @/* path-alias imports & re-exports.
 *   2. Missing named exports imported via @/* alias.
 *   3. Missing / case-mismatched dynamic import() and require() local/@/ targets.
 *   4. Missing default export when default-importing a local/@/ static ESM module
 *      (while allowing CJS and export-* targets).
 *   5. Next.js pages exporting both getStaticProps and getServerSideProps, or
 *      getStaticPaths without getStaticProps.
 *   6. Importing next/document outside pages/_document.*.
 *   7. Importing local global CSS outside pages/_app.* / app/** (while allowing
 *      *.module.css, pages/_app.*, and app/**).
 *   8. Malformed imported .json files and malformed critical config JSON
 *      (vercel.json, package.json, config/*.json), including under simulated merge.
 *   9. Required CI wiring into _test-guards-exist.test.mjs (CHECK 8) and
 *      config-only pre-push enforcement in pre-push-js-safety.sh.
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
} from '../scripts/ci/check-module-parse-and-bindings.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cleanGitEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith('GIT_') && !['NODE_PATH', 'NODE_OPTIONS'].includes(key),
  ),
);

function makeVirtualTree(fileMap) {
  return validateModuleTree({
    allTrackedFiles: Object.keys(fileMap),
    readFile: (f) => {
      if (!(f in fileMap)) throw new Error(`missing virtual file ${f}`);
      return fileMap[f];
    },
  });
}

test('negative proof: catches missing, case-mismatched, and missing-export @/* path-alias imports', () => {
  const res = makeVirtualTree({
    'src/lib/AliasHelper.mjs': 'export const realValue = 1;\n',
    'pages/alias-bad.js': [
      "import { realValue } from '@/src/lib/aliashelper.mjs';",
      "import { missingExport } from '@/src/lib/AliasHelper.mjs';",
      "import { gone } from '@/src/lib/does-not-exist.mjs';",
      'export default function AliasBad() { return <div>{realValue}{missingExport}{gone}</div>; }',
    ].join('\n'),
    'src/reexport-bad.js': "export * from '@/src/lib/missing-reexport.mjs';\n",
  });

  const broken = res.violations.filter((v) => v.kind === 'broken-or-case-mismatched-import');
  const missingNamed = res.violations.filter((v) => v.kind === 'missing-local-named-export');

  assert.equal(broken.length, 3);
  assert.ok(broken.some((v) => v.message.includes('@/src/lib/aliashelper.mjs')));
  assert.ok(broken.some((v) => v.message.includes('@/src/lib/does-not-exist.mjs')));
  assert.ok(broken.some((v) => v.message.includes('@/src/lib/missing-reexport.mjs')));
  assert.equal(missingNamed.length, 1);
  assert.match(missingNamed[0].message, /missingExport/);
});

test('negative proof: catches broken or case-mismatched dynamic import() and require() paths', () => {
  const res = makeVirtualTree({
    'src/components/RealModal.jsx': 'export default function RealModal() { return <div />; }\n',
    'src/lib/realCjs.cjs': 'module.exports = { ok: true };\n',
    'pages/dynamic-bad.js': [
      "import dynamic from 'next/dynamic';",
      "const BadDyn = dynamic(() => import('../src/components/realmodal.jsx'));",
      "const BadAliasDyn = dynamic(() => import('@/src/components/MissingModal'));",
      "const badReq = require('../src/lib/missingCjs.cjs');",
      "const goodDyn = () => import('../src/components/RealModal.jsx');",
      "const goodReq = () => require('../src/lib/realCjs.cjs');",
      'export default function DynPage() { return <div>{BadDyn && BadAliasDyn && badReq && goodDyn && goodReq}</div>; }',
    ].join('\n'),
  });

  const broken = res.violations.filter((v) => v.kind === 'broken-or-case-mismatched-import');
  assert.equal(broken.length, 3);
  assert.ok(broken.some((v) => v.message.includes('realmodal.jsx')));
  assert.ok(broken.some((v) => v.message.includes('@/src/components/MissingModal')));
  assert.ok(broken.some((v) => v.message.includes('missingCjs.cjs')));
});

test('negative proof: catches default import from local/@/ static ESM module with no default export', () => {
  const res = makeVirtualTree({
    'src/lib/namedOnly.mjs': 'export const alpha = 1;\n',
    'src/lib/hasDefault.mjs': 'export default function ok() { return 1; }\n',
    'src/lib/cjsMod.js': 'module.exports = function legacy() { return 2; };\n',
    'src/lib/reExportAll.mjs': "export * from './hasDefault.mjs';\n",
    'pages/default-check.js': [
      "import NamedOnly from '../src/lib/namedOnly.mjs';",
      "import AliasNamedOnly from '@/src/lib/namedOnly.mjs';",
      "import GoodDefault from '../src/lib/hasDefault.mjs';",
      "import GoodCjs from '../src/lib/cjsMod.js';",
      "import GoodStar from '../src/lib/reExportAll.mjs';",
      'export default function Page() { return <div>{String(NamedOnly || AliasNamedOnly || GoodDefault || GoodCjs || GoodStar)}</div>; }',
    ].join('\n'),
  });

  const missingDefaults = res.violations.filter((v) => v.kind === 'missing-local-default-export');
  assert.equal(missingDefaults.length, 2);
  assert.ok(missingDefaults.every((v) => v.file === 'pages/default-check.js'));
});

test('negative proof: catches Next.js page data-method conflicts, next/document misuse, and global CSS outside _app', () => {
  const res = makeVirtualTree({
    'styles/global.css': 'body { margin: 0; }\n',
    'styles/card.module.css': '.card { padding: 8px; }\n',
    'pages/_document.js': "import { Html, Head, Main, NextScript } from 'next/document';\nexport default function Doc() { return <Html><Head /><body><Main /><NextScript /></body></Html>; }\n",
    'pages/_app.js': "import '../styles/global.css';\nexport default function App({ Component, pageProps }) { return <Component {...pageProps} />; }\n",
    'app/layout.tsx': "import '../styles/global.css';\nexport default function Layout({ children }: { children: unknown }) { return <div>{children}</div>; }\n",
    'pages/conflict.js': [
      'export async function getStaticProps() { return { props: {} }; }',
      'export async function getServerSideProps() { return { props: {} }; }',
      'export default function Conflict() { return <div />; }',
    ].join('\n'),
    'pages/orphan-paths.js': [
      'export async function getStaticPaths() { return { paths: [], fallback: false }; }',
      'export default function OrphanPaths() { return <div />; }',
    ].join('\n'),
    'pages/bad-doc.js': [
      "import { Html } from 'next/document';",
      'export default function BadDoc() { return <Html />; }',
    ].join('\n'),
    'pages/bad-css.js': [
      "import '../styles/global.css';",
      "import styles from '../styles/card.module.css';",
      'export default function BadCss() { return <div className={styles.card} />; }',
    ].join('\n'),
  });

  const kinds = new Set(res.violations.map((v) => `${v.kind}:${v.file}`));
  assert.ok(kinds.has('next-page-data-method-conflict:pages/conflict.js'));
  assert.ok(kinds.has('next-page-static-paths-without-props:pages/orphan-paths.js'));
  assert.ok(kinds.has('next-document-import-outside-document:pages/bad-doc.js'));
  assert.ok(kinds.has('next-global-css-outside-app:pages/bad-css.js'));
  assert.equal(res.violations.length, 4, `Expected exactly 4 violations, got: ${JSON.stringify(res.violations)}`);
});

test('negative proof: catches invalid JSON in critical config files and imported JSON data', () => {
  const res = makeVirtualTree({
    'vercel.json': '{ "framework": "nextjs", }\n',
    'config/geo-blocks.json': '{ "denied_countries": ["KP"] }\n',
    'src/data/broken.json': '{ "bad": }\n',
    'pages/json-consumer.js': "import data from '../src/data/broken.json';\nexport default function P() { return <div>{String(data)}</div>; }\n",
  });

  const badJson = res.violations.filter((v) => v.kind === 'invalid-json');
  assert.equal(badJson.length, 2);
  assert.ok(badJson.some((v) => v.file === 'vercel.json'));
  assert.ok(badJson.some((v) => v.file === 'src/data/broken.json'));
});

test('integration proof: git merge-tree catches broken vercel.json introduced on a branch', (t) => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-json-merge-guard-'));
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

  writeAndCommit(
    {
      'vercel.json': '{"framework":"nextjs"}\n',
      'pages/index.js': 'export default function Home() { return <div />; }\n',
    },
    'base',
  );

  git('checkout', '-b', 'bad-config');
  writeAndCommit({ 'vercel.json': '{"framework":"nextjs",}\n' }, 'break vercel.json');

  git('checkout', 'main');
  writeAndCommit({ 'pages/other.js': 'export default function Other() { return <div />; }\n' }, 'advance main');

  git('checkout', 'bad-config');
  const mergeRes = validateSimulatedMerge(repoDir, 'main', 'HEAD');
  assert.equal(mergeRes.skipped, false);
  assert.ok(mergeRes.violations.some((v) => v.kind === 'invalid-json' && v.file === 'vercel.json'));
});

test('wiring proof: vercel-json deployability, shared-game-links, and this fortress are wired into required CI & pre-push', () => {
  const registry = fs.readFileSync(path.join(ROOT, '__tests__/_test-guards-exist.test.mjs'), 'utf8');
  const prePush = fs.readFileSync(path.join(ROOT, 'scripts/hooks/pre-push-js-safety.sh'), 'utf8');

  assert.match(registry, /import\s+['"]\.\/vercel-json-is-deployable\.law\.test\.mjs['"]/);
  assert.match(registry, /import\s+['"]\.\/shared-game-links\.test\.mjs['"]/);
  assert.match(registry, /import\s+['"]\.\/vercel-build-hardening\.law\.test\.mjs['"]/);
  assert.match(
    prePush,
    /DEPLOY_CONFIG_FILES/,
    'pre-push-js-safety.sh must validate deploy/config JSON changes even when no JS/TS files changed',
  );
  assert.match(
    prePush,
    /vercel-json-is-deployable\.law\.test\.mjs/,
    'pre-push-js-safety.sh must run vercel-json-is-deployable.law.test.mjs on config changes',
  );
});
