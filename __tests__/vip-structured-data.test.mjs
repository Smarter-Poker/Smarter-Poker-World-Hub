import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { vipStructuredData, vipProductStructuredData, vipProductContent, vipProductPath, vipProductPageProps, VIP_URL, vipGiftTerms, vipMembershipTerms } from '../src/lib/store/vipStructuredData.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
// Execute the actual catalog declaration, not a second hand-written price table.
const catalog = vm.runInNewContext(`(${read('src/data/diamondStoreData.js').match(/export const VIP_MEMBERSHIP = (\{[\s\S]*?\n\});/)[1]})`);
const graph = vipStructuredData(catalog)['@graph'];
const product = (key, gift = false) => graph.find(n => n['@id'] === `${VIP_URL}#${gift ? 'gift' : 'membership'}-${key}`);

test('all six published products use the actual catalog and server checkout prices', () => {
  assert.equal(graph.filter(n => n['@type'] === 'Product').length, 6);
  const server = read('pages/api/store/create-checkout-session.js');
  for (const [plan, cents] of [['monthly', 2000], ['yearly', 20000], ['lifetime', 50000]]) {
    assert.equal(Math.round(catalog[plan].price * 100), cents);
    if (plan === 'lifetime') assert.match(server, /lifetimeUnitAmount !== 50000/);
    else assert.match(server, new RegExp(`${plan}: \\{[\\s\\S]*?unitAmount: ${cents}`));
    for (const gift of [false, true]) {
      const item = product(plan, gift);
      assert.equal(item.offers.price, String(cents / 100));
      assert.equal(item.offers.priceSpecification.price, item.offers.price);
      assert.equal(item.offers.priceCurrency, 'USD');
      assert.equal(item.additionalProperty.value, cents);
      assert.equal(item.additionalProperty.unitText, 'Smarter.Poker Diamonds');
    }
  }
});
test('only self monthly/yearly Card prices recur, gifts and Lifetime are one-time', () => {
  for (const [plan, unit] of [['monthly', 'MON'], ['yearly', 'ANN']]) {
    const price = product(plan).offers.priceSpecification;
    assert.equal(price['@type'], 'UnitPriceSpecification');
    assert.equal(price.referenceQuantity.unitCode, unit);
    assert.equal(price.referenceQuantity.value, 1);
    assert.match(product(plan).description, /Renews Every .*Cancel Anytime/);
  }
  for (const plan of ['monthly', 'yearly', 'lifetime']) {
    const item = product(plan, true);
    assert.equal(item.offers.priceSpecification['@type'], 'PriceSpecification');
    assert.equal(item.offers.priceSpecification.referenceQuantity, undefined);
    assert.match(item.description, /Accepted Friends/);
    assert.match(item.description, /Starts On Redemption/);
    assert.equal(item.description.includes(vipGiftTerms(plan)), true);
  }
  assert.equal(product('lifetime').offers.priceSpecification['@type'], 'PriceSpecification');
  assert.match(product('lifetime').description, /No Expiry Or Renewal/);
  assert.match(product('monthly', true).description, /30 Days/);
  assert.match(product('yearly', true).description, /365 Days/);
  assert.match(read('supabase/migrations/20261017003200_vip_gift_redemption_binding.sql'), /THEN 30 ELSE 365/);
});
test('stable canonical graph references resolve and catalogs contain the six Card offers', () => {
  const ids = [];
  const refs = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value['@id']) (value['@type'] ? ids : refs).push(value['@id']);
    for (const item of Object.values(value)) if (Array.isArray(item)) item.forEach(visit); else visit(item);
  }
  visit(vipStructuredData(catalog));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(refs.every(id => ids.includes(id)), true);
  const catalogs = graph.filter(n => n['@type'] === 'OfferCatalog');
  assert.deepEqual(catalogs.map(n => n.numberOfItems), [3, 3]);
  assert.equal(graph.find(n => n['@type'] === 'CollectionPage').url, VIP_URL);
});
test('price edits flow through both card and diamond amounts; invalid and disabled offers are omitted', () => {
  const changed = structuredClone(catalog); changed.monthly.price = 24;
  let items = vipStructuredData(changed)['@graph'].filter(n => n['@type'] === 'Product' && n.name.includes('Monthly'));
  for (const item of items) { assert.equal(item.offers.price, '24'); assert.equal(item.additionalProperty.value, 2400); }
  changed.monthly.cardCheckoutReady = false;
  items = vipStructuredData(changed)['@graph'].filter(n => n['@type'] === 'Product' && n.name.includes('Monthly'));
  assert.equal(items.every(n => !n.offers), true);
  changed.monthly.price = NaN;
  assert.equal(vipStructuredData(changed)['@graph'].filter(n => n['@type'] === 'Product').length, 4);
});
test('no invented currency, ratings, shipping, expiry dates or checkout-session identities', () => {
  const json = JSON.stringify(graph);
  for (const key of ['aggregateRating', 'review', 'shippingDetails', 'priceValidUntil', 'validThrough', 'payment_intent', 'recipientId']) assert.equal(json.includes(`"${key}"`), false);
  const currencies = [...json.matchAll(/"priceCurrency":"([^"]+)"/g)].map(m => m[1]);
  assert.equal(currencies.every(c => c === 'USD'), true);
});
test('server page owns the graph, escapes script text, and public terms are not behind sign-in', () => {
  const store = read('pages/hub/diamond-store.js');
  assert.match(store, /activeTab === 'vip'\) return vipStructuredData\(VIP_MEMBERSHIP\)/);
  const serialize = store.split('\n').find(line => line.includes('__html: JSON.stringify(storeStructuredData')).split('__html: ')[1].split(' }}')[0];
  const value = vm.runInNewContext(serialize, { storeStructuredData: () => ({ description: '</script><script>alert(1)</script>' }), activeTab: 'vip', vipProduct: null });
  assert.equal(value.includes('<'), false);
  assert.equal(JSON.parse(value).description, '</script><script>alert(1)</script>');
  const gifts = read('src/components/store/VipGifts.jsx');
  assert.ok(gifts.indexOf('VIP Gift Card Prices And Terms') < gifts.indexOf('{!accountId ?'));
  assert.match(gifts, /vipGiftTerms\(key\)/);
  assert.match(store, /vipMembershipTerms\('monthly'\)/);
  for (const key of Object.keys(catalog)) assert.ok(vipMembershipTerms(key).length > 20);
});
test('regressions execute in marketplace build checks and are included in Vercel source', () => {
  assert.ok(JSON.parse(read('package.json')).scripts['test:marketplace'].includes('__tests__/vip-structured-data.test.mjs'));
  assert.ok(read('.vercelignore').includes('!/__tests__/vip-structured-data.test.mjs'));
});

