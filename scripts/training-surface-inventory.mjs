import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');

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

function importBindingsFor(file, source) {
  const bindings = [];
  for (const match of source.matchAll(/\bimport\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const target = resolveImport(file, match[2]);
    if (!target) continue;
    const clause = match[1].trim();
    const named = clause.match(/\{([\s\S]*?)\}/)?.[1] || '';
    for (const entry of named.split(',').map((value) => value.trim()).filter(Boolean)) {
      const imported = entry.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (imported) bindings.push({ from: rel(file), to: rel(target), imported });
    }
    const defaultBinding = clause.split(',')[0].trim();
    if (defaultBinding && !defaultBinding.startsWith('{') && !defaultBinding.startsWith('*')) {
      bindings.push({ from: rel(file), to: rel(target), imported: 'default' });
    }
    if (/^\*\s+as\s+/.test(clause)) bindings.push({ from: rel(file), to: rel(target), imported: '*' });
  }
  for (const match of source.matchAll(/\bexport\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const target = resolveImport(file, match[2]);
    if (!target) continue;
    for (const entry of match[1].split(',').map((value) => value.trim()).filter(Boolean)) {
      const imported = entry.split(/\s+as\s+/)[0].trim();
      if (imported) bindings.push({ from: rel(file), to: rel(target), imported });
    }
  }
  for (const match of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const target = resolveImport(file, match[1]);
    if (target) bindings.push({ from: rel(file), to: rel(target), imported: 'default' });
  }
  for (const match of source.matchAll(/\bconst\s+(\{[\s\S]*?\}|[A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const target = resolveImport(file, match[2]);
    if (!target) continue;
    if (match[1].startsWith('{')) {
      for (const entry of match[1].slice(1, -1).split(',').map((value) => value.trim()).filter(Boolean)) {
        bindings.push({ from: rel(file), to: rel(target), imported: entry.split(/\s*:\s*/)[0].trim() });
      }
    } else {
      bindings.push({ from: rel(file), to: rel(target), imported: '*' });
    }
  }
  return bindings;
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

function jsxName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return `${jsxName(node.object)}.${jsxName(node.property)}`;
  return '';
}

function jsxAttribute(opening, name, source) {
  const attribute = opening.attributes.find((entry) => entry.type === 'JSXAttribute' && entry.name?.name === name);
  if (!attribute) return null;
  if (!attribute.value) return 'true';
  if (attribute.value.type === 'StringLiteral') return attribute.value.value;
  if (attribute.value.type === 'JSXExpressionContainer') {
    const expression = attribute.value.expression;
    return expression?.start !== undefined && expression?.end !== undefined
      ? source.slice(expression.start, expression.end).trim()
      : '<expression>';
  }
  return '<dynamic>';
}

function jsxText(node, source) {
  if (!node) return '';
  if (node.type === 'JSXText') return node.value;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'JSXExpressionContainer') {
    if (node.expression?.type === 'StringLiteral') return node.expression.value;
    return '';
  }
  if (node.type === 'JSXElement') return node.children.map((child) => jsxText(child, source)).join(' ');
  return '';
}

function visitAst(node, ancestors, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node, ancestors);
  const nextAncestors = [...ancestors, node];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
    if (Array.isArray(value)) {
      for (const child of value) visitAst(child, nextAncestors, visitor);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      visitAst(value, nextAncestors, visitor);
    }
  }
}

function ctas(source, file) {
  const controls = [];
  const ast = parse(source, {
    sourceType: 'unambiguous',
    sourceFilename: rel(file),
    errorRecovery: false,
    plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties', 'dynamicImport', 'topLevelAwait'],
  });
  visitAst(ast, [], (node, ancestors) => {
    if (node.type !== 'JSXElement') return;
    const opening = node.openingElement;
    const rawElement = jsxName(opening.name);
    if (!['button', 'a', 'Link'].includes(rawElement)) return;
    const explicit = jsxAttribute(opening, 'aria-label', source) || jsxAttribute(opening, 'title', source);
    const text = node.children.map((child) => jsxText(child, source)).join(' ').replace(/\s+/g, ' ').trim();
    const element = rawElement.toLowerCase();
    const destination = jsxAttribute(opening, 'href', source);
    const onClick = jsxAttribute(opening, 'onClick', source);
    const type = jsxAttribute(opening, 'type', source);
    const disabled = jsxAttribute(opening, 'disabled', source);
    const insideForm = ancestors.some((ancestor) => ancestor.type === 'JSXElement' && jsxName(ancestor.openingElement?.name) === 'form');
    const wiring = disabled === 'true' && destination === null && onClick === null
      ? 'disabled-status'
      : destination !== null
      ? 'destination'
      : onClick !== null
        ? 'handler'
        : type === 'submit' || (element === 'button' && insideForm && type !== 'button')
          ? 'form-submit'
          : 'unwired-static-control';
    controls.push({
      element,
      name: explicit || text || '<dynamic>',
      line: opening.loc.start.line,
      handler: onClick,
      destination,
      type,
      disabled,
      wiring,
    });
  });
  return controls;
}

function functionCandidates(source) {
  const declarations = [
    ...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g),
    ...source.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g),
    ...source.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g),
  ];
  const unique = new Map();
  for (const declaration of declarations) {
    const name = declaration[1];
    if (unique.has(name)) continue;
    const prefix = source.slice(Math.max(0, declaration.index - 40), declaration.index);
    const namedFunctionExpression = declaration[0].startsWith('function') && /(?:=|return)\s*(?:async\s*)?$/.test(prefix);
    unique.set(name, {
      name,
      line: lineNumber(source, declaration.index),
      references: (source.match(new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`, 'g')) || []).length,
      exported: /export\s+(?:default\s+)?(?:async\s+)?$/.test(prefix),
      defaultExport: /export\s+default\s+(?:async\s+)?$/.test(prefix),
      namedFunctionExpression,
    });
  }
  return [...unique.values()];
}

function classifyMarker(file, marker) {
  const testOnly = /^(?:__tests__|e2e)\//.test(file) || /(?:^|\/)test(?:s)?\//i.test(file);
  const frozenHeader = ['src/components/ui/UniversalHeader.js', 'src/components/ui/HamburgerMenu.jsx'].includes(file);
  const commentOnly = /^(?:\/\/|\/\*|\*|\{?\/\*)/.test(marker.excerpt);
  const kind = marker.kind;
  if (testOnly) return { disposition: 'test-fixture', review: 'accepted', rationale: 'Marker is confined to automated test code.' };
  if (frozenHeader) return { disposition: 'frozen-global-header-dependency', review: 'accepted', rationale: 'Global header behavior is explicitly frozen and outside Training redesign scope.' };
  if (file === 'src/components/store/DiamondWalletModal.jsx' && kind === 'PLACEHOLDER') {
    return { disposition: 'frozen-global-header-dependency', review: 'accepted', rationale: 'Wallet balance authority belongs to the frozen global header dependency, not Training.' };
  }
  if (file === 'src/lib/supabase.js' && kind === 'STUB') {
    return { disposition: 'build-alias-sentinel', review: 'accepted', rationale: 'Fail-loud compatibility sentinel documents and enforces the webpack alias to the real TypeScript Supabase client.' };
  }
  if (kind === 'PLACEHOLDER' && /\bplaceholder\s*=/.test(marker.excerpt)) {
    return { disposition: 'ui-input-copy', review: 'accepted', rationale: 'JSX placeholder attribute, not placeholder implementation.' };
  }
  if (kind === 'PLACEHOLDER' && /(?:styles?\.placeholder|placeholder\s*:|Skeleton|loading state)/i.test(marker.excerpt)) {
    return { disposition: 'visible-ui-state', review: 'accepted', rationale: 'Visible empty/loading UI presentation, not fabricated product data.' };
  }
  if (kind === 'PLACEHOLDER' && /(?:was an explicit sample-data placeholder|plausible-looking placeholder values)/i.test(marker.excerpt)) {
    return { disposition: 'historical-defect-comment', review: 'accepted', rationale: 'Comment documents removed fabricated data and preserves the regression rationale.' };
  }
  if (kind === 'PLACEHOLDER' && /(?:placeholder suits|dealing placeholder)/i.test(marker.excerpt)) {
    return { disposition: 'poker-normalization-or-ui-state', review: 'accepted', rationale: 'Suit normalization or visible deal-state placeholder; it does not fabricate solver output.' };
  }
  if (commentOnly && /\b(?:former|removed|no |never |without |instead of|used to|dead-link fix)\b/i.test(marker.excerpt)) {
    return { disposition: 'historical-or-prohibition-comment', review: 'accepted', rationale: 'Comment documents removed behavior or explicitly prohibits a fallback/stub.' };
  }
  if (kind === 'SIMULATE' || kind === 'SIMULATED' || kind === 'SIMULATION') {
    return { disposition: 'domain-simulation', review: 'accepted', rationale: 'Poker/training simulation is an intentional product capability; solver provenance is audited separately.' };
  }
  if (kind === 'FALLBACK') {
    if (commentOnly && /(?:\bwas\b|\bold\b|\bformer\b|\bremoved\b|\bunreachable\b|could never|not as a fallback|no .*fallback|prevents? .*fallback|replaces? .*fallback)/i.test(marker.excerpt)) {
      return { disposition: 'historical-or-prohibition-comment', review: 'accepted', rationale: 'Comment records a removed fallback or a guard that prevents fallback behavior.' };
    }
    if (/(?:\bfallback\s*=|\(.*fallback|return .*fallback|\bfallback\s*\|\||\? .*: fallback)/i.test(marker.excerpt)) {
      return { disposition: 'input-normalization-default', review: 'accepted', rationale: 'Explicit function default used to normalize missing display/input values.' };
    }
    if (/auth|supabase|session|localStorage|cached header|publishable|legacy sb-|JWT/i.test(`${file} ${marker.excerpt}`)) {
      return { disposition: 'identity-or-persistence-resilience', review: 'documented-follow-up', followUpPhase: 8, rationale: 'Auth/session/persistence fallback is inventoried for stale-client, expiry, and cross-device verification.' };
    }
    if (/solver|question|range|strategy|frequency|PIO|engine|grading|personality|psychology|hand|cards?|ICM|postflop|preflop/i.test(`${file} ${marker.excerpt}`)) {
      return { disposition: 'training-data-provenance-fallback', review: 'documented-follow-up', followUpPhase: 4, rationale: 'Training-data downgrade requires Phase 4 legality, provenance, semantics, and answer-contract evidence.' };
    }
    if (/icon|SVG|clipboard|download|older browsers|reload|error state|renderable|empty classification|image/i.test(marker.excerpt)) {
      return { disposition: 'visible-ui-resilience', review: 'documented-follow-up', followUpPhase: 14, rationale: 'Visible UI/browser resilience path is assigned to responsive, accessibility, and cross-browser certification.' };
    }
    return { disposition: 'runtime-resilience-fallback', review: 'documented-follow-up', followUpPhase: 15, rationale: 'Runtime resilience path is inventoried for visibility, determinism, observability, and silent-downgrade testing.' };
  }
  if (commentOnly && ['TODO', 'FIXME', 'HACK', 'STUB', 'MOCK', 'DUMMY', 'PLACEHOLDER'].includes(kind)) {
    return { disposition: 'implementation-marker', review: 'phase-review', rationale: 'Explicit implementation marker in reachable Training dependency.' };
  }
  return { disposition: 'runtime-marker', review: 'phase-review', rationale: 'Reachable runtime marker requiring phase-specific wiring verification.' };
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
    ctas: ctas(source, file),
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
      authExpiry: /\b(?:401|unauthorized|auth(?:entication)?\s*(?:error|expired)|session\s*expired|sign\s*in)\b/i.test(source),
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
    markers: markers.map((marker) => ({ ...marker, ...classifyMarker(rel(file), marker) })),
  };
}

const DYNAMIC_SAMPLE_VALUES = {
  gameId: 'cash-001',
  categoryId: 'CASH',
  clinicId: 'clinic-01',
  id: 'phase-2-inventory-sample',
};

function routeSample(template) {
  const params = [];
  let path = template.replace(/\[([^\]]+)\]/g, (_, name) => {
    const value = DYNAMIC_SAMPLE_VALUES[name] || `sample-${name.toLowerCase()}`;
    params.push({ name, value, source: name === 'id' ? 'runtime-api-dependent' : 'canonical-static-catalog' });
    return value;
  });
  if (template.includes('/arena/[gameId]')) path += '?level=1';
  return { path, params, productionSafe: !params.some((param) => param.source === 'runtime-api-dependent') };
}

function closureFor(entry, edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }
  const pending = [entry];
  const visited = new Set();
  while (pending.length) {
    const file = pending.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    for (const dependency of adjacency.get(file) || []) pending.push(dependency);
  }
  return [...visited].sort();
}

function followUpPhaseForRouteState(route, state) {
  if (route.includes('/pvp')) return 10;
  if (/study-group|training-feed|community-leaderboard/.test(route)) return 11;
  if (/coach-mode|reports|progress|performance|weakness|session-dashboard|aggregate/.test(route)) return 12;
  if (/live-hud-sync|hand-history-upload|replay-theater/.test(route)) return 13;
  if (/challenge|tournament|final-table/.test(route)) return 9;
  if (/\/(?:play|arena)\//.test(route)) return state === 'authExpiry' || state === 'stale' ? 8 : 5;
  if (state === 'authExpiry' || state === 'stale') return 8;
  if (state === 'offline' || state === 'retry' || state === 'error') return 15;
  return 7;
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
  const repositorySourceFiles = [...new Set([
    ...walk(join(ROOT, 'pages')),
    ...walk(join(ROOT, 'src')),
    ...walk(join(ROOT, 'scripts')),
    ...walk(join(ROOT, '__tests__')),
    ...walk(join(ROOT, 'e2e')),
  ])].sort();
  const repositoryImportBindings = repositorySourceFiles.flatMap((file) => importBindingsFor(file, read(file)));
  const tests = [...walk(join(ROOT, '__tests__')), ...walk(join(ROOT, 'e2e'))]
    .filter((file) => /training/i.test(rel(file)) || /\/hub\/training|src\/components\/training|TRAINING_LIBRARY/.test(read(file)))
    .sort()
    .map(rel);
  const testText = new Map(tests.map((file) => [file, read(join(ROOT, file))]));
  const routes = pageFiles.map((file) => {
    const template = pageRoute(file, pageRoot, '/hub/training');
    const source = sourceRows.find((row) => row.file === rel(file));
    return {
      template,
      file: rel(file),
      dynamic: template.includes('['),
      sample: routeSample(template),
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
  const componentFiles = graph.files.filter((file) => file.startsWith('src/components/'));
  const hookFiles = graph.files.filter((file) => file.startsWith('src/hooks/'));
  const persistence = sourceRows.filter((row) => Object.values(row.persistenceWrites).some(Boolean));
  const realtime = sourceRows.filter((row) => Object.values(row.realtime).some(Boolean));
  const markers = sourceRows.flatMap((row) => row.markers.map((marker) => ({ file: row.file, ...marker })));
  const possibleUnwiredFunctions = sourceRows.flatMap((row) => row.functions
    .filter((entry) => entry.references === 1)
    .map((entry) => {
      const externalReferenceFiles = repositoryImportBindings
        .filter((binding) => binding.to === row.file && (binding.imported === (entry.defaultExport ? 'default' : entry.name) || binding.imported === '*'))
        .map((binding) => binding.from);
      let disposition = 'unwired-local-review';
      let review = 'phase-review';
      let rationale = 'Local function has no second lexical reference in its declaring file.';
      if (/^(?:__tests__|e2e)\//.test(row.file)) {
        disposition = 'test-helper';
        review = 'accepted';
        rationale = 'Single-use helper is confined to automated test code.';
      } else if (entry.defaultExport && row.file.startsWith('pages/hub/training/')) {
        disposition = 'route-entrypoint';
        review = 'accepted';
        rationale = 'Next.js page default export is invoked by the router.';
      } else if (entry.defaultExport && row.file.startsWith('pages/api/training/')) {
        disposition = 'api-entrypoint';
        review = 'accepted';
        rationale = 'Next.js API default export is invoked by the router.';
      } else if (entry.namedFunctionExpression) {
        disposition = 'assigned-or-returned-function-expression';
        review = 'accepted';
        rationale = 'Named function expression is invoked through its assigned property, variable, or returned closure.';
      } else if (entry.defaultExport && externalReferenceFiles.length) {
        disposition = 'imported-default-entrypoint';
        review = 'accepted';
        rationale = 'Default export is imported by another repository source file.';
      } else if (entry.exported && externalReferenceFiles.length) {
        disposition = 'imported-entrypoint';
        review = 'accepted';
        rationale = 'Named export is imported by another repository source file.';
      } else if (entry.exported) {
        disposition = 'unused-export-review';
        review = externalReferenceFiles.length ? 'accepted' : 'phase-review';
        rationale = 'Named export has no static importer anywhere in pages, src, scripts, or the automated-test trees.';
      }
      return { file: row.file, ...entry, disposition, review, rationale, externalReferenceFiles };
    }));

  const stateNames = ['loading', 'empty', 'error', 'retry', 'success', 'stale', 'offline', 'authExpiry'];
  const routeCoverage = routes.map((route) => {
    const reachableFiles = closureFor(route.file, graph.edges);
    const reachableRows = reachableFiles.map((file) => sourceRows.find((row) => row.file === file)).filter(Boolean);
    const matchingTests = [...testText.entries()]
      .filter(([file, source]) => source.includes(route.template) || source.includes(route.sample.path.split('?')[0]) || source.includes(route.file) || source.includes(route.file.split('/').pop()))
      .map(([file]) => file);
    const states = Object.fromEntries(stateNames.map((state) => {
      const evidence = state === 'success'
        ? [route.file, ...reachableRows.filter((row) => row.states.success).map((row) => row.file)]
        : reachableRows.filter((row) => row.states[state]).map((row) => row.file);
      return [state, {
        status: evidence.length ? 'implemented-or-detected' : 'coverage-gap',
        evidence: [...new Set(evidence)].sort(),
        tests: matchingTests,
        ...(evidence.length ? {} : { followUpPhase: followUpPhaseForRouteState(route.template, state) }),
      }];
    }));
    return {
      route: route.template,
      file: route.file,
      sample: route.sample,
      reachableFiles,
      states,
      existingTests: matchingTests,
      uncoveredStates: stateNames.filter((state) => states[state].status === 'coverage-gap'),
    };
  });

  const sourceEffects = new Map(sourceRows.map((row) => {
    const reachableFiles = closureFor(row.file, graph.edges);
    const reachableRows = reachableFiles.map((file) => sourceRows.find((candidate) => candidate.file === file)).filter(Boolean);
    return [row.file, {
      reachableFiles,
      apiReferences: [...new Set(reachableRows.flatMap((candidate) => candidate.apiReferences))].sort(),
      persistence: reachableRows
        .filter((candidate) => Object.values(candidate.persistenceWrites).some(Boolean))
        .map((candidate) => ({ file: candidate.file, writes: candidate.persistenceWrites })),
      realtime: reachableRows
        .filter((candidate) => Object.values(candidate.realtime).some(Boolean))
        .map((candidate) => ({ file: candidate.file, subscriptions: candidate.realtime })),
      tests: [...testText.entries()]
        .filter(([, source]) => source.includes(row.file) || source.includes(row.file.split('/').pop()))
        .map(([file]) => file),
    }];
  }));

  const ctaLedger = sourceRows.flatMap((row) => row.ctas.map((cta, index) => ({
    id: `${row.file}:${cta.line}:${index + 1}`,
    file: row.file,
    ...cta,
    effectRef: row.file,
  })));
  const dialogLedger = sourceRows.flatMap((row) => {
    const total = row.dialogs.native + row.dialogs.aria + row.dialogs.modalComponents.length;
    return Array.from({ length: total }, (_, index) => ({
      id: `${row.file}:dialog:${index + 1}`,
      file: row.file,
      kind: index < row.dialogs.native
        ? 'native-dialog'
        : index < row.dialogs.native + row.dialogs.aria
          ? 'aria-dialog'
          : row.dialogs.modalComponents[index - row.dialogs.native - row.dialogs.aria],
      effectRef: row.file,
    }));
  });
  const missingLinks = links.filter((link) => !routeExists(link, allPageTemplates));
  const missingApiDefinitions = apiReferences.filter((route) => !routeExists(route, allApiTemplates));
  const manifest = {
    schemaVersion: 2,
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
      routeStateCells: routeCoverage.length * stateNames.length,
      routeStateCoverageGaps: routeCoverage.reduce((sum, route) => sum + route.uncoveredStates.length, 0),
      routeStateUnassignedGaps: routeCoverage.reduce((sum, route) => sum + route.uncoveredStates.filter((state) => !route.states[state].followUpPhase).length, 0),
      ctaWiringGaps: ctaLedger.filter((cta) => cta.wiring === 'unwired-static-control').length,
      markerPhaseReview: markers.filter((marker) => marker.review === 'phase-review').length,
      markerDocumentedFollowUp: markers.filter((marker) => marker.review === 'documented-follow-up').length,
      functionPhaseReview: possibleUnwiredFunctions.filter((entry) => entry.review === 'phase-review').length,
    },
    games,
    routes,
    routeCoverage,
    apiRoutes,
    sourceFiles: sourceRows,
    dependencyEdges: graph.edges,
    componentFiles,
    hookFiles,
    tests,
    persistenceFiles: persistence.map((row) => ({ file: row.file, writes: row.persistenceWrites })),
    realtimeFiles: realtime.map((row) => ({ file: row.file, subscriptions: row.realtime })),
    ctaLedger,
    dialogLedger,
    sourceEffects: [...sourceEffects.entries()].map(([file, effects]) => ({ file, ...effects })),
    classifications: {
      markers,
      possibleUnwiredFunctions,
    },
    gaps: {
      missingLinks,
      missingApiDefinitions,
      markerCandidates: markers,
      possibleUnwiredFunctions,
      routeStates: routeCoverage.filter((route) => route.uncoveredStates.length).map((route) => ({
        route: route.route,
        states: route.uncoveredStates.map((state) => ({ state, followUpPhase: route.states[state].followUpPhase })),
      })),
      ctas: ctaLedger.filter((cta) => cta.wiring === 'unwired-static-control').map((cta) => ({ id: cta.id, file: cta.file, line: cta.line, name: cta.name })),
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
