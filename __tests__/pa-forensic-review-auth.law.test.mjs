/**
 * PERSONAL ASSISTANT · Forensic Anti-Regression Laws (Review My Play, Landing, SEO Summary & Auth Chain)
 *
 * Permanently locks root-cause fixes for:
 * 1. Review My Play revision draft key pinning (`draftSourceRevRef` / `draftOwnerUserIdRef`) & cross-user isolation
 * 2. Review My Play delete `<dialog>` guard, captured owner/token, account-switch & unmount keepalive flush,
 *    failure restoration + re-selection, and `saved-hand-deleted` `sourceHandId` broadcast
 * 3. Review My Play `AbortError` `||` guard, `TAB_ID` BroadcastChannel self-echo suppression, `handleLoadMore` catch,
 *    `401` signed-out transition, `handleAnalyzeHand` fail-closed gate + receipt guard, and `unreviewedCount` sync
 * 4. Review My Play Street-By-Street Replayer Bomb Pot / AI-Scan pot math, straddle detection & Run-It-Twice multi-board
 * 5. Personal Assistant Landing Page account-switch state reset & zero `/hub/training` links in `HubPageSummary`
 * 6. Auth `?hand=<uuid>` redirect chain preservation & open-redirect rejection across `/auth/mfa`, `/auth/callback`,
 *    and `/hub/verify-phone`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isSafeRelativePath } from '../src/lib/clubInvite.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);

const REVIEW_PAGE = 'pages/hub/personal-assistant/review.js';
const LANDING_PAGE = 'pages/hub/personal-assistant/index.js';
const HUB_SUMMARY = 'src/components/seo/HubPageSummary.js';
const SITEMAP_PAGE = 'pages/sitemap.xml.js';
const MFA_PAGE = 'pages/auth/mfa.js';
const CALLBACK_PAGE = 'pages/auth/callback.js';
const VERIFY_PHONE_PAGE = 'pages/hub/verify-phone.js';

const DEEP_HAND_URL = '/hub/personal-assistant/review?hand=11111111-2222-4333-8444-555555555555';

function extractFunctionBlock(src, fnHeader) {
  const start = src.indexOf(fnHeader);
  assert.ok(start >= 0, `expected ${fnHeader} to exist`);
  let depth = 0;
  let started = false;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) {
        return src.slice(start, i + 1);
      }
    }
  }
  throw new Error(`unterminated function block for ${fnHeader}`);
}

test('LAW 1: Review My Play pins sessionStorage drafts to owner/hand/sourceRev and resets state synchronously on account switch', () => {
  const src = read(REVIEW_PAGE);

  // Refs tracking draft ownership & source revision exist
  assert.match(src, /const draftOwnerUserIdRef = useRef\(null\);/);
  assert.match(src, /const draftHandIdRef = useRef\(''\);/);
  assert.match(src, /const draftSourceRevRef = useRef\(1\);/);
  assert.match(src, /const draftBaselineRef = useRef\(\{ notes: '', status: 'saved', tags: \[\] \}\);/);

  // Account-switch reset effect must appear BEFORE the draft persistence effect
  const accountSwitchIdx = src.indexOf('if (prevUserIdRef.current === currentUserId) return;');
  const draftPersistIdx = src.indexOf('const draftOwner = draftOwnerUserIdRef.current;');
  assert.ok(accountSwitchIdx > 0, 'account-switch reset effect exists');
  assert.ok(draftPersistIdx > accountSwitchIdx, 'account-switch reset runs BEFORE draft persistence effect');

  const switchBlock = src.slice(accountSwitchIdx, draftPersistIdx);
  for (const resetCall of [
    'draftOwnerUserIdRef.current = null;',
    'draftHandIdRef.current = \'\';',
    'setHands([]);',
    'setSelectedHandId(\'\');',
    'setDraftNotes(\'\');',
    'setDraftStatus(\'saved\');',
    'setDraftTags([]);',
    'setSuggestedHands([]);',
    'setTotalCount(null);',
    'setUnreviewedCount(null);',
  ]) {
    assert.ok(switchBlock.includes(resetCall), `account-switch reset includes ${resetCall}`);
  }

  // Draft persistence effect MUST key by (draftOwner, draftHandId, draftSourceRev), NEVER selectedHand.review.revision
  const persistEnd = src.indexOf('}, [selectedHand, user?.id, draftNotes, draftStatus, draftTags]);', draftPersistIdx);
  assert.ok(persistEnd > draftPersistIdx, 'draft persistence effect terminates cleanly');
  const persistBlock = src.slice(draftPersistIdx, persistEnd);
  assert.match(persistBlock, /draftOwner !== user\.id/);
  assert.match(persistBlock, /String\(draftHandId\) !== String\(selectedHand\.id\)/);
  assert.match(persistBlock, /writeDraftToSession\(draftOwner, draftHandId, draftSourceRev,/);
  assert.match(persistBlock, /clearDraftFromSession\(draftOwner, draftHandId, draftSourceRev\)/);
  assert.doesNotMatch(persistBlock, /getReviewMeta\(selectedHand\)/, 'draft persistence must never key off mutable selectedHand revision N+1');
});

test('LAW 2: Review My Play delete captures immutable owner/token, flushes keepalive on switch/unmount, restores on failure, guards showModal, and broadcasts sourceHandId', () => {
  const src = read(REVIEW_PAGE);

  // Immutable capture on startUndoableDelete
  assert.match(src, /ownerUserId,/);
  assert.match(src, /ownerToken:\s*capturedToken,/);
  assert.match(src, /sourceHandId,/);
  assert.match(src, /const capturedToken = getAccessToken\(\) \|\| null;/);

  // commitServerDelete uses captured ownerUserId & ownerToken and supports keepalive flush
  const commitBlock = src.slice(
    src.indexOf('const commitServerDelete = useCallback'),
    src.indexOf('const startUndoableDelete = useCallback'),
  );
  assert.match(commitBlock, /const ownerUserId = snapshot\?\.ownerUserId;/);
  assert.match(commitBlock, /let token = snapshot\.ownerToken \|\| null;/);
  assert.match(commitBlock, /keepalive:\s*true/);
  assert.match(commitBlock, /if \(keepalive \|\| activeUserIdRef\.current !== ownerUserId\) return;/);
  assert.match(commitBlock, /if \(!selectedHandIdRef\.current\)\s*\{\s*setSelectedHandId\(hand\.id\);\s*syncEditorFromHand\(hand\);\s*\}/);
  assert.match(commitBlock, /setLoadError\(errorMessage\);/);
  assert.match(commitBlock, /type:\s*'saved-hand-deleted',\s*savedRowId:\s*hand\.id,\s*sourceHandId,\s*tabId:\s*TAB_ID/);

  // Account switch & unmount flush pending delete with keepalive: true
  const flushMatches = src.match(/commitServerDeleteRef\.current\([^,]+,\s*\{\s*keepalive:\s*true\s*\}\)/g) || [];
  assert.ok(flushMatches.length >= 2, 'both account-switch effect and unmount cleanup flush pending delete with keepalive: true');

  // handleUndoDelete refuses cross-user undo
  assert.match(src, /if \(!snapshot \|\| snapshot\.ownerUserId !== activeUserIdRef\.current\) return;/);

  // dialog.showModal guarded by dialog.isConnected && !dialog.open inside try/catch
  const openBlock = src.slice(
    src.indexOf('const handleOpenDeleteDialog = useCallback'),
    src.indexOf('const handleDeleteDialogClose = useCallback'),
  );
  assert.match(openBlock, /!dialog\.isConnected \|\| dialog\.open/);
  assert.match(openBlock, /try\s*\{\s*dialog\.showModal\(\);\s*\}\s*catch/);
  assert.match(openBlock, /setDeleteDialogHand\(null\);/);
});

test('LAW 3: Review My Play fixes AbortError || guard, TAB_ID self-echo suppression, handleLoadMore catch, 401 signed-out recovery, analysis gate fail-closed, and unreviewedCount sync', () => {
  const src = read(REVIEW_PAGE);

  // Zero buggy `controller.signal.aborted && activeUserIdRef.current !== expectedUserId`
  assert.doesNotMatch(
    src,
    /controller\.signal\.aborted\s*&&\s*activeUserIdRef\.current\s*!==\s*expectedUserId/,
    'AbortError catch guards MUST use || instead of &&',
  );
  const orGuards = src.match(/if \(controller\.signal\.aborted \|\| activeUserIdRef\.current !== expectedUserId\) return;/g) || [];
  assert.ok(orGuards.length >= 8, `expected >= 8 strict abort/user guards, found ${orGuards.length}`);

  // TAB_ID self-echo suppression
  assert.match(src, /const TAB_ID =/);
  assert.match(src, /channel\.postMessage\(\{\s*\.\.\.payload,\s*tabId:\s*TAB_ID,\s*at:\s*Date\.now\(\)\s*\}\)/);
  assert.match(src, /if \(!msg \|\| msg\.tabId === TAB_ID\) return;/);

  // handleLoadMore has catch + 401 + !res.ok error handling
  const loadMoreBlock = src.slice(
    src.indexOf('const handleLoadMore = useCallback'),
    src.indexOf('// Synchronously flush pending deletes'),
  );
  assert.match(loadMoreBlock, /if \(res\.status === 401\)/);
  assert.match(loadMoreBlock, /setLoadStatus\('signed_out'\)/);
  assert.match(loadMoreBlock, /catch \(err\)/);
  assert.match(loadMoreBlock, /setLoadError\(/);

  // loadSavedHands transitions to signed_out on 401
  const loadHandsBlock = src.slice(
    src.indexOf('const loadSavedHands = useCallback'),
    src.indexOf('const handleLoadMore = useCallback'),
  );
  assert.match(loadHandsBlock, /if \(listRes\.status === 401 \|\| directRes\?\.status === 401\)/);
  assert.match(loadHandsBlock, /setLoadStatus\('signed_out'\)/);

  // handleAnalyzeHand fails closed on non-423 !gateRes.ok / 401, checks user before receipt PATCH, updates unreviewedCount & broadcasts
  const analyzeBlock = src.slice(
    src.indexOf('const handleAnalyzeHand = useCallback'),
    src.indexOf('const handleSaveSuggestedHand = useCallback'),
  );
  assert.match(analyzeBlock, /if \(gateRes\.status === 401\)/);
  assert.match(analyzeBlock, /if \(!gateRes\.ok \|\| gateRes\.body\?\.success === false\)/);
  assert.ok(
    analyzeBlock.indexOf('!gateRes.ok') < analyzeBlock.indexOf('/api/assistant/leaks/hand-audit'),
    'non-OK analysis gate error MUST abort before calling hand-audit',
  );
  assert.match(analyzeBlock, /applyUnreviewedDelta\(currentMeta\.status,\s*nextMeta\.status\)/);
  assert.match(analyzeBlock, /broadcastSavedHandsSync\(\{\s*type:\s*'saved-hand-updated'/);

  // submitReviewUpdate updates unreviewedCount accurately
  const submitBlock = src.slice(
    src.indexOf('const submitReviewUpdate = useCallback'),
    src.indexOf('const handleAnalyzeHand = useCallback'),
  );
  assert.match(submitBlock, /applyUnreviewedDelta\(previousStatus,\s*updatedMeta\.status\)/);
  assert.match(submitBlock, /applyUnreviewedDelta\(previousStatus,\s*serverMeta\.status\)/);
});

test('LAW 4: Street-By-Street Replayer handles Bomb Pots, AI-Scan hands, Straddles, and Run-It-Twice multi-boards accurately', () => {
  const src = read(REVIEW_PAGE);

  // Extract pure replayer helpers and execute them directly in VM
  const helperCode = [
    "const STREET_ORDER = ['preflop', 'pineapple_discard', 'flop', 'turn', 'river'];",
    "const STREET_LABELS = { preflop: 'Preflop', pineapple_discard: 'Discard', flop: 'Flop', turn: 'Turn', river: 'River' };",
    extractFunctionBlock(src, 'function getHeroPlayer(hand)'),
    extractFunctionBlock(src, 'function sliceBoardCardsForStreet('),
    extractFunctionBlock(src, 'function buildReplayerSteps(hand, boards, streets)'),
    '({ buildReplayerSteps })',
  ].join('\n');
  const { buildReplayerSteps } = vm.runInNewContext(helperCode, {});

  // 1) AI-Scan hand with 0 recorded actions and pot_total = 325 must NOT lock final pot to sb + bb (15)
  const aiScanSteps = buildReplayerSteps(
    { small_blind: 5, big_blind: 10, pot_total: 325, hand_data: { players: [{ isHero: true, stack: 1000 }] } },
    [{ index: 1, label: 'Board 1', cards: ['Ah', 'Kd', '7c', '2s', '9h'] }],
    [],
  );
  assert.equal(aiScanSteps[aiScanSteps.length - 1].name, 'river');
  assert.equal(aiScanSteps[aiScanSteps.length - 1].runningPot, 325, 'AI-Scan final street pot must equal pot_total');

  // 2) Bomb Pot with flop bet/call and 0 preflop blinds must equal pot_total (400), NOT sb + bb + 200 (215)
  const bombPotSteps = buildReplayerSteps(
    { small_blind: 5, big_blind: 10, pot_total: 400, hand_data: { bombPot: true, players: [{ isHero: true, stack: 1000 }] } },
    [{ index: 1, label: 'Board 1', cards: ['Ts', '9s', '2d'] }],
    [
      { name: 'flop', cards: ['Ts', '9s', '2d'], actions: [{ action: 'bet', amount: 100, isHero: true }, { action: 'call', amount: 100 }] },
    ],
  );
  const bombFlop = bombPotSteps.find((s) => s.name === 'flop');
  assert.equal(bombFlop.runningPot, 400, 'Bomb Pot flop pot must account for bomb-pot ante to match pot_total');

  // 3) Straddle hand recognizes verb === 'straddle' as explicit blind (does not double-add sb + bb)
  const straddleSteps = buildReplayerSteps(
    { small_blind: 5, big_blind: 10, pot_total: 55, hand_data: { players: [{ isHero: true, stack: 1000 }] } },
    [],
    [
      {
        name: 'preflop',
        cards: [],
        actions: [
          { action: 'straddle', amount: 20 },
          { action: 'call', amount: 20, isHero: true },
        ],
      },
    ],
  );
  assert.equal(straddleSteps[0].runningPot, 40, 'explicit straddle must not double-add sb+bb');

  // 4) Run-It-Twice multi-board hand populates ALL boards on flop/turn/river steps
  const ritSteps = buildReplayerSteps(
    { small_blind: 5, big_blind: 10, pot_total: 600, hand_data: { players: [{ isHero: true, stack: 1000 }] } },
    [
      { index: 1, label: 'Board 1', cards: ['Ah', 'Kh', '2c', '7d', '9s'] },
      { index: 2, label: 'Board 2', cards: ['Ah', 'Kh', '2c', 'Qc', 'Jd'] },
    ],
    [],
  );
  const ritRiver = ritSteps.find((s) => s.name === 'river');
  assert.equal(ritRiver.boards.length, 2, 'replayer step must expose both Run-It-Twice boards');
  assert.deepEqual(ritRiver.boards[0].cards, ['Ah', 'Kh', '2c', '7d', '9s']);
  assert.deepEqual(ritRiver.boards[1].cards, ['Ah', 'Kh', '2c', 'Qc', 'Jd']);

  // UI renders all Run-It-Twice boards inside Replayer
  assert.match(src, /data-testid="replayer-multi-boards"/);
  assert.match(src, /activeStep\.boards\.map\(\(board\) =>/);
});

test('LAW 5: Landing Page resets counts/focus synchronously on account switch and HubPageSummary has zero /hub/training links', () => {
  const landingSrc = read(LANDING_PAGE);

  // Account-switch synchronous reset
  assert.match(landingSrc, /const prevOverviewUserIdRef = useRef\(user\?\.id \|\| null\);/);
  assert.match(
    landingSrc,
    /if \(prevOverviewUserIdRef\.current !== currentUserId\)\s*\{\s*prevOverviewUserIdRef\.current = currentUserId;\s*setSavedHandsCount\(null\);\s*setUnreviewedHandsCount\(null\);\s*setCoachingSnapshot\(null\);\s*\}/,
  );
  // Clears state on !token and non-OK responses
  const overviewBlock = landingSrc.slice(
    landingSrc.indexOf('const loadPersonalOverview = async () =>'),
    landingSrc.indexOf('loadPersonalOverview();'),
  );
  assert.match(overviewBlock, /if \(!token\)\s*\{\s*setSavedHandsCount\(null\);\s*setUnreviewedHandsCount\(null\);\s*setCoachingSnapshot\(null\);/);
  assert.match(overviewBlock, /else if \(!cancelled && activeUserIdRef\.current === expectedUserId\)\s*\{\s*setSavedHandsCount\(null\);\s*setUnreviewedHandsCount\(null\);\s*\}/);
  assert.match(overviewBlock, /else if \(!cancelled && activeUserIdRef\.current === expectedUserId\)\s*\{\s*setCoachingSnapshot\(null\);\s*\}/);

  // HubPageSummary['personal-assistant'] has ZERO /hub/training links and uses Review My Play + Virtual Sandbox
  const summarySrc = read(HUB_SUMMARY);
  const paStart = summarySrc.indexOf("'personal-assistant': {");
  const paEnd = summarySrc.indexOf("'personal-assistant-leaks': {");
  assert.ok(paStart > 0 && paEnd > paStart, 'personal-assistant HubPageSummary block exists');
  const paBlock = summarySrc.slice(paStart, paEnd);

  assert.doesNotMatch(paBlock, /\/hub\/training/, 'personal-assistant summary MUST have zero /hub/training links');
  assert.doesNotMatch(paBlock, /Scenario Archive/, 'personal-assistant summary MUST use Virtual Sandbox, not Scenario Archive');
  assert.match(paBlock, /name:\s*'Virtual Sandbox',\s*href:\s*'\/hub\/personal-assistant\/sandbox'/);
  assert.match(paBlock, /name:\s*'Review My Play',\s*href:\s*'\/hub\/personal-assistant\/review'/);

  // Sitemap lists /hub/personal-assistant/review so summary links remain 100% valid
  const sitemapSrc = read(SITEMAP_PAGE);
  assert.match(sitemapSrc, /path:\s*'\/hub\/personal-assistant\/review'/);
});

test('LAW 6: Auth redirect chain preserves ?hand=<uuid> and rejects open redirects across /auth/mfa, /auth/callback, and /hub/verify-phone', async () => {
  const mfaSrc = read(MFA_PAGE);
  const callbackSrc = read(CALLBACK_PAGE);
  const verifySrc = read(VERIFY_PHONE_PAGE);

  // 6A: /auth/mfa uses ensureAuthReady + isSafeRelativePath on BOTH next and redirect + preserves next on all 3 login bounces
  assert.match(mfaSrc, /import \{ ensureAuthReady, getAccessToken, getFreshAccessToken \} from '\.\.\/\.\.\/src\/lib\/authUtils';/);
  assert.match(mfaSrc, /import \{ isSafeRelativePath \} from '\.\.\/\.\.\/src\/lib\/clubInvite';/);
  assert.match(mfaSrc, /await ensureAuthReady\(supabase\)/);
  assert.doesNotMatch(mfaSrc, /const user = getAuthUser\(\);/, 'mfa.js must not rely on one-shot synchronous getAuthUser()');
  assert.doesNotMatch(
    mfaSrc,
    /router\.replace\(`\/auth\/login\?redirect=\$\{encodeURIComponent\('\/auth\/mfa'\)\}`\)/,
    'mfa.js must never strip ?next=<encoded> on unauthenticated/401 login redirects',
  );
  const mfaBounceCalls = mfaSrc.match(/router\.replace\(getMfaLoginRedirectUrl\(\)\)/g) || [];
  assert.equal(mfaBounceCalls.length, 3, 'all 3 unauthenticated/401 bounces in mfa.js must preserve /auth/mfa?next= via getMfaLoginRedirectUrl()');

  // Executable runtime test of mounted MfaChallengePage: unauthenticated bounce preserves ?hand=<uuid> and rejects open redirect
  const React = require('react');
  const ts = require('typescript');
  const { create, act } = require('react-test-renderer');
  const compiledMfa = ts.transpileModule(mfaSrc, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;

  const runMfaBoot = async (query) => {
    const replaced = [];
    const mod = { exports: {} };
    vm.runInNewContext(compiledMfa, {
      exports: mod.exports,
      module: mod,
      console,
      encodeURIComponent,
      setTimeout: () => 1,
      clearTimeout: () => {},
      sessionStorage: { setItem: () => {}, getItem: () => null },
      require: (name) => {
        if (name === 'react' || name === 'react/jsx-runtime') return require(name);
        if (name === 'next/router') return { useRouter: () => ({ isReady: true, query, replace: (u) => replaced.push(u) }) };
        if (name === 'next/head') return { default: () => null };
        if (name.endsWith('/supabase')) return { supabase: { auth: { signOut: async () => {} } } };
        if (name.endsWith('/authUtils')) {
          return {
            ensureAuthReady: async () => null,
            getFreshAccessToken: async () => null,
            getAccessToken: () => null,
          };
        }
        if (name.endsWith('/clubInvite')) return { isSafeRelativePath };
        return {};
      },
    });
    let tree;
    await act(async () => {
      tree = create(React.createElement(mod.exports.default));
    });
    await act(async () => {
      tree.unmount();
    });
    return replaced;
  };

  const mfaNextBounce = await runMfaBoot({ next: [DEEP_HAND_URL] });
  assert.equal(
    mfaNextBounce[0],
    `/auth/login?redirect=${encodeURIComponent(`/auth/mfa?next=${encodeURIComponent(DEEP_HAND_URL)}`)}`,
    'MFA unauthenticated bounce must preserve ?hand=<uuid> inside /auth/mfa?next=',
  );

  const mfaRedirectBounce = await runMfaBoot({ redirect: DEEP_HAND_URL });
  assert.equal(
    mfaRedirectBounce[0],
    `/auth/login?redirect=${encodeURIComponent(`/auth/mfa?next=${encodeURIComponent(DEEP_HAND_URL)}`)}`,
    'MFA must honor ?redirect= when ?next= is absent',
  );

  for (const evil of ['/\\evil.com', '/\t/evil.com', '//evil.com/phish', 'https://evil.com/phish']) {
    const evilBounce = await runMfaBoot({ next: evil, redirect: evil });
    assert.equal(
      evilBounce[0],
      `/auth/login?redirect=${encodeURIComponent('/auth/mfa')}`,
      `MFA must reject open redirect payload ${JSON.stringify(evil)}`,
    );
  }

  // 6B: /auth/callback forwards ANY safe relative path to /hub/verify-phone?welcome=1 AND preserves redirect in goLogin
  assert.match(callbackSrc, /const redirectSuffix = safeReturnPath\s*\?\s*`&redirect=\$\{encodeURIComponent\(safeReturnPath\)\}`\s*:\s*'';/);
  assert.match(callbackSrc, /router\.replace\(`\$\{dest\}\?authError=\$\{encodeURIComponent\(code\)\}\$\{redirectSuffix\}`\)/);

  const destBlock = callbackSrc.slice(
    callbackSrc.indexOf('const destination = nextPath'),
    callbackSrc.indexOf('try {\n                    if (typeof window', callbackSrc.indexOf('const destination = nextPath')),
  );
  const cbVerifyUrl = vm.runInNewContext(`${destBlock}\ndest`, {
    nextPath: DEEP_HAND_URL,
    inviteDest: null,
    newPlayerNeedsPhone: true,
    isCommanderOrigin: false,
    encodeURIComponent,
    isSafeRelativePath,
    safeClubArenaPath: (p) => (p?.startsWith('/hub/club-arena/') ? p : null),
  });
  assert.equal(
    cbVerifyUrl,
    `/hub/verify-phone?welcome=1&next=${encodeURIComponent(DEEP_HAND_URL)}`,
    'callback must forward /hub/personal-assistant/review?hand=<uuid> to /hub/verify-phone?welcome=1',
  );

  // 6C: /hub/verify-phone accepts ANY safe internal relative path (next or redirect) and rejects open redirects
  assert.match(verifySrc, /import \{ fetchPendingJoinPath, isSafeRelativePath, safeClubArenaPath \} from '\.\.\/\.\.\/src\/lib\/clubInvite';/);
  const compiledVerify = ts.transpileModule(verifySrc, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;

  const runVerifySkip = async (query) => {
    const navs = [];
    const mod = { exports: {} };
    vm.runInNewContext(compiledVerify, {
      exports: mod.exports,
      module: mod,
      console,
      encodeURIComponent,
      URL,
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      localStorage: { setItem: () => {} },
      setTimeout: () => 1,
      clearTimeout: () => {},
      window: { location: { replace: (u) => navs.push(u), search: '' }, dispatchEvent: () => {} },
      require: (name) => {
        if (name === 'react' || name === 'react/jsx-runtime') return require(name);
        if (name === 'next/router') return { useRouter: () => ({ query, replace: (u) => navs.push(u) }) };
        if (name.endsWith('/VerificationConsole')) return { default: (props) => React.createElement('div', { id: 'console', ...props }) };
        if (name.endsWith('/SEOHead')) return { default: () => null };
        if (name.endsWith('/authUtils')) return { useRequireAuth: () => ({ user: { id: 'u1' }, checking: false }), getAccessToken: () => '', authedFetch: async () => ({ ok: true, json: async () => ({ success: true }) }) };
        if (name.endsWith('/supabase')) return { supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { phone_verified: false } }) }) }) }), auth: { updateUser: async () => ({}) } } };
        if (name.endsWith('/clubInvite')) return { isSafeRelativePath, safeClubArenaPath: (p) => (p?.startsWith('/hub/club-arena/') ? p : null), fetchPendingJoinPath: async () => null };
        if (name.endsWith('/phoneWelcome')) return { shouldOfferPhoneWelcome: () => true };
        if (name.endsWith('/pendingPhoneVerification.mjs')) return { readPendingPhoneVerification: () => null, savePendingPhoneVerification: () => {}, clearPendingPhoneVerification: () => {} };
        if (name.endsWith('/EventBus')) return { busEmit: { diamondsEarned: () => {} } };
        return {};
      },
    });
    let tree;
    await act(async () => {
      tree = create(React.createElement(mod.exports.default));
    });
    const consoleProps = tree.root.findByProps({ id: 'console' }).props;
    await act(async () => {
      consoleProps.skip();
    });
    await act(async () => {
      tree.unmount();
    });
    return { navs, continueLabel: consoleProps.continueLabel };
  };

  const verifyNext = await runVerifySkip({ welcome: '1', next: DEEP_HAND_URL });
  assert.deepEqual(verifyNext.navs, [DEEP_HAND_URL], 'verify-phone skip must preserve /hub/personal-assistant/review?hand=<uuid>');
  assert.equal(verifyNext.continueLabel, 'Continue');

  const verifyRedirect = await runVerifySkip({ welcome: '1', redirect: DEEP_HAND_URL });
  assert.deepEqual(verifyRedirect.navs, [DEEP_HAND_URL], 'verify-phone must also honor ?redirect=');

  for (const evil of ['//evil.com/x', '/\\evil.com', '/\t/evil.com', 'https://evil.com', 'javascript:alert(1)']) {
    const evilRes = await runVerifySkip({ welcome: '1', next: evil, redirect: evil });
    assert.deepEqual(evilRes.navs, ['/hub'], `verify-phone must reject open redirect ${JSON.stringify(evil)}`);
  }
});
