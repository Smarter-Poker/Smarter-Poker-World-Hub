/**
 * LAW: the server-rendered page paints without waiting for JavaScript, and
 * the mobile budget never reads "nothing painted yet" as a pass.
 *
 * MOBILE LCP (2026-10-16). Global Footer E2E failed its mobile budget on
 * /hub/personal-assistant (3240/3148/3928ms on a 2500ms budget) and /hub/news
 * (4840/4800/5584ms on 3500ms), run 38847919432, and failed or flaked on other
 * roots in later runs with no change to their source. Three causes, each
 * pinned below:
 *
 * 1. src/providers/ThemeProvider.jsx wrapped the whole application in
 *    <div style={{ visibility: 'hidden' }}> until its mount effect ran, then
 *    returned a Provider instead. Nothing the server sent could paint until
 *    the app had downloaded, parsed and hydrated, and the root element
 *    changing type made React unmount and remount every provider and the page
 *    on every load. Measured locally on the production build of 3155bce, the
 *    Personal Assistant scripts had all arrived by ~300ms and first paint
 *    came at 2158ms.
 * 2. /hub/personal-assistant served its body at opacity 0 (PageTransition's
 *    entrance variant) and held its hero, the largest element, behind a
 *    `mounted` flag, so the hero could only appear after hydration plus one
 *    more render.
 * 3. e2e/mobile-budget.spec.ts created its LCP observer 1.5s after `load` and
 *    skipped the LCP assertion when it read 0. A page that had not painted by
 *    then passed. Against 3155bce ten of the twelve roots measured 0 locally.
 */
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '@babel/parser';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function jsxName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return `${jsxName(node.object)}.${jsxName(node.property)}`;
  return node.type;
}

// Every value the ThemeProvider component itself can return (returns inside
// nested callbacks belong to those callbacks, not to the render).
function providerReturns(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const fn = ast.program.body
    .map((node) => (node.type === 'ExportNamedDeclaration' ? node.declaration : node))
    .find((node) => node?.type === 'FunctionDeclaration' && node.id?.name === 'ThemeProvider');
  assert.ok(fn, 'ThemeProvider is a named function declaration');
  const returns = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node !== fn && /Function|ArrowFunction/.test(node.type)) return;
    if (node.type === 'ReturnStatement') returns.push(node.argument);
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(fn.body);
  return returns;
}

