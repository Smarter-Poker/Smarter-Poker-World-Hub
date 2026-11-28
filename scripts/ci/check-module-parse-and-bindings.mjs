#!/usr/bin/env node
/**
 * scripts/ci/check-module-parse-and-bindings.mjs
 *
 * Permanent Vercel-build safety gate (incident 86bcafc1 / VercelDeploymentFailed).
 *
 * Parses application source modules with @babel/parser (errorRecovery: false)
 * and catches five classes of production Next.js/Vercel build failures in one pass:
 *   1. Syntax errors, duplicate import bindings (e.g. 208edab4 #3131+#3136),
 *      duplicate top-level const/let/function/class declarations, and duplicate
 *      named or default exports (#3138) across .js/.jsx/.mjs/.cjs/.ts/.tsx.
 *   2. Missing, untracked, or Linux case-mismatched local relative imports/re-exports.
 *   3. Missing named imports from local static ESM modules (generalizing CHECK 1c
 *      beyond authUtils to the entire codebase).
 *   4. Next.js route collisions (same-basename different extensions in pages/,
 *      or pages/ colliding with app/.../page.*).
 *   5. Cross-PR merge regressions under strict:false branch protection: when
 *      --merge-against <baseRef> is passed and HEAD is behind <baseRef>, runs
 *      read-only `git merge-tree --write-tree <baseRef> HEAD` and validates the
 *      exact merged tree before merge so two independently-green PRs cannot
 *      combine into a SyntaxError on main.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const SOURCE_ROOTS = ['pages', 'app', 'src', 'components', 'lib', 'utils'];
export const MODULE_EXT_RE = /\.(js|jsx|mjs|cjs|ts|tsx)$/;
export const CRITICAL_CONFIG_JSON_RE =
  /^(?:vercel|package|package-lock|tsconfig|jsconfig)\.json$|^config\/.*\.json$/;
const RESOLVE_EXTS = [
  '',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '/index.js',
  '/index.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.mjs',
];
const ASSET_EXT_RE =
  /\.(css|scss|sass|less|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|mp4|mp3|wav|pdf|txt|md)$/i;
const STYLESHEET_EXT_RE = /\.(css|scss|sass|less)$/i;
const CSS_MODULE_EXT_RE = /\.module\.(css|scss|sass|less)$/i;

function isLocalOrAliasSpec(spec) {
  return typeof spec === 'string' && (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('@/'));
}

function walkAst(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'tokens' || key === 'comments') {
      continue;
    }
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && typeof item.type === 'string') {
          walkAst(item, visitor);
        }
      }
    } else if (val && typeof val === 'object' && typeof val.type === 'string') {
      walkAst(val, visitor);
    }
  }
}

let cachedBabelParse = null;
function getBabelParse(resolveFromDir) {
  if (resolveFromDir) {
    try {
      const localRequire = createRequire(path.join(resolveFromDir, 'package.json'));
      return localRequire('@babel/parser').parse;
    } catch {
      // Fall through to the gate's own installed @babel/parser (e.g. isolated temp git fixtures).
    }
  }
  if (!cachedBabelParse) {
    cachedBabelParse = require('@babel/parser').parse;
  }
  return cachedBabelParse;
}

export function babelPluginsForFile(filePath) {
  const isTS = /\.(ts|tsx)$/.test(filePath);
  const isPlainTS = /\.ts$/.test(filePath);
  return [
    ...(isTS ? ['typescript'] : []),
    ...(isPlainTS ? [] : ['jsx']),
    'decorators-legacy',
    'classProperties',
    'optionalChaining',
    'nullishCoalescingOperator',
    'importAttributes',
    'topLevelAwait',
  ];
}

export function parseModuleAst(filePath, source, { parseFn } = {}) {
  const parse = parseFn || getBabelParse();
  const isCJS = /\.cjs$/.test(filePath);
  return parse(source, {
    sourceType: isCJS ? 'script' : 'unambiguous',
    plugins: babelPluginsForFile(filePath),
    errorRecovery: false,
  });
}

function collectPatternNames(node, out) {
  if (!node) return;
  if (node.type === 'Identifier') {
    out.add(node.name);
  } else if (node.type === 'ObjectPattern') {
    for (const prop of node.properties) {
      collectPatternNames(prop.type === 'RestElement' ? prop.argument : prop.value, out);
    }
  } else if (node.type === 'ArrayPattern') {
    for (const el of node.elements) collectPatternNames(el, out);
  } else if (node.type === 'AssignmentPattern') {
    collectPatternNames(node.left, out);
  } else if (node.type === 'RestElement') {
    collectPatternNames(node.argument, out);
  }
}

export function extractModuleSurface(filePath, source, ast) {
  const isCJS = /\.cjs$/.test(filePath);
  const valueExports = new Set();
  const typeExports = new Set();
  const duplicateExports = [];
  let defaultExportCount = 0;
  let hasDefault = false;
  let hasStarReExport = false;
  const isDynamicCjs =
    isCJS || /\bmodule\.exports\b|\bexports\s*[.[]|\bObject\.defineProperty\(\s*exports\b/.test(source);

  const relativeImports = [];
  const relativeNamedImports = [];
  const relativeDefaultImports = [];
  const nextDocumentImports = [];
  const localGlobalCssImports = [];

  const recordValueExport = (name, line) => {
    if (valueExports.has(name)) {
      duplicateExports.push({ name, line });
    } else {
      valueExports.add(name);
    }
  };

  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      const spec = node.source?.value;
      const line = node.loc?.start?.line ?? 0;
      if (node.importKind !== 'type' && spec) {
        if (spec === 'next/document') {
          nextDocumentImports.push({ spec, line });
        }
        if (
          (spec.startsWith('./') || spec.startsWith('../')) &&
          STYLESHEET_EXT_RE.test(spec) &&
          !CSS_MODULE_EXT_RE.test(spec)
        ) {
          localGlobalCssImports.push({ spec, line });
        }
        if (isLocalOrAliasSpec(spec)) {
          relativeImports.push({ spec, line, kind: 'static' });
          const names = [];
          for (const sp of node.specifiers || []) {
            if (sp.importKind === 'type') continue;
            if (sp.type === 'ImportSpecifier') {
              const imported = sp.imported?.name ?? sp.imported?.value;
              if (imported === 'default') {
                relativeDefaultImports.push({
                  spec,
                  line: sp.loc?.start?.line ?? line,
                });
              } else if (imported) {
                names.push({ imported, line: sp.loc?.start?.line ?? line });
              }
            } else if (sp.type === 'ImportDefaultSpecifier') {
              relativeDefaultImports.push({
                spec,
                line: sp.loc?.start?.line ?? line,
              });
            }
          }
          if (names.length > 0) {
            relativeNamedImports.push({ spec, names });
          }
        }
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      hasDefault = true;
      defaultExportCount += 1;
      if (defaultExportCount > 1) {
        duplicateExports.push({ name: 'default', line: node.loc?.start?.line ?? 0 });
      }
    } else if (node.type === 'ExportAllDeclaration') {
      hasStarReExport = true;
      const spec = node.source?.value;
      if (node.exportKind !== 'type' && isLocalOrAliasSpec(spec)) {
        relativeImports.push({ spec, line: node.loc?.start?.line ?? 0, kind: 're-export' });
      }
    } else if (node.type === 'ExportNamedDeclaration') {
      const spec = node.source?.value;
      if (node.exportKind !== 'type' && isLocalOrAliasSpec(spec)) {
        relativeImports.push({ spec, line: node.loc?.start?.line ?? 0, kind: 're-export' });
      }
      const isTypeOnlyDecl =
        node.exportKind === 'type' ||
        node.declaration?.type === 'TSInterfaceDeclaration' ||
        node.declaration?.type === 'TSTypeAliasDeclaration';
      const isFunctionOverload =
        node.declaration?.type === 'TSDeclareFunction';
      const line = node.loc?.start?.line ?? 0;

      if (node.declaration && !isFunctionOverload) {
        const d = node.declaration;
        if (isTypeOnlyDecl) {
          if (d.id?.name) typeExports.add(d.id.name);
        } else if (d.type === 'VariableDeclaration') {
          const names = new Set();
          for (const decl of d.declarations) collectPatternNames(decl.id, names);
          for (const n of names) recordValueExport(n, line);
        } else if (d.id?.name) {
          recordValueExport(d.id.name, line);
        }
      }
      for (const sp of node.specifiers || []) {
        const exported = sp.exported?.name ?? sp.exported?.value;
        if (!exported) continue;
        const spLine = sp.loc?.start?.line ?? line;
        if (sp.exportKind === 'type' || node.exportKind === 'type') {
          typeExports.add(exported);
        } else if (exported === 'default') {
          hasDefault = true;
          defaultExportCount += 1;
          if (defaultExportCount > 1) duplicateExports.push({ name: 'default', line: spLine });
        } else {
          recordValueExport(exported, spLine);
        }
      }
    }
  }

  // Dynamic import('...') and CommonJS require('...') with static local/@/ string literals
  walkAst(ast.program, (node) => {
    if (node.type !== 'CallExpression') return;
    const firstArg = node.arguments?.[0];
    if (!firstArg || firstArg.type !== 'StringLiteral') return;
    const spec = firstArg.value;
    if (!isLocalOrAliasSpec(spec)) return;
    const line = node.loc?.start?.line ?? 0;
    if (node.callee?.type === 'Import') {
      relativeImports.push({ spec, line, kind: 'dynamic-import' });
    } else if (node.callee?.type === 'Identifier' && node.callee.name === 'require') {
      relativeImports.push({ spec, line, kind: 'require' });
    }
  });

  return {
    valueExports,
    typeExports,
    duplicateExports,
    hasDefault,
    hasStarReExport,
    isDynamicCjs,
    relativeImports,
    relativeNamedImports,
    relativeDefaultImports,
    nextDocumentImports,
    localGlobalCssImports,
  };
}

/**
 * Page-scoped world stylesheets (__tests__/site-wide-payload-budget.test.mjs).
 *
 * The rule above mirrors Next's Pages Router restriction. Next lifts it for
 * the pages layer when the project also has an App Router root layout: with
 * `app/` present, webpack's pages rule has no issuer restriction
 * (next/dist/build/webpack/config/blocks/css/index.js, allowedPagesGlobalCSS*
 * are undefined when ctx.hasAppDir). PR #3252 proved it on the real build
 * (Vercel Build Parity green) while moving the Video Library CSS out of _app,
 * where every page of the site downloaded it.
 *
 * So the exception is narrow: only these stylesheets, only from pages/, and
 * only while app/layout.* is tracked. Delete app/ and these imports fail here
 * before they can fail a Vercel build.
 */
