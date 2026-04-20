#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// verify-npm-versions.js — Pre-push npm registry validation
// ═══════════════════════════════════════════════════════════════════════════════
//
// Catches `npm error notarget No matching version found` errors BEFORE they
// hit Vercel. Born out of the Phase 6.1.16/5.1.2 deploy-failure chain on
// 2026-04-19 where `posthog-node@^4.20.0` and `serialize-javascript@^6.1.2`
// (both invalid on npm) broke 15+ consecutive production deploys.
//
// USAGE:
//   node scripts/verify-npm-versions.js           # audit full package.json
//   node scripts/verify-npm-versions.js --changed # audit only changed entries
//                                                 # (fast, pre-push default)
//
// HOW IT WORKS:
//   1. Parses package.json dependencies + devDependencies + overrides
//   2. For `--changed`, diffs against HEAD~1 and only checks modified lines
//   3. For each `name@^X.Y.Z` spec, calls registry.npmjs.org/{name}
//      and checks that SOME published version satisfies the range
//   4. Exits non-zero on any unresolved spec — prints the offender + message
//
// EXIT CODES:
//   0 = all specs resolve
//   1 = at least one spec invalid
//   2 = usage/internal error
// ═══════════════════════════════════════════════════════════════════════════════

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const args = process.argv.slice(2);
const CHANGED_ONLY = args.includes('--changed');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

const PACKAGE_JSON = path.resolve(__dirname, '..', 'package.json');
const REGISTRY_TIMEOUT_MS = 8000;
const CONCURRENCY = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Tiny semver satisfies — enough for ^X.Y.Z / ~X.Y.Z / X.Y.Z / exact pins.
// Avoids adding `semver` as a runtime dep for the hook.
// ─────────────────────────────────────────────────────────────────────────────

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v);
  if (!m) return null;
  return {
    major: +m[1],
    minor: +m[2],
    patch: +m[3],
    pre: m[4] || null,
    raw: v,
  };
}

function cmpVersion(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // Prerelease: no-prerelease > prerelease
  if (a.pre && !b.pre) return -1;
  if (!a.pre && b.pre) return 1;
  if (a.pre && b.pre) return a.pre.localeCompare(b.pre);
  return 0;
}