test('the theme provider renders one tree, the same on the server and after mount', () => {
  const source = read('src/providers/ThemeProvider.jsx');
  const returns = providerReturns(source);
  assert.equal(returns.length, 1, 'one render path: a second return swaps the root element and remounts the app');
  const [rendered] = returns;
  const element = rendered?.type === 'JSXElement' ? rendered : rendered?.expression;
  assert.equal(element?.type, 'JSXElement');
  assert.equal(jsxName(element.openingElement.name), 'ThemeContext.Provider');
  assert.doesNotMatch(stripComments(source), /visibility/, 'the application is never hidden while it hydrates');
  // The theme is still applied, and still only after mount.
  assert.match(source, /useEffect\(\(\) => \{\s*setMounted\(true\);/);
  assert.match(source, /if \(mounted\) \{[\s\S]*?root\.style\.setProperty\('--bg', theme\.bg\);[\s\S]*?document\.body\.classList\.toggle\('dark-mode', isDark\);/);
});

test('the personal assistant paints its hero on the first frame', () => {
  const src = stripComments(read('pages/hub/personal-assistant/index.js'));
  assert.match(src, /return \(\n\s*<PageTransition disableInitialAnimation>/, 'the body is not served at opacity 0');
  const hero = src.indexOf('<section className={`${styles.frame} ${styles.hero}`}');
  const gate = src.indexOf('{!mounted ? skeleton : (');
  assert.ok(hero > 0, 'the hero section exists');
  assert.ok(gate > hero, 'the hero renders before, and outside, the post-mount gate');
  const skeleton = src.slice(src.indexOf('const skeleton = ('), src.indexOf('return (\n'));
  assert.doesNotMatch(skeleton, /skelHero/, 'the hero is real content, not a placeholder');
  // The hero still reads only state that starts identical on server and client.
  const heroBlock = src.slice(hero, src.indexOf('</section>', hero));
  assert.doesNotMatch(heroBlock, /\b(stats|recentSessions|dailyHand)\b/, 'no data-dependent value in the server-rendered hero');
});

test('the mobile budget observes LCP from navigation and never passes an unpainted page', () => {
  const spec = read('e2e/mobile-budget.spec.ts');
  assert.match(spec, /await page\.addInitScript\(\(\) => \{[\s\S]*?largest-contentful-paint[\s\S]*?\}\);\s*\n\s*await page\.goto\(route/,
    'the LCP observer exists before the page starts loading');
  assert.match(spec, /supportedEntryTypes\?\.includes\('largest-contentful-paint'\)/, 'unsupported is detected, not assumed');
  assert.match(spec, /await page\.waitForFunction\([\s\S]*?__mobileBudgetLcp[\s\S]*?\{ timeout: 15_000 \}\)/,
    'a late first paint is waited for, bounded, instead of read as zero');
  assert.match(spec, /expect\(metrics\.lcpSupported, [^)]*\)\.toBe\(true\)/);
  assert.match(spec, /expect\(metrics\.lcp, `\$\{route\} never reported a Largest Contentful Paint`\)\.toBeGreaterThan\(0\)/);
  assert.match(spec, /expect\(metrics\.lcp, `\$\{route\} LCP [^`]*`\)\.toBeLessThanOrEqual\(budget\.lcpMs\)/);
  assert.doesNotMatch(spec, /if \(metrics\.lcp > 0\)/, 'the LCP budget is never conditional on something having painted');
});

test('the budgets this law protects are unchanged', () => {
  const routes = JSON.parse(read('scripts/ci/mobile-budget.json')).routes;
  assert.deepEqual(routes['/hub/personal-assistant'], { jsKb: 850, lcpMs: 2500, converted: true });
  assert.deepEqual(routes['/hub/news'], { jsKb: 900, lcpMs: 3500, converted: false });
});

test('the news lead story and its photo are in the server HTML, not behind JavaScript', () => {
  // Live on 29a6a92 the lead photo was LCP at 3.7-4.4s on the 3.5s budget:
  // it waited for hydration, a browser fetch of the source boxes, a
  // client-only NewsBox chunk and an opacity-0 entrance before it could load.
  const src = read('pages/hub/news.js');
  assert.match(src, /export const SOURCE_BOXES_KEY = '\/api\/news\/source-boxes';/);
  assert.match(src, /swrFallback\(originFrom\(req\), SOURCE_BOXES_KEY\)/, 'the source boxes are seeded on the server');
  assert.match(src, /swrFallback\(originFrom\(req\), FIRST_PAGE_KEY\)/, 'the first feed page is still seeded');
  assert.match(src, /useSWR\(SOURCE_BOXES_KEY, fetchNewsJson\)/, 'the hook reads the seeded key, so the fallback is used');
  assert.match(src, /const NewsBox = dynamic\(\(\) => import\('\.\.\/\.\.\/src\/components\/news\/NewsBox'\)\);/, 'NewsBox renders on the server');
  assert.doesNotMatch(stripComments(src), /const NewsBox = dynamic\([^;]*ssr: false/);
  assert.match(src, /initial=\{hasMounted \? \{ opacity: 0, y: 20 \} : false\}/, 'server-seeded top cards are not served at opacity 0');
  // NewsBox keeps the lead photo prioritised and its clock-dependent label
  // client-only, which is what makes it safe to render on a cached server page.
  const box = read('src/components/news/NewsBox.js');
  assert.match(box, /loading=\{priority \? 'eager' : 'lazy'\}/);
  assert.match(box, /fetchpriority=\{priority \? 'high' : 'auto'\}/);
  assert.match(box, /\{hasMounted \? timeAgo\(article\.published_at\) : ''\}/);
  assert.match(src, /priority=\{index === 0\}/);
  // The lead photo is preloaded from the head with the card's own URL logic.
  assert.match(src, /import \{ newsBoxImage \} from '\.\.\/\.\.\/src\/components\/news\/NewsBox';/);
  assert.match(src, /\? newsBoxImage\(topArticles\[0\]\)/);
  assert.match(src, /<link key="news-lead-image" rel="preload" as="image" href=\{leadImageUrl\} imageSrcSet=\{leadImage\.srcSet\} imageSizes=\{leadImage\.sizes\} fetchpriority="high" \/>/,
    'the preload names the same candidates the card chooses from');
  assert.match(box, /const \{ imageUrl, srcSet, sizes, fallbackUrl \} = newsBoxImage\(article\);/, 'the card and the preload share one URL function');
  assert.match(box, /srcSet=\{srcSet\}\s*sizes=\{sizes\}/);
});
