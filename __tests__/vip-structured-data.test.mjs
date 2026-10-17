import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { vipStructuredData, VIP_URL, vipGiftTerms, vipMembershipTerms } from '../src/lib/store/vipStructuredData.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
// Execute the actual catalog declaration, not a second hand-written price table.
const catalog = vm.runInNewContext(`(${read('src/data/diamondStoreData.js').match(/export const VIP_MEMBERSHIP = (\{[\s\S]*?\n\});/)[1]})`);
const graph = vipStructuredData(catalog)['@graph'];
const product = (key, gift = false) => graph.find(n => n['@id'] === `${VIP_URL}#${gift ? 'gift' : 'membership'}-${key}`);

test('all six published products use the actual catalog and server checkout prices', () => {
  assert.equal(graph.filter(n => n['@type'] === 'Product').length, 6);
  const server = read('pages/api/store/create-checkout-session.js');
  for (const [plan, cents] of [['monthly', 1999], ['yearly', 19999], ['lifetime', 49900]]) {
    assert.equal(Math.round(catalog[plan].price * 100), cents);
    if (plan === 'lifetime') assert.match(server, /lifetimeUnitAmount !== 49900/);
    else assert.match(server, new RegExp(`${plan}: \\{[\\s\\S]*?unitAmount: ${cents}`));
    for (const gift of [false, true]) {
      const item = product(plan, gift);
      assert.equal(item.offers.price, (cents / 100).toFixed(2));
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
  const changed = structuredClone(catalog); changed.monthly.price = 23.45;
  let items = vipStructuredData(changed)['@graph'].filter(n => n['@type'] === 'Product' && n.name.includes('Monthly'));
  for (const item of items) { assert.equal(item.offers.price, '23.45'); assert.equal(item.additionalProperty.value, 2345); }
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
  const value = vm.runInNewContext(serialize, { storeStructuredData: () => ({ description: '</script><script>alert(1)</script>' }), activeTab: 'vip' });
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
