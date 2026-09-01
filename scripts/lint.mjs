import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const ESLINT_BIN = resolve(ROOT, 'node_modules/eslint/bin/eslint.js');
const BATCH_SIZE = 20;
const SOURCE_EXTENSION = /\.(?:cjs|js|jsx|mjs|ts|tsx)$/;
const EXCLUDED_PREFIXES = [
  '.cache/',
  '.next/',
  'coverage/',
  'node_modules/',
  'out/',
  'playwright-report/',
  'public/',
  'test-results/',
];

if (!existsSync(ESLINT_BIN)) {
  console.error('ESLint is not installed. Run npm install before linting.');
  process.exit(1);
}

const inventory = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: ROOT, encoding: 'utf8' },
);

if (inventory.status !== 0) {
  process.stderr.write(inventory.stderr || 'Unable to enumerate repository files.\n');
  process.exit(inventory.status || 1);
}

const files = inventory.stdout
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => SOURCE_EXTENSION.test(file))
  .filter((file) => !EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)));

console.log(`Linting ${files.length} source and test files in bounded batches.`);

for (let index = 0; index < files.length; index += BATCH_SIZE) {
  const batch = files.slice(index, index + BATCH_SIZE);
  const result = spawnSync(
    process.execPath,
    [
      ESLINT_BIN,
      '--cache',
      '--cache-location',
      '.cache/eslint',
      '--quiet',
      ...batch,
    ],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=4096',
      },
    },
  );

  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`ESLint passed for ${files.length} files.`);
