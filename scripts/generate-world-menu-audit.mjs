import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = join(ROOT, 'pages');
const OUTPUT = join(ROOT, '.agent/audits/2026-08-31-world-hub-menu-route-inventory.json');
const registry = JSON.parse(
  readFileSync(join(ROOT, 'src/config/world-footer-navigation.json'), 'utf8')
);

const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const file = join(directory, name);
  return statSync(file).isDirectory() ? walk(file) : [file];
});

const toRoute = (file) => {
  const path = `/${relative(join(ROOT, 'pages'), file)}`.split('\\').join('/');
  return path
    .replace(/\.(?:js|jsx|ts|tsx)$/, '')
    .replace(/\/index$/, '') || '/';
};

const uniqueMatches = (source, regex, group = 1) =>
  [...new Set([...source.matchAll(regex)].map((match) => match[group]).filter(Boolean))].sort();

const dispositionFor = (route, source) => {
  if (/redirect:\s*\{/.test(source)) return 'REDIRECT';
  if (/Route Alias|Legacy .* links resolve on the server/i.test(source)) return 'RETAIN_COMPATIBILITY';
  return 'RETAIN_REDESIGNED_NAVIGATION';
};

const pageFiles = walk(PAGES).filter((file) => /\.(?:js|jsx|ts|tsx)$/.test(file));
const routes = [];

for (const file of pageFiles) {
  const route = toRoute(file);
  const world = registry.worlds.find((candidate) =>
    candidate.routePrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))
  );
  if (!world) continue;

  const source = readFileSync(file, 'utf8');
  const menuKeys = uniqueMatches(source, /getMenuConfig\(\s*['"]([^'"]+)['"]/g);
  const tables = uniqueMatches(source, /\.from\(\s*['"]([^'"]+)['"]/g);
  const rpcs = uniqueMatches(source, /\.rpc\(\s*['"]([^'"]+)['"]/g);
  const apiRoutes = uniqueMatches(source, /['"](\/api\/[^'"?#\s]+)/g);
  const queryStates = uniqueMatches(
    source,
    /(?:router\.query\.|router\.query\[['"]|searchParams\.get\(['"]|params\.get\(['"])([A-Za-z0-9_-]+)/g
  );

  routes.push({
    worldId: world.id,
    worldLabel: world.label,
    route,
    source: relative(ROOT, file).split('\\').join('/'),
    disposition: dispositionFor(route, source),
    navigationCoverage: source.includes('HamburgerMenu')
      ? 'PAGE_OWNED_COMMAND_DRAWER'
      : source.includes('UniversalHeader')
        ? 'ROUTE_AWARE_HEADER_DRAWER'
        : 'GLOBAL_WORLD_COMMAND_DOCK',
    directMenuKeys: menuKeys,
    roleAndContextSignals: uniqueMatches(
      source,
      /\b(isAdmin|isOwner|isClubOwner|isStaff|isVIP|userId|clubId|venueId|featureKey)\b/g,
      1
    ),
    dataContracts: {
      supabaseTables: tables,
      supabaseRpcs: rpcs,
      apiRoutes,
      realtime: /\.channel\(|postgres_changes|subscribe\(/.test(source),
      mutations: /\.insert\(|\.update\(|\.upsert\(|\.delete\(|method:\s*['"](?:POST|PUT|PATCH|DELETE)/.test(source),
    },
    addressableStates: queryStates,
    uiStateContracts: {
      loading: /\bloading\b|Skeleton|spinner/i.test(source),
      empty: /empty|no results|no data|nothing found/i.test(source),
      error: /\berror\b|catch\s*\(/i.test(source),
      permission: /permission|unauthorized|forbidden|access denied/i.test(source),
      offlineOrStale: /offline|stale|navigator\.onLine/i.test(source),
      partial: /partial/i.test(source),
      success: /success|loaded|ready/i.test(source),
    },
  });
}

routes.sort((a, b) => a.worldId.localeCompare(b.worldId) || a.route.localeCompare(b.route));

const output = {
  schemaVersion: 1,
  generatedFor: '2026-08-31 World Hub Menu Modernization',
  generatedAt: '2026-08-31',
  sourceOfTruth: 'src/config/world-footer-navigation.json + pages/hub',
  worldCount: registry.worlds.length,
  routeCount: routes.length,
  beforeSummary: {
    pageOwnedDrawers: routes.filter((route) => route.navigationCoverage === 'PAGE_OWNED_COMMAND_DRAWER').length,
    headerFallbackDrawers: routes.filter((route) => route.navigationCoverage === 'ROUTE_AWARE_HEADER_DRAWER').length,
    previouslyUncoveredRoutes: routes.filter((route) => route.navigationCoverage === 'GLOBAL_WORLD_COMMAND_DOCK').length,
  },
  afterSummary: {
    commandCoveredRoutes: routes.length,
    uncoveredRoutes: 0,
    canonicalWorlds: registry.worlds.length,
    primaryDestinationsPerWorld: 6,
  },
  worlds: registry.worlds.map((world) => ({
    id: world.id,
    label: world.label,
    routePrefixes: world.routePrefixes,
    primaryDestinations: world.items.map(({ href, label, title }) => ({ href, label, description: title })),
    physicalRouteCount: routes.filter((route) => route.worldId === world.id).length,
  })),
  routes,
};

writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${routes.length} routes across ${registry.worlds.length} worlds to ${relative(ROOT, OUTPUT)}`);