function satisfies(version, range) {
  // Non-version ranges we don't validate (git urls, file:, workspace:, tags like `latest`/`beta`):
  if (/^(git[:+]|github:|file:|link:|workspace:|npm:|http:|https:)/.test(range)) return true;
  if (/^[a-z-]+$/.test(range)) return true; // e.g. "latest", "next"

  const v = parseVersion(version);
  if (!v) return false;

  // Strip leading `v` and trim
  range = range.trim().replace(/^v/, '');

  // ^X.Y.Z — compatible range (same major, same minor if major=0)
  if (range.startsWith('^')) {
    const base = parseVersion(range.slice(1));
    if (!base) return false;
    if (base.major > 0) {
      // ^1.2.3 → >=1.2.3 <2.0.0
      return cmpVersion(v, base) >= 0 && v.major === base.major;
    }
    if (base.minor > 0) {
      // ^0.2.3 → >=0.2.3 <0.3.0
      return cmpVersion(v, base) >= 0 && v.major === 0 && v.minor === base.minor;
    }
    // ^0.0.3 → =0.0.3
    return cmpVersion(v, base) === 0;
  }

  // ~X.Y.Z — approximate (same major.minor)
  if (range.startsWith('~')) {
    const base = parseVersion(range.slice(1));
    if (!base) return false;
    return cmpVersion(v, base) >= 0 && v.major === base.major && v.minor === base.minor;
  }

  // >=X.Y.Z
  if (range.startsWith('>=')) {
    const base = parseVersion(range.slice(2));
    if (!base) return false;
    return cmpVersion(v, base) >= 0;
  }

  // Exact pin
  const base = parseVersion(range);
  if (!base) return false;
  return cmpVersion(v, base) === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// npm registry
// ─────────────────────────────────────────────────────────────────────────────

function fetchRegistry(name) {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
    const req = https.get(url, { timeout: REGISTRY_TIMEOUT_MS, headers: { 'User-Agent': 'verify-npm-versions/1.0', 'Accept': 'application/vnd.npm.install-v1+json' } }, (res) => {
      if (res.statusCode === 404) {
        resolve({ notFound: true });
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${name}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve({ versions: Object.keys(json.versions || {}) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout fetching ${name}`)));
    req.on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// package.json reading
// ─────────────────────────────────────────────────────────────────────────────

function collectAllSpecs(pkg) {
  const out = [];
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides'];
  for (const sec of sections) {
    const block = pkg[sec];
    if (!block || typeof block !== 'object') continue;
    for (const [name, spec] of Object.entries(block)) {
      if (typeof spec !== 'string') continue;
      out.push({ name, spec, section: sec });
    }
  }
  return out;
}

function collectChangedSpecs(pkg) {
  let diff = '';
  try {
    diff = execSync('git diff HEAD~1 HEAD -- package.json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    try {
      diff = execSync('git diff --cached -- package.json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      diff = '';
    }
  }

  const addedLines = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));

  const all = collectAllSpecs(pkg);
  const changed = [];
  for (const entry of all) {
    const needle = `"${entry.name}": "${entry.spec}"`;
    if (addedLines.some((l) => l.includes(needle))) {
      changed.push(entry);
    }
  }
  return changed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function mapWithConcurrency(items, worker, n = CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(n, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (e) {
        results[idx] = { error: e.message };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  } catch (e) {
    console.error(`  verify-npm-versions: cannot read ${PACKAGE_JSON} — ${e.message}`);
    process.exit(2);
  }

  const specs = CHANGED_ONLY ? collectChangedSpecs(pkg) : collectAllSpecs(pkg);

  if (specs.length === 0) {
    if (CHANGED_ONLY) console.log('  ✓ No dependency changes to verify');
    else console.log('  ✓ package.json has no deps');
    process.exit(0);
  }

  if (VERBOSE) {
    console.log(`  Verifying ${specs.length} spec(s)${CHANGED_ONLY ? ' (changed only)' : ''}...`);
  }

  const results = await mapWithConcurrency(specs, async ({ name, spec, section }) => {
    // Skip workspace/file/git specs — npm handles these separately
    if (/^(workspace:|file:|link:|git[:+]|github:|http:|https:)/.test(spec)) {
      return { name, spec, section, skipped: true };
    }
    try {
      const reg = await fetchRegistry(name);
      if (reg.notFound) {
        return { name, spec, section, status: 'notfound' };
      }
      const match = reg.versions.some((v) => satisfies(v, spec));
      return { name, spec, section, status: match ? 'ok' : 'unresolved', versions: reg.versions };
    } catch (e) {
      return { name, spec, section, status: 'net-error', error: e.message };
    }
  });

  const bad = results.filter((r) => r && (r.status === 'unresolved' || r.status === 'notfound'));
  const netErrors = results.filter((r) => r && r.status === 'net-error');

  if (bad.length === 0 && netErrors.length === 0) {
    console.log(`  ✓ All ${specs.length} npm spec(s) resolve against the registry`);
    process.exit(0);
  }

  if (bad.length > 0) {
    console.log('');
    console.log('  ❌ INVALID npm version spec(s) — Vercel deploy WILL fail with ETARGET:');
    for (const r of bad) {
      if (r.status === 'notfound') {
        console.log(`     - ${r.section}.${r.name}@${r.spec} — package not found on registry`);
      } else {
        // Find the highest published version to help the author
        const highest = (r.versions || []).filter((v) => !/-/.test(v)).sort().slice(-1)[0] || (r.versions || []).slice(-1)[0];
        console.log(`     - ${r.section}.${r.name}@${r.spec} — no matching version (latest published: ${highest || '?'})`);
      }
    }
    console.log('');
    console.log('     Fix the specs above (check `npm view <pkg> versions` for valid ranges), then re-push.');
    console.log('');
  }

  if (netErrors.length > 0) {
    // Network errors shouldn't block the push (registry can flake), but warn.
    console.log('');
    console.log(`  ⚠  ${netErrors.length} registry lookup(s) failed — not blocking, but retry before trusting green:`);
    for (const r of netErrors.slice(0, 5)) console.log(`     - ${r.name}: ${r.error}`);
    if (netErrors.length > 5) console.log(`     ... and ${netErrors.length - 5} more`);
  }

  process.exit(bad.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`  verify-npm-versions: fatal — ${e.message}`);
  process.exit(2);
});
