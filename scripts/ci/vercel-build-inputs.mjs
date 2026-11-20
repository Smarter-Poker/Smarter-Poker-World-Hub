// Every file the Vercel production build names must be in the Vercel upload.
//
// Vercel builds from an upload filtered by .vercelignore, not from the Git
// tree. A file that the build command (or an `npm run` script it reaches)
// names, but that .vercelignore leaves out, exists for every PR check and is
// missing only inside the production build - so the PR goes green and the
// production deployment fails.
//
// That happened on 2026-10-17: #2473 added __tests__/printful-status.test.mjs
// to test:marketplace, .vercelignore excluded __tests__ except named files,
// and dpl_CW1YLaroptrFiBRmbFotkxg5Fj7Y failed with "Command npm run
// build:vercel exited with 1" (alert row 255715). #2474 re-included the file.
//
// The matching uses git's own ignore engine (`git check-ignore --no-index`)
// on a copy of .vercelignore in an empty scratch repository, so the answer is
// exact gitignore semantics (negation, anchoring, directory patterns) and
// never reads this repository's own .gitignore files.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PATH_TOKEN =
  /(?<![\w./-])((?:[\w.-]+\/)+[\w.-]+\.(?:mjs|cjs|js|jsx|ts|tsx|sh|py|json|sql))(?![\w/])/g;

/**
 * Files named by the build command, following `npm run <script>` through
 * package.json. Returns the scripts reached and the repository files named.
 * A script that is named but does not exist is reported, not skipped.
 */
export function buildInputs({ buildCommand, scripts, exists }) {
  const reached = [];
  const missingScripts = [];
  const files = new Set();
  const seen = new Set();
  const walk = (command) => {
    for (const match of command.matchAll(/npm run ([\w:.-]+)/g)) {
      const name = match[1];
      if (seen.has(name)) continue;
      seen.add(name);
      if (typeof scripts[name] !== 'string') {
        missingScripts.push(name);
        continue;
      }
      reached.push(name);
      walk(scripts[name]);
    }
    for (const match of command.matchAll(PATH_TOKEN)) {
      if (exists(match[1])) files.add(match[1]);
    }
  };
  walk(buildCommand);
  return { reached, missingScripts, files: [...files].sort() };
}

/** The subset of `paths` that .vercelignore keeps out of the upload. */
export function excludedFromUpload(vercelIgnoreText, paths) {
  if (paths.length === 0) return [];
  const scratch = mkdtempSync(join(tmpdir(), 'vercelignore-'));
  try {
    execFileSync('git', ['init', '-q', scratch]);
    writeFileSync(join(scratch, '.gitignore'), vercelIgnoreText);
    try {
      const out = execFileSync('git', ['-C', scratch, 'check-ignore', '--no-index', '--stdin'], {
        input: `${paths.join('\n')}\n`,
      });
      return out.toString().split('\n').filter(Boolean).sort();
    } catch (error) {
      // Exit 1 means "nothing is ignored". Anything else is a failure to tell,
      // which must not read as a pass.
      if (error.status === 1) return [];
      throw error;
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * The marketplace contract's own rule (__tests__/marketplace-operations.test.mjs,
 * "Vercel build and scheduled health probe ..."): every __tests__ file in
 * test:marketplace is named on its own `!/` line in .vercelignore, even where a
 * broader re-include already ships it. This is the rule 27da635 broke.
 */
export function unlistedMarketplaceTests(testMarketplaceScript, vercelIgnoreText) {
  const lines = new Set(vercelIgnoreText.split('\n').map((line) => line.trim()));
  return (testMarketplaceScript.match(/__tests__\/[^ ]+\.mjs/g) || []).filter(
    (file) => !lines.has(`!/${file}`)
  );
}

/** Convenience for a checkout: read package.json, vercel.json, .vercelignore. */
export async function checkCheckout(root) {
  const { readFile } = await import('node:fs/promises');
  const [pkg, vercel, ignore] = await Promise.all([
    readFile(join(root, 'package.json'), 'utf8'),
    readFile(join(root, 'vercel.json'), 'utf8'),
    readFile(join(root, '.vercelignore'), 'utf8'),
  ]);
  const inputs = buildInputs({
    buildCommand: JSON.parse(vercel).buildCommand,
    scripts: JSON.parse(pkg).scripts,
    exists: (path) => existsSync(join(root, path)),
  });
  return { ...inputs, excluded: excludedFromUpload(ignore, inputs.files) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkCheckout(process.cwd());
  console.log(
    `[vercel-build-inputs] ${result.reached.length} scripts, ${result.files.length} named files`
  );
  for (const name of result.missingScripts) console.error(`MISSING SCRIPT npm run ${name}`);
  for (const path of result.excluded) console.error(`NOT UPLOADED ${path}`);
  if (result.missingScripts.length || result.excluded.length) process.exit(1);
}
