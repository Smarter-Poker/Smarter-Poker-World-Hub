#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const buildManifestPath = path.join(root, '.next', 'build-manifest.json');
if (!fs.existsSync(buildManifestPath)) {
  console.error('Personal Assistant performance budget requires a completed Next.js build.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'));
const routeBudgets = Object.freeze({
  '/hub/personal-assistant': 475_000,
  '/hub/personal-assistant/sandbox': 575_000,
  '/hub/personal-assistant/leaks': 525_000,
});
const serverBudgets = Object.freeze({
  'pages/api/assistant/sandbox/analyze.js': 60_000,
  'pages/api/assistant/leaks/detect.js': 50_000,
});

let failed = false;
const report = { routes: {}, server: {} };

for (const [route, budget] of Object.entries(routeBudgets)) {
  const files = new Set([...(manifest.rootMainFiles || []), ...(manifest.pages?.[route] || [])]);
  let gzipBytes = 0;
  for (const file of files) {
    const absolute = path.join(root, '.next', file);
    if (!fs.existsSync(absolute)) continue;
    gzipBytes += gzipSync(fs.readFileSync(absolute)).length;
  }
  report.routes[route] = { gzipBytes, budget, remaining: budget - gzipBytes };
  if (gzipBytes <= 0 || gzipBytes > budget) failed = true;
}

for (const [relative, budget] of Object.entries(serverBudgets)) {
  const absolute = path.join(root, '.next', 'server', relative);
  const bytes = fs.existsSync(absolute) ? fs.statSync(absolute).size : 0;
  report.server[relative] = { bytes, budget, remaining: budget - bytes };
  if (bytes <= 0 || bytes > budget) failed = true;
}

console.log('Personal Assistant performance budget');
console.log(JSON.stringify(report, null, 2));
if (failed) {
  console.error('Personal Assistant bundle or server-function budget exceeded.');
  process.exit(1);
}
