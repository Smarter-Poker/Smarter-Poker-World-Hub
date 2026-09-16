#!/usr/bin/env node
/**
 * Read-only preflight for a local production build (Node 24+, no dependencies).
 * Vercel's dotenv loader preserves inherited values over its selected env file.
 * This checks inputs only: it does not authenticate keys, write files or build.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

export const REQUIRED_BUILD_KEYS = Object.freeze([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
]);

export function checkBuildEnv(text, inherited = {}) {
  const fileEnv = parseEnv(text);
  const effective = { ...fileEnv, ...inherited };
  const problems = new Map();
  for (const name of REQUIRED_BUILD_KEYS) {
    if (typeof effective[name] !== 'string' || effective[name].trim() === '') {
      problems.set(name, 'missing or empty');
    }
  }
  for (const [name, value] of Object.entries(effective)) {
    if (typeof value !== 'string') continue;
    if (value.includes('[SENSITIVE]')) {
      problems.set(name, 'unresolved sensitive marker');
    } else if (REQUIRED_BUILD_KEYS.includes(name) &&
        /^(?:placeholder|missing[-_]key|MISSING_SUPABASE_SERVICE_ROLE_KEY)$/i.test(value.trim())) {
      problems.set(name, 'unresolved placeholder');
    }
  }
  // Never return values, lengths, prefixes, hashes or parser error messages.
  return [...problems].sort(([a], [b]) => a.localeCompare(b)).map(([name, reason]) => ({
    name: /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : '<invalid variable name>',
    reason,
  }));
}

export function main(args, inherited = process.env, io = console) {
  if (args.length !== 2 || args[0] !== '--build-env-file' || !args[1]) {
    io.error('Usage: node scripts/check-local-production-build-env.mjs --build-env-file PATH');
    return 2;
  }
  let problems;
  try {
    // Explicit path: no discovery of private files or implicit development input.
    problems = checkBuildEnv(readFileSync(resolve(args[1]), 'utf8'), inherited);
  } catch {
    io.error('Build environment preflight could not read or parse the selected file.');
    return 2;
  }
  if (problems.length) {
    for (const { name, reason } of problems) io.error(`Build environment rejected: ${name}: ${reason}`);
    return 1;
  }
  io.log('Build environment preflight passed: required inputs are present; no unresolved sensitive markers. Credential validity is not verified.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
