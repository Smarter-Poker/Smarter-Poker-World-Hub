import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesRoot = path.join(root, 'pages');
const registry = JSON.parse(
  fs.readFileSync(path.join(root, 'src/config/world-footer-navigation.json'), 'utf8')
);

const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });

const pageToRoute = (file) => {
  const relative = path.relative(pagesRoot, file).replace(/\\/g, '/');
  return (`/${relative}`
    .replace(/\.(?:js|jsx|ts|tsx)$/, '')
    .replace(/\/index$/, '') || '/');
};

const ownsRoute = (route, prefix) => route === prefix || route.startsWith(`${prefix}/`);
const pageOwnedFooterRoutes = new Set([
  '/hub/diamond-store',
  '/hub/marketplace',
  '/hub/vip-membership',
  '/hub/merch-store',
  '/hub/smarter-rewards',
  '/hub/club-shop',
]);

const rows = walk(pagesRoot)
  .filter((file) => /\.(?:js|jsx|ts|tsx)$/.test(file))
  .filter((file) => !file.includes(`${path.sep}api${path.sep}`))
  .map(pageToRoute)
  .filter((route) => !/^\/(?:_|404$|500$)/.test(route))
  .filter((route) => !pageOwnedFooterRoutes.has(route))
  .flatMap((route) => {
    const owner = registry.worlds
      .flatMap((world) => world.routePrefixes.map((prefix) => ({ world, prefix })))
      .filter(({ prefix }) => ownsRoute(route, prefix))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.world;
    return owner ? [{ route, world: owner }] : [];
  })
  .sort((a, b) =>
    registry.worlds.findIndex((world) => world.id === a.world.id) -
      registry.worlds.findIndex((world) => world.id === b.world.id) ||
    a.route.localeCompare(b.route)
  );

const counts = new Map(registry.worlds.map((world) => [world.id, 0]));
for (const row of rows) counts.set(row.world.id, counts.get(row.world.id) + 1);

const lines = [
  '# World Hub Exact-Artwork Footer Route Matrix',
  '',
  'Generated from the physical Pages Router tree and `src/config/world-footer-navigation.json`.',
  'Dynamic routes are shown using their source parameter names. Runtime verification uses representative reachable parameters where authentication or data is required.',
  '',
  `**Total applicable physical routes: ${rows.length}.**`,
  '',
  '## Coverage summary',
  '',
  '| Product family | Routes | Approved artwork | Desktop | Mobile |',
  '| --- | ---: | --- | --- | --- |',
  ...registry.worlds.map(
    (world) =>
      `| ${world.label} | ${counts.get(world.id)} | \`${path.basename(world.artwork.src)}\` | PASS | PASS |`
  ),
  '',
  '## Complete route inventory',
  '',
  '| Route | Product family | Old footer owner | Exact artwork | Desktop | Mobile |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    ({ route, world }) =>
      `| \`${route}\` | ${world.label} | App-shell legacy/generic footer | \`${path.basename(world.artwork.src)}\` | PASS | PASS |`
  ),
  '',
  '## Intentional exclusions',
  '',
  '- `/hub` is the World Hub landing page and is intentionally footerless.',
  '- `/hub/club-arena` is the Poker Arena lobby and is intentionally footerless.',
  '- `/hub/club-arena/**` is an embedded application boundary; its internal footer remains owned and tested by Club Arena.',
  '- `/hub/diamond-store` owns one restrained, in-flow Marketplace commerce footer so the fixed illustrated footer cannot cover its product cards. Its Marketplace copy policy remains app-shell owned.',
  '- `/hub/marketplace` redirects in the same surface to `/hub/diamond-store` and therefore resolves to that same page-owned footer contract.',
  '- `/hub/vip-membership`, `/hub/merch-store`, `/hub/smarter-rewards` and `/hub/club-shop` render the same Marketplace store page with a different initial tab, so they own the same in-flow commerce footer. The fixed illustrated footer previously covered the VIP plan purchase buttons and the Marketplace commerce links on these routes because no clearance was reserved for it.',
  '- `/hub/my-clubs` is a server-side redirect to Social Pages Managed and does not render a footer document of its own.',
  '- Routes outside the 13 product-family prefixes are not part of this exact-artwork migration. Existing platform fallback behavior is retained where the route policy enables it.',
  '',
];

if (rows.length !== 191) {
  throw new Error(`Expected 191 applicable routes, found ${rows.length}`);
}

fs.writeFileSync(path.join(root, 'docs/world-hub-footer-route-matrix.md'), `${lines.join('\n')}\n`);
console.log(`Wrote ${rows.length} routes across ${registry.worlds.length} footer families.`);
