import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

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

const source = page;
const start = source.indexOf('    async (silent = false) => {', source.indexOf('const loadClubShop = useCallback('));
const end = source.indexOf('\n    },\n    [clubShopClubId', start);
const loader = source.slice(start, end) + '\n    }';

async function runLoader(status, { silent = false, superseded = false, timedOut = false } = {}) {
  const state = { errors: [], loaded: [], access: [], toasts: [] };
  const requestRef = { current: 0 };
  let deadline;
  const scope = {
    AbortController, Error, Number, console: { warn() {} },
    setTimeout: callback => { deadline = callback; return 1; }, clearTimeout() {},
    clubShopLoadingRef: { current: false },
    clubShopLoadRequestRef: requestRef,
    clubShopLoadTimerRef: { current: null },
    clubShopClubId: 'club-a', routeClubId: 'club-a', committedStoreAccountId: 'account-a',
    CLUB_SHOP_LOAD_TIMEOUT_MS: 12000,
    setClubShopLoadedAccountId() {}, setClubShopLoading() {},
    setClubShopError: value => state.errors.push(value),
    setClubShopLoaded: value => state.loaded.push(value),
    setClubShopAccessRefused: value => state.access.push(value),
    showStoreToast: (...args) => state.toasts.push(args),
    getVerifiedCheckoutAuthorization: async () => ({ accessToken: 'local-fixture' }),
    fetch: async () => {
      if (superseded) requestRef.current += 1;
      if (timedOut) deadline();
      return { status, ok: status === 200 };
    },
  };
  await vm.runInNewContext(`(${loader})`, scope)(silent);
  return { state, scope };
}

test('403 renders membership refusal and own-shop action without a failure toast', async () => {
  const { state } = await runLoader(403);
  assert.equal(state.access.at(-1), true);
  assert.match(state.errors.at(-1), /Club Membership Required/);
  assert.equal(state.loaded.at(-1), true);
  assert.deepEqual(state.toasts, []);
  assert.match(source, /clubShopAccessRefused \? \([\s\S]*?<Link href="\/hub\/club-shop"[\s\S]*?Open My Club Shop/);
});

test('a failed initial or silent refresh has a terminal inline error, never a duplicate toast', async () => {
  for (const silent of [false, true]) {
    const { state, scope } = await runLoader(500, { silent });
    assert.match(state.errors.at(-1), /Could Not Be Loaded/);
    assert.equal(state.loaded.at(-1), true);
    assert.equal(scope.clubShopLoadingRef.current, false);
    assert.deepEqual(state.toasts, []);
  }
});

test('superseded responses cannot publish a refusal for another account or club', async () => {
  const { state } = await runLoader(403, { superseded: true });
  assert.equal(state.access.includes(true), false);
  assert.deepEqual(state.errors, [null]);
  assert.deepEqual(state.loaded, []);
});

test('failed auto-loads stop and unavailable balances are never projected as zero', () => {
  const autoload = source.slice(source.indexOf('// ═══ Club Shop: Auto-load'), source.indexOf('// ═══ Club Shop: Real-time'));
  assert.match(autoload, /!clubShopError/);
  assert.match(autoload, /clubShopError,/);
  assert.match(source, /\[clubDiamondBalance, setClubDiamondBalance\] = useState\(null\)/);
  assert.match(source, /visibleClubDiamondBalance =\s*clubShopSnapshotOwned && clubShopClubId \? clubDiamondBalance : null/);
  assert.match(source, /Loading Balance\.\.\./);
  assert.match(source, /Balance Unavailable/);
  assert.doesNotMatch(source, /setClubDiamondBalance\(0\)/);
});

test('a silent refresh deadline publishes an inline error and rejects its late response', async () => {
  const { state } = await runLoader(403, { silent: true, timedOut: true });
  assert.match(state.errors.at(-1), /Timed Out/);
  assert.equal(state.access.includes(true), false);
  assert.equal(state.loaded.at(-1), true);
  assert.deepEqual(state.toasts, []);
});
