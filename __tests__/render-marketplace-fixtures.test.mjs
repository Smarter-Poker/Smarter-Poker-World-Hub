// The marketplace render harness (scripts/render-marketplace) mocks every
// store endpoint with fixtures. A fixture the repo's own normalizers reject
// renders an error state instead of the page being reviewed, so BEFORE/AFTER
// sheets would silently compare broken screens. This keeps them in contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFixtures, REPO_ROOT } from '../scripts/render-marketplace/validate-fixtures.mjs';
import * as F from '../scripts/render-marketplace/fixtures.mjs';

test('render-marketplace fixtures pass the repo store normalizers', async () => {
    const result = await validateFixtures(REPO_ROOT);
    assert.equal(result.items, F.CLUB_ITEMS.length);
    assert.equal(result.purchases, F.CLUB_PURCHASES.length);
});

test('render-marketplace fixtures expose the mocks the render scripts need', () => {
    assert.equal(typeof F.prep, 'function');
    assert.ok(F.CATALOG.diamondPackages.length > 0);
    assert.ok(F.ORDERS.some((o) => o.id === F.ORDER_ID && o.source === 'merchandise'));
    assert.equal(F.MERCH_CATALOG.data.count, F.MERCH_CATALOG.data.items.length);
});
