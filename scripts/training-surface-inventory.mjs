import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, '.agent/audits/2026-08-31-training-phase-2-inventory.json');
const SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];

const posix = (value) => value.split(sep).join('/');
const rel = (value) => posix(relative(ROOT, value));
const read = (file) => readFileSync(file, 'utf8');

function walk(directory, output = []) {
  if (!existsSync(directory)) return output;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (SOURCE_EXTENSIONS.includes(extname(entry.name))) output.push(full);
  }
  return output;
}

function pageRoute(file, root, prefix) {
  const route = posix(relative(root, file))
    .replace(/\.(?:js|jsx|ts|tsx)$/, '')
    .replace(/\/index$/, '');
  return `${prefix}/${route}`.replace(/\/$/, '') || '/';
}

function resolveImport(importer, specifier) {
  let base = null;
  if (specifier.startsWith('.')) base = resolve(dirname(importer), specifier);
  else if (specifier.startsWith('@/')) base = resolve(ROOT, specifier.slice(2));
  else if (specifier.startsWith('src/')) base = resolve(ROOT, specifier);
  if (!base) return null;
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) || null;
}

function importsFor(file, source) {
  const specifiers = [
    ...source.matchAll(/\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1]);
  return [...new Set(specifiers.map((specifier) => resolveImport(file, specifier)).filter(Boolean))].sort();
}

function dependencyGraph(entryFiles) {
  const pending = [...entryFiles];
  const visited = new Set();
  const edges = [];
  while (pending.length) {
    const file = pending.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const imports = importsFor(file, read(file));
    for (const imported of imports) {
      edges.push({ from: rel(file), to: rel(imported) });
      if (!visited.has(imported)) pending.push(imported);
    }
  }
  return {
    files: [...visited].sort().map(rel),
    edges: edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)),
  };
}

function extractGames() {
  const source = read(join(ROOT, 'src/data/TRAINING_LIBRARY.js'));
  const block = source.match(/export const TRAINING_LIBRARY = \[([\s\S]*?)\n\];/)?.[1] || '';
  const games = block.split('\n').flatMap((line) => {
    const id = line.match(/\bid:\s*'([^']+)'/)?.[1];
    if (!id) return [];
    return [{
      id,
      name: line.match(/\bname:\s*'([^']+)'/)?.[1] || '',
      focus: line.match(/\bfocus:\s*'([^']+)'/)?.[1] || '',
      category: line.match(/\bcategory:\s*'([^']+)'/)?.[1] || '',
      playRoute: `/hub/training/play/${id}`,
      arenaRoute: `/hub/training/arena/${id}?level=1`,
    }];
  });
  assert.equal(games.length, 107, 'Phase 2 inventory must contain all 107 canonical games');
  assert.equal(new Set(games.map((game) => game.id)).size, 107, 'canonical game IDs must be unique');
  return games;
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function literals(source, pattern, group = 1) {
  return [...source.matchAll(pattern)].map((match) => match[group]).filter(Boolean);
}

function ctas(source) {
  const controls = [];
  for (const match of source.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attributes = match[2];
    const body = match[3];
    const explicit = attributes.match(/(?:aria-label|title)=['"]([^'"]+)['"]/)?.[1];
    const text = body.replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    controls.push({
      element: match[1].toLowerCase(),
      name: explicit || text || '<dynamic>',
      line: lineNumber(source, match.index),
    });
  }
  return controls;
}

