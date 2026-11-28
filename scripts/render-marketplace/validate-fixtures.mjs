// Validates the render fixtures against the repo's own normalizers (no server).
// Usage: node scripts/render-marketplace/validate-fixtures.mjs [repoDir ...]
// With no argument it checks the repo this file lives in. Pass extra repo dirs
// (for example a worktree of origin/main) to check the fixtures fit those too.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as F from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

const load = (repo, rel) => import(pathToFileURL(path.join(repo, rel)).href);

/** Throws (AssertionError) on the first fixture that a normalizer rejects. */
export async function validateFixtures(repo = REPO_ROOT) {
  const C = await load(repo, 'src/lib/store/clubCardCheckout.mjs');
  const d = F.marketplaceItems('owner');
  const items = C.normalizeVerifiedClubShopItems(d.items, d.balance);
  const rejected = items ? [] : d.items.filter((i) => !C.normalizeVerifiedClubShopItem(i, d.balance)).map((i) => i.name);
  assert.ok(items, `club shop items rejected by normalizeVerifiedClubShopItems: ${rejected.join(', ') || '(whole list)'}`);
  assert.equal(items.length, F.CLUB_ITEMS.length, 'every club shop item survives normalization');
  assert.ok(C.normalizeVerifiedClubShopPurchases(d.purchases), 'club shop purchases');
  assert.ok(C.normalizeVerifiedClubShopContext(d.clubId, 'owner'), 'club context (owner)');
  assert.ok(C.normalizeVerifiedClubShopContext(d.clubId, 'player'), 'club context (player)');
  assert.equal(C.normalizeVerifiedClubShopAccountId(d.accountId, F.USER_ID), F.USER_ID, 'account id');
  assert.equal(items.filter((i) => i.on_sale).length, 1, 'exactly one sale item');
  for (const i of items) if (i.card_checkout_available) assert.ok(C.normalizeClubCardQuote(i.card_quote), `card quote for ${i.name}`);

  const V = await load(repo, 'src/lib/store/verifiedCheckoutUrl.mjs');
  assert.ok(
    V.merchandiseDiamondOfferConfirmation(F.USER_ID, [{ id: 'hoodie-neural', variantId: 'hoodie-neural-s', quantity: 1, unitDiamonds: 6000 }]),
    'merchandise diamond offer confirmation',
  );

  const payload = JSON.parse(Buffer.from(F.ACCESS_TOKEN.split('.')[1], 'base64url'));
  assert.equal(payload.sub, F.USER_ID, 'access token subject');
  assert.ok(payload.exp > Date.now() / 1000, 'access token not expired');

  return { repo, items: items.length, purchases: d.purchases.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repos = process.argv.slice(2).map((r) => path.resolve(r));
  let failed = false;
  for (const repo of repos.length ? repos : [REPO_ROOT]) {
    try {
      const r = await validateFixtures(repo);
      console.log(`OK ${r.repo}: ${r.items} club items, ${r.purchases} purchases`);
    } catch (e) {
      failed = true;
      console.error(`FAIL ${repo}: ${e.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
