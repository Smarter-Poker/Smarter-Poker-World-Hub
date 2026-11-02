import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const css = readFileSync('src/components/store/MarketplaceDetailExperience.module.css', 'utf8');

test('detail pages do not reserve an already in-flow sticky header twice', () => {
  const header = readFileSync('src/components/ui/UniversalHeader.js', 'utf8');
  assert.match(header, /\.approved-global-header\s*\{\s*position:\s*sticky/);
  const owner = readFileSync('src/components/store/MarketplaceDetailExperience.jsx', 'utf8');
  assert.ok(owner.indexOf('<UniversalHeader') < owner.indexOf('<main'));
  let pageRules = 0;
  postcss.parse(css).walkRules('.page', (rule) => {
    const padding = rule.nodes.find((node) => node.prop === 'padding');
    assert.ok(padding, 'each desktop/mobile page rule declares its own spacing');
    assert.equal(padding.value.split(/\s+/)[0], '14px', 'keep one content gap below the in-flow header');
    pageRules += 1;
  });
  assert.equal(pageRules, 2, 'desktop and phone keep the same header clearance contract');
});

test('real Merch atlas cards keep image margins unpainted and copy faces readable', async () => {
  const source = readFileSync('src/components/store/MerchStore.jsx', 'utf8');
  const merchCss = readFileSync('src/components/store/MerchStore.module.css', 'utf8');
  const shellCss = readFileSync('src/components/diamond-store/DiamondStoreShell.module.css', 'utf8');
  const names = [...merchCss.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => match[1]);
  const helpers = source.slice(source.indexOf('const fmt ='), source.indexOf('function firstString'));
  const card = source.slice(source.indexOf('function MerchProductCard('), source.indexOf('export default function MerchStore'));
  const compiled = await build({
    stdin: {
      contents: `import React,{useState,useId} from 'react';
        import { formatStoreUsd } from './src/lib/store/wholeDollarPrice.mjs';
        const merchStyles=${JSON.stringify(Object.fromEntries(names.map((name) => [name, name])))};
        const Link=({href,children,...props})=><a href={href} {...props}>{children}</a>;
        ${source.match(/const MAX_QTY = [^;]+;/)[0]} ${helpers} ${card}
        export default MerchProductCard;`,
      loader: 'jsx', resolveDir: process.cwd(),
    },
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react/jsx-runtime'],
  });
  const isolated = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, { module: isolated, exports: isolated.exports, require });
  const product = {
    key: 'atlas-matte-fixture', name: 'Atlas Matte Fixture', description: 'Isolated Product Copy',
    atlasPosition: '0 0', variants: [], source: 'catalog', inStock: true,
    fulfillmentReady: true, mediaApproved: true, priceUsd: 20, priceDiamonds: 2000,
  };
  const html = renderToStaticMarkup(React.createElement(isolated.exports.default, {
    product, balance: 0, hasUser: false, cartReady: false, busyKey: null,
    wishlistBusyKey: null, isWishlisted: false,
  }));
  assert.match(html, /<article[^>]*><div class="mediaBay"><div[^>]*class="productImage atlasProductImage"/);
  assert.match(html, /<div class="cardBody">/);
  assert.match(html, /legacy-tabletop-atlas\.webp/);
  const declaration = (sheet, selector, property) => {
    let value;
    postcss.parse(sheet).walkRules(selector, (rule) => rule.walkDecls(property, (node) => { value = node.value; }));
    return value;
  };
  for (const selector of ['.productCard', '.mediaBay']) {
    assert.equal(declaration(merchCss, selector, 'background'), 'transparent');
  }
  for (const selector of [
    '.merchSurface :global(article)', '.merchSurface :global(article) > div:first-child',
    ".contentShell[data-store-section='merch']", ".contentShell[data-store-section='merch']::before",
  ]) assert.equal(declaration(shellCss, selector, 'background'), 'transparent');
  assert.equal(declaration(merchCss, '.atlasProductImage', 'aspect-ratio'), '1 / 2');
  const baseFace = declaration(merchCss, '.cardBody', 'background');
  const shellFace = declaration(shellCss, '.merchSurface :global(article) > div:last-child', 'background');
  assert.equal(baseFace, '#02070b');
  assert.equal(shellFace, '#050a0f');
  const luminance = (hex) => hex.slice(1).match(/../g).map((pair) => parseInt(pair, 16) / 255)
    .map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
    .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
  for (const face of [baseFace, shellFace]) {
    for (const selector of ['.productTitle', '.productDescription', '.price']) {
      let ink = declaration(merchCss, selector, 'color');
      if (ink === '#fff') ink = '#ffffff';
      assert.ok((luminance(ink) + 0.05) / (luminance(face) + 0.05) >= 4.5,
        `${selector} remains readable on its preserved copy face`);
    }
  }
});

