import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

// Execute the actual pod's hooks and request handlers, including their cleanup.
// No JSX transform or browser/database writes are needed for these races.
async function homeGamePod(fetchPage) {
  const text = await source('src/components/poker-near-me/lobby/PodHomeGames.jsx');
  const body = text.slice(text.indexOf('  const hgSearch ='), text.indexOf('  // Unified per-card navigation'));
  const slots = []; const cleanups = []; let cursor = 0;
  const state = { filters: {}, games: [], sharedLoadingWrites: 0 };
  const scope = {
    useState(initial) { const slot = cursor++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }]; },
    useRef(initial) { const slot = cursor++; if (!(slot in slots)) slots[slot] = { current: initial }; return slots[slot]; },
    useEffect(fn) { const slot = cursor++; if (!(slot in slots)) { slots[slot] = true; cleanups.push(fn()); } },
    useCallback: fn => fn, cachedFetch: fetchPage,
    adaptHomeGameToVenueShape: row => ({ ...row, venue_type: 'home_game' }),
    setFilters: update => { state.filters = update(state.filters); },
    setPodHomeGames: update => { state.games = typeof update === 'function' ? update(state.games) : update; },
    setLoading: () => { state.sharedLoadingWrites++; }, URLSearchParams,
    console: { warn() {} },
  };
  return {
    state,
    render() {
      cursor = 0;
      const args = { ...scope, filters: state.filters, podHomeGames: state.games, userLocation: { lat: 30, lng: -97 }, loading: false };
      return new Function(...Object.keys(args), `${body}; return { search: handleSearch, more: typeof handleLoadMore === 'function' ? handleLoadMore : null, clear: typeof handleClearSearch === 'function' ? handleClearSearch : null, busy: typeof discovering === 'boolean' ? discovering : false, error: discoverError };`)(...Object.values(args));
    },
    unmount() { cleanups.forEach(fn => fn?.()); },
  };
}
const settlePod = async () => { for (let n = 0; n < 15; n++) await Promise.resolve(); };
const deferredPod = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('legacy home games exposes row 101 through scoped continuation with stable unique cards', async () => {
  const urls = [];
  const pod = await homeGamePod(async url => {
    urls.push(new URL(url, 'https://example.test'));
    return urls.length === 1
      ? { groups: Array.from({ length: 100 }, (_, i) => ({ id: `g${i}`, name: `Game ${i}` })), pagination: { has_more: true, next_offset: 100, total: 101 } }
      : { groups: [{ id: 'g99' }, { id: 'g100', name: 'Game 101' }], pagination: { has_more: false, next_offset: null, total: 101 } };
  });
  pod.state.filters = { hgState: 'TX', hgSearch: 'Austin' };
  pod.render().search(); await settlePod();
  assert.equal(pod.state.games.length, 100);
  const next = pod.render(); assert.equal(typeof next.more, 'function'); next.more(); await settlePod();
  assert.equal(pod.state.games.length, 101); assert.equal(pod.state.games.at(-1).name, 'Game 101');
  assert.deepEqual(urls.map(url => url.searchParams.get('offset')), ['0', '100']);
  assert.ok(urls.every(url => url.searchParams.get('state') === 'TX' && url.searchParams.get('search') === 'Austin' && !url.searchParams.has('lat')));
  assert.equal(pod.state.sharedLoadingWrites, 0);
});

test('legacy paging keeps partial cards and exposes retry on failed continuation', async () => {
  let count = 0;
  const pod = await homeGamePod(async () => {
    if (++count === 2) throw new Error('Unavailable');
    return { groups: [{ id: `g${count}` }], pagination: { has_more: count === 1, next_offset: count === 1 ? 100 : null } };
  });
  pod.render().search(); await settlePod(); pod.render().more(); await settlePod();
  assert.equal(pod.state.games.length, 1); assert.match(pod.render().error, /unavailable/i); assert.equal(pod.render().busy, false);
  pod.render().more(); await settlePod(); assert.equal(pod.state.games.length, 2); assert.equal(pod.render().error, '');
});