test('Google merchant listings receive Brand objects and online-only availability for every option', () => {
  // Google Rich Results Test 2026-10-16: Organization was valid Schema.org but
  // produced "Invalid object type for field brand" in merchant listings.
  for (const item of graph.filter(node => node['@type'] === 'Product')) {
    assert.equal(item.brand['@type'], 'Brand', item.name);
    assert.equal(item.brand.name, 'Smarter.Poker');
    assert.equal(item.offers.availability, 'https://schema.org/OnlineOnly');
    assert.equal(item.offers.seller['@id'], 'https://smarter.poker/#organization');
  }
});


test('six strict product routes each publish exactly one canonical Product and one priced Offer', () => {
  const seen = new Set();
  for (const gift of [false, true]) for (const plan of Object.keys(catalog)) {
    const path = vipProductPath(plan, gift);
    assert.equal(seen.has(path), false); seen.add(path);
    const graph = vipProductStructuredData(catalog, plan, gift)['@graph'];
    assert.equal(graph.filter(n => n['@type'] === 'Product').length, 1);
    assert.equal(graph.some(n => n['@type'] === 'OfferCatalog'), false);
    const item = graph.find(n => n['@type'] === 'Product');
    const page = graph.find(n => n['@type'] === 'WebPage');
    assert.equal(item.url, `https://smarter.poker${path}`);
    assert.equal(page.url, item.url);
    assert.equal(page.mainEntity['@id'], item['@id']);
    assert.equal(item.offers.url, item.url);
    assert.equal(item.offers.price, String(catalog[plan].price));
    assert.equal(item.additionalProperty.value, Math.round(catalog[plan].price * 100));
    assert.equal(item.description.includes(gift ? vipGiftTerms(plan) : vipMembershipTerms(plan)), true);
    const result = vipProductPageProps({ params: { plan }, res: { setHeader() {} }, query: { plan: 'vip-lifetime' } }, gift);
    assert.deepEqual(result.props.vipProduct, { plan, gift });
    for (const file of ['pages/sitemap.xml.js', 'src/lib/seo/sitemapBuilders.mjs']) assert.ok(read(file).includes(`path: '${path}'`));
  }
  for (const plan of ['daily', 'toString', '__proto__', '', undefined, ['monthly']]) {
    assert.deepEqual(vipProductPageProps({ params: { plan }, res: { setHeader() {} } }), { notFound: true });
  }
});