const result = await build({
  entryPoints: ['pages/hub/smarter-rewards/[rewardId].js'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  plugins: [
    {
      name: 'isolated-reward-detail',
      setup(build) {
        build.onResolve({ filter: /^(react|react\/jsx-runtime)$/ }, (args) => ({
          path: require.resolve(args.path),
          external: true,
        }));
        build.onResolve({ filter: /\.module\.css$/ }, (args) => ({
          path: path.resolve(args.resolveDir, args.path),
          namespace: 'css',
        }));
        build.onLoad({ filter: /.*/, namespace: 'css' }, (args) => {
          const names = [...readFileSync(args.path, 'utf8').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(
            (m) => m[1]
          );
          return {
            contents: `export default ${JSON.stringify(Object.fromEntries(names.map((name) => [name, name])))}`,
          };
        });
        build.onResolve(
          {
            filter:
              /next\/(link|head)$|UniversalHeader$|PageTransition$|MarketplaceCommerceNav$|RewardTelemetryConsole$/,
          },
          (args) => ({ path: args.path, namespace: 'fixture' })
        );
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
          contents:
            args.path.endsWith('/head') ||
            args.path.endsWith('UniversalHeader') ||
            args.path.endsWith('MarketplaceCommerceNav')
              ? 'export default function Empty(){return null}'
              : args.path.endsWith('/link')
                ? 'export default function Link({href,children,...props}) {return <a href={href} {...props}>{children}</a>}'
                : args.path.endsWith('RewardTelemetryConsole')
                  ? 'export default function Telemetry(){return <section id="reward-telemetry"><h2>Verified Reward Telemetry</h2></section>}'
                  : 'export default function Transition({children}) {return <>{children}</>}',
          loader: 'jsx',
        }));
      },
    },
  ],
});
const module = { exports: {} };
vm.runInNewContext(result.outputFiles[0].text, {
  module,
  exports: module.exports,
  require,
  console,
  URL,
  setTimeout,
  clearTimeout,
});
const { default: RewardDetail, getStaticPaths, getStaticProps } = module.exports;

test('every catalog reward retains a unique reachable detail and authoritative Diamond metadata', () => {
  const { paths, fallback } = getStaticPaths();
  assert.equal(fallback, false);
  assert.ok(paths.length >= 67);
  assert.equal(new Set(paths.map((p) => p.params.rewardId)).size, paths.length);
  for (const { params } of paths) {
    const { reward } = getStaticProps({ params }).props;
    assert.equal(reward.id, params.rewardId);
    assert.ok(Number.isFinite(reward.diamonds) && reward.diamonds >= 0);
    const html = renderToStaticMarkup(React.createElement(RewardDetail, { reward }));
    assert.match(
      html,
      new RegExp(`data-marketplace-route="/hub/smarter-rewards/${params.rewardId}"`)
    );
    assert.match(html, /data-presentation="reward"/);
    assert.match(html, /Reward Value/);
    assert.match(html, /Reward Signal/);
    assert.match(html, /id="reward-telemetry"/);
    assert.match(html, /href="\/hub\/smarter-rewards"/);
    assert.match(html, /href="\/hub\/diamond-store"/);
  }
  assert.equal(getStaticProps({ params: { rewardId: 'unknown' } }).notFound, true);
});