test('legacy paging refuses malformed or nonadvancing cursor and invalid response', async () => {
  for (const next_offset of [0, -1, '100', 1.5, null]) {
    let count = 0;
    const pod = await homeGamePod(async () => { count++; return { groups: [{ id: 'g1' }], pagination: { has_more: true, next_offset } }; });
    pod.render().search(); await settlePod();
    assert.match(pod.render().error, /unavailable/i); assert.equal(count, 1); assert.equal(pod.state.games.length, 0);
  }
  const pod = await homeGamePod(async () => ({ error: 'Refused' }));
  pod.render().search(); await settlePod(); assert.match(pod.render().error, /unavailable/i);
});

test('legacy continuation refuses repeated cursor, prevents duplicate in-flight loads and preserves its scope', async () => {
  const next = deferredPod(); const urls = [];
  const pod = await homeGamePod(url => {
    urls.push(new URL(url, 'https://example.test'));
    return urls.length === 1 ? Promise.resolve({ groups: [{ id: 'first' }], pagination: { has_more: true, next_offset: 100 } }) : next.promise;
  });
  pod.state.filters = { hgState: 'TX' }; pod.render().search(); await settlePod();
  pod.state.filters = { ...pod.state.filters, hgState: 'NY' };
  pod.render().more(); pod.render().more(); assert.equal(urls.length, 2);
  assert.equal(urls[1].searchParams.get('state'), 'TX');
  next.resolve({ groups: [{ id: 'wrong' }], pagination: { has_more: true, next_offset: 100 } }); await settlePod();
  assert.deepEqual(pod.state.games.map(row => row.id), ['first']); assert.match(pod.render().error, /unavailable/i);
});

test('legacy clear revokes pending continuation and a genuine empty page stays empty without error', async () => {
  const next = deferredPod(); let count = 0;
  const pod = await homeGamePod(() => ++count === 1 ? Promise.resolve({ groups: [{ id: 'first' }], pagination: { has_more: true, next_offset: 100 } }) : next.promise);
  pod.render().search(); await settlePod(); pod.render().more(); pod.render().clear();
  next.resolve({ groups: [{ id: 'late' }], pagination: { has_more: false } }); await settlePod();
  assert.deepEqual(pod.state.games, []); assert.equal(pod.render().busy, false); assert.equal(pod.state.filters.hgHasSearched, false);
  const empty = await homeGamePod(async () => ({ groups: [], pagination: { has_more: false } }));
  empty.render().search(); await settlePod(); assert.deepEqual(empty.state.games, []); assert.equal(empty.render().error, '');
  const text = await source('src/components/poker-near-me/lobby/PodHomeGames.jsx');
  assert.match(text, /onClear=\{handleClearSearch\}/);
  assert.match(text, /onClick=\{handleLoadMore\} disabled=\{discovering\}/);
  assert.match(text, /Load More Home Games/); assert.match(text, /More Games Available/); assert.match(text, /Retry More Home Games/);
});

test('legacy clear, replacement search and unmount revoke late success/error/loading writes', async () => {
  for (const action of ['clear', 'search', 'unmount']) {
    for (const outcome of ['resolve', 'reject']) {
      const old = deferredPod(); let count = 0;
      const pod = await homeGamePod(() => ++count === 1 ? old.promise : Promise.resolve({ groups: [{ id: 'new' }], pagination: { has_more: false } }));
      pod.render().search();
      if (action === 'unmount') pod.unmount(); else { assert.equal(typeof pod.render()[action], 'function'); pod.render()[action](); }
      await settlePod(); const before = JSON.stringify(pod.state); const view = pod.render();
      if (outcome === 'resolve') old.resolve({ groups: [{ id: 'old' }], pagination: { has_more: false } }); else old.reject(new Error('Late refusal'));
      await settlePod();
      assert.equal(JSON.stringify(pod.state), before); assert.equal(pod.render().error, view.error); assert.equal(pod.render().busy, view.busy);
    }
  }
});

