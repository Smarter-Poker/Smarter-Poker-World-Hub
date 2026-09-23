/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CLUB SHOP MANAGE TOOLS: what the retired Club Arena Manage tab could do
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  /marketplace now hands every web visit to these pages, so whatever the old
 *  storefront's Manage tab could do, this one has to do. Three things it could
 *  and this one could not:
 *
 *    1. edit an offer in place, including the fields where BLANK IS A VALUE
 *       (unlimited stock, no sale, no per-member cap, no availability bound)
 *       and the two datetime-local fields that carry no offset;
 *    2. refuse a hard delete of a sold item and say to hide it instead, because
 *       club_shop_purchases.item_id is ON DELETE CASCADE;
 *    3. list the purchases behind the totals, so an operator can see who bought
 *       what and refund the right person.
 *
 *  Deterministic by construction: the payload cases fix the timezone before
 *  they convert a wall-clock, and the ledger cases render one state from props.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  buildClubShopItemUpdatePayload,
  clubShopEditableCategories,
  clubShopItemDeleteGuard,
  clubShopOperatorRequestId,
  createClubShopItemDraft,
  isoToLocalInput,
  localInputToIso,
  validateClubShopItemDraft,
} from '../src/lib/store/clubShopItemDraft.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const CLUB_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const CARD_LIMIT = 250000;

function timeBankItem(overrides = {}) {
  return {
    id: ITEM_ID,
    club_id: CLUB_ID,
    name: 'Ten Second Top Up',
    description: 'Buys One Extra Decision',
    price: 500,
    category: 'Time Banks',
    item_type: 'time_bank',
    image_url: 'https://cdn.example.com/time-bank.png',
    grant_spec: { type: 'time_bank', qty: 3 },
    is_active: true,
    stock: 12,
    sale_price: 400,
    per_user_limit: 2,
    available_from: null,
    available_until: null,
    sort_order: 4,
    purchase_count: 0,
    ...overrides,
  };
}

/** The same draft the editor would hold, with named fields overridden. */
const draftFor = (item, overrides = {}) => ({ ...createClubShopItemDraft(item), ...overrides });

const has = (options, key) => Object.prototype.hasOwnProperty.call(options, key);

const built = (item, overrides = {}, options = {}) =>
  buildClubShopItemUpdatePayload({
    clubId: has(options, 'clubId') ? options.clubId : CLUB_ID,
    item,
    draft: draftFor(item, overrides),
    maximumCardFundedPrice: has(options, 'maximumCardFundedPrice')
      ? options.maximumCardFundedPrice
      : CARD_LIMIT,
  });

// ───────────────────────────────────────────────────────────────────────────
// 1. The update payload
// ───────────────────────────────────────────────────────────────────────────

test('the editor seeds from the stored row and sends every field the old tab could change', () => {
  const result = built(timeBankItem());
  assert.equal(result.error, undefined);
  assert.deepEqual(result.payload, {
    action: 'update',
    clubId: CLUB_ID,
    itemId: ITEM_ID,
    name: 'Ten Second Top Up',
    price: 500,
    description: 'Buys One Extra Decision',
    category: 'Time Banks',
    imageUrl: 'https://cdn.example.com/time-bank.png',
    stock: 12,
    salePrice: 400,
    perUserLimit: 2,
    availableFrom: null,
    availableUntil: null,
    sortOrder: 4,
    grantQty: 3,
  });
});

test('blank stock, sale price and per-member limit travel as an explicit null, never as an omission', () => {
  const result = built(timeBankItem(), { stock: '', salePrice: '', perUserLimit: '' });
  assert.equal(result.error, undefined);
  // Present-and-null is what clears the column. Omitting the key is what made a
  // promo write-once: the route reads `undefined` as leave alone.
  for (const key of ['stock', 'salePrice', 'perUserLimit']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(result.payload, key),
      `${key} must be present so blank can clear it`
    );
    assert.equal(result.payload[key], null);
  }
});

test('a blank sort order is sent as 0, the storefront default, not as a cleared column', () => {
  const result = built(timeBankItem(), { sortOrder: '' });
  assert.equal(result.error, undefined);
  assert.equal(result.payload.sortOrder, 0);
});