test('all six linked detail families retain one content layer with wrapping readouts', () => {
  const parsed = postcss.parse(css);
  const hero = parsed.nodes.find(
    (node) => node.selector === '.heroReward,\n.heroMembership,\n.heroRecord'
  );
  const values = Object.fromEntries(hero.nodes.map((node) => [node.prop, node.value]));
  assert.equal(values.border, '0');
  assert.equal(values.background, 'transparent');
  assert.equal(values.overflow, 'visible');
  assert.match(css, /line-height: 1\.2/);
  assert.match(css, /overflow-wrap: anywhere/);
  const readout = parsed.nodes.find((node) => node.selector === '.readoutGrid div');
  const declarations = Object.fromEntries(readout.nodes.map((node) => [node.prop, node.value]));
  assert.equal(declarations.border, '0');
  assert.equal(declarations['border-top'], '1px solid #253b49');
  assert.equal(declarations.background, 'transparent');
  const longest = getStaticPaths()
    .paths.map(({ params }) => getStaticProps({ params }).props.reward)
    .sort((a, b) => b.name.length - a.name.length)[0];
  const html = renderToStaticMarkup(React.createElement(RewardDetail, { reward: longest }));
  assert.match(html, /<h1>[^<]+<\/h1>/);
  assert.match(html, /Economy Rules/);
});

test('every hidden reward detail shows current availability from the maintained verifier coverage', async () => {
  const { VERIFIED_EGG_KEYS } = await import('../src/lib/rewards/eggCoverage.js');
  const verified = new Set(VERIFIED_EGG_KEYS);
  const hidden = getStaticPaths()
    .paths.map(({ params }) => getStaticProps({ params }).props.reward)
    .filter((reward) => reward.kind !== 'Standard Reward');
  assert.equal(new Set(hidden.map((reward) => reward.id)).size, hidden.length);
  let live = 0;
  let future = 0;
  for (const { params } of getStaticPaths().paths) {
    const { reward } = getStaticProps({ params }).props;
    const expected = reward.kind === 'Standard Reward' || verified.has(reward.id);
    assert.equal(reward.available, expected, `${reward.id} retains actual current availability`);
    const html = renderToStaticMarkup(React.createElement(RewardDetail, { reward }));
    if (reward.kind === 'Standard Reward') continue;
    if (expected) {
      live += 1;
      assert.match(html, /How This Signal Unlocks/);
      assert.doesNotMatch(html, /Planned Unlock Signal|Cannot Award Diamonds/);
    } else {
      future += 1;
      assert.match(html, /Coming Soon/);
      assert.match(html, /Planned Unlock Signal/);
      assert.match(html, /Cannot Award Diamonds/);
      assert.doesNotMatch(html, /How This Signal Unlocks|Eligible Actions Are Credited/);
    }
  }
  assert.equal(
    live,
    VERIFIED_EGG_KEYS.length,
    'every live verifier has exactly one catalog detail'
  );
  assert.equal(
    future,
    hidden.length - VERIFIED_EGG_KEYS.length,
    'all remaining hidden rewards are future'
  );
  for (const id of ['the_optimizer', 'gto_machine', 'speed_demon']) {
    assert.equal(getStaticProps({ params: { rewardId: id } }).props.reward.available, false);
  }
  assert.equal(
    getStaticProps({ params: { rewardId: 'daily_login' } }).props.reward.available,
    true
  );
  assert.equal(getStaticProps({ params: { rewardId: 'unknown' } }).notFound, true);
});

