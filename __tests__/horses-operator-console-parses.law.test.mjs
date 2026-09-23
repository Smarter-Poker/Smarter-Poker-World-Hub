/**
 * The repo-wide type check proves nothing about this console.
 *
 * `tsconfig.json` includes only `**\/*.ts` and `**\/*.tsx`. Every file in the
 * operator console is `.js` or `.jsx`, so `npx tsc --noEmit` checks ZERO of
 * them. Measured with `--listFilesOnly` on 2026-09-23: 0 of 81 files under
 * pages/horses, pages/api/horses, pages/admin, pages/hub/admin,
 * src/components/horses, src/components/admin and src/lib/horses were in the
 * program. A green tsc run was being read as evidence that this console
 * compiles. It was evidence about 323 unrelated files.
 *
 * Widening the tsconfig include to `**\/*.js` was measured and rejected: it
 * sweeps scripts/, supabase/ and the rest of the estate and did not finish in
 * ninety seconds, which would make every build slower for a guarantee nobody
 * asked for.
 *
 * So this is the honest substitute. It parses every operator-console source
 * file with the same parser the build uses and fails loudly on a syntax or
 * module error. It does not claim to be a type check, and nothing here should
 * be cited as one. What it does prove is that no file in this console is
 * unparseable, which is exactly the class of breakage a green-but-empty tsc
 * run was hiding.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROOTS = [
  'pages/horses',
  'pages/api/horses',
  'pages/admin',
  'pages/hub/admin',
  'src/components/horses',
  'src/components/admin',
  'src/lib/horses',
];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(path.join(repo, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(rel)));
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

async function operatorFiles() {
  const found = [];
  for (const root of ROOTS) found.push(...(await walk(root)));
  return found.sort();
}

test('every operator console source file parses', async () => {
  const files = await operatorFiles();
  assert.ok(
    files.length >= 70,
    `expected the operator console to have at least 70 source files, found ${files.length}. If the console shrank this much, this guard is pointed at the wrong place.`
  );

  const broken = [];
  for (const file of files) {
    const source = await readFile(path.join(repo, file), 'utf8');
    try {
      parse(source, {
        sourceType: 'module',
        allowReturnOutsideFunction: false,
        plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'topLevelAwait'],
      });
    } catch (err) {
      broken.push(`${file}: ${err.message}`);
    }
  }

  assert.deepEqual(broken, [], `these operator console files do not parse:\n${broken.join('\n')}`);
});

test('the console is still javascript, so tsc still cannot see it', async () => {
  const files = await operatorFiles();
  const typed = files.filter((file) => /\.(ts|tsx)$/.test(file));
  assert.deepEqual(
    typed,
    [],
    'a .ts or .tsx file appeared in the operator console. If the console is being migrated to TypeScript, revisit the tsconfig include and this guard together rather than leaving both half true.'
  );
});

test('nothing in the console imports a stock icon pack', async () => {
  const files = await operatorFiles();
  const offenders = [];
  for (const file of files) {
    const source = await readFile(path.join(repo, file), 'utf8');
    if (/from\s+['"](lucide-react|react-icons|@heroicons|feather|font-awesome)/.test(source)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], `stock icon packs are not used in the operator console: ${offenders.join(', ')}`);
});
