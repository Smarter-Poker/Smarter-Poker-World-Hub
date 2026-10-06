#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = readFileSync(resolve(root, 'src/components/horses/dynamicPanels.js'), 'utf8');
const modules = [...source.matchAll(/dynamic\(\s*\(\) => import\('\.\/(\w+Panel)'\)/g)]
  .map((match) => match[1]);
const uniqueModules = [...new Set(modules)];
if (uniqueModules.length < 30) {
  throw new Error(`Phase 9 expected at least 30 explicit panel chunks, found ${uniqueModules.length}`);
}

const buildManifest = JSON.parse(readFileSync(resolve(root, '.next/build-manifest.json'), 'utf8'));
const loadableManifest = JSON.parse(readFileSync(resolve(root, '.next/react-loadable-manifest.json'), 'utf8'));
const initialFiles = new Set(buildManifest.pages?.['/horses'] || []);
if (initialFiles.size === 0) throw new Error('The production build has no /horses page entry');

const missing = [];
const eager = [];
for (const moduleName of uniqueModules) {
  const entries = Object.entries(loadableManifest)
    .filter(([key]) => key.includes(`dynamicPanels.js -> ./${moduleName}`));
  if (entries.length !== 1) {
    missing.push(`${moduleName} (${entries.length} manifest entries)`);
    continue;
  }
  for (const file of entries[0][1]?.files || []) {
    if (initialFiles.has(file)) eager.push(`${moduleName}: ${file}`);
  }
}
if (missing.length) throw new Error(`Dynamic panel manifest mismatch:\n${missing.join('\n')}`);
if (eager.length) throw new Error(`Panel chunks leaked into the initial /horses payload:\n${eager.join('\n')}`);

const initialJavaScriptFiles = [...initialFiles].filter((file) => file.endsWith('.js'));
const routeJavaScriptFiles = initialJavaScriptFiles.filter((file) => /static\/chunks\/pages\/horses-[^/]+\.js$/.test(file));
if (routeJavaScriptFiles.length !== 1) {
  throw new Error(`Expected one route-specific /horses JavaScript chunk, found ${routeJavaScriptFiles.length}`);
}

const pageBytes = routeJavaScriptFiles.reduce((sum, file) => sum + statSync(resolve(root, '.next', file)).size, 0);
const pageGzipBytes = routeJavaScriptFiles.reduce((sum, file) => {
  const bytes = readFileSync(resolve(root, '.next', file));
  return sum + gzipSync(bytes).length;
}, 0);
const totalInitialBytes = initialJavaScriptFiles.reduce(
  (sum, file) => sum + statSync(resolve(root, '.next', file)).size,
  0,
);
const totalInitialGzipBytes = initialJavaScriptFiles.reduce((sum, file) => {
  const bytes = readFileSync(resolve(root, '.next', file));
  return sum + gzipSync(bytes).length;
}, 0);
const baselinePageBytes = 227686;
if (pageBytes > baselinePageBytes) {
  throw new Error(`Initial /horses JavaScript grew from ${baselinePageBytes} to ${pageBytes} bytes`);
}

console.log(JSON.stringify({
  route: '/horses',
  explicitPanelChunks: uniqueModules.length,
  initialJavaScriptBytes: pageBytes,
  initialJavaScriptGzipBytes: pageGzipBytes,
  totalInitialJavaScriptBytes: totalInitialBytes,
  totalInitialJavaScriptGzipBytes: totalInitialGzipBytes,
  baselinePageBytes,
}, null, 2));