test('single-product UI binds the term, retains direct payment handlers and safe gift recovery', () => {
  const store = read('pages/hub/diamond-store.js');
  assert.match(store, /activeTab !== 'vip' \|\| vipProduct/);
  assert.match(store, /useState\(vipProduct \? `vip-\$\{vipProduct.plan\}`/);
  assert.match(store, /onClick=\{handleVIPSubscribe\}/);
  assert.match(store, /openVipDiamondReview\(selectedVIPPlan/);
  assert.match(store, /productPlan=\{vipProduct\?\.plan\}/);
  const gifts = read('src/components/store/VipGifts.jsx');
  assert.match(gifts, /productPlan && saved.plan !== productPlan/);
  assert.match(gifts, /productPlan && gift.plan !== productPlan/);
  assert.match(gifts, /productPlan && plan !== productPlan/);
  assert.match(gifts, /disabled=\{busy \|\| !!pending \|\| !!productPlan\}/);
  for (const file of ['pages/hub/vip-membership/[plan].js', 'pages/hub/vip-membership/gift/[plan].js']) {
    assert.match(read(file), /vipProductPageProps\(context, (true|false)\)/);
    assert.match(read(file), /key=\{`\$\{props.vipProduct.gift\}:\$\{props.vipProduct.plan\}`\}/);
  }
});


test('VIP legal copy reflects gift returns instead of the generic all-final policy', () => {
  const store = read('pages/hub/diamond-store.js');
  assert.match(store, /activeTab === 'vip'[\s\S]*?Unredeemed VIP Gift Cards Can Be Returned To The Sender Through Gift History/);
});

test('organic search copy distinguishes all six offers while preserving authoritative terms', () => {
  const titles = new Set(), descriptions = new Set(), intros = new Set();
  for (const gift of [false, true]) for (const plan of Object.keys(catalog)) {
    const copy = vipProductContent(catalog, plan, gift);
    titles.add(copy.title); descriptions.add(copy.description); intros.add(copy.intro);
    assert.ok(copy.title.length < 70);
    assert.ok(copy.description.length < 200);
    assert.ok(copy.description.includes(`$${String(catalog[plan].price)}`));
    assert.ok(copy.description.includes(Math.round(catalog[plan].price * 100).toLocaleString('en-US')));
    assert.equal(copy.terms, gift ? vipGiftTerms(plan) : vipMembershipTerms(plan));
    assert.equal(copy.faqs[0].a, copy.terms);
    assert.equal(copy.faqs.length, 3);
    const nodes = vipProductStructuredData(catalog, plan, gift)['@graph'];
    const page = nodes.find(n => n['@type'] === 'WebPage');
    assert.equal(page.name, copy.title);
    assert.equal(page.description, copy.description);
    assert.equal(nodes.find(n => n['@type'] === 'Product').description, product(plan, gift).description);
    if (gift) assert.match(copy.description, /Accepted Friend/);
  }
  assert.equal(titles.size, 6); assert.equal(descriptions.size, 6); assert.equal(intros.size, 6);
  const changed = structuredClone(catalog); changed.monthly.price = 24;
  for (const gift of [false, true]) {
    const copy = vipProductContent(changed, 'monthly', gift);
    assert.ok(copy.description.includes('$24'));
    assert.ok(copy.description.includes('2,400'));
    assert.equal(copy.description.includes('$19.99'), false);
  }
  assert.equal(vipProductContent(catalog, 'daily'), null);
});

test('related offer links cover the other five canonical pages without overriding selected checkout', () => {
  for (const gift of [false, true]) for (const plan of Object.keys(catalog)) {
    const current = vipProductPath(plan, gift);
    const links = vipProductContent(catalog, plan, gift).relatedLinks;
    assert.equal(links.length, 5);
    assert.equal(new Set(links.map(link => link.href)).size, 5);
    for (const link of links) {
      assert.notEqual(link.href, current);
      assert.match(link.href, /^\/hub\/vip-membership\/(gift\/)?(monthly|yearly|lifetime)$/);
      assert.match(link.label, /VIP (Membership|Gift Card)$/);
    }
  }
  const store = read('pages/hub/diamond-store.js');
  assert.match(store, /vipProductCopy\.heading/);
  assert.match(store, /vipProductCopy\.intro/);
  assert.match(store, /vipProductCopy\.faqs/);
  assert.match(store, /vipProductCopy\.relatedLinks\.map/);
  assert.match(store, /href="\/hub\/training"/);
  assert.match(store, /href="\/hub\/club-arena\/"/);
});
