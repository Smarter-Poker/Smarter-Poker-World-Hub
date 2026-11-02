import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roundSalePriceUsd, formatStoreUsd } from '../src/lib/store/wholeDollarPrice.mjs';
import { normalizeDiamondPackageRows } from '../src/lib/store/diamondPackageCatalog.mjs';
test('sale rounding always rounds up and whole prices have no decimal point',()=>{
 for(const [input,expected] of [[0,0],[1,1],[19.99,20],[20,20],[20.01,21],[199.99,200],[499.99,500]]) {
  assert.equal(roundSalePriceUsd(input),expected);
  assert.equal(formatStoreUsd(expected).includes('.'),false);
 }
 for(const input of [NaN,Infinity,-1]) assert.throws(()=>roundSalePriceUsd(input));
 assert.equal(formatStoreUsd(19.99),'19 And 99 Cents','historical receipts preserve their original amount');
});
test('Diamond display and checkout resolve the same rounded catalog cents',()=>{
 const catalog=normalizeDiamondPackageRows([{package_key:'example',diamonds:1000,price_usd:'9.99'}]);
 assert.equal(catalog.example.price,10);assert.equal(catalog.example.priceCents,1000);
});
test('current storefront sale price renderers share the decimal-free formatter',()=>{
 for(const path of ['src/components/diamond-store/SmarterStoreShowcase.jsx','pages/hub/diamond-store.js','src/components/store/StoreCards.js','src/components/store/MerchStore.jsx','src/components/store/ShoppingCart.jsx','src/components/store/VipGifts.jsx','src/components/store/MarketplaceDetailExperience.jsx']) {
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(source,/formatStoreUsd/);
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''),/\$19\.99|\$199\.99|\$499/);
 }
});

test('Stripe recurring validation preserves old subscriptions and admits the new exact offers', async()=>{
 const { default: vm } = await import('node:vm');
 const source=readFileSync(new URL('../pages/api/store/webhooks/stripe.js',import.meta.url),'utf8');
 const contract=source.match(/const VIP_PLAN_CONTRACT = Object.freeze\([\s\S]*?\n\}\);/)[0];
 const body=source.slice(source.indexOf('function validateVipOffer('),source.indexOf('function syntheticLegacySubscriptionIdentity('));
 const validate=vm.runInNewContext(`${contract}\n${body}\nvalidateVipOffer`);
 for(const [tier,interval,amounts] of [['monthly','month',[1999,2000]],['yearly','year',[19999,20000]]]) {
  const subscription=amount=>({items:{data:[{quantity:1,price:{type:'recurring',currency:'usd',billing_scheme:'per_unit',unit_amount:amount,recurring:{interval,interval_count:1,usage_type:'licensed'}}}]}});
  for(const amount of amounts) assert.equal(validate(subscription(amount),tier),amount/100);
  assert.throws(()=>validate(subscription(amounts[1]+1),tier));
 }
});

test('Lifetime disputes resolve the original paid charge from the durable receipt', async()=>{
 const { default: vm } = await import('node:vm');
 const source=readFileSync(new URL('../pages/api/store/webhooks/stripe.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('async function lifetimePurchaseChargeAmount('),source.indexOf('async function handleDispute('));
 for(const dollars of [499,500,1,null]) {
  const getSupabase=()=>({from(table){assert.equal(table,'vip_lifetime_purchases');return this;},select(){return this;},eq(key,id){assert.equal(key,'id');assert.equal(id,'receipt');return this;},async maybeSingle(){return {data:{price_usd:dollars},error:null};}});
  const resolve=vm.runInNewContext(`${body}\nlifetimePurchaseChargeAmount`,{getSupabase});
  if(dollars===499||dollars===500) assert.equal(await resolve('receipt'),dollars*100);
  else await assert.rejects(resolve('receipt'));
 }
});