export const PAGE_SCOPED_GLOBAL_CSS = new Set([
  'src/styles/worlds/video-library.css',
  'src/styles/worlds/video-library-pages.css',
]);

export function isAllowedPageScopedGlobalCss(fromFile, spec, trackedSet) {
  if (!fromFile.startsWith('pages/')) return false;
  const hasAppRootLayout = [...trackedSet].some((f) => /^app\/layout\.(js|jsx|ts|tsx)$/.test(f));
  if (!hasAppRootLayout) return false;
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  return PAGE_SCOPED_GLOBAL_CSS.has(target);
}

export function resolveTrackedTarget(fromFile, spec, trackedSet) {
  const relBase = spec.startsWith('@/')
    ? path.posix.normalize(spec.slice(2))
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  if (ASSET_EXT_RE.test(spec)) {
    return trackedSet.has(relBase) ? relBase : null;
  }
  for (const ext of RESOLVE_EXTS) {
    const candidate = relBase + ext;
    if (trackedSet.has(candidate)) return candidate;
  }
  return null;
}

export function findNextRouteCollisions(trackedFiles) {
  const violations = [];

  // 1. Same-basename different extensions inside pages/ (e.g. pages/foo.js + pages/foo.tsx)
  const baseMap = new Map();
  for (const file of trackedFiles) {
    if (!file.startsWith('pages/') || !MODULE_EXT_RE.test(file)) continue;
    const noExt = file.replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/, '');
    if (!baseMap.has(noExt)) baseMap.set(noExt, []);
    baseMap.get(noExt).push(file);
  }
  for (const [base, group] of baseMap) {
    if (group.length > 1) {
      violations.push({
        kind: 'route-extension-collision',
        file: group[0],
        message: `Multiple Next.js pages share basename "${base}": ${group.sort().join(', ')}`,
      });
    }
  }

  // 2. pages/ route colliding with app/.../page.*
  const appRoutes = new Map();
  for (const file of trackedFiles) {
    if (!file.startsWith('app/')) continue;
    if (!/^app\/(?:.*\/)?page\.(js|jsx|ts|tsx)$/.test(file)) continue;
    const route = file.replace(/^app/, '').replace(/\/page\.(js|jsx|ts|tsx)$/, '') || '/';
    appRoutes.set(route, file);
  }
  for (const file of trackedFiles) {
    if (!file.startsWith('pages/') || file.startsWith('pages/api/') || !MODULE_EXT_RE.test(file)) {
      continue;
    }
    let rel = file.slice('pages/'.length).replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/, '');
    if (['_app', '_document', '_error', '404', '500'].includes(rel)) continue;
    if (rel.endsWith('/index')) rel = rel.slice(0, -'/index'.length);
    if (rel === 'index') rel = '';
    const route = '/' + rel;
    if (appRoutes.has(route)) {
      violations.push({
        kind: 'app-pages-route-collision',
        file,
        message: `Conflicting pages/ and app/ route "${route}": ${file} vs ${appRoutes.get(route)}`,
      });
    }
  }

  return violations;
}

