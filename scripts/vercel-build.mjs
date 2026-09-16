#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as checkBuildEnv } from './check-local-production-build-env.mjs';

// Exact pre-existing vercel.json command, including ordering and Next options.
export const BUILD_COMMAND = "node scripts/copy-reader-assets.mjs && bash scripts/prune-platform-bins.sh && node scripts/patch-next.js && npm run test:marketplace && npm run test:training:phase6-authority && NODE_OPTIONS='--max-old-space-size=7168' next build --webpack";

export function main() {
  let metadata;
  try {
    // Vercel writes this before calling the project's custom build command.
    metadata = JSON.parse(readFileSync('.vercel/output/builds.json', 'utf8'));
    if (!metadata || !['production', 'preview'].includes(metadata.target)) throw new Error();
  } catch {
    console.error('Local build refused: missing or malformed target in .vercel/output/builds.json. Use the default local Vercel output and a production or preview target; custom --output is unsupported.');
    return 2;
  }
  if (Array.isArray(metadata.argv) && metadata.argv.some(arg =>
    typeof arg === 'string' && (arg === '--output' || arg.startsWith('--output=')))) {
    console.error('Local build refused: custom --output is unsupported; use the default .vercel/output.');
    return 2;
  }
  // VERCEL_ENV may be absent or inherited incorrectly. The CLI target owns this
  // decision. Preview keeps its existing command without the production guard.
  if (metadata.target === 'production') {
    const status = checkBuildEnv(['--build-env-file', '.vercel/.env.production.local']);
    if (status !== 0) return status;
  }
  const result = spawnSync('/bin/sh', ['-c', BUILD_COMMAND], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error('Local build failed to start its existing build command.');
    return 1;
  }
  if (result.signal) return 128 + (constants.signals[result.signal] || 1);
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