test('actual account telemetry distinguishes future rewards from verified global ledger readings', async () => {
  const compiled = await build({
    entryPoints: ['src/components/store/RewardTelemetryConsole.jsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    plugins: [
      {
        name: 'actual-telemetry-availability',
        setup(build) {
          build.onResolve({ filter: /^(react|react\/jsx-runtime)$/ }, (args) => ({
            path: require.resolve(args.path),
            external: true,
          }));
          build.onResolve({ filter: /\.module\.css$/ }, (args) => ({
            path: path.resolve(args.resolveDir, args.path),
            namespace: 'css',
          }));
          build.onLoad({ filter: /.*/, namespace: 'css' }, (args) => {
            const names = [...readFileSync(args.path, 'utf8').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(
              (m) => m[1]
            );
            return {
              contents: `export default ${JSON.stringify(Object.fromEntries(names.map((name) => [name, name])))}`,
            };
          });
          build.onResolve(
            { filter: /next\/link$|authUtils$|AvatarContext$|\/lib\/supabase$/ },
            (args) => ({ path: args.path, namespace: 'availability-fixture' })
          );
          build.onLoad({ filter: /.*/, namespace: 'availability-fixture' }, (args) => ({
            contents: args.path.endsWith('/link')
              ? 'export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}'
              : args.path.endsWith('authUtils')
                ? 'export const getAuthUser=()=>({id:"availability-fixture-player"}); export const ensureAuthReady=async()=>({id:"availability-fixture-player"}); export const authedFetch=async()=>{throw Error("SSR Never Requests A Ledger")};'
                : args.path.endsWith('AvatarContext')
                  ? 'export const useAvatar=()=>({user:{id:"availability-fixture-player"},initializing:false});'
                  : 'export default {};',
            loader: 'jsx',
          }));
        },
      },
    ],
  });
  const actual = { exports: {} };
  let fixtureStatus = 'ready';
  const fixtureRequire = (name) =>
    name === require.resolve('react')
      ? {
          ...React,
          useState: (initial) =>
            React.useState(
              initial?.status === 'loading'
                ? { ...initial, status: fixtureStatus }
                : initial === null
                  ? 'availability-fixture-player'
                  : initial
            ),
        }
      : require(name);
  vm.runInNewContext(compiled.outputFiles[0].text, {
    module: actual,
    exports: actual.exports,
    require: fixtureRequire,
    console,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
  });
  const reward = getStaticProps({ params: { rewardId: 'gto_machine' } }).props.reward;
  const future = renderToStaticMarkup(
    React.createElement(actual.exports.default, {
      reward,
      canonical: '/hub/smarter-rewards/gto_machine',
    })
  );
  assert.match(future, /Coming Soon/);
  assert.match(future, /Cannot Award Diamonds/);
  assert.match(future, /Verified Account Ledger/);
  assert.match(future, /These Account Totals Do Not Verify This Future Reward/);
  assert.match(future, /Selected Future Reward/);
  assert.match(future, /Daily Earning Circuit/);
  assert.doesNotMatch(future, /Selected Reward Signal/);
  assert.doesNotMatch(future, /Live Account Signal|Verified Reward Telemetry/);
  const live = renderToStaticMarkup(
    React.createElement(actual.exports.default, {
      reward: getStaticProps({ params: { rewardId: 'daily_login' } }).props.reward,
      canonical: '/hub/smarter-rewards/daily_login',
    })
  );
  assert.match(live, /Verified Reward Telemetry/);
  assert.doesNotMatch(live, /Coming Soon|Cannot Award Diamonds/);
  fixtureStatus = 'signed-out';
  const signedOut = renderToStaticMarkup(React.createElement(actual.exports.default, {
    reward, canonical: '/hub/smarter-rewards/gto_machine',
  }));
  assert.match(signedOut, /These Readings Do Not Verify This Future Reward/);
  assert.match(signedOut, /Sign In To View My Telemetry/);
});