/**
 * Validate a virtual or real repository tree.
 *
 * @param {object} params
 * @param {string[]} params.allTrackedFiles - All tracked file paths (POSIX) for exact-case import & route resolution.
 * @param {(filePath: string) => string} params.readFile - Reads UTF-8 source of a tracked file.
 * @param {string[]|null} [params.onlyCheckFiles] - Optional subset of module paths to check (still resolves targets across allTrackedFiles).
 * @param {Function} [params.parseFn] - Optional custom @babel/parser parse function.
 */
export function validateModuleTree({ allTrackedFiles, readFile, onlyCheckFiles = null, parseFn }) {
  const trackedSet = new Set(allTrackedFiles);
  const violations = [...findNextRouteCollisions(allTrackedFiles)];

  const isScannedModule = (f) =>
    MODULE_EXT_RE.test(f) && SOURCE_ROOTS.some((root) => f.startsWith(`${root}/`));

  const isDirectModule = (f) =>
    MODULE_EXT_RE.test(f) && !f.startsWith('node_modules/') && !f.startsWith('.next/');

  const modulesToCheck = onlyCheckFiles
    ? onlyCheckFiles.filter((f) => trackedSet.has(f) && isDirectModule(f))
    : allTrackedFiles.filter(isScannedModule);

  const jsonFilesToCheck = new Set(
    (onlyCheckFiles ? onlyCheckFiles.filter((f) => trackedSet.has(f)) : allTrackedFiles).filter((f) =>
      CRITICAL_CONFIG_JSON_RE.test(f),
    ),
  );

  const surfaceCache = new Map();
  const parseAndCache = (filePath) => {
    if (surfaceCache.has(filePath)) return surfaceCache.get(filePath);
    let source;
    try {
      source = readFile(filePath);
    } catch (err) {
      surfaceCache.set(filePath, null);
      violations.push({
        kind: 'read-error',
        file: filePath,
        message: err.message,
      });
      return null;
    }
    try {
      const ast = parseModuleAst(filePath, source, { parseFn });
      const surface = extractModuleSurface(filePath, source, ast);
      surfaceCache.set(filePath, surface);
      return surface;
    } catch (err) {
      surfaceCache.set(filePath, null);
      const loc = err.loc ? ` (line ${err.loc.line}, col ${err.loc.column})` : '';
      violations.push({
        kind: 'parse-or-binding-error',
        file: filePath,
        message: `${err.message}${loc}`,
      });
      return null;
    }
  };

  for (const filePath of modulesToCheck) {
    parseAndCache(filePath);
  }

  for (const filePath of modulesToCheck) {
    const surface = surfaceCache.get(filePath);
    if (!surface) continue;

    // 1b. Explicit duplicate export check (covers TypeScript files where Babel defers duplicate export errors)
    for (const dup of surface.duplicateExports) {
      violations.push({
        kind: 'parse-or-binding-error',
        file: filePath,
        line: dup.line,
        message: `Duplicate export "${dup.name}" (line ${dup.line})`,
      });
    }

    // 2. Case-exact relative & @/* alias import / re-export / dynamic import / require resolution
    for (const imp of surface.relativeImports) {
      const target = resolveTrackedTarget(filePath, imp.spec, trackedSet);
      if (!target) {
        const label =
          imp.kind === 'dynamic-import'
            ? 'Dynamic import'
            : imp.kind === 'require'
              ? 'require()'
              : imp.spec.startsWith('@/')
                ? 'Alias import'
                : 'Relative import';
        violations.push({
          kind: 'broken-or-case-mismatched-import',
          file: filePath,
          line: imp.line,
          message: `${label} "${imp.spec}" (line ${imp.line}) does not match any tracked file with exact case`,
        });
      } else if (target.endsWith('.json')) {
        jsonFilesToCheck.add(target);
      }
    }

    // 3. Local & @/* static ESM named-export parity
    const importerIsTS = /\.(ts|tsx)$/.test(filePath);
    for (const group of surface.relativeNamedImports) {
      const target = resolveTrackedTarget(filePath, group.spec, trackedSet);
      if (!target || !MODULE_EXT_RE.test(target) || ASSET_EXT_RE.test(target)) continue;
      const targetSurface = parseAndCache(target);
      if (!targetSurface || targetSurface.isDynamicCjs || targetSurface.hasStarReExport) continue;

      for (const { imported, line } of group.names) {
        const hasValue = targetSurface.valueExports.has(imported);
        const hasType = importerIsTS && targetSurface.typeExports.has(imported);
        if (!hasValue && !hasType) {
          violations.push({
            kind: 'missing-local-named-export',
            file: filePath,
            line,
            message: `Named import "${imported}" from "${group.spec}" (line ${line}) is not exported by ${target}`,
          });
        }
      }
    }

    // 3b. Local & @/* static ESM default-export parity
    for (const defImp of surface.relativeDefaultImports) {
      const target = resolveTrackedTarget(filePath, defImp.spec, trackedSet);
      if (!target || !MODULE_EXT_RE.test(target) || ASSET_EXT_RE.test(target)) continue;
      const targetSurface = parseAndCache(target);
      if (!targetSurface || targetSurface.isDynamicCjs || targetSurface.hasStarReExport) continue;
      if (!targetSurface.hasDefault) {
        violations.push({
          kind: 'missing-local-default-export',
          file: filePath,
          line: defImp.line,
          message: `Default import from "${defImp.spec}" (line ${defImp.line}) has no default export in ${target}`,
        });
      }
    }

    // 4. Next.js build-time page & stylesheet invariants
    if (filePath.startsWith('pages/') && !filePath.startsWith('pages/api/')) {
      if (surface.valueExports.has('getStaticProps') && surface.valueExports.has('getServerSideProps')) {
        violations.push({
          kind: 'next-page-data-method-conflict',
          file: filePath,
          message: 'Next.js page cannot export both getStaticProps and getServerSideProps',
        });
      }
      if (surface.valueExports.has('getStaticPaths') && !surface.valueExports.has('getStaticProps')) {
        violations.push({
          kind: 'next-page-static-paths-without-props',
          file: filePath,
          message: 'Next.js page exports getStaticPaths without getStaticProps',
        });
      }
    }

    if (!/^pages\/_document\.(js|jsx|ts|tsx)$/.test(filePath)) {
      for (const docImp of surface.nextDocumentImports) {
        violations.push({
          kind: 'next-document-import-outside-document',
          file: filePath,
          line: docImp.line,
          message: `next/document cannot be imported outside pages/_document.* (line ${docImp.line})`,
        });
      }
    }

    if (!/^pages\/_app\.(js|jsx|ts|tsx)$/.test(filePath) && !filePath.startsWith('app/')) {
      for (const cssImp of surface.localGlobalCssImports) {
        if (isAllowedPageScopedGlobalCss(filePath, cssImp.spec, trackedSet)) continue;
        violations.push({
          kind: 'next-global-css-outside-app',
          file: filePath,
          line: cssImp.line,
          message: `Global CSS "${cssImp.spec}" (line ${cssImp.line}) cannot be imported outside pages/_app.* (use *.module.css)`,
        });
      }
    }
  }

  // 5. Critical config & imported JSON parse validation
  for (const jsonPath of jsonFilesToCheck) {
    try {
      const raw = readFile(jsonPath);
      JSON.parse(raw);
    } catch (err) {
      violations.push({
        kind: 'invalid-json',
        file: jsonPath,
        message: `Invalid JSON: ${err.message}`,
      });
    }
  }

  return {
    checkedCount: modulesToCheck.length,
    violations,
  };
}

