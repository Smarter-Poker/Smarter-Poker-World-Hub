#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  indexnow-submit - tell Bing (and Copilot, and through Bing's index a large
 *  share of ChatGPT search) which public pages changed in a merge to main
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AEO PHASE 1 (2026-09-17). IndexNow is the push protocol Bing, Yandex, Naver,
 * Seznam and Amazon consume; Microsoft's Webmaster guidance says it "helps keep
 * information fresh across search and AI experiences", and Bing's AI
 * Performance report grounds Copilot answers on what Bing has indexed. Google
 * does not consume it. It is free and needs no account: the key is proven by
 * serving it at https://smarter.poker/<key>.txt (public/<key>.txt here).
 *
 * WHAT IS SUBMITTED. Only URLs whose source changed in the pushed range, so a
 * merge that touches pages/hub/training.js submits /hub/training and nothing
 * else. Resubmitting unchanged URLs is what the protocol asks sites not to do.
 * Static page files under pages/ map to their route; dynamic segments
 * ([id].js) are skipped because one file is thousands of URLs. A change under
 * src/components/landing/ is a homepage change.
 *
 * WHAT THIS IS NOT. It is not a release stage, a watcher or a scheduler. It
 * runs once per push to main, after the merge, never gates anything, and a
 * failure is a log line. The Vercel build it announces may still be running
 * when the ping lands; Bing fetches later, on its own schedule.
 *
 *   node scripts/indexnow-submit.mjs --range <base>..<head>     (CI)
 *   node scripts/indexnow-submit.mjs --urls /hub/training,/terms (manual)
 *   node scripts/indexnow-submit.mjs --dry-run --range HEAD~1..HEAD
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const SITE = 'https://smarter.poker';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const PAGE_FILE_SKIP = new Set(['_app', '_document', '_error', '404', '500', 'sitemap.xml', 'USRobots']);

/** Map a changed repository path to a public route, or null when it has none. */
export function routeForChangedFile(file) {
  if (file.startsWith('src/components/landing/')) return '/';
  const m = /^pages\/(.+)\.(js|jsx|ts|tsx)$/.exec(file);
  if (!m) return null;
  const rel = m[1];
  if (rel.startsWith('api/')) return null;
  if (rel.includes('[')) return null;
  const base = rel.split('/').pop();
  if (PAGE_FILE_SKIP.has(base)) return null;
  if (/^(admin|auth|sandbox|demo)(\/|$)/.test(rel)) return null;
  const route = rel.endsWith('/index') ? rel.slice(0, -'/index'.length) : rel;
  return route === 'index' ? '/' : `/${route}`;
}

export function readIndexNowKey() {
  const publicDir = join(ROOT, 'public');
  const keyFile = readdirSync(publicDir).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
  if (!keyFile) throw new Error('no IndexNow key file (public/<32 hex>.txt)');
  const key = keyFile.replace(/\.txt$/, '');
  const body = readFileSync(join(publicDir, keyFile), 'utf8').trim();
  if (body !== key) throw new Error(`public/${keyFile} must contain exactly its own key`);
  return key;
}

function changedFiles(range) {
  const out = execSync(`git diff --name-only ${range}`, { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

export function urlsForRange(range) {
  const routes = new Set();
  for (const file of changedFiles(range)) {
    const route = routeForChangedFile(file);
    if (route) routes.add(route);
  }
  return [...routes].sort().map((r) => `${SITE}${r}`);
}

async function submit(urls, key, { dryRun = false } = {}) {
  if (urls.length === 0) {
    console.log('indexnow: no public page changed in this range; nothing to submit');
    return 0;
  }
  const payload = { host: 'smarter.poker', key, keyLocation: `${SITE}/${key}.txt`, urlList: urls.slice(0, 10000) };
  console.log(`indexnow: ${dryRun ? 'would submit' : 'submitting'} ${urls.length} url(s):\n  ${urls.join('\n  ')}`);
  if (dryRun) return 0;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  // 200 OK, 202 Accepted (key validation pending). Anything else is reported,
  // never thrown: this script must not fail a merge.
  console.log(`indexnow: HTTP ${res.status} ${res.statusText}`);
  return res.status === 200 || res.status === 202 ? 0 : 1;
}

async function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args.set(a, next); i += 1; } else { args.set(a, true); }
    }
  }
  const dryRun = args.has('--dry-run');
  const key = readIndexNowKey();
  let urls = [];
  if (args.has('--urls')) {
    urls = String(args.get('--urls')).split(',').map((u) => u.trim()).filter(Boolean).map((u) => (u.startsWith('http') ? u : `${SITE}${u}`));
  } else if (args.has('--range')) {
    urls = urlsForRange(String(args.get('--range')));
  } else {
    console.error('usage: indexnow-submit.mjs --range <base>..<head> | --urls /a,/b [--dry-run]');
    return 2;
  }
  return submit(urls, key, { dryRun });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((err) => {
    console.error(`indexnow: ${err.message}`);
    process.exit(1);
  });
}