test('discovery navigation distinguishes user history from filter synchronization', async () => {
  const page = await source('pages/hub/poker-near-me/[pnmTab].js');

  assert.match(page, /const pushDiscoverySurface = \(nextState\) =>/);
  assert.match(page, /window\.history\.pushState\(/);
  assert.match(page, /window\.history\.replaceState\(/);
  assert.match(page, /spPnmDiscovery: true/);
  assert.match(page, /options: \{ shallow: true, scroll: false \}/);
  assert.doesNotMatch(page, /window\.history\.pushState\(\s*\{\s*\.\.\.window\.history\.state/);
  assert.match(page, /`\$\{window\.location\.pathname\}\$\{window\.location\.search\}`/);
  assert.match(page, /window\.addEventListener\('popstate', restoreDiscoveryState\)/);
  assert.match(page, /window\.removeEventListener\('popstate', restoreDiscoveryState\)/);
  assert.match(page, /window\.addEventListener\('pagehide', markExiting\)/);
  assert.match(page, /if \(discoveryPageExitingRef\.current\) return/);
  assert.match(page, /const addressSlug = normalizeRouteSlug\(/);
  assert.match(page, /if \(addressSlug !== pathSlug\) return/);
  assert.doesNotMatch(page, /const currentUrl = router\.asPath/);
});

test('closed report-game shells never pollute discovery history', async () => {
  const reportGameModal = await source('src/components/poker-near-me/ReportGameModal.jsx');
  assert.match(reportGameModal, /useModalHistory\(!!isOpen, onClose\)/);
  assert.doesNotMatch(reportGameModal, /useModalHistory\(true, onClose\)/);
});

test('the lobby LCP image is not delayed by a cosmetic opacity reveal', async () => {
  const lobbyCanvas = await source('src/components/poker-near-me/lobby/LobbyCanvas.jsx');
  assert.match(lobbyCanvas, /transition: 'none'/);
  assert.doesNotMatch(lobbyCanvas, /transition: ['"]opacity/);
});

test('dynamic mobile notices keep a physical touch-target cushion', async () => {
  const [tutorialCss, globalErrorCatcher] = await Promise.all([
    source('src/styles/tutorial.css'),
    source('src/components/ui/GlobalErrorCatcher.jsx'),
  ]);
  assert.match(tutorialCss, /\.sp-tutorial-prompt-start \{[^}]*min-height: 45px !important/s);
  assert.match(tutorialCss, /\.sp-tutorial-prompt-close \{[^}]*width: 45px;[^}]*height: 45px/s);
  assert.match(globalErrorCatcher, /aria-label="Dismiss Error Notice"/);
  assert.match(globalErrorCatcher, /minWidth: 45/);
  assert.match(globalErrorCatcher, /minHeight: 45/);
});

test('responsive visual baselines and live map probes remain project-stable', async () => {
  const [phase6, phase7, phase14] = await Promise.all([
    source('e2e/06-poker-near-me-phase-6.spec.ts'),
    source('e2e/07-poker-near-me-phase-7.spec.ts'),
    source('e2e/012-poker-near-me-phase-14.spec.ts'),
  ]);

  assert.match(phase6, /phase6-location-section-\$\{testInfo\.project\.name\}\.png/);
  assert.match(phase7, /phase7-map-signal-\$\{testInfo\.project\.name\}\.png/);
  assert.match(phase14, /const activated = await candidate\.evaluate/);
  assert.match(phase14, /element\.click\(\);/);
  assert.match(phase14, /const popupContract = await map\.evaluate/);
  assert.doesNotMatch(phase14, /await candidate\.click\(\)/);
  assert.doesNotMatch(phase14, /popup\.locator\('\.directions-trigger'\)/);
});

test('restored routes remain explicit to assistive technology', async () => {
  const [page, world] = await Promise.all([
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('src/styles/worlds/poker-near-me.css'),
  ]);

  assert.match(
    page,
    /className="pnm-route-announcer" role="status" aria-live="polite" aria-atomic="true"/
  );
  assert.match(page, /Showing \{routeMeta\.breadcrumb\}/);
  assert.match(world, /\.pnm-route-announcer\s*\{[\s\S]*?clip-path:\s*inset\(50%\)/);
});

test('shared Poker Near Me world supports WebKit masks and user contrast preferences', async () => {
  const world = await source('src/styles/worlds/poker-near-me.css');

  assert.match(world, /-webkit-mask-image:\s*linear-gradient\(to bottom/);
  assert.match(world, /-webkit-mask-image:\s*linear-gradient\(90deg/);
  assert.match(world, /@media \(prefers-contrast: more\)/);
  assert.match(world, /@media \(forced-colors: active\)/);
  assert.match(world, /outline:\s*3px solid Highlight !important/);
  assert.match(world, /\[aria-selected='true'\][\s\S]*?background:\s*Highlight !important/);
  assert.match(world, /@media \(prefers-reduced-motion: reduce\)/);
});

test('mobile command controls use continuous contained frames', async () => {
  const [header, menu, navigation, world, app, menuCss, wellPng, platePng] = await Promise.all([
    source('src/components/ui/UniversalHeader.js'),
    source('src/components/ui/HamburgerMenu.jsx'),
    source('src/config/worldMenuNavigation.js'),
    source('src/styles/worlds/poker-near-me.css'),
    source('pages/_app.js'),
    source('src/styles/worlds/poker-near-me-console-menu.css'),
    readFile(new URL('public/images/pnm-console/painted-controls-v1/search-well.png', root)),
    readFile(new URL('public/images/pnm-console/painted-controls-v1/button-secondary.png', root)),
  ]);

  // The approved chrome deliberately replaced the old rectangular cyan
  // pseudo-element with a soft, edge-free glow. Preserve keyboard visibility
  // without reintroducing a box over the baked header artwork.
  assert.match(
    header,
    /\.approved-global-header__button:focus,\s*\.approved-global-header__button:focus-visible\s*\{[\s\S]*?outline:\s*none;[\s\S]*?box-shadow:\s*none;/
  );
  assert.match(
    header,
    /\.approved-global-header__button:focus-visible\s*\{[\s\S]*?background:\s*radial-gradient\(/
  );
  assert.doesNotMatch(
    header,
    /\.approved-global-header__button:focus-visible::(?:before|after)\s*\{[\s\S]*?border:/
  );
  assert.match(world, /:where\(:not\([\s\S]*?\.approved-global-header__button[\s\S]*?\.sp-grid-tile/);
  assert.match(navigation, /'poker-near-me':[\s\S]*?scheme:\s*'casino-realism'[\s\S]*?accent:\s*'#38bdf8'/);

  // Ownership of the Poker Near Me drawer frames moved out of the component's
  // inline stylesheet into the external console menu layer. The regression
  // now reads the final cascade, and still protects what the inline rules
  // protected: one continuous frame per control, no intersecting rails or
  // decorative edge fragments, no clipped corners, a distinct current page.

  // 1. The drawer is marked for the layer on Poker Near Me, and only there.
  assert.match(menu, /const isPokerNearMeMenu = activeWorld\?\.id === 'poker-near-me';/);
  assert.match(menu, /data-pnm-console=\{isPokerNearMeMenu \? 'painted-command-drawer-v1' : undefined\}/);

  // 2. One source of truth: no second, inline Poker Near Me frame competes
  // with the layer (a CSS border over painted art is a frame on a frame).
  assert.doesNotMatch(
    menu,
    /\.sp-drawer\[data-world-command-menu='poker-near-me'\][^{}]*\{[^}]*(?:border|background|box-shadow|clip-path)[\w-]*\s*:/
  );

  // 3. _app.js loads the layer after every earlier drawer finish, so its
  // rules win equal-specificity ties against the ordinary-border finish.
  const at = (file) => app.indexOf(`import '../src/styles/worlds/${file}';`);
  assert.ok(at('poker-near-me-console-menu.css') > 0, 'the console menu layer must be imported');
  for (const earlier of [
    'poker-near-me.css',
    'poker-near-me-machined.css',
    'poker-near-me-command-surfaces.css',
    'poker-near-me-console.css',
  ]) {
    assert.ok(at(earlier) >= 0, `${earlier} must stay imported`);
    assert.ok(at(earlier) < at('poker-near-me-console-menu.css'), `${earlier} must load before the console menu layer`);
  }

  // 4. Every rule in the layer is scoped to Poker Near Me.
  const css = menuCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((prelude) => !prelude.startsWith('@'))
    .flatMap((prelude) => {
      const parts = [];
      let depth = 0;
      let current = '';
      for (const char of prelude) {
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (char === ',' && depth === 0) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      return parts;
    });
  assert.ok(selectors.length > 40);
  for (const selector of selectors) {
    assert.ok(selector.startsWith('body.world-poker-near-me '), `unscoped menu rule: ${selector}`);
  }

  // 5. One frame per control, and it is the painted art: every drawer control
  // has its CSS border, radius and shadow zeroed, and nothing in the layer
  // draws a border, radius, shadow, gradient or clip of its own.
  assert.match(
    css,
    /:is\([^)]*\.sp-command-utility-rail[^)]*\.sp-command-search input[^)]*\.sp-menu-row,\s*\.sp-grid-tile,\s*\.sp-icon-btn\s*\)\s*\{\s*border:\s*0 !important;\s*border-radius:\s*0 !important;\s*box-shadow:\s*none !important;/
  );
  for (const [, property, value] of css.matchAll(/(?:^|[;{\s])(border(?:-radius)?|box-shadow)\s*:\s*([^;}]+)/g)) {
    assert.match(value.trim(), property === 'box-shadow' ? /^none( !important)?$/ : /^0( !important)?$/, `${property}: ${value}`);
  }
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(|clip-path|:hover/i);

  // 6. The frames are complete: each well and plate keeps the art's native
  // ratio (search-well.png 1829 x 313 with its painted band in the top 271
  // rows, button-secondary.png 348 x 114), is anchored so no edge is cut,
  // and is never stretched.
  const pngSize = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)];
  assert.deepEqual(pngSize(wellPng), [1829, 313]);
  assert.deepEqual(pngSize(platePng), [348, 114]);
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || '';
  };
  const scope = "body.world-poker-near-me .sp-drawer[data-pnm-console='painted-command-drawer-v1']";
  const row = rule(`${scope} .sp-menu-row`);
  assert.match(row, /aspect-ratio:\s*1829 \/ 271;/);
  assert.match(row, /min-height:\s*0 !important;/);
  assert.match(row, /search-well\.webp/);
  assert.match(row, /background-position:\s*center top !important;/);
  assert.match(row, /background-size:\s*100% auto !important;/);
  const tile = rule(`${scope} .sp-grid-tile`);
  assert.match(tile, /aspect-ratio:\s*348 \/ 114;/);
  assert.match(tile, /min-height:\s*0 !important;/);
  assert.match(tile, /button-secondary\.png/);
  assert.match(tile, /background-size:\s*100% auto !important;/);
  assert.doesNotMatch(css, /100% 100%/);
  assert.match(rule(`${scope} .sp-command-search input`), /height:\s*var\(--pnm-row-height\) !important;[\s\S]*background-position:\s*center top !important;/);
  assert.match(css, /--pnm-row-height:\s*calc\(var\(--pnm-row-width\) \* 271 \/ 1829\);/);

  // 7. No rail runs behind the controls to intersect their frames, and the
  // generic decorative fragments stay removed.
  const drawer = rule(scope);
  assert.match(drawer, /background:\s*#010305 !important;/);
  assert.doesNotMatch(drawer, /panel-mid\.png|url\(/);
  assert.match(css, /\.sp-grid-tile::after\s*\{\s*content:\s*none !important;\s*\}/);
  assert.match(css, /\.sp-menu-row,\s*\.sp-grid-tile\s*\)::before/);

  // 8. The current page keeps a distinct, painted state.
  assert.match(rule(`${scope} .sp-grid-tile[aria-current='page']`), /button-primary\.png/);
  assert.match(rule(`${scope} .sp-menu-row[aria-current='page']`), /color:\s*#45adff !important;[\s\S]*filter:/);
});

test('Poker Near Me drawer icons are the right painted holder or deliberate text', async () => {
  const [menu, menuCss, kit] = await Promise.all([
    source('src/components/ui/HamburgerMenu.jsx'),
    source('src/styles/worlds/poker-near-me-console-menu.css'),
    source('src/components/poker-near-me/PokerNearMeConsole.jsx'),
  ]);
  const kitIcons = new Set(
    [...kit.match(/const PNM_CONTROL_ICONS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
  );
  const table = menu.match(/const PNM_COMMAND_ICON_BY_ROUTE = Object\.freeze\(\{([\s\S]*?)\}\);/)[1];
  const routes = Object.fromEntries([...table.matchAll(/'([^']+)':\s*'([a-z-]+)'/g)].map((m) => [m[1], m[2]]));
  const fn = menu.match(/function pokerNearMeCommandIcon\(item\) \{([\s\S]*?)\n\}/)[1];
  const used = new Set([...Object.values(routes), ...[...fn.matchAll(/return '([a-z-]+)'/g)].map((m) => m[1])]);

  // Every Poker Near Me destination the menus link to has a semantic holder.
  assert.deepEqual(
    Object.fromEntries(Object.entries(routes).filter(([route]) => route.startsWith('/hub/poker-near-me/'))),
    {
      '/hub/poker-near-me/lobby': 'location',
      '/hub/poker-near-me/venues': 'directions',
      '/hub/poker-near-me/series': 'event-ticket',
      '/hub/poker-near-me/events': 'event-ticket',
      '/hub/poker-near-me/live-games': 'live-games',
      '/hub/poker-near-me/map': 'globe',
      '/hub/poker-near-me/saved': 'saved',
      '/hub/poker-near-me/roadtrip': 'roadtrip',
      '/hub/poker-near-me/alerts': 'alert',
      '/hub/poker-near-me/more': 'more',
      '/hub/poker-near-me/lobby?pod=gametrends': 'live-games',
      '/hub/poker-near-me/lobby?pod=peakheatmap': 'calendar',
      '/hub/poker-near-me/lobby?pod=compare': 'filter',
    }
  );

  // Only kit pictograms, each with a painted holder the layer actually loads,
  // and no generic fallback: an unmatched row is printed as text.
  for (const name of used) {
    assert.ok(kitIcons.has(name), `${name} is not a PokerNearMeConsoleIcon`);
    const holder = new RegExp(`\\.sp-command-item-icon--${name} \\{ background-image: url\\('/images/pnm-console/painted-controls-v1/icon-${name}\\.png'\\) !important; \\}`);
    assert.match(menuCss, holder, `${name} has no painted holder`);
    await readFile(new URL(`public/images/pnm-console/painted-controls-v1/icon-${name}.png`, root));
  }
  assert.match(fn, /\n  return null;$/);
  assert.match(menu, /`sp-command-item-icon sp-command-item-icon--\$\{pokerNearMeCommandIcon\(item\) \|\| 'text-only'\}`/);
  assert.match(menuCss, /\.sp-command-item-icon--text-only \{\s*display: none !important;\s*\}/);

  // Deck tiles always get a slot on Poker Near Me; other worlds keep theirs.
  assert.match(menu, /const iconSlot = \(gridItem\.icon \|\| isPokerNearMeMenu\) \? \(/);
  // Page Tutorial, Help and Log Out are one deliberately text-only group.
  assert.match(menu, /className=\{isPokerNearMeMenu \? 'sp-command-item-icon sp-command-item-icon--text-only' : undefined\}/);
  assert.match(menu, /className=\{isPokerNearMeMenu \? 'sp-command-utility-links' : undefined\}/);
});

test('Poker Near Me drawer rows are one glyph, one arrow and clear to assistive technology', async () => {
  const [menu, menuCss] = await Promise.all([
    source('src/components/ui/HamburgerMenu.jsx'),
    source('src/styles/worlds/poker-near-me-console-menu.css'),
  ]);
  const hidden = menuCss.match(/([^{}]+)\{\s*display: none !important;\s*\}/g).join('\n');
  for (const glyph of [
    '.sp-command-item-icon svg',
    '.sp-menu-row > svg',
    '.sp-icon-btn svg',
    '.sp-command-utility-button svg',
    '.sp-command-offline > svg',
    '.sp-command-report-bug > button > svg',
  ]) {
    assert.ok(hidden.includes(glyph), `${glyph} must not reach the painted drawer`);
  }

  // Exactly one painted arrow per link or disclosure row, empty content so it
  // is never announced, turned down while a section is open.
  const arrows = [...menuCss.matchAll(/\.sp-menu-row[^{]*::after\s*\{[^}]*content: '';[^}]*\}/g)].map((m) => m[0]);
  assert.equal(arrows.length, 2);
  assert.match(arrows[0], /^\.sp-menu-row:is\(a, \[aria-expanded\]\)::after[\s\S]*icon-back\.png[\s\S]*rotate\(180deg\)/);
  assert.match(arrows[1], /^\.sp-menu-row\[data-command-pinned\]::after[\s\S]*icon-review\.png/);
  assert.match(menuCss, /\.sp-menu-row\[aria-expanded='true'\]::after \{\s*transform: rotate\(-90deg\);/);

  // Row semantics stay in the DOM: disclosure state, switch state, pin state.
  assert.match(menu, /aria-expanded=\{!collapsed\}\s*aria-controls=\{panelId\}/);
  assert.match(menu, /role="switch"\s*aria-checked=\{!!item\.checked\}\s*aria-label=\{item\.label\}/);
  assert.match(menu, /<span className="sp-command-switch-state" data-state=\{item\.checked \? 'on' : 'off'\} aria-hidden="true">\s*\{item\.checked \? 'On' : 'Off'\}/);
  assert.match(menu, /'data-command-pinned': isPokerNearMeMenu && editFavs \? \(pinned \? 'true' : 'false'\) : undefined,/);
  assert.match(menu, /\$\{pinned \? 'Unpin' : 'Pin'\} \$\{item\.label\}/);
  assert.match(menuCss, /\.sp-command-utility-button--edit\[aria-pressed='true'\] \{\s*background-image: url\('\/images\/pnm-console\/painted-controls-v1\/icon-review\.png'\) !important;/);

  // Clearing the search keeps keyboard focus in the field on Poker Near Me.
  assert.match(menu, /setQuery\(''\);\s*if \(isPokerNearMeMenu\) searchInputRef\.current\?\.focus\(\);/);
});

test('Poker Near Me header buttons get 44px touch targets without painting anything', async () => {
  const [menuCss, header] = await Promise.all([
    source('src/styles/worlds/poker-near-me-console-menu.css'),
    source('src/components/ui/UniversalHeader.js'),
  ]);
  const css = menuCss.replace(/\/\*[\s\S]*?\*\//g, '');

  // The geometry this relies on is the header's own: buttons 13% down, 74% tall.
  assert.match(header, /\.approved-global-header__button \{[^}]*top: 13%;[^}]*height: 74%;/);

  const extension = css.match(/body\.world-poker-near-me \.approved-global-header :is\(([^)]*)\)::before \{([^}]*)\}/);
  assert.ok(extension, 'the Poker Near Me header hit-area extension is missing');
  const buttons = extension[1].split(',').map((name) => name.trim());
  assert.deepEqual(buttons, [
    '.approved-global-header__menu',
    '.approved-global-header__back',
    '.approved-global-header__hub',
    '.approved-global-header__wallet',
    '.approved-global-header__messenger',
    '.approved-global-header__notifications',
  ]);
  const body = extension[2];
  assert.match(body, /content: '';/);
  assert.match(body, /top: calc\(-13% \/ 0\.74\);/);
  assert.match(body, /height: max\(44px, calc\(100% \/ 0\.74\)\);/);
  // Transparent: it paints nothing over the approved artwork.
  assert.doesNotMatch(body, /background|border|outline|box-shadow|filter|opacity/);
  // Profile and VIP clip their own content, so they are never extended here.
  assert.doesNotMatch(css, /approved-global-header__(?:profile|vip)[^{]*::(?:before|after)/);
  assert.match(css, /body\.world-poker-near-me \.approved-global-header \{\s*overflow: visible;\s*\}/);
  // Scoped to Poker Near Me: no rule touches the header anywhere else.
  for (const [prelude] of css.matchAll(/[^{}]*approved-global-header[^{}]*(?=\{)/g)) {
    assert.match(prelude.trim(), /^body\.world-poker-near-me /);
  }
});

test('other worlds keep the generic drawer exactly', async () => {
  const menu = await source('src/components/ui/HamburgerMenu.jsx');
  // The generic hover finish keeps its original (0,2,0) specificity so no
  // world-specific rule loses a tie it used to win; Poker Near Me is excluded
  // without adding weight.
  assert.match(menu, /:where\(\.sp-drawer:not\(\[data-world-command-menu='poker-near-me'\]\)\) \.sp-menu-row:hover \{ background: var\(--world-tile-active, rgba\(127, 148, 190, 0\.14\)\) !important; \}/);
  assert.match(menu, /:where\(\.sp-drawer:not\(\[data-world-command-menu='poker-near-me'\]\)\) \.sp-grid-tile:hover \{ transform: translateY\(-2px\); box-shadow: 0 4px 8px rgba\(0, 0, 0, 0\.18\); \}/);
  assert.doesNotMatch(menu, /(?<!:where\()\.sp-drawer:not\(\[data-world-command-menu='poker-near-me'\]\)/);
  // Every Poker Near Me presentation hook is conditional on the world.
  for (const hook of ['sp-command-assist', 'sp-command-report-bug', 'sp-command-utility-links']) {
    assert.match(menu, new RegExp(`className=\\{isPokerNearMeMenu \\? '${hook}' : undefined\\}`));
  }
  assert.match(menu, /const pokerNearMeIconClass = \(item\) => \(isPokerNearMeMenu\n/);
  assert.match(menu, /\{isPokerNearMeMenu \? \(\s*<span className="sp-command-switch-state"[\s\S]*?\) : \(\s*<span\s*aria-hidden="true"\s*style=\{\{\s*width: 52, height: 28, borderRadius: 999/);
});

test('Phase 5 stays on the shared route family instead of forking handlers or data', async () => {
  const routes = await Promise.all([
    source('pages/hub/poker-near-me/lobby.js'),
    source('pages/hub/poker-near-me/[pnmTab].js'),
    source('pages/hub/poker-near-me/in/index.js'),
    source('pages/hub/poker-near-me/in/[state]/index.js'),
    source('pages/hub/poker-near-me/in/[state]/[city].js'),
    source('pages/hub/venues/[id].js'),
    source('pages/hub/home-games.js'),
    source('pages/hub/home-games/near-me.js'),
    source('pages/hub/poker-series.js'),
    source('pages/hub/events-calendar.js'),
    source('pages/hub/series/[id].js'),
    source('pages/hub/tours/[code].js'),
  ]);

  assert.equal(routes.length, 12);
  for (const route of routes) {
    assert.match(route, /PokerNearMe|poker-near-me|pnm-|world-poker-near-me/i);
  }
});
