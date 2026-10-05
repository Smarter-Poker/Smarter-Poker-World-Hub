import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const page = readFileSync(resolve(import.meta.dirname, '..', 'pages/hub/diamond-store.js'), 'utf8');

test('signed-out visitors see an honest read-only Club Shop preview', () => {
  assert.match(page, /const SIGNED_OUT_CLUB_SHOP_PREVIEW/);
  assert.match(page, /function SignedOutClubShopPreview/);
  assert.match(page, /Preview Club Equipment/);
  assert.match(page, /Club Pricing Appears After Sign In/);
  assert.match(page, /committedStoreAccountId \? \([\s\S]*?<SignedOutClubShopPreview \/>/);
});

test('the preview uses reviewed product art and never exposes purchase controls', () => {
  const start = page.indexOf('function SignedOutClubShopPreview');
  const end = page.indexOf('function MerchStoreLoadingText', start);
  const preview = page.slice(start, end);
  assert.match(preview, /resolveClubShopProductArt\(item\)/);
  assert.match(page, /const ALL_THROWABLES_NAME = 'All Throwables Pack \(10\)'/);
  assert.match(page, /name: ALL_THROWABLES_NAME/);
  assert.match(preview, /href="\/auth\/login\?redirect=%2Fhub%2Fclub-shop"/);
  assert.doesNotMatch(preview, /handleClubPurchase|openClubPurchaseReview|handleClubCardPurchase/);
});
