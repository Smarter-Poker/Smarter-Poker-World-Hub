#!/usr/bin/env node
/** Reserve a migration version against this tree, origin/main, and every remote branch. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DIR = join(ROOT, 'supabase', 'migrations');
const sh = (args, fallback = '') => {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return fallback;
  }
};

function takenVersions() {
  const taken = new Set();
  const add = (name) => {
    const match = /(\d{14})_/.exec(name);
    if (match) taken.add(match[1]);
  };
  if (existsSync(DIR)) readdirSync(DIR).forEach(add);
  sh(['fetch', '-q', 'origin', 'main']);
  sh(['ls-tree', '-r', '--name-only', 'origin/main', 'supabase/migrations']).split('\n').forEach(add);
  sh(['ls-remote', '--heads', 'origin']).split('\n').forEach((line) => {
    const ref = line.split('\t')[1];
    if (!ref) return;
    sh(['ls-tree', '-r', '--name-only', ref.replace('refs/heads/', 'origin/'), 'supabase/migrations'])
      .split('\n').forEach(add);
  });
  return taken;
}

function stamp(date) {
  const part = (number, width = 2) => String(number).padStart(width, '0');
  return `${date.getUTCFullYear()}${part(date.getUTCMonth() + 1)}${part(date.getUTCDate())}`
    + `${part(date.getUTCHours())}${part(date.getUTCMinutes())}${part(date.getUTCSeconds())}`;
}

const slug = (process.argv.slice(2).join(' ') || 'migration')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
const taken = takenVersions();
const now = new Date();
let version = stamp(now);
let bumped = 0;
while (taken.has(version)) {
  now.setUTCSeconds(now.getUTCSeconds() + 1);
  version = stamp(now);
  if (++bumped > 86400) throw new Error('Could not reserve a migration version within one day');
}
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
const file = join(DIR, `${version}_${slug}.sql`);
writeFileSync(file, `-- ${version}_${slug}.sql\n-- Reserved against origin/main and every remote branch.\n\nBEGIN;\n\n-- Your change here.\n\nCOMMIT;\n`);
console.log(`reserved ${version}${bumped ? ` (stepped past ${bumped} taken version(s))` : ''}`);
console.log(file);
