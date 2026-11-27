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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { isSafeRelativePath } from '../src/lib/clubInvite.js';
import { anonymizeHandForShare } from '../src/lib/personal-assistant/anonymizeHandForShare.mjs';

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
  assert.match(src, /await res\.blob\(\)/);
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
  const imgs = getJsxElementsByName(src, 'img');

  const reviewImg = imgs.find((el) => getJsxAttrStringValue(el, 'src') === '/images/personal-assistant/review-my-play.webp');
  const sandboxImg = imgs.find((el) => getJsxAttrStringValue(el, 'src') === '/images/personal-assistant/virtual-sandbox.webp');
  const leaksImg = imgs.find((el) => getJsxAttrStringValue(el, 'src') === '/images/personal-assistant/my-leaks.webp');

  assert.ok(reviewImg, 'review-my-play.webp exists');
  assert.equal(getJsxAttrStringValue(reviewImg, 'fetchPriority'), 'high', 'LCP hero image has fetchPriority="high"');
  assert.equal(getJsxAttrStringValue(reviewImg, 'width'), 308);
  assert.equal(getJsxAttrStringValue(reviewImg, 'height'), 230);
  assert.equal(getJsxAttrStringValue(reviewImg, 'loading'), null, 'LCP hero image MUST NOT be lazy-loaded');

  assert.ok(sandboxImg, 'virtual-sandbox.webp exists');
  assert.equal(getJsxAttrStringValue(sandboxImg, 'fetchPriority'), null, 'virtual-sandbox omits fetchPriority');
  assert.equal(getJsxAttrStringValue(sandboxImg, 'loading'), null, 'virtual-sandbox is not lazy-loaded');
  assert.equal(getJsxAttrStringValue(sandboxImg, 'width'), 308);
  assert.equal(getJsxAttrStringValue(sandboxImg, 'height'), 202);

  assert.ok(leaksImg, 'my-leaks.webp exists');
  assert.equal(getJsxAttrStringValue(leaksImg, 'loading'), 'lazy', 'below-the-fold my-leaks image has loading="lazy"');
  assert.equal(getJsxAttrStringValue(leaksImg, 'fetchPriority'), null, 'below-the-fold my-leaks omits fetchPriority');
  assert.equal(getJsxAttrStringValue(leaksImg, 'width'), 720);
  assert.equal(getJsxAttrStringValue(leaksImg, 'height'), 402);

  // Live signed-in counts with AbortController + timeout
  assert.match(src, /\/api\/poker\/saved-hands\?limit=1/);
  assert.match(src, /new AbortController\(\)/);
  assert.match(src, /window\.setTimeout\(\(\) => controller\.abort\(\)/);
  assert.match(src, /Saved Hands.*Unreviewed/);
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