function gitExec(repoRoot, args, { allowNonZero = false } = {}) {
  try {
    return {
      status: 0,
      stdout: execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (err) {
    if (allowNonZero) {
      return {
        status: typeof err.status === 'number' ? err.status : 1,
        stdout: err.stdout ? String(err.stdout) : '',
        stderr: err.stderr ? String(err.stderr) : '',
      };
    }
    throw err;
  }
}

export function validateWorkingTree(repoRoot, { onlyCheckFiles = null, parseFn } = {}) {
  const parse = parseFn || getBabelParse(repoRoot);
  const allTrackedFiles = gitExec(repoRoot, ['ls-files'])
    .stdout.split('\n')
    .filter((f) => f && fs.existsSync(path.join(repoRoot, f)));

  return validateModuleTree({
    allTrackedFiles,
    readFile: (f) => fs.readFileSync(path.join(repoRoot, f), 'utf8'),
    onlyCheckFiles,
    parseFn: parse,
  });
}

/**
 * Simulates merging `headRef` into `baseRef` using read-only `git merge-tree --write-tree`
 * (zero working-tree mutations) and validates the merged files that differ from `baseRef`
 * or were touched by both sides (catching cross-PR duplicate imports/declarations/exports
 * even when branch protection has strict:false).
 */
export function validateSimulatedMerge(
  repoRoot,
  baseRef,
  headRef = 'HEAD',
  { parseFn, validateWhenUpToDate = false } = {},
) {
  const parse = parseFn || getBabelParse(repoRoot);

  const baseExists = gitExec(repoRoot, ['rev-parse', '--verify', '--quiet', baseRef], {
    allowNonZero: true,
  });
  if (baseExists.status !== 0) {
    return { skipped: true, reason: `base ref "${baseRef}" is not present locally`, checkedCount: 0, violations: [] };
  }

  const headExists = gitExec(repoRoot, ['rev-parse', '--verify', '--quiet', headRef], {
    allowNonZero: true,
  });
  if (headExists.status !== 0) {
    return { skipped: true, reason: `head ref "${headRef}" is not present locally`, checkedCount: 0, violations: [] };
  }

  const baseSha = baseExists.stdout.trim();
  const headSha = headExists.stdout.trim();
  const mergeBase = gitExec(repoRoot, ['merge-base', baseSha, headSha], { allowNonZero: true });
  if (mergeBase.status !== 0) {
    return { skipped: true, reason: 'no common ancestor between base and head', checkedCount: 0, violations: [] };
  }
  const mergeBaseSha = mergeBase.stdout.trim();

  // If HEAD already includes all of baseRef and the caller already validated the working tree,
  // skip the redundant merge-tree pass. In --merge-only mode (e.g. pull_request_target where
  // PR code is never checked out), validateWhenUpToDate=true validates the PR tree purely from
  // git objects so up-to-date PRs are verified without touching the working tree.
  if (!validateWhenUpToDate && mergeBaseSha === baseSha) {
    return { skipped: true, reason: 'HEAD is already up to date with base', checkedCount: 0, violations: [] };
  }

  const mergeRes = gitExec(repoRoot, ['merge-tree', '--write-tree', baseSha, headSha], {
    allowNonZero: true,
  });
  const firstLine = mergeRes.stdout.split('\n')[0]?.trim() || '';
  if (mergeRes.status !== 0 || !/^[0-9a-f]{40}$/.test(firstLine)) {
    const conflictDetails = mergeRes.stdout
      .split('\n')
      .filter((l) => /CONFLICT/.test(l))
      .slice(0, 10);
    return {
      skipped: false,
      checkedCount: 0,
      violations: [
        {
          kind: 'merge-conflict-against-base',
          file: baseRef,
          message:
            conflictDetails.length > 0
              ? `Merging ${headRef} into ${baseRef} produces conflicts: ${conflictDetails.join(' | ')}`
              : `git merge-tree against ${baseRef} failed (exit ${mergeRes.status}): ${mergeRes.stderr || mergeRes.stdout}`.trim(),
        },
      ],
    };
  }

  const mergedTreeSha = firstLine;
  const allMergedFiles = gitExec(repoRoot, ['ls-tree', '-r', '--name-only', mergedTreeSha])
    .stdout.split('\n')
    .filter(Boolean);

  // Check every file that differs between baseSha and mergedTreeSha (all branch edits + any dual-touched merges).
  const changedInMerge = gitExec(repoRoot, ['diff-tree', '-r', '--name-only', '--diff-filter=ACMR', baseSha, mergedTreeSha])
    .stdout.split('\n')
    .filter(Boolean);

  const blobCache = new Map();
  const readBlob = (filePath) => {
    if (blobCache.has(filePath)) return blobCache.get(filePath);
    const content = gitExec(repoRoot, ['cat-file', '-p', `${mergedTreeSha}:${filePath}`]).stdout;
    blobCache.set(filePath, content);
    return content;
  };

  const result = validateModuleTree({
    allTrackedFiles: allMergedFiles,
    readFile: readBlob,
    onlyCheckFiles: changedInMerge,
    parseFn: parse,
  });

  return {
    skipped: false,
    mergedTreeSha,
    checkedCount: result.checkedCount,
    violations: result.violations.map((v) => ({
      ...v,
      message: `[simulated merge onto ${baseRef}] ${v.message}`,
    })),
  };
}

function parseCliArgs(argv) {
  const opts = {
    repoRoot: process.cwd(),
    mergeAgainst: null,
    head: 'HEAD',
    mergeOnly: false,
    changedSince: null,
    files: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--merge-against' && argv[i + 1]) {
      opts.mergeAgainst = argv[++i];
    } else if (arg === '--head' && argv[i + 1]) {
      opts.head = argv[++i];
    } else if (arg === '--merge-only') {
      opts.mergeOnly = true;
    } else if (arg === '--changed-since' && argv[i + 1]) {
      opts.changedSince = argv[++i];
    } else if (arg === '--repo' && argv[i + 1]) {
      opts.repoRoot = path.resolve(argv[++i]);
    } else if (arg === '--files') {
      opts.files.push(...argv.slice(i + 1));
      break;
    }
  }
  return opts;
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  const t0 = Date.now();

  if (opts.mergeOnly) {
    if (!opts.mergeAgainst) {
      console.error('[check-module-parse-and-bindings] FAILED: --merge-only requires --merge-against <baseRef>.');
      process.exit(1);
    }
    const mergeResult = validateSimulatedMerge(opts.repoRoot, opts.mergeAgainst, opts.head, {
      validateWhenUpToDate: true,
    });
    const elapsedMs = Date.now() - t0;
    if (mergeResult.skipped) {
      console.error(
        `[check-module-parse-and-bindings] FAILED: simulated merge-only check could not run (${mergeResult.reason}, ${elapsedMs}ms).`,
      );
      process.exit(1);
    }
    if (mergeResult.violations.length > 0) {
      console.error(
        `[check-module-parse-and-bindings] FAILED: ${mergeResult.violations.length} violation(s) found in simulated merge (${opts.head} onto ${opts.mergeAgainst}, ${mergeResult.checkedCount} file(s), ${elapsedMs}ms):`,
      );
      for (const v of mergeResult.violations) {
        console.error(`  - [${v.kind}] ${v.file}: ${v.message}`);
      }
      process.exit(1);
    }
    console.log(
      `[check-module-parse-and-bindings] OK: simulated merge (${opts.head} onto ${opts.mergeAgainst}) verified ${mergeResult.checkedCount} file(s) (${elapsedMs}ms).`,
    );
    return;
  }

  let onlyCheckFiles = opts.files.length > 0 ? opts.files : null;
  if (!onlyCheckFiles && opts.changedSince) {
    const diffRes = gitExec(
      opts.repoRoot,
      ['diff', '--name-only', '--diff-filter=ACMR', opts.changedSince, 'HEAD'],
      { allowNonZero: true },
    );
    if (diffRes.status === 0) {
      onlyCheckFiles = diffRes.stdout.split('\n').filter(Boolean);
    }
  }

  const workingResult = validateWorkingTree(opts.repoRoot, { onlyCheckFiles });
  const allViolations = [...workingResult.violations];

  let mergeSummary = '';
  if (opts.mergeAgainst) {
    const mergeResult = validateSimulatedMerge(opts.repoRoot, opts.mergeAgainst, opts.head);
    if (!mergeResult.skipped) {
      allViolations.push(...mergeResult.violations);
      mergeSummary = `; simulated merge onto ${opts.mergeAgainst}: ${mergeResult.checkedCount} file(s)`;
    } else {
      mergeSummary = `; merge-tree skipped (${mergeResult.reason})`;
    }
  }

  const elapsedMs = Date.now() - t0;
  if (allViolations.length > 0) {
    console.error(
      `[check-module-parse-and-bindings] FAILED: ${allViolations.length} violation(s) found (${workingResult.checkedCount} checked${mergeSummary}, ${elapsedMs}ms):`,
    );
    for (const v of allViolations) {
      console.error(`  - [${v.kind}] ${v.file}: ${v.message}`);
    }
    process.exit(1);
  }

  console.log(
    `[check-module-parse-and-bindings] OK: ${workingResult.checkedCount} module(s) parsed & verified${mergeSummary} (${elapsedMs}ms).`,
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
