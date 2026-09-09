'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (/\.(?:js|jsx|tsx)$/.test(entry.name)) output.push(full);
  }
  return output;
}

function routeFor(file) {
  return `/${path.relative(path.join(ROOT, 'pages'), file)
    .replace(/\\/g, '/')
    .replace(/\.(?:js|jsx|tsx)$/, '')
    .replace(/\/index$/, '')}`;
}

function routeMatches(routes, candidate) {
  if (routes.has(candidate)) return true;
  if (candidate.endsWith('/') && [...routes].some((route) => route.startsWith(`${candidate}[`))) return true;
  return [...routes].some((route) => {
    const pattern = route
      .split('/')
      .map((part) => /^\[[^\]]+\]$/.test(part) ? '[^/]+' : part.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&'))
      .join('/');
    return new RegExp(`^${pattern}$`).test(candidate);
  });
}

const trainingPages = walk(path.join(ROOT, 'pages/hub/training')).sort();
const allPages = walk(path.join(ROOT, 'pages'));
const pageRoutes = new Set(allPages.filter((file) => !file.includes('/pages/api/')).map(routeFor));
const apiRoutes = new Set(allPages.filter((file) => file.includes('/pages/api/')).map(routeFor));
const missingPages = [];
const missingApis = [];
const missingDefault = [];
const defaultExportPattern = /(?:export\s+default|export\s*\{\s*default(?:\s+as\s+default)?\s*\}\s*from)/;

for (const file of trainingPages) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(ROOT, file);
  if (!defaultExportPattern.test(source)) missingDefault.push(relative);

  const links = [
    ...source.matchAll(/(?:href=|router\.(?:push|replace)\s*\()\s*[{'"`]([^'"`?}{]+)/g),
  ].map((match) => match[1]).filter((value) => value.startsWith('/hub/training'));
  for (const candidate of links) {
    if (!routeMatches(pageRoutes, candidate)) missingPages.push({ file: relative, route: candidate });
  }

  const apiCalls = [
    ...source.matchAll(/(?:fetch|authedFetch)\s*\(\s*['"`](\/api\/[^?'"`$}{]+)/g),
  ].map((match) => match[1]);
  for (const candidate of apiCalls) {
    if (!routeMatches(apiRoutes, candidate)) missingApis.push({ file: relative, route: candidate });
  }
}

const dedupe = (rows) => [...new Map(rows.map((row) => [`${row.file}:${row.route}`, row])).values()];
const result = {
  success: missingDefault.length === 0 && missingPages.length === 0 && missingApis.length === 0,
  trainingPageFiles: trainingPages.length,
  missingDefault,
  missingPages: dedupe(missingPages),
  missingApis: dedupe(missingApis),
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.success ? 0 : 1;
