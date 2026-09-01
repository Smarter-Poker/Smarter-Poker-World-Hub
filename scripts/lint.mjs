import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const ESLINT_BIN = resolve(ROOT, 'node_modules/eslint/bin/eslint.js');
const MAX_BATCH_FILES = 60;
const MAX_BATCH_BYTES = 600_000;
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

const batches = [];
let batch = [];
let batchBytes = 0;

for (const file of files) {
  const fileBytes = statSync(resolve(ROOT, file)).size;
  if (
    batch.length > 0 &&
    (batch.length >= MAX_BATCH_FILES || batchBytes + fileBytes > MAX_BATCH_BYTES)
  ) {
    batches.push(batch);
    batch = [];
    batchBytes = 0;
  }
  batch.push(file);
  batchBytes += fileBytes;
}
if (batch.length > 0) batches.push(batch);

console.log(`Linting ${files.length} source and test files in ${batches.length} bounded batches.`);

for (const [index, lintBatch] of batches.entries()) {
  const result = spawnSync(
    process.execPath,
    [
      ESLINT_BIN,
      '--cache',
      '--cache-location',
      '.cache/eslint',
      '--quiet',
      ...lintBatch,
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
  if ((index + 1) % 25 === 0 || index === batches.length - 1) {
    console.log(`Lint progress: ${index + 1}/${batches.length} batches.`);
  }
}

console.log(`ESLint passed for ${files.length} files.`);