function functionCandidates(source) {
  const names = [
    ...literals(source, /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g),
    ...literals(source, /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g),
    ...literals(source, /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g),
  ];
  return [...new Set(names)].map((name) => ({
    name,
    references: (source.match(new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`, 'g')) || []).length,
  }));
}

function sourceInventory(file) {
  const source = read(file);
  const markerPattern = /\b(TODO|FIXME|HACK|STUB|MOCK|PLACEHOLDER|DUMMY)\b|\b(simulat(?:e|ed|ion)|fallback)\b/gi;
  const markers = [...source.matchAll(markerPattern)].map((match) => ({
    kind: (match[1] || match[2] || '').toUpperCase(),
    line: lineNumber(source, match.index),
    excerpt: source.split('\n')[lineNumber(source, match.index) - 1].trim().slice(0, 240),
  }));
  const functions = functionCandidates(source);
  return {
    file: rel(file),
    imports: importsFor(file, source).map(rel),
    links: [...new Set(literals(source, /['"`](\/hub\/training[^'"` $}{]*)/g))].sort(),
    apiReferences: [...new Set(literals(source, /['"`](\/api\/[^'"` $}{?]*)/g))].sort(),
    ctas: ctas(source),
    dialogs: {
      native: (source.match(/<dialog\b/gi) || []).length,
      aria: (source.match(/role=['"]dialog['"]/gi) || []).length,
      modalComponents: [...new Set(literals(source, /<([A-Za-z][\w]*(?:Modal|Dialog))\b/g))].sort(),
    },
    states: {
      loading: /\b(?:isLoading|loading)\b/.test(source),
      empty: /\bempty\b|\.length\s*===?\s*0|!\w+\.length/.test(source),
      error: /\b(?:setError|error|ErrorBanner)\b/.test(source),
      retry: /\bRetry\b|\bretry\w*\b/i.test(source),
      offline: /\boffline\b|navigator\.onLine/i.test(source),
      stale: /\bstale\b|localStorage|sessionStorage/i.test(source),
      success: /\bsuccess\b|setSuccess/i.test(source),
    },
    persistenceWrites: {
      localStorage: (source.match(/localStorage\.setItem\s*\(/g) || []).length,
      sessionStorage: (source.match(/sessionStorage\.setItem\s*\(/g) || []).length,
      inserts: (source.match(/\.(?:insert|upsert)\s*\(/g) || []).length,
      updates: (source.match(/\.update\s*\(/g) || []).length,
      deletes: (source.match(/\.delete\s*\(/g) || []).length,
      rpc: (source.match(/\.rpc\s*\(/g) || []).length,
    },
    realtime: {
      channels: (source.match(/\.channel\s*\(/g) || []).length,
      postgresChanges: (source.match(/postgres_changes/g) || []).length,
      webSockets: (source.match(/\bWebSocket\s*\(/g) || []).length,
      eventSources: (source.match(/\bEventSource\s*\(/g) || []).length,
    },
    functions,
    possibleUnwiredFunctions: functions.filter((entry) => entry.references === 1).map((entry) => entry.name),
    markers,
  };
}

function dynamicPattern(route) {
  return new RegExp(`^${route.split('/').map((part) => (
    /^\[[^\]]+\]$/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )).join('/')}$`);
}

function routeExists(candidate, routes) {
  const pathname = candidate.split('?')[0];
  if (pathname.endsWith('/') && routes.some((route) => route.template.startsWith(`${pathname}[`))) return true;
  return routes.some((route) => dynamicPattern(route.template).test(pathname));
}

function main() {
  const games = extractGames();
  const pageRoot = join(ROOT, 'pages/hub/training');
  const apiRoot = join(ROOT, 'pages/api/training');
  const pageFiles = walk(pageRoot).sort();
  const apiFiles = walk(apiRoot).sort();
  const graph = dependencyGraph([...pageFiles, ...apiFiles]);
  const sourceFiles = graph.files.map((file) => join(ROOT, file));
  const sourceRows = sourceFiles.map(sourceInventory);
  const routes = pageFiles.map((file) => {
    const template = pageRoute(file, pageRoot, '/hub/training');
    const source = sourceRows.find((row) => row.file === rel(file));
    return {
      template,
      file: rel(file),
      dynamic: template.includes('['),
      gameExpansions: template.includes('[gameId]') ? games.length : 0,
      states: source.states,
      ctaCount: source.ctas.length,
      dialogCount: source.dialogs.native + source.dialogs.aria + source.dialogs.modalComponents.length,
      apiReferences: source.apiReferences,
      persistenceWrites: source.persistenceWrites,
      realtime: source.realtime,
    };
  }).sort((a, b) => a.template.localeCompare(b.template));
  const apiRoutes = apiFiles.map((file) => ({
    template: pageRoute(file, apiRoot, '/api/training'),
    file: rel(file),
  })).sort((a, b) => a.template.localeCompare(b.template));
  const links = [...new Set(sourceRows.flatMap((row) => row.links))].sort();
  const apiReferences = [...new Set(sourceRows.flatMap((row) => row.apiReferences))].sort();
  const allPageTemplates = walk(join(ROOT, 'pages')).filter((file) => !rel(file).startsWith('pages/api/')).map((file) => ({
    template: pageRoute(file, join(ROOT, 'pages'), ''),
    file: rel(file),
  }));
  const allApiTemplates = walk(join(ROOT, 'pages/api')).map((file) => ({
    template: pageRoute(file, join(ROOT, 'pages/api'), '/api'),
    file: rel(file),
  }));
  const tests = [...walk(join(ROOT, '__tests__')), ...walk(join(ROOT, 'e2e'))]
    .filter((file) => /training/i.test(rel(file)) || /\/hub\/training|src\/components\/training|TRAINING_LIBRARY/.test(read(file)))
    .sort()
    .map(rel);
  const componentFiles = graph.files.filter((file) => file.startsWith('src/components/'));
  const hookFiles = graph.files.filter((file) => file.startsWith('src/hooks/'));
  const persistence = sourceRows.filter((row) => Object.values(row.persistenceWrites).some(Boolean));
  const realtime = sourceRows.filter((row) => Object.values(row.realtime).some(Boolean));
  const markers = sourceRows.flatMap((row) => row.markers.map((marker) => ({ file: row.file, ...marker })));
  const possibleUnwiredFunctions = sourceRows.flatMap((row) => row.possibleUnwiredFunctions.map((name) => ({ file: row.file, name })));
  const missingLinks = links.filter((link) => !routeExists(link, allPageTemplates));
  const missingApiDefinitions = apiReferences.filter((route) => !routeExists(route, allApiTemplates));
  const manifest = {
    schemaVersion: 1,
    generatedBy: 'scripts/training-surface-inventory.mjs',
    frozenInvariants: { globalHeader: 'unchanged', canonicalGames: 107 },
    counts: {
      canonicalGames: games.length,
      trainingRouteTemplates: routes.length,
      dynamicGameRouteExpansions: routes.reduce((sum, route) => sum + route.gameExpansions, 0),
      trainingApiRouteTemplates: apiRoutes.length,
      dependencyFiles: graph.files.length,
      componentFiles: componentFiles.length,
      hookFiles: hookFiles.length,
      ctas: sourceRows.reduce((sum, row) => sum + row.ctas.length, 0),
      dialogs: sourceRows.reduce((sum, row) => sum + row.dialogs.native + row.dialogs.aria + row.dialogs.modalComponents.length, 0),
      persistenceFiles: persistence.length,
      realtimeFiles: realtime.length,
      tests: tests.length,
      markerCandidates: markers.length,
      possibleUnwiredFunctions: possibleUnwiredFunctions.length,
    },
    games,
    routes,
    apiRoutes,
    sourceFiles: sourceRows,
    dependencyEdges: graph.edges,
    componentFiles,
    hookFiles,
    tests,
    persistenceFiles: persistence.map((row) => ({ file: row.file, writes: row.persistenceWrites })),
    realtimeFiles: realtime.map((row) => ({ file: row.file, subscriptions: row.realtime })),
    gaps: {
      missingLinks,
      missingApiDefinitions,
      markerCandidates: markers,
      possibleUnwiredFunctions,
    },
  };
  assert.deepEqual(missingLinks, [], 'Training source contains unresolved page links');
  assert.deepEqual(missingApiDefinitions, [], 'Training source contains unresolved API references');
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  const summary = `${JSON.stringify({ success: true, output: rel(OUTPUT), counts: manifest.counts }, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    writeFileSync(OUTPUT, json);
    process.stdout.write(summary);
  } else if (process.argv.includes('--check')) {
    assert.ok(existsSync(OUTPUT), `Inventory is missing: ${rel(OUTPUT)}`);
    assert.equal(read(OUTPUT), json, 'Phase 2 inventory is stale; run the generator with --write');
    process.stdout.write(summary);
  } else {
    process.stdout.write(json);
  }
}

main();