test('a zero stock is a sold-out drop, not an unlimited one', () => {
  const result = built(timeBankItem(), { stock: '0' });
  assert.equal(result.error, undefined);
  assert.equal(result.payload.stock, 0);
});

test('an availability window is read as local wall-clock and sent as a real instant', () => {
  const previousTimeZone = process.env.TZ;
  try {
    // Fixed offset, so the assertion does not depend on where this runs.
    process.env.TZ = 'Australia/Brisbane'; // UTC+10, no daylight saving
    const result = built(timeBankItem(), {
      availableFrom: '2026-08-20T18:00',
      availableUntil: '2026-08-21T18:30',
    });
    assert.equal(result.error, undefined);
    // The admin meant 18:00 where they are. Sent raw, the server read it as
    // 18:00 UTC and the offer opened at 04:00 the next morning for them.
    assert.equal(result.payload.availableFrom, '2026-08-20T08:00:00.000Z');
    assert.equal(result.payload.availableUntil, '2026-08-21T08:30:00.000Z');
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test('a blank availability bound clears it, and an unreadable one is refused rather than invented', () => {
  assert.equal(localInputToIso(''), null);
  assert.equal(localInputToIso('   '), null);
  assert.equal(localInputToIso(null), null);
  assert.equal(localInputToIso('not-a-date'), null);
  assert.equal(built(timeBankItem(), { availableUntil: '' }).payload.availableUntil, null);
  assert.match(
    built(timeBankItem(), { availableUntil: 'soon' }).error,
    /Available Until Must Be A Real Date And Time/
  );
});

test('a stored instant round-trips back into the local control it came from', () => {
  const previousTimeZone = process.env.TZ;
  try {
    process.env.TZ = 'Australia/Brisbane';
    assert.equal(isoToLocalInput('2026-08-20T08:00:00.000Z'), '2026-08-20T18:00');
    assert.equal(localInputToIso(isoToLocalInput('2026-08-20T08:00:00.000Z')), '2026-08-20T08:00:00.000Z');
    assert.equal(isoToLocalInput(null), '');
    assert.equal(isoToLocalInput('nonsense'), '');
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test('an availability window that ends before it opens is refused', () => {
  const result = built(timeBankItem(), {
    availableFrom: '2026-08-21T18:00',
    availableUntil: '2026-08-20T18:00',
  });
  assert.match(result.error, /Available Until Must Be After Available From/);
});

test('the payload carries no computed price and no authority claim', () => {
  const result = built(timeBankItem());
  const keys = Object.keys(result.payload);
  for (const forbidden of [
    'effectivePrice',
    'expectedPrice',
    'listPrice',
    'isActive',
    'role',
    'userId',
    'buyerId',
    'revenue',
    'purchaseCount',
  ]) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must never leave the browser`);
  }
});

test('a sale price above the list price is refused before a request is spent on it', () => {
  const result = built(timeBankItem(), { price: '300', salePrice: '400' });
  assert.match(result.error, /Sale Price Cannot Exceed The Price \(300\)/);
});

test('the Card-funded price ceiling the create control enforces also binds an edit', () => {
  assert.match(
    built(timeBankItem(), { price: String(CARD_LIMIT + 1) }).error,
    /Price Cannot Exceed 250,000 Diamonds/
  );
  assert.equal(built(timeBankItem(), { price: String(CARD_LIMIT) }).error, undefined);
  // An unknown ceiling pauses saving rather than guessing one.
  assert.match(
    built(timeBankItem(), {}, { maximumCardFundedPrice: null }).error,
    /Current Card Price Limit Is Unavailable/
  );
});

test('an empty name, a non-positive price and an out-of-range grant quantity are each refused', () => {
  assert.match(built(timeBankItem(), { name: '   ' }).error, /Item Name Required/);
  assert.match(built(timeBankItem(), { price: '0' }).error, /Price Must Be A Whole Number/);
  assert.match(built(timeBankItem(), { price: '' }).error, /Price Is Required/);
  assert.match(built(timeBankItem(), { grantQty: '0' }).error, /Uses Delivered/);
  assert.match(built(timeBankItem(), { grantQty: '1001' }).error, /Uses Delivered/);
});

test('a row belonging to another club can never be edited against the club on screen', () => {
  const foreign = timeBankItem({ club_id: '33333333-3333-4333-8333-333333333333' });
  assert.match(built(foreign).error, /Reload The Current Club/);
  assert.match(built(timeBankItem(), {}, { clubId: null }).error, /Reload Before Saving/);
});

test('the grant travels with the category, and only where the grant has one to carry', () => {
  // Time Banks count uses, so a quantity travels and no reference does.
  const timeBank = built(timeBankItem()).payload;
  assert.equal(timeBank.grantQty, 3);
  assert.ok(!Object.prototype.hasOwnProperty.call(timeBank, 'grantRef'));

  // A legacy unlock row carries a reference and no quantity.
  const legacy = timeBankItem({
    category: 'Avatars',
    item_type: 'avatar',
    grant_spec: { type: 'avatar', avatar_id: 'dealer-07' },
  });
  const built_ = built(legacy).payload;
  assert.equal(built_.category, 'Avatars');
  assert.equal(built_.grantRef, 'dealer-07');
  assert.ok(!Object.prototype.hasOwnProperty.call(built_, 'grantQty'));
});

test('an unrecognised category is preserved in the picker rather than silently rewritten', () => {
  assert.deepEqual(clubShopEditableCategories('Time Banks'), ['Time Banks']);
  assert.deepEqual(clubShopEditableCategories('Avatars'), ['Avatars', 'Time Banks']);
  assert.deepEqual(clubShopEditableCategories(''), ['Time Banks']);
  // And a save of that row keeps the category it arrived with.
  const legacy = timeBankItem({ category: 'Exclusive', grant_spec: { type: 'none' } });
  assert.equal(built(legacy).payload.category, 'Exclusive');
});

test('an optional text field that is blanked is cleared, not sent as an empty string', () => {
  const result = built(timeBankItem(), { description: '  ', imageUrl: '' });
  assert.equal(result.payload.description, null);
  assert.equal(result.payload.imageUrl, null);
});

test('each save carries its own durable request key, so a later edit cannot replay an earlier one', () => {
  const first = clubShopOperatorRequestId();
  const second = clubShopOperatorRequestId();
  assert.notEqual(first, second);
  for (const key of [first, second]) {
    // manage-shop refuses a key under eight characters.
    assert.ok(key.length >= 8, `${key} is too short for X-Idempotency-Key`);
    assert.match(key, /^club-shop-update-/);
  }
});

test('validation reports the first problem rather than throwing on a missing draft field', () => {
  assert.match(validateClubShopItemDraft({}, { maximumCardFundedPrice: CARD_LIMIT }).error, /Item Name Required/);
  assert.equal(
    validateClubShopItemDraft(draftFor(timeBankItem()), { maximumCardFundedPrice: CARD_LIMIT }).error,
    undefined
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Delete versus hide
// ───────────────────────────────────────────────────────────────────────────

test('an item with sales can only be hidden, and the refusal says so', () => {
  const sold = clubShopItemDeleteGuard(timeBankItem({ purchase_count: 1 }));
  assert.equal(sold.canDelete, false);
  assert.match(sold.reason, /Hide It Instead/);
  assert.match(sold.reason, /Purchase History/);
});

test('a refunded sale still blocks a delete, because the ledger row still exists', () => {
  // The server counts every club_shop_purchases row for the item, refunded
  // included, so a client guard reading NET sales would offer a delete the
  // server refuses.
  const refundedAway = timeBankItem({
    purchase_count: 3,
    refunded_purchase_count: 3,
    net_purchase_count: 0,
  });
  assert.equal(clubShopItemDeleteGuard(refundedAway).canDelete, false);
});

test('an unsold item is still deletable', () => {
  const fresh = clubShopItemDeleteGuard(timeBankItem({ purchase_count: 0 }));
  assert.equal(fresh.canDelete, true);
  assert.equal(fresh.reason, null);
});

test('a row with no counts yet is treated as unsold rather than crashing', () => {
  assert.equal(clubShopItemDeleteGuard(undefined).canDelete, true);
  assert.equal(clubShopItemDeleteGuard({}).canDelete, true);
});

// ───────────────────────────────────────────────────────────────────────────
// 3. The ledger's rendering states
// ───────────────────────────────────────────────────────────────────────────

function compileComponent(path, resolve) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    fileName: 'component.jsx',
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports);
  return module.exports;
}

const ledgerModule = compileComponent('src/components/store/ClubShopPurchaseLedger.jsx', (name) => {
  if (name.endsWith('.module.css')) return {};
  if (name.endsWith('/marketplaceCopy')) return { marketplaceCopy: (value) => String(value ?? '') };
  if (name.endsWith('/boundedCommerceFetch')) return { boundedCommerceFetch: async () => ({}) };
  if (name.endsWith('/checkoutAuthorization')) {
    return { getVerifiedCheckoutAuthorization: async () => null };
  }
  if (name.endsWith('/authUtils')) return { getAuthUser: () => null };
  if (name.endsWith('./StoreToast')) return { showStoreToast: () => {} };
  return require(name);
});

const LedgerView = ledgerModule.ClubShopPurchaseLedgerView;

const renderLedger = (props) => renderToStaticMarkup(React.createElement(LedgerView, props));

const ledgerRow = (overrides = {}) => ({
  id: '44444444-4444-4444-8444-444444444444',
  itemName: 'Ten Second Top Up',
  buyerName: 'River Quinn',
  pricePaid: 1500,
  currency: 'diamonds',
  createdAt: '2026-08-20T08:00:00.000Z',
  status: 'owned',
  refundable: true,
  ...overrides,
});

test('the ledger says it is loading before it has anything to show', () => {
  const html = renderLedger({ loading: true, rows: [] });
  assert.match(html, /Loading Purchases/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /No Purchases Yet/);
});

test('a failed load says so, offers a retry, and never presents itself as an empty ledger', () => {
  const html = renderLedger({
    rows: [],
    loaded: true,
    error: 'The Purchase Ledger Failed (503).',
  });
  assert.match(html, /role="alert"/);
  assert.match(html, /The Purchase Ledger Failed \(503\)\./);
  assert.match(html, /Retry Ledger/);
  assert.doesNotMatch(html, /No Purchases Yet/);
  assert.doesNotMatch(html, /No Purchases Match That Search/);
});

test('a retry in flight is announced rather than silently repeated', () => {
  const html = renderLedger({ rows: [], loaded: true, loading: true, error: 'Network Refused.' });
  assert.match(html, /Retrying\.\.\./);
  assert.match(html, /disabled=""/);
});

test('an error over rows that are already listed keeps the rows', () => {
  const html = renderLedger({
    rows: [ledgerRow()],
    loaded: true,
    total: 1,
    error: 'The Purchase Ledger Failed (503).',
  });
  assert.match(html, /role="alert"/);
  assert.match(html, /River Quinn/);
});

test('an empty club and an empty search read differently', () => {
  const empty = renderLedger({ rows: [], loaded: true });
  assert.match(empty, /No Purchases Yet\./);

  const searched = renderLedger({ rows: [], loaded: true, query: 'zeta', appliedQuery: 'zeta' });
  assert.match(searched, /No Purchases Match That Search\./);
  assert.doesNotMatch(searched, /No Purchases Yet\./);
});

test('nothing is claimed before the first load has settled', () => {
  const html = renderLedger({ rows: [], loaded: false });
  assert.doesNotMatch(html, /No Purchases Yet/);
  assert.doesNotMatch(html, /No Purchases Match That Search/);
  assert.doesNotMatch(html, /Loading Purchases/);
});

test('a listed purchase names the member, the item, what was paid and when', () => {
  const html = renderLedger({ rows: [ledgerRow()], total: 1, loaded: true });
  assert.match(html, /River Quinn/);
  assert.match(html, /Ten Second Top Up/);
  assert.match(html, /1,500 Diamonds/);
  // The instant, not a relative phrase that changes between runs.
  assert.match(html, /datetime="2026-08-20T08:00:00\.000Z"/i);
  assert.match(html, /Owned/);
});

test('a legacy chip purchase is not relabelled as Diamonds', () => {
  const html = renderLedger({
    rows: [ledgerRow({ currency: 'chips', pricePaid: 250 })],
    total: 1,
    loaded: true,
  });
  assert.match(html, /250 Chips/);
  assert.doesNotMatch(html, /250 Diamonds/);
});

test('a redeemed or already refunded purchase offers no refund control and says why', () => {
  for (const [status, label, reason] of [
    ['redeemed', 'Redeemed', /Already Used/],
    ['refunded', 'Refunded', /Already Refunded/],
    ['not_delivered', 'Not Delivered', /No Delivered Copy To Revoke/],
  ]) {
    const html = renderLedger({
      rows: [ledgerRow({ status, refundable: false })],
      total: 1,
      loaded: true,
    });
    assert.match(html, new RegExp(label));
    assert.match(html, /Refund Unavailable/);
    assert.match(html, reason);
    assert.doesNotMatch(html, />Refund</);
  }
});

test('a refundable purchase offers exactly one refund control, named for its row', () => {
  const html = renderLedger({ rows: [ledgerRow()], total: 1, loaded: true });
  assert.match(html, /aria-label="Refund Ten Second Top Up For River Quinn"/);
  assert.match(html, />Refund</);
});

test('a refund in flight locks every refund control and marks only the one it is running', () => {
  const rows = [ledgerRow(), ledgerRow({ id: 'second-row', buyerName: 'Ada Vale' })];
  const html = renderLedger({
    rows,
    total: 2,
    loaded: true,
    refundingId: rows[0].id,
  });
  assert.match(html, /Refunding\.\.\./);
  assert.equal((html.match(/Refunding\.\.\./g) || []).length, 1);
  assert.equal((html.match(/aria-busy="true"/g) || []).length, 1);
  // No second refund may start beside it: BOTH controls are locked.
  const lockedRefunds = html.match(/disabled="" aria-busy="(?:true|false)" aria-label="Refund /g);
  assert.equal((lockedRefunds || []).length, 2);
});

test('the pager reports the real window and is held while the search box is ahead of the rows', () => {
  const rows = Array.from({ length: 25 }, (_, index) =>
    ledgerRow({ id: `row-${index}`, buyerName: `Member ${index}` })
  );
  const listed = renderLedger({ rows, total: 60, offset: 25, loaded: true });
  assert.match(listed, /26 To 50 Of 60/);

  const midSearch = renderLedger({
    rows,
    total: 60,
    offset: 25,
    loaded: true,
    searching: true,
  });
  // Previous and Next both refuse to page into a list that is about to change.
  assert.ok((midSearch.match(/disabled=""/g) || []).length >= 2);
});

test('the ledger panel is a named region and its table is a real table', () => {
  const html = renderLedger({ rows: [ledgerRow()], total: 1, loaded: true });
  assert.match(html, /role="region" aria-label="Club Shop Purchase Ledger"/);
  assert.match(html, /<th scope="col"[^>]*>Member<\/th>/);
  assert.match(html, /<caption/);
});

// ───────────────────────────────────────────────────────────────────────────
// 4. The page wiring: the guards this panel is only safe behind
// ───────────────────────────────────────────────────────────────────────────

const page = read('pages/hub/diamond-store.js');
const editor = read('src/components/store/ClubShopItemEditor.jsx');
const ledgerSource = read('src/components/store/ClubShopPurchaseLedger.jsx');

test('the operator panel renders only inside the Manage view, and only for an operator', () => {
  const manageBlock = page.slice(page.indexOf("clubShopSubTab === 'manage' && clubShopIsAdmin"));
  for (const component of [
    '<ClubShopSalesAnalytics',
    '<ClubShopPurchaseLedger',
    '<ClubShopItemEditor',
  ]) {
    assert.ok(manageBlock.includes(component), `${component} must render inside the Manage view`);
    // And nowhere else on the page.
    assert.equal((page.match(new RegExp(component, 'g')) || []).length, 1);
  }
  // Each one is handed the page's own account and club identity, never its own.
  assert.match(
    page,
    /<ClubShopSalesAnalytics\s+accountId=\{committedStoreAccountId\}\s+clubId=\{clubShopClubId\}\s+snapshotOwned=\{clubShopSnapshotOwned\}/
  );
  assert.match(
    page,
    /<ClubShopPurchaseLedger\s+accountId=\{committedStoreAccountId\}\s+clubId=\{clubShopClubId\}\s+snapshotOwned=\{clubShopSnapshotOwned\}/
  );
});

test('an in-place save goes through the same account and club binding the other operator actions use', () => {
  const handler = page.slice(
    page.indexOf('const handleClubShopAdminAction'),
    page.indexOf('const clubShopIsAdmin =')
  );
  assert.match(handler, /clubShopSnapshotOwned/);
  assert.match(handler, /\['owner', 'admin'\]\.includes\(visibleClubShopRole\)/);
  assert.match(handler, /item\.club_id !== expectedClubId/);
  assert.match(handler, /routeClubId && expectedClubId !== routeClubId/);
  assert.match(handler, /clubShopPurchaseOwnerRef\.current\.accountId !== expectedAccountId/);
  assert.match(handler, /clubShopPurchaseOwnerRef\.current\.clubId !== expectedClubId/);
  assert.match(handler, /getAuthUser\(\)\?\.id !== expectedAccountId/);
  assert.match(handler, /clubShopAdminActionAttemptRef\.current === actionAttemptId/);
  // The update re-verifies the session itself before it writes.
  assert.match(handler, /getVerifiedCheckoutAuthorization\(expectedAccountId\)/);
  // A save may not be pinned to a row the editor is not editing.
  assert.match(handler, /fields\.itemId !== item\.id/);
});

test('the in-place save posts the only route that accepts the ported fields, with a durable key', () => {
  const handler = page.slice(
    page.indexOf('const handleClubShopAdminAction'),
    page.indexOf('const clubShopIsAdmin =')
  );
  assert.match(handler, /'\/api\/club-arena\/manage-shop'/);
  assert.match(handler, /'\/api\/club-arena\/shop-items'/);
  assert.match(handler, /'X-Idempotency-Key': clubShopOperatorRequestId\(\)/);
  // The ids the server checks are the page's, never whatever the form supplied.
  assert.match(handler, /\.\.\.fields, action: 'update', clubId: item\.club_id, itemId: item\.id/);
});

test('the open editor and the pending delete never survive a club or account change', () => {
  assert.ok(
    (page.match(/setClubShopEditingItemId\(null\)/g) || []).length >= 3,
    'the editor must be closed by every identity reset that closes the delete dialog'
  );
});

test('a sold item cannot be walked into the delete dialog from the row either', () => {
  assert.match(page, /!clubShopItemDeleteGuard\(item\)\.canDelete/);
  assert.match(page, /clubShopItemDeleteGuard\(item\)\.reason \|\|\s*'Delete This Item'/);
  const handler = page.slice(
    page.indexOf('const handleClubShopAdminAction'),
    page.indexOf('const clubShopIsAdmin =')
  );
  assert.match(handler, /const deleteGuard = clubShopItemDeleteGuard\(item\)/);
  assert.match(handler, /if \(!deleteGuard\.canDelete\)/);
});

test('the create, hide, activate and delete controls the Manage view already had are untouched', () => {
  assert.match(page, /action: 'create',[\s\S]{0,400}grantType: 'time_bank'/);
  assert.match(page, /handleClubShopAdminAction\('toggle', item\)/);
  assert.match(page, /handleClubShopAdminAction\('delete', clubShopDeleteTarget\)/);
  assert.match(page, /Items With Purchase History Cannot Be Deleted\. Hide This Item Instead\./);
  assert.match(page, /Report Is Partial:/);
  assert.match(page, /Club Shop Sales Are 100% Platform-Owned Diamond Burns\./);
});

test('a historical throwable receipt row stays read only, and the platform pack keeps its label', () => {
  // Only a non-throwable row, or the one canonical pack, is offered an editor.
  assert.match(
    page,
    /\(!isThrowableAdminItem\(item\) \|\|\s*isCanonicalAllThrowablesAdminItem\(item\)\) && \(/
  );
  assert.match(page, /\? 'Platform Managed'\s*:\s*'Historical Receipt Row'/s);
  const handler = page.slice(
    page.indexOf('const handleClubShopAdminAction'),
    page.indexOf('const clubShopIsAdmin =')
  );
  assert.match(handler, /Historical Throwable Rows Are Preserved For Receipts And Cannot Be Edited/);
  assert.match(handler, /if \(isThrowableAdminItem\(item\)\) \{/);
  assert.match(handler, /Throwable Offers Are Platform Managed And Cannot Be Hidden Or Deleted/);
});

test('the refund names both the club and the purchase in its durable key', () => {
  assert.match(ledgerSource, /'X-Idempotency-Key': `refund:\$\{expectedClubId\}:\$\{row\.id\}`/);
  assert.match(ledgerSource, /'\/api\/club-arena\/refund-purchase'/);
  assert.match(ledgerSource, /`\/api\/club-arena\/shop-purchases\?clubId=/);
});

test('the ledger re-verifies the session on both sides of a refund and abandons a superseded one', () => {
  assert.match(ledgerSource, /const confirmed = await getVerifiedCheckoutAuthorization/);
  assert.match(ledgerSource, /refundAttemptRef\.current === attemptId/);
  assert.match(ledgerSource, /loadAttemptRef\.current === attemptId/);
  assert.match(ledgerSource, /activeOwnerRef\.current\.clubId === expectedClubId/);
  assert.match(ledgerSource, /getAuthUser\(\)\?\.id === expectedAccountId/);
  assert.match(ledgerSource, /controller\.signal\.aborted/);
});

test('no operator surface carries an em dash or an emoji', () => {
  for (const [label, source] of [
    ['the editor', editor],
    ['the ledger', ledgerSource],
    ['the draft rules', read('src/lib/store/clubShopItemDraft.mjs')],
  ]) {
    assert.doesNotMatch(source, /[—–]/, `${label} must not use an em dash`);
    assert.doesNotMatch(
      source,
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u,
      `${label} must not use an emoji`
    );
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 5. The editor renders every ported control
// ───────────────────────────────────────────────────────────────────────────

const draftModule = await import('../src/lib/store/clubShopItemDraft.mjs');

const editorModule = compileComponent('src/components/store/ClubShopItemEditor.jsx', (name) => {
  if (name.endsWith('.module.css')) return {};
  if (name.endsWith('/marketplaceCopy')) return { marketplaceCopy: (value) => String(value ?? '') };
  if (name.endsWith('clubShopItemDraft.mjs')) return draftModule;
  return require(name);
});

const renderEditor = (props) =>
  renderToStaticMarkup(React.createElement(editorModule.default, props));

test('the editor offers every field the retired Manage tab could change', () => {
  const html = renderEditor({
    item: timeBankItem(),
    clubId: CLUB_ID,
    maximumCardFundedPrice: CARD_LIMIT,
  });
  for (const label of [
    'Item Name',
    'Price In Diamonds',
    'Item Description',
    'Item Category',
    'Item Image URL',
    'Uses Delivered Per Purchase',
    'Stock Quantity, Blank For Unlimited',
    'Sale Price, Blank To End The Sale',
    'Maximum Purchases Per Member, Blank For No Cap',
    'Available From',
    'Available Until',
    'Storefront Sort Order',
  ]) {
    assert.match(html, new RegExp(`aria-label="${label}"`), `${label} must be editable`);
  }
  assert.match(html, /type="datetime-local"/);
  assert.match(html, /Save Changes To Ten Second Top Up/);
  assert.match(html, /Cancel Editing Ten Second Top Up/);
  // Seeded from the stored row, not from an empty form.
  assert.match(html, /value="Ten Second Top Up"/);
  assert.match(html, /Current Card-Compatible Price Limit: 250,000 Diamonds\./);
});

test('the editor pauses saving while the Card price limit is unknown, and says why', () => {
  const html = renderEditor({
    item: timeBankItem(),
    clubId: CLUB_ID,
    maximumCardFundedPrice: null,
  });
  assert.match(html, /Current Card Price Limit Is Unavailable\. Saving Is Paused Until It Returns\./);
  assert.match(html, /disabled=""/);
});

test('a save already in flight is announced and cannot be submitted twice', () => {
  const html = renderEditor({
    item: timeBankItem(),
    clubId: CLUB_ID,
    maximumCardFundedPrice: CARD_LIMIT,
    busy: true,
  });
  assert.match(html, /Saving\.\.\./);
  assert.match(html, /aria-busy="true"/);
  // Every control, including Cancel, is locked while the request is open.
  assert.ok((html.match(/disabled=""/g) || []).length >= 12);
});

// ───────────────────────────────────────────────────────────────────────────
// 6. The windowed sales report
// ───────────────────────────────────────────────────────────────────────────

const analyticsModule = compileComponent(
  'src/components/store/ClubShopSalesAnalytics.jsx',
  (name) => {
    if (name.endsWith('.module.css')) return {};
    if (name.endsWith('/marketplaceCopy')) {
      return { marketplaceCopy: (value) => String(value ?? '') };
    }
    if (name.endsWith('/boundedCommerceFetch')) return { boundedCommerceFetch: async () => ({}) };
    if (name.endsWith('/checkoutAuthorization')) {
      return { getVerifiedCheckoutAuthorization: async () => null };
    }
    if (name.endsWith('/authUtils')) return { getAuthUser: () => null };
    return require(name);
  }
);

const AnalyticsView = analyticsModule.ClubShopSalesAnalyticsView;
const renderAnalytics = (props) =>
  renderToStaticMarkup(React.createElement(AnalyticsView, props));

const analyticsReport = (overrides = {}) => ({
  days: 30,
  totals: {
    grossSales: 4,
    netSales: 3,
    grossRevenue: 4000,
    refundedAmount: 1000,
    netRevenue: 3000,
    uniqueBuyers: 2,
    averageSale: 1000,
  },
  series: [
    { date: '2026-08-19', sales: 1, revenue: 1000, netSales: 1, netRevenue: 1000 },
    { date: '2026-08-20', sales: 3, revenue: 3000, netSales: 2, netRevenue: 2000 },
  ],
  topItems: [{ itemId: ITEM_ID, name: 'Ten Second Top Up', netSales: 3, netRevenue: 3000 }],
  topBuyers: [{ userId: 'buyer-1', name: 'River Quinn', netPurchases: 2, netSpent: 2000 }],
  ...overrides,
});

test('the sales report says it is loading before it has a window to show', () => {
  const html = renderAnalytics({ loading: true, data: null });
  assert.match(html, /Loading Sales/);
  assert.match(html, /role="status"/);
});

test('a failed sales window says so and offers a retry instead of reporting zero', () => {
  const html = renderAnalytics({ data: null, error: 'The Sales Report Failed (500).' });
  assert.match(html, /role="alert"/);
  assert.match(html, /The Sales Report Failed \(500\)\./);
  assert.match(html, /Retry Sales/);
  assert.doesNotMatch(html, /No Sales In The Last/);
});

test('a window with no sales reads as empty rather than broken', () => {
  const html = renderAnalytics({
    data: analyticsReport({
      totals: {
        grossSales: 0,
        netSales: 0,
        grossRevenue: 0,
        refundedAmount: 0,
        netRevenue: 0,
        uniqueBuyers: 0,
        averageSale: 0,
      },
      topItems: [],
      topBuyers: [],
    }),
  });
  assert.match(html, /No Sales In The Last 30 Days/);
  assert.doesNotMatch(html, /role="alert"/);
});

test('the report shows the server totals, names refunds beside gross, and draws every day', () => {
  const html = renderAnalytics({ data: analyticsReport() });
  assert.match(html, /Net Diamonds Burned/);
  assert.match(html, /3,000/);
  assert.match(html, /Gross 4,000 Less 1,000 Refunded\./);
  assert.match(html, /aria-label="Daily Diamond Burns Over 30 Days"/);
  assert.equal((html.match(/role="listitem"/g) || []).length, 2);
  assert.match(html, /Ten Second Top Up/);
  assert.match(html, /River Quinn/);
});

test('a partial window is declared rather than presented as the whole truth', () => {
  const html = renderAnalytics({ data: analyticsReport({ truncated: true }) });
  assert.match(html, /This Report Is Partial\./);
});

test('the range control is a real toggle group and states which range is showing', () => {
  const html = renderAnalytics({ days: 7, data: analyticsReport({ days: 7 }) });
  assert.match(html, /role="group" aria-label="Sales Date Range"/);
  assert.match(html, /aria-pressed="true"[^>]*>7 Days/);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 2);
});

test('the sales report never writes, and is bound to the account and club on screen', () => {
  const analytics = read('src/components/store/ClubShopSalesAnalytics.jsx');
  assert.doesNotMatch(analytics, /method:\s*'POST'/);
  assert.doesNotMatch(analytics, /refund-purchase|manage-shop|shop-items/);
  assert.match(analytics, /`\/api\/club-arena\/shop-analytics\?clubId=/);
  assert.match(analytics, /getVerifiedCheckoutAuthorization\(expectedAccountId/);
  assert.match(analytics, /activeOwnerRef\.current\.clubId === expectedClubId/);
  assert.match(analytics, /getAuthUser\(\)\?\.id === expectedAccountId/);
  assert.doesNotMatch(analytics, /[—–]/);
});
