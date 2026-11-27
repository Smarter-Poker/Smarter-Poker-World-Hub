/**
 * PERSONAL ASSISTANT · Review My Play Workstation, Landing LCP & Sign-In Redirect Guards
 *
 * Covers every contract for:
 * - pages/hub/personal-assistant/review.js
 * - src/styles/worlds/PersonalAssistantReview.module.css
 * - pages/hub/personal-assistant/index.js
 * - pages/auth/login.js (?redirect= preservation including ?hand=<uuid>)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { isSafeRelativePath } from '../src/lib/clubInvite.js';
import { anonymizeHandForShare } from '../src/lib/personal-assistant/anonymizeHandForShare.mjs';
import { collectSavedHandsExport } from '../src/lib/personal-assistant/savedHandExport.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const REVIEW_PAGE = 'pages/hub/personal-assistant/review.js';
const REVIEW_CSS = 'src/styles/worlds/PersonalAssistantReview.module.css';
const LANDING_PAGE = 'pages/hub/personal-assistant/index.js';
const LOGIN_PAGE = 'pages/auth/login.js';

function jsxTagName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return `${jsxTagName(node.object)}.${jsxTagName(node.property)}`;
  return '';
}

function getJsxElementsByName(source, tagName) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const matches = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXElement' && jsxTagName(node.openingElement?.name) === tagName) {
      matches.push(node);
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const val = node[key];
      if (Array.isArray(val)) val.forEach(visit);
      else if (val && typeof val === 'object') visit(val);
    }
  };
  visit(ast.program);
  return matches;
}

function getJsxAttrNames(jsxEl) {
  const attrs = jsxEl.openingElement?.attributes || [];
  return attrs
    .filter((a) => a.type === 'JSXAttribute')
    .map((a) => a.name?.name)
    .filter(Boolean);
}

function getJsxAttrStringValue(jsxEl, attrName) {
  const attrs = jsxEl.openingElement?.attributes || [];
  const attr = attrs.find((a) => a.type === 'JSXAttribute' && a.name?.name === attrName);
  if (!attr) return null;
  if (!attr.value) return true;
  if (attr.value.type === 'StringLiteral') return attr.value.value;
  if (attr.value.type === 'JSXExpressionContainer') {
    const expr = attr.value.expression;
    if (expr.type === 'NumericLiteral' || expr.type === 'StringLiteral' || expr.type === 'BooleanLiteral') {
      return expr.value;
    }
  }
  return '[expr]';
}

test('Review My Play implements interactive Street-By-Street Visual Replayer with accessible keyboard tablist', () => {
  const src = read(REVIEW_PAGE);
  assert.match(src, /data-testid="street-replayer"/);
  assert.match(src, /role="tablist"/);
  assert.match(src, /role="tab"/);
  assert.match(src, /role="tabpanel"/);
  assert.match(src, /aria-selected=\{isActive\}/);
  assert.match(src, /tabIndex=\{isActive \? 0 : -1\}/);
  assert.match(src, /event\.key === 'ArrowRight'/);
  assert.match(src, /event\.key === 'ArrowLeft'/);
  assert.match(src, /event\.key === 'Home'/);
  assert.match(src, /event\.key === 'End'/);
  assert.match(src, /event\.preventDefault\(\)/);
  assert.match(src, /SPR:/);
  assert.match(src, /Hero Decisions:/);
  assert.match(src, /actionRowHero/);
});

test('Review My Play provides one-click sanitized Explore In Sandbox handoff with zero hidden opponent cards', () => {
  const src = read(REVIEW_PAGE);
  assert.match(src, /const SANDBOX_HANDOFF_KEY = 'pa-sandbox-handoff-v1';/);
  assert.match(src, /data-testid="explore-in-sandbox-btn"/);
  assert.match(src, /Explore In Sandbox/);
  assert.match(src, /window\.sessionStorage\.setItem\(SANDBOX_HANDOFF_KEY, JSON\.stringify\(payload\)\)/);
  assert.match(src, /\/hub\/personal-assistant\/sandbox\?fromReview=\$\{encodeURIComponent\(selectedHand\.id\)\}/);

  const fnStart = src.indexOf('function buildSandboxHandoffPayload');
  const fnEnd = src.indexOf('function broadcastSavedHandsSync');
  assert.ok(fnStart > 0 && fnEnd > fnStart, 'buildSandboxHandoffPayload is present');
  const fnBody = src.slice(fnStart, fnEnd);
  for (const field of ['sourceRowId', 'heroCards', 'board', 'heroPosition', 'pot', 'effectiveStack', 'gameFormat', 'variant']) {
    assert.match(fnBody, new RegExp(`\\b${field}\\b`), `sandbox handoff includes ${field}`);
  }
  assert.doesNotMatch(fnBody, /opponentCards|villains|players\s*:/, 'sandbox handoff never leaks opponent cards or player list');
});

test('Review My Play renders multi-variant hands (2/4/5/6 cards), Bomb Pots, Straddles, Multi-Board RIT, and honest variant notices', () => {
  const src = read(REVIEW_PAGE);
  assert.match(src, /heroCards\.length === 6/);
  assert.match(src, /heroCards\.length === 5/);
  assert.match(src, /heroCards\.length === 4/);
  assert.match(src, /Manual Review · Hold'em Solver Grading Does Not Apply/);
  assert.doesNotMatch(src, /—/, 'review.js respects PA copy policy (zero em dashes)');
  assert.match(src, /data-testid="variant-honest-notice"/);
  assert.match(src, /Bomb Pot/);
  assert.match(src, /Straddle/);
  assert.match(src, /Run It/);
  assert.match(src, /selectedHeroCards\.length >= 5/);
});

test('Review My Play supports tags, filters, search, and cursor Load More pagination', () => {
  const src = read(REVIEW_PAGE);
  for (const tag of ['3-Bet Pot', 'River Bluff-Catch', 'Bubble', 'Multi-Board', 'Bomb Pot']) {
    assert.ok(src.includes(`'${tag}'`), `preset tag ${tag} is defined`);
  }
  assert.match(src, /const PAGE_SIZE = 25;/);
  assert.match(src, /const MAX_TAGS = 10;/);
  assert.match(src, /params\.set\('cursor', cursor\)/);
  assert.match(src, /params\.set\('status', filterStatus\)/);
  assert.match(src, /params\.set\('source', filterSource\)/);
  assert.match(src, /params\.set\('format', filterFormat\)/);
  assert.match(src, /params\.set\('tag', filterTag\)/);
  assert.match(src, /params\.set\('q', debouncedQuery\)/);
  assert.match(src, /tags: desiredTags/);
  assert.match(src, /data-testid="load-more-hands-btn"/);
  assert.match(src, /Load More/);
});

function variableInitializer(source, name) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  let initializer;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === name) {
      initializer = node.init;
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast.program);
  assert.ok(initializer, `${name} exists in the actual source`);
  return initializer;
}

function loadPageCallback(name, bindings) {
  const source = read(REVIEW_PAGE);
  const callback = variableInitializer(source, name).arguments[0];
  return new Function(...Object.keys(bindings), `return (${source.slice(callback.start, callback.end)});`)(...Object.values(bindings));
}

test('Review pagination discards a delayed page after filters or the list generation change', async () => {
  for (const outcome of ['success', 'failure']) {
    let settleRequest;
    let markRequested;
    const requested = new Promise((resolve) => { markRequested = resolve; });
    const response = new Promise((resolve, reject) => { settleRequest = outcome === 'success' ? resolve : reject; });
    const state = { hands: [{ id: 'new-filter-hand' }], cursor: 'new-filter-cursor', error: '', loading: false, status: 'ready' };
    const generation = { current: 1 };
    const handleLoadMore = loadPageCallback('handleLoadMore', {
      nextCursor: 'old-filter-cursor',
      loadingMore: false,
      user: { id: 'test-owner' },
      activeUserIdRef: { current: 'test-owner' },
      loadGenRef: generation,
      getFreshAccessToken: async () => 'synthetic-test-token',
      buildFilterQueryParams: (cursor) => `status=saved&cursor=${cursor}`,
      fetchJsonWithTimeout: () => { markRequested(); return response; },
      setLoadingMore: (value) => { state.loading = value; },
      setLoadError: (value) => { state.error = value; },
      setLoadStatus: (value) => { state.status = value; },
      setHands: (value) => { state.hands = typeof value === 'function' ? value(state.hands) : value; },
      setNextCursor: (value) => { state.cursor = value; },
      setTotalCount: () => assert.fail('A stale page cannot reset counts'),
      setUnreviewedCount: () => assert.fail('A stale page cannot reset counts'),
      setSelectedHandId: () => assert.fail('A stale page cannot reset selection'),
    });
    const pending = handleLoadMore();
    await requested;
    generation.current += 1;
    // The next list owns the loading indicator while the old request settles.
    state.loading = true;
    if (outcome === 'success') {
      settleRequest({ ok: true, status: 200, body: { success: true, hands: [{ id: 'old-filter-hand' }], nextCursor: 'old-next-cursor' } });
    } else {
      settleRequest(new Error('Old Filter Request Failed'));
    }
    await pending;
    assert.deepEqual(state.hands, [{ id: 'new-filter-hand' }]);
    assert.equal(state.cursor, 'new-filter-cursor');
    assert.equal(state.error, '');
    assert.equal(state.loading, true);
    assert.equal(state.status, 'ready');
  }
});

test('Review My Play wires post-session Suggested Hands To Review and Active-Table RTA analysis gate', () => {
  const src = read(REVIEW_PAGE);
  assert.match(src, /\/api\/poker\/saved-hands\?suggested=1/);
  assert.match(src, /Suggested Hands Appear After You Leave Your Active Table\./);
  assert.match(src, /data-testid="suggested-hands-panel"/);
  assert.match(src, /Save & Review/);

  // Analysis RTA gate must run before /api/assistant/leaks/hand-audit
  const gateIdx = src.indexOf('/api/poker/saved-hands?analysisGate=1');
  const auditIdx = src.indexOf('/api/assistant/leaks/hand-audit');
  assert.ok(gateIdx > 0, 'analysisGate endpoint is queried');
  assert.ok(auditIdx > gateIdx, 'analysisGate check executes BEFORE /api/assistant/leaks/hand-audit');
  assert.match(src, /gateRes\.status === 423/);
  assert.match(src, /ACTIVE_PLAY_RESTRICTED/);
  assert.match(src, /data-testid="analysis-rta-notice"/);
});

test('Review My Play provides offline-safe note draft recovery and instant cross-tab sync', () => {
  const src = read(REVIEW_PAGE);
  assert.match(src, /`pa-review-draft:\$\{userId\}:\$\{handId\}:\$\{revision\}`/);
  assert.match(src, /data-testid="draft-restored-pill"/);
  assert.match(src, /Draft Restored/);
  assert.match(src, /clearDraftFromSession/);

  assert.match(src, /const SAVED_HANDS_CHANNEL = 'smarter-poker-saved-hands';/);
  assert.match(src, /typeof BroadcastChannel !== 'undefined'/);
  assert.match(src, /document\.addEventListener\('visibilitychange'/);
  assert.match(src, /document\.visibilityState !== 'visible'/);
  assert.match(src, /VISIBILITY_REFRESH_THROTTLE_MS/);
});

test('Review My Play safe deletion guard strictly follows modern-web-guidance dialog standard and 5-second Undo Delete', () => {
  const src = stripComments(read(REVIEW_PAGE));
  const css = stripComments(read(REVIEW_CSS));

  const dialogs = getJsxElementsByName(src, 'dialog');
  assert.equal(dialogs.length, 1, 'exactly one native <dialog> element');
  const attrs = getJsxAttrNames(dialogs[0]);
  assert.ok(!attrs.includes('role'), '<dialog> MUST NOT set role="dialog"');
  assert.ok(!attrs.includes('aria-modal'), '<dialog> MUST NOT set aria-modal');

  assert.match(src, /dialog\.showModal\(\)/, 'opens via native showModal()');
  assert.match(src, /dialog\.returnValue = '';/, 'resets dialog.returnValue in close handler');
  assert.match(src, /autoFocus[\s\S]{0,240}>\s*Cancel\s*<\/button>/, 'autoFocus is placed on the safe Cancel button');
  assert.doesNotMatch(src, /document\.(body|documentElement)\.style\.overflow/, 'no manual html/body scroll lock');

  assert.match(css, /dialog:modal\s*\{[^}]*overscroll-behavior:\s*contain/i, 'dialog:modal contains overscroll');
  assert.match(css, /dialog::backdrop\s*\{[^}]*overflow:\s*hidden[^}]*overscroll-behavior:\s*contain/i, 'dialog::backdrop locks overscroll');

  assert.match(src, /const DELETE_UNDO_SECONDS = 5;/);
  assert.match(src, /data-testid="undo-delete-toast"/);
  assert.match(src, /data-testid="undo-delete-btn"/);
  assert.match(src, /Undo Delete/);
  assert.match(src, /method: 'DELETE'/);
});

test('Review My Play wires privacy-safe anonymizeHandForShare and authenticated Blob exports', () => {
  const src = read(REVIEW_PAGE);
  assert.match(src, /import \{ anonymizeHandForShare \} from '\.\.\/\.\.\/\.\.\/src\/lib\/personal-assistant\/anonymizeHandForShare\.mjs'/);
  assert.match(src, /anonymizeHandForShare\(selectedHand, \{ includeNotes: false, origin \}\)/);
  assert.match(src, /data-testid="share-anonymized-btn"/);
  assert.match(src, /Share Anonymized Hand/);

  // Runtime verification that anonymizeHandForShare strips opponent identities, hidden cards, and private notes
  const shared = anonymizeHandForShare({
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    variant: 'PLO5',
    small_blind: 5,
    big_blind: 10,
    pot_total: 420,
    hand_data: {
      tableName: 'Secret VIP Club Table',
      players: [
        { id: '11111111-1111-4111-8111-111111111111', name: 'HeroUser', position: 'BTN', isHero: true, holeCards: ['As', 'Ks', 'Qh', 'Jh', 'Td'], netResult: 210 },
        { id: '22222222-2222-4222-8222-222222222222', name: 'VillainRealName', position: 'BB', isHero: false, holeCards: ['2c', '3c', '4c', '5c', '6c'], cardsVisibility: 'hidden', showedCards: false, netResult: -210 },
      ],
      communityCards: ['Ah', '7s', '2d', '9c', 'Kc'],
      review: { notes: 'Top Secret Private Tell On Villain', tags: ['3-Bet Pot'] },
    },
  }, { includeNotes: false, origin: 'https://smarter.poker' });

  assert.ok(shared.shareUrl.startsWith('https://smarter.poker/share/hand?'));
  assert.ok(!shared.summaryText.includes('VillainRealName'), 'opponent username stripped');
  assert.ok(!shared.summaryText.includes('22222222-2222-4222-8222-222222222222'), 'opponent UUID stripped');
  assert.ok(!shared.summaryText.includes('Secret VIP Club Table'), 'table name stripped');
  assert.ok(!shared.summaryText.includes('Top Secret Private Tell'), 'private notes stripped by default');
  assert.ok(!shared.summaryText.includes('2c 3c'), 'hidden opponent hole cards stripped');

  assert.match(src, /data-testid="export-json-btn"/);
  assert.match(src, /data-testid="export-text-btn"/);
  assert.match(src, /\/api\/poker\/saved-hands\?export=\$\{encodeURIComponent\(format\)\}/);
  assert.match(src, /Authorization: `Bearer \$\{token\}`/);
  assert.match(src, /await collectSavedHandsExport\(/);
  assert.match(src, /new Blob\(result\.parts, \{ type: result\.mimeType \}\)/);
  assert.match(src, /data-testid="cancel-export-btn"/);
  assert.match(src, /URL\.createObjectURL\(blob\)/);
  assert.match(src, /URL\.revokeObjectURL\(objectUrl\)/);
});

test('Sign-In redirect preserves ?hand=<uuid> across review CTA, login, OAuth callback, and MFA', () => {
  const reviewSrc = read(REVIEW_PAGE);
  const loginSrc = read(LOGIN_PAGE);

  assert.match(reviewSrc, /\/auth\/login\?redirect=\$\{encodeURIComponent\(rawAsPath\)\}/);
  assert.doesNotMatch(reviewSrc, /\/auth\/login\?next=/, 'review Sign In CTA uses ?redirect= not ?next=');

  assert.match(loginSrc, /isSafeRelativePath\(r\)\) return r;/);
  assert.match(loginSrc, /\/auth\/mfa\?next=\$\{encodeURIComponent\(dest\)\}&redirect=\$\{encodeURIComponent\(dest\)\}/);

  const deepReviewPath = '/hub/personal-assistant/review?hand=11111111-2222-3333-4444-555555555555';
  assert.equal(isSafeRelativePath(deepReviewPath), true, 'deep ?hand=<uuid> path passes isSafeRelativePath');
  assert.equal(isSafeRelativePath('//evil.com/hub/personal-assistant/review?hand=1'), false, 'protocol-relative redirect blocked');
  assert.equal(isSafeRelativePath('https://evil.com/phish'), false, 'absolute external redirect blocked');
});

test('Personal Assistant landing page satisfies optimize-image-priority LCP standard and live signed-in counts', () => {
  const src = read(LANDING_PAGE);
  const artSource = read('src/components/personal-assistant/ApprovedLandingArt.jsx');
  const illustrations = getJsxElementsByName(src, 'ApprovedIllustration');
  for (const kind of ['review', 'sandbox', 'leaks', 'log', 'coaching']) {
    assert.equal(illustrations.filter((el) => getJsxAttrStringValue(el, 'kind') === kind).length, 1, `one approved ${kind} subject`);
  }
  const mainKinds = illustrations.map((el) => getJsxAttrStringValue(el, 'kind')).filter((kind) => ['review', 'sandbox', 'leaks'].includes(kind));
  assert.deepEqual(mainKinds, ['review', 'sandbox', 'leaks'], 'illustrated selection hierarchy is unchanged');
  const preloads = getJsxElementsByName(src, 'link').filter((el) => getJsxAttrStringValue(el, 'rel') === 'preload' && getJsxAttrStringValue(el, 'as') === 'image');
  assert.equal(preloads.length, 1, 'one shared sprite preload avoids competing hero requests');
  assert.equal(getJsxAttrStringValue(preloads[0], 'fetchPriority') || getJsxAttrStringValue(preloads[0], 'fetchpriority'), 'high');
  assert.match(src.slice(preloads[0].start, preloads[0].end), /href=\{APPROVED_LANDING_SPRITE\}/);
  const subjectSvg = getJsxElementsByName(artSource, 'svg').find((el) => getJsxAttrNames(el).includes('data-approved-illustration'));
  assert.ok(subjectSvg);
  assert.equal(getJsxAttrStringValue(subjectSvg, 'preserveAspectRatio'), 'xMidYMid meet', 'subjects cannot scale their axes independently');
  const artBoxes = variableInitializer(artSource, 'ART');
  assert.deepEqual(new Function(`return (${artSource.slice(artBoxes.start, artBoxes.end)});`)(), {
    review: [89, 220, 489, 238], sandbox: [89, 490, 507, 164], leaks: [89, 681, 391, 94],
    log: [137, 797, 153, 113], coaching: [666, 792, 123, 119], settings: [955, 155, 35, 35],
    target: [604, 330, 34, 34], check: [940, 708, 38, 38],
  }, 'illustrations use the actual approved-reference coordinates');
  for (const image of getJsxElementsByName(artSource, 'image')) {
    assert.equal(getJsxAttrStringValue(image, 'width'), '1249');
    assert.equal(getJsxAttrStringValue(image, 'height'), '1061');
  }
  assert.match(artSource, /kind === 'sandbox' \|\| kind === 'leaks' \? CARDS : APPROVED_LANDING_SPRITE/);
  assert.match(artSource, /approved-card-edit-sprite\.webp/);
  const sprite = fs.readFileSync(path.join(ROOT, 'public/images/personal-assistant/approved-layout-sprite.webp'));
  assert.equal(createHash('sha256').update(sprite).digest('hex'), '30ea73e7b35c12906fd44aa59ce6b34fe3bf49889df9b1442f5b07a811016655', 'unchanged approved-reference artwork identity');
  assert.match(src, /Ace Of Hearts, Four Of Spades, And Five Of Spades/);
  assert.match(src, /King Of Hearts And Queen Of Hearts/);
  assert.match(src, /<h2 id="card-review-title"[^>]*>Review My Play<\/h2>/, 'heading remains live HTML');
  assert.match(src, /<Link[\s\S]*?href="\/hub\/personal-assistant\/review"[\s\S]*?Start Review[\s\S]*?<\/Link>/, 'primary action remains an interactive live link');

  // Live signed-in counts with AbortController + timeout
  assert.match(src, /\/api\/poker\/saved-hands\?limit=1/);
  assert.match(src, /new AbortController\(\)/);
  assert.match(src, /window\.setTimeout\(\(\) => controller\.abort\(\)/);
  assert.match(src, /unreviewedHandsCount\.toLocaleString\(\)/);
  assert.match(src, /All Saved Hands Reviewed/);
  assert.doesNotMatch(src, /\/hub\/training/, 'zero /hub/training redirects on landing page');
});

test('Review My Play satisfies all World Hub PA HTML, CSS, landmark, and touch-target laws', () => {
  const reviewSrc = stripComments(read(REVIEW_PAGE));
  const reviewCss = stripComments(read(REVIEW_CSS));

  // Single <main> landmark (owned by HubPageShell, none inside review.js)
  assert.equal(getJsxElementsByName(reviewSrc, 'main').length, 0, 'review.js renders no duplicate <main>');

  // Zero <div> inside <button>
  const buttons = getJsxElementsByName(reviewSrc, 'button');
  assert.ok(buttons.length > 0, 'review.js has interactive buttons');
  const hasDivDescendant = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'JSXElement' && jsxTagName(node.openingElement?.name) === 'div') return true;
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const val = node[key];
      if (Array.isArray(val) && val.some(hasDivDescendant)) return true;
      if (val && typeof val === 'object' && hasDivDescendant(val)) return true;
    }
    return false;
  };
  for (const btn of buttons) {
    assert.equal(hasDivDescendant(btn), false, 'no <div> nested inside <button> in review.js');
  }

  // CSS laws: 100dvh, overflow-x: clip, no display: none, >= 12px font, only 900/768/600 breakpoints
  assert.match(reviewCss, /min-height:\s*100dvh/);
  assert.doesNotMatch(reviewCss, /min-height:\s*100vh/);
  assert.match(reviewCss, /overflow-x:\s*clip/);
  assert.doesNotMatch(reviewCss, /overflow-x:\s*hidden/);
  assert.doesNotMatch(reviewCss, /display:\s*none/i, 'zero display: none responsive culling in review CSS');

  const widths = [...reviewCss.matchAll(/@media[^{]*\(max-width:\s*(\d+)px\)/g)].map((m) => m[1]);
  const allowed = new Set(['900', '768', '600']);
  for (const w of widths) {
    assert.ok(allowed.has(w), `disallowed breakpoint ${w}px in review CSS (900/768/600 only)`);
  }

  // No font size under 12px
  for (const [idx, line] of reviewCss.split('\n').entries()) {
    const decls = line
      .replace(/^[^{]*\{/, '')
      .split(';')
      .filter((d) => /^\s*font(-size)?\s*:/.test(d));
    for (const decl of decls) {
      const value = decl.replace(/^\s*font(-size)?\s*:/, '').replace(/\/\s*[\d.]+/g, '');
      for (const m of value.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)px/g)) {
        assert.ok(Number(m[1]) >= 12, `line ${idx + 1} has font size < 12px: ${line.trim()}`);
      }
    }
  }

  // Button touch targets >= 36px
  for (const rule of reviewCss.matchAll(/\.([a-zA-Z0-9_-]*(?:Btn|Tab|RemoveBtn))\s*\{([^}]*)\}/g)) {
    const className = rule[1];
    const body = rule[2];
    const minH = body.match(/min-height:\s*(\d+)px/);
    if (minH) {
      assert.ok(Number(minH[1]) >= 36, `.${className} min-height (${minH[1]}px) must be >= 36px`);
    }
  }
});


test('Review keeps incomplete totals unknown and loads the first older filtered match into its editor', async () => {
  const state = { hands: [], cursor: null, selected: '', total: 'unset', unreviewed: 'unset', editor: null };
  const selectedHandIdRef = { current: '' };
  const bindings = {
    user: { id: 'owner' }, authInitializing: false,
    activeUserIdRef: { current: 'owner' }, loadGenRef: { current: 0 },
    pendingDeleteRef: { current: null }, selectedHandIdRef,
    getFreshAccessToken: async () => 'synthetic-test-token',
    buildFilterQueryParams: () => 'q=oldest', requestedQueryHandId: '', hasActiveFilters: true,
    setLoadingMore: () => {}, setLoadError: () => {}, setLoadStatus: () => {}, setMissingRequestedId: () => {},
    setHands: (value) => { state.hands = typeof value === 'function' ? value(state.hands) : value; },
    setNextCursor: (value) => { state.cursor = value; },
    setSelectedHandId: (value) => { state.selected = value; selectedHandIdRef.current = value; },
    setTotalCount: (value) => { state.total = value; },
    setUnreviewedCount: (value) => { state.unreviewed = value; },
    syncEditorFromHand: (hand) => { state.editor = hand.id; },
  };
  const load = loadPageCallback('loadSavedHands', {
    ...bindings,
    fetchJsonWithTimeout: async () => ({ ok: true, status: 200, body: {
      success: true, hands: [], nextCursor: 'older', countsComplete: false, totalCount: null, unreviewedCount: null,
    } }),
  });
  await load();
  assert.equal(state.total, null);
  assert.equal(state.unreviewed, null);
  assert.equal(state.cursor, 'older');
  const more = loadPageCallback('handleLoadMore', {
    ...bindings, nextCursor: state.cursor, loadingMore: false,
    fetchJsonWithTimeout: async () => ({ ok: true, status: 200, body: { success: true, hands: [{ id: 'oldest' }], nextCursor: null } }),
  });
  await more();
  assert.equal(state.selected, 'oldest');
  assert.equal(state.editor, 'oldest');
  assert.equal(state.cursor, null);
  assert.deepEqual(state.hands, [{ id: 'oldest' }]);
});

test('Review downloads only after all export chunks complete and suppresses interrupted or cross-account files', async () => {
  for (const outcome of ['complete', 'failure', 'cancel', 'account-change', 'unmount']) {
    let settleSecond;
    let markSecond;
    const secondStarted = new Promise((resolve) => { markSecond = resolve; });
    const secondResponse = new Promise((resolve, reject) => { settleSecond = outcome === 'failure' ? reject : resolve; });
    let requests = 0;
    let downloads = 0;
    let downloadedBlob;
    let error = '';
    let exporting = '';
    const owner = { current: 'owner' };
    const exportAbortRef = { current: null };
    const chunk = (id, nextCursor) => ({ ok: true, status: 200, body: {
      success: true, schemaVersion: 1, format: 'json', count: 1, ids: [id], hands: [{ id }],
      nextCursor, complete: nextCursor === null,
    } });
    const handleExport = loadPageCallback('handleExportHands', {
      user: { id: 'owner' }, activeUserIdRef: owner, exportAbortRef, exportingFormat: '',
      setExportingFormat: (value) => { exporting = value; },
      setExportError: (value) => { error = value; },
      getFreshAccessToken: async () => 'synthetic-test-token', collectSavedHandsExport,
      fetchJsonWithTimeout: async (url, options) => {
        assert.match(url, /export=json&chunk=1/);
        assert.equal(options.headers.Authorization, 'Bearer synthetic-test-token');
        assert.equal(options.signal, exportAbortRef.current.signal);
        requests += 1;
        if (requests === 1) return chunk('first', 'next');
        assert.match(url, /cursor=next/);
        markSecond();
        return secondResponse;
      },
      URL: { createObjectURL: (blob) => { downloadedBlob = blob; return 'blob:synthetic'; }, revokeObjectURL: () => {} },
      document: { body: { appendChild: () => {} }, createElement: () => ({ click: () => { downloads += 1; }, remove: () => {} }) },
      window: { setTimeout: (callback) => callback() },
    });
    const pending = handleExport('json');
    await secondStarted;
    assert.equal(downloads, 0, 'first chunk must never be offered as a completed export');
    if (outcome === 'cancel') exportAbortRef.current.abort();
    if (outcome === 'account-change') owner.current = 'different-owner';
    if (outcome === 'unmount') { exportAbortRef.current.abort(); exportAbortRef.current = null; }
    if (outcome === 'failure') settleSecond(new Error('Connection Interrupted'));
    else settleSecond(chunk('second', null));
    await pending;
    assert.equal(exporting, outcome === 'unmount' ? 'json' : '', 'unmounted components receive no late state updates');
    assert.equal(downloads, outcome === 'complete' ? 1 : 0);
    if (outcome === 'complete') {
      const data = JSON.parse(await downloadedBlob.text());
      assert.equal(data.count, 2);
      assert.deepEqual(data.hands.map((hand) => hand.id), ['first', 'second']);
    }
    if (outcome === 'cancel') assert.match(error, /Cancelled/);
    if (outcome === 'failure') assert.match(error, /Interrupted/);
  }
});


test('Review query selection preserves React state while unrelated routes retain URL-key resets', () => {
  const appSource = read('pages/_app.js');
  const expression = variableInitializer(appSource, 'pageErrorBoundaryKey');
  const keyFor = new Function('resolvedPath', 'router', `return (${appSource.slice(expression.start, expression.end)});`);
  for (const pathname of ['/hub/personal-assistant/review', '/hub/profile']) {
    let mounts = 0;
    let setFilter;
    function Workstation() {
      const [filter, set] = React.useState('');
      setFilter = set;
      React.useEffect(() => { mounts += 1; }, []);
      return React.createElement('p', null, filter);
    }
    const router = {
      asPath: pathname,
      replace: ({ pathname: nextPath, query }, _unused, options) => {
        assert.equal(options.shallow, true);
        router.asPath = `${nextPath}?hand=${query.hand}`;
      },
    };
    const render = () => React.createElement(Workstation, { key: keyFor(pathname, router) });
    let renderer;
    try {
      TestRenderer.act(() => { renderer = TestRenderer.create(render()); });
      TestRenderer.act(() => { setFilter('Unreviewed'); });
      if (pathname.endsWith('/review')) {
        const noop = () => {};
        loadPageCallback('handleSelectHand', {
          router, saveAbortRef: { current: null }, analysisAbortRef: { current: null },
          setSelectedHandId: noop, setMissingRequestedId: noop, syncEditorFromHand: noop,
        })({ id: 'synthetic-hand' });
      } else {
        router.asPath = `${pathname}?tab=settings`;
      }
      TestRenderer.act(() => { renderer.update(render()); });
      assert.equal(mounts, pathname.endsWith('/review') ? 1 : 2);
      assert.deepEqual(renderer.toJSON().children, pathname.endsWith('/review') ? ['Unreviewed'] : null);
    } finally {
      TestRenderer.act(() => renderer?.unmount());
    }
  }
});


test('landing count parsing never labels incomplete account counts as zero or all reviewed', () => {
  const source = read(LANDING_PAGE);
  const complete = variableInitializer(source, 'countsComplete');
  const total = variableInitializer(source, 'total');
  const unreviewed = variableInitializer(source, 'unreviewed');
  const readCounts = new Function('payload', `
    const countsComplete = ${source.slice(complete.start, complete.end)};
    return [${source.slice(total.start, total.end)}, ${source.slice(unreviewed.start, unreviewed.end)}];
  `);
  for (const payload of [
    { countsComplete: false, totalCount: null, unreviewedCount: null },
    { countsComplete: false, totalCount: 1000, unreviewedCount: 12 },
    { totalCount: null, unreviewedCount: null },
    { totalCount: 10 },
  ]) assert.deepEqual(readCounts(payload), [null, null]);
  assert.deepEqual(readCounts({ countsComplete: true, totalCount: 0, unreviewedCount: 0 }), [0, 0]);
  assert.deepEqual(readCounts({ countsComplete: true, totalCount: 20, unreviewedCount: 5 }), [20, 5]);
});
