import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const catalog = read('src/data/diamondStoreData.js');
const store = read('pages/hub/diamond-store.js');
const compare = read('pages/hub/vip-membership/compare.js');
const lifetimeStart = catalog.indexOf('export const VIP_LIFETIME_BENEFITS');
const lifetimeEnd = catalog.indexOf('export function getVipBenefitsForPlan', lifetimeStart);
const lifetimeBenefits = catalog.slice(lifetimeStart, lifetimeEnd);

function catalogObjectForTitle(title) {
  const titleAt = catalog.indexOf(`title: '${title}'`);
  assert.ok(titleAt > 0, `${title} must remain in the benefit catalog`);
  const start = catalog.lastIndexOf('{', titleAt);
  const end = catalog.indexOf('},', titleAt);
  assert.ok(start > -1 && end > titleAt, `${title} must have a bounded catalog object`);
  return catalog.slice(start, end + 2);
}

test('Lifetime VIP receives its own defined digital benefit set', () => {
  assert.ok(lifetimeStart > 0);
  assert.ok(lifetimeEnd > lifetimeStart);
  for (const copy of [
    'Unlimited Rabbit Hunts With Lifetime VIP',
    'Unlimited Standard Time Bank Activations',
    'Unlimited Throwables With Lifetime VIP',
    'Every Cataloged Table Skin And Background Included',
    'Every Cataloged Card Back And Dealer Button Included',
    'Lifetime Emoji Packs And Player Tags Included',
  ]) {
    assert.match(lifetimeBenefits, new RegExp(copy));
  }
  assert.match(lifetimeBenefits, /Two-Per-Street Anti-Stall Limit Still Applies/);
});

test('finite allowances and the current stipend remain ordinary-plan benefits', () => {
  for (const title of [
    '500 Bonus Diamonds Credited Every Month',
    '100 Free Rabbit Hunts Every Month',
    '120 Extra Time Bank Seconds Every Month',
    '500 Free Throwables Every Month',
  ]) {
    assert.match(catalogObjectForTitle(title), /plans: \['month', 'year'\]/);
  }
  assert.match(catalog, /benefit\.plans\.includes\(normalized\)/);
  assert.match(
    catalog,
    /normalized === 'lifetime' \? \[\.\.\.common, \.\.\.VIP_LIFETIME_BENEFITS\] : common/
  );
});

test('Lifetime benefit copy cannot imply excluded financial or physical products are free', () => {
  assert.doesNotMatch(lifetimeBenefits, /Diamond Packages|Physical Merchandise|Tournament Buy-In/);
  assert.doesNotMatch(lifetimeBenefits, /Club Creation|Transferable/);
  assert.doesNotMatch(lifetimeBenefits, /2,000|2000|90 Days/);
  assert.doesNotMatch(lifetimeBenefits, /\u2014/);
  assert.doesNotMatch(lifetimeBenefits, /icon:\s*['"][◆♦✓]['"]|[◆♦]/);
});

test('Lifetime copy is title cased and keeps ordinary eligibility distinct from free value', () => {
  const fields = [...lifetimeBenefits.matchAll(/(?:title|description|value): '([^']+)'/g)].map(
    (match) => match[1]
  );
  assert.ok(fields.length > 0);
  for (const field of fields) {
    for (const word of field.split(/\s+/)) {
      const firstLetter = word.match(/[A-Za-z]/)?.[0];
      if (firstLetter) assert.equal(firstLetter, firstLetter.toUpperCase(), field);
    }
  }
  assert.match(catalog, /The Tournament Buy-In Still Applies Normally/);
  assert.match(catalog, /plans: \['month', 'year'\]/);
  assert.match(catalog, /Stack Display In Big Blinds, Free Every Session/);
  assert.doesNotMatch(lifetimeBenefits, /Stack Display|Offline Protection|Automatic Time Bank/);
});

test('the selected storefront plan controls the rendered benefit contract', () => {
  assert.match(
    store,
    /const displayedVipBenefits = getVipBenefitsForPlan\(selectedVIPPlan\?\.interval\)/
  );
  assert.match(store, /Everything Included With \{lifetimeSelected \? 'Lifetime VIP' : 'VIP'\}/);
  assert.equal((store.match(/displayedVipBenefits/g) || []).length, 3);
  assert.doesNotMatch(store, /VIP_BENEFITS\.filter/);
  assert.match(store, /Monthly And Yearly VIP Carry Three Honest Monthly Ceilings/);
  assert.match(store, /Lifetime VIP Makes Those Three Digital Gameplay Benefits Unlimited/);
  assert.match(store, /No More Than Two Per Street/);
});

test('the comparison subpage uses plan-specific counts and names Lifetime extras', () => {
  assert.match(compare, /const benefits = getVipBenefitsForPlan\(plan\.interval\)/);
  assert.match(compare, /\? 'Permanent Full VIP Access'/);
  assert.doesNotMatch(compare, /Permanent Of Full VIP Access/);
  assert.match(compare, /Includes All \{benefits\.length\} Included Benefits For This Plan/);
  assert.match(compare, /Unlimited Throwables, Rabbit Hunts, And Standard Time Banks/);
  assert.match(
    compare,
    /Every Cataloged Digital Table Skin, Background, Card Back, And Dealer Button\s+Included/
  );
  assert.match(compare, /Every VIP Avatar, Frame, Aura, And Safe Digital Feature Pack Included/);
});

test('the Vercel build upload retains the imported Lifetime contract', () => {
  const ignore = read('.vercelignore');
  assert.match(ignore, /!\/__tests__\/marketplace-phase-8-lifetime-entitlements\.test\.mjs/);
});
